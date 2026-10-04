import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { integrations, metaConnections, oauthStates } from "../../../../../db/schema";
import { markConnectionRequestsConnected } from "../../../../../lib/connection-queue";
import { exchangeFacebookAuthorizationCode, getFacebookInstagramAccounts } from "../../../../../lib/meta-api";
import { facebookMetaConfig } from "../../../../../lib/runtime-env";
import { encryptToken } from "../../../../../lib/token-crypto";
import { restoreConnectedAccount } from "../../../../../lib/account-lifecycle";

function redirectWith(origin: string, key: string, value: string) {
  const destination = new URL("/contas", origin);
  destination.searchParams.set(key, value);
  return Response.redirect(destination.toString(), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return redirectWith(url.origin, "meta_error", "A autorização pelo Facebook foi cancelada ou retornou incompleta.");
    const [storedState] = await getDb().delete(oauthStates).where(eq(oauthStates.state, state)).returning();
    if (!storedState || new Date(storedState.expiresAt).getTime() < Date.now()) return redirectWith(url.origin, "meta_error", "A autorização expirou. Tente conectar novamente.");

    const config = facebookMetaConfig();
    const redirectUri = config.redirectUri || `${url.origin}/api/meta/facebook/callback`;
    const token = await exchangeFacebookAuthorizationCode(code, redirectUri);
    const discovery = await getFacebookInstagramAccounts(token.accessToken);
    const linkedAccounts = discovery.accounts;
    if (!linkedAccounts.length) {
      const message = discovery.pagesFound === 0
        ? "O Facebook não devolveu nenhuma Página administrada por este perfil. Revise o acesso às Páginas na autorização."
        : discovery.linkedInstagramIds === 0
          ? `Encontramos ${discovery.pagesFound} Página(s), mas nenhuma possui uma conta profissional do Instagram vinculada.`
          : `Encontramos ${discovery.linkedInstagramIds} conta(s) vinculada(s), mas a Meta não permitiu ler os perfis. Revise as permissões do aplicativo.`;
      return redirectWith(url.origin, "meta_error", message);
    }

    const ownerUserId = storedState.ownerUserId;
    const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
    const now = new Date().toISOString();
    const scopes = "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish";
    const db = getDb();

    for (const linked of linkedAccounts) {
      const instagramUserId = String(linked.profile.id);
      const username = linked.profile.username.toLowerCase();
      const protectedToken = await encryptToken(linked.pageAccessToken);
      await db.insert(metaConnections).values({
        id: crypto.randomUUID(), ownerUserId, instagramUserId, username,
        accountType: linked.profile.account_type || null,
        tokenCiphertext: protectedToken.ciphertext, tokenIv: protectedToken.iv,
        tokenExpiresAt, scopes, status: "connected", lastError: null, lastSyncAt: now,
      }).onConflictDoUpdate({
        target: [metaConnections.ownerUserId, metaConnections.instagramUserId],
        set: { username, accountType: linked.profile.account_type || null, tokenCiphertext: protectedToken.ciphertext, tokenIv: protectedToken.iv, tokenExpiresAt, scopes, status: "connected", lastError: null, lastSyncAt: now, updatedAt: now },
      });
      await restoreConnectedAccount({ ownerUserId, instagramAccountId: instagramUserId, username, displayName: linked.profile.username, source: "meta_facebook", followersCount: linked.profile.followers_count });
    }

    await db.insert(integrations).values({ id: crypto.randomUUID(), ownerUserId, provider: "meta", status: "connected", externalAppId: config.appId, accountCount: linkedAccounts.length, lastSyncAt: now }).onConflictDoUpdate({
      target: [integrations.ownerUserId, integrations.provider],
      set: { status: "connected", externalAppId: config.appId, accountCount: linkedAccounts.length, lastSyncAt: now, updatedAt: now },
    });
    await markConnectionRequestsConnected(ownerUserId, linkedAccounts.map((linked) => linked.profile.username));
    return redirectWith(url.origin, "meta", `facebook_connected_${linkedAccounts.length}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a conexão pelo Facebook.";
    return redirectWith(url.origin, "meta_error", message.slice(0, 180));
  }
}
