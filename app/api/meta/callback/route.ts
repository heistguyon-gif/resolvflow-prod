import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { integrations, metaConnections, oauthStates, systemHealth } from "../../../../db/schema";
import { markConnectionRequestsConnected } from "../../../../lib/connection-queue";
import { describeInstagramProfileError, exchangeAuthorizationCode, getInstagramProfile, MetaApiError, type MetaCallContext } from "../../../../lib/meta-api";
import { encryptToken } from "../../../../lib/token-crypto";
import { restoreConnectedAccount } from "../../../../lib/account-lifecycle";
import { authorizeMetaOauthState } from "../../../../lib/meta-oauth-authorization";
import { isMetaWorkspaceManaged, resolveMetaAppForStoredKey, resolveMetaAppForWorkspace } from "../../../../lib/workspace-meta-apps";

function redirectWith(origin: string, key: string, value: string, account?: string, accountId?: string) {
  const destination = new URL("/contas", origin); destination.searchParams.set(key, value);
  if (account) destination.searchParams.set("meta_account", account);
  if (accountId) destination.searchParams.set("meta_account_id", accountId);
  return Response.redirect(destination.toString(), 302);
}

async function recordOauthFailure(operationId: string, metaAppKey: string, redirectUri: string, error: unknown) {
  const apiError = error instanceof MetaApiError ? error : undefined;
  const details = JSON.stringify({
    operation_id: operationId,
    meta_app_key: metaAppKey,
    redirect_uri: redirectUri,
    host: apiError?.host || null,
    endpoint: apiError?.endpoint || null,
    status: apiError?.status || null,
    error_code: apiError?.code || null,
    error_subcode: apiError?.subcode || null,
    fbtrace_id: apiError?.fbtraceId || null,
    message: error instanceof Error ? error.message.slice(0, 180) : "callback_failed",
  });
  try {
    await getDb().insert(systemHealth).values({
      key: "meta_oauth",
      status: "error",
      lastError: error instanceof Error ? error.message.slice(0, 240) : "callback_failed",
      detailsJson: details,
    }).onConflictDoUpdate({
      target: systemHealth.key,
      set: { status: "error", lastError: error instanceof Error ? error.message.slice(0, 240) : "callback_failed", detailsJson: details, updatedAt: new Date().toISOString() },
    });
  } catch {
    console.log(details);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
    if (!code || !state) return redirectWith(url.origin, "meta_error", "A autorização foi cancelada ou retornou incompleta.");
    const [storedState] = await getDb().delete(oauthStates).where(eq(oauthStates.state, state)).returning();
    if (!storedState || new Date(storedState.expiresAt).getTime() < Date.now()) return redirectWith(url.origin, "meta_error", "A autorização expirou. Tente conectar novamente.");
    const ownerUserId = storedState.ownerUserId;
    const operationId = storedState.operationId || ownerUserId;
    const app = await authorizeMetaOauthState(storedState, {
      isWorkspaceManaged: isMetaWorkspaceManaged,
      resolveForActor: (accountUserId, workspaceOwnerUserId, key) => resolveMetaAppForWorkspace({
        accountUserId, workspaceOwnerUserId, requestedKey: key, legacyKey: key,
      }),
      resolveStored: resolveMetaAppForStoredKey,
    });
    if (!app) return redirectWith(url.origin, "meta_error", "O acesso a este App Meta foi removido ou expirou. Inicie uma nova conexão.");
    const redirectUri = storedState.redirectUri || app.redirectUri || `${url.origin}/api/meta/callback`;
    const trace: MetaCallContext = { operationId, metaAppKey: app.key, redirectUri, stage: "oauth.callback" };
    console.log(JSON.stringify({ source: "nexoflow-meta", event: "oauth.callback.start", operation_id: operationId, meta_app_key: app.key, redirect_uri: redirectUri, host: "api.instagram.com", endpoint: "/oauth/access_token", status: null, error_code: null, error_subcode: null, fbtrace_id: null }));
    const token = await exchangeAuthorizationCode(code, redirectUri, app, trace);
    let profile;
    try {
      profile = await getInstagramProfile(token.userId, token.accessToken, "instagram", trace);
    } catch (error) {
      await recordOauthFailure(operationId, app.key, redirectUri, error);
      return redirectWith(url.origin, "meta_error", describeInstagramProfileError(error, app.appId));
    }
    const instagramUserId = String(profile.user_id || profile.id || token.userId);
    const username = (profile.username || instagramUserId).replace(/^@/, "").toLowerCase();
    const protectedToken = await encryptToken(token.accessToken);
    const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
    const db = getDb();
    await db.insert(metaConnections).values({
      id: crypto.randomUUID(), ownerUserId, instagramUserId, username, accountType: profile.account_type || null,
      tokenCiphertext: protectedToken.ciphertext, tokenIv: protectedToken.iv, tokenExpiresAt, scopes: token.scopes.join(","),
      status: "connected", lastError: token.exchangeWarning, lastSyncAt: new Date().toISOString(),
      metaAppKey: app.key, metaAppId: app.appId,
    }).onConflictDoUpdate({
      target: [metaConnections.ownerUserId, metaConnections.instagramUserId],
      set: {
        username, accountType: profile.account_type || null, tokenCiphertext: protectedToken.ciphertext, tokenIv: protectedToken.iv,
        tokenExpiresAt, scopes: token.scopes.join(","), status: "connected", lastError: token.exchangeWarning, lastSyncAt: new Date().toISOString(),
        metaAppKey: app.key, metaAppId: app.appId, updatedAt: new Date().toISOString(),
      },
    });
    const accountId = await restoreConnectedAccount({ ownerUserId, instagramAccountId: instagramUserId, username, displayName: profile.username || username, source: "meta_oauth", followersCount: profile.followers_count, followsCount: profile.follows_count, mediaCount: profile.media_count });
    await db.insert(integrations).values({ id: crypto.randomUUID(), ownerUserId, provider: "meta", status: "connected", externalAppId: app.appId, accountCount: 1, lastSyncAt: new Date().toISOString() }).onConflictDoUpdate({ target: [integrations.ownerUserId, integrations.provider], set: { status: "connected", externalAppId: app.appId, lastSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    await markConnectionRequestsConnected(ownerUserId, [username]);
    console.log(JSON.stringify({ source: "nexoflow-meta", event: "oauth.callback.connected", operation_id: operationId, meta_app_key: app.key, redirect_uri: redirectUri, host: "graph.instagram.com", endpoint: "/me", status: 200, error_code: null, error_subcode: null, fbtrace_id: null }));
    return redirectWith(url.origin, "meta", "connected", username, accountId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a conexão com a Meta.";
    return redirectWith(url.origin, "meta_error", message.slice(0, 180));
  }
}
