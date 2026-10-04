import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { metaConnections } from "../../../../db/schema";
import { authErrorResponse, isPlatformAdminEmail, requireWorkspaceContext } from "../../../../lib/auth";
import { connectionApiMode } from "../../../../lib/meta-api";
import { facebookMetaConfig, metaAppKeysForWorkspace, metaAppLabel, metaConfig } from "../../../../lib/runtime-env";

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const ownerUserId = context.workspaceOwnerUserId;
    const rows = await getDb().select({
      id: metaConnections.id,
      instagramUserId: metaConnections.instagramUserId,
      username: metaConnections.username,
      accountType: metaConnections.accountType,
      status: metaConnections.status,
      tokenExpiresAt: metaConnections.tokenExpiresAt,
      publishingLimitUsed: metaConnections.publishingLimitUsed,
      publishingLimitTotal: metaConnections.publishingLimitTotal,
      lastSyncAt: metaConnections.lastSyncAt,
      lastError: metaConnections.lastError,
      scopes: metaConnections.scopes,
      metaAppKey: metaConnections.metaAppKey,
      metaAppId: metaConnections.metaAppId,
    }).from(metaConnections).where(eq(metaConnections.ownerUserId, ownerUserId)).orderBy(asc(metaConnections.username));
    const connections = rows.map(({ scopes, ...connection }) => {
      const apiMode = connectionApiMode(scopes);
      const key = connection.metaAppKey || "default";
      return { ...connection, apiMode, metaAppKey: key, metaAppId: connection.metaAppId || (apiMode === "instagram" ? metaConfig(key).appId : null) };
    });
    const apps = metaAppKeysForWorkspace(ownerUserId, isPlatformAdminEmail(context.email)).map((key) => {
      const app = metaConfig(key);
      return { key, label: metaAppLabel(key), configured: app.configured, appId: app.appId || null };
    });
    return Response.json({
      configured: apps.some((app) => app.configured),
      facebookConfigured: facebookMetaConfig().configured,
      apps,
      connections,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar a Meta." }, { status: 500 });
  }
}
