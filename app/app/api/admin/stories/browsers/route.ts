import { authErrorResponse, requirePlatformOwner } from "../../../../../lib/auth";
import { getMediaBucket } from "../../../../../lib/media-storage";
import { bridgeError, jsonBody, noStore, sameOrigin } from "../../../../../lib/story-bridge-http";
import { fail, MASTER_STORY_OWNER, onlyKeys, record, textField } from "../../../../../lib/story-bridge";
import { hasStoryGrant } from "../../../../../lib/story-access";
import { validateStoryAdminTarget } from "../../../../../lib/admin-stories";
import { bindMasterBrowsers, masterBrowsers } from "../../../../../lib/story-sharing";
import { recordAuditEvent } from "../../../../../lib/audit";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    return noStore(Response.json({ browsers: await masterBrowsers(getMediaBucket()) }));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
export async function POST(request: Request) {
  try {
    await requirePlatformOwner(request); sameOrigin(request);
    const body = record(await jsonBody(request)); onlyKeys(body, ["targets", "workspaceOwnerUserId", "accountUserId"]);
    const owner = textField(body.workspaceOwnerUserId, 180), account = textField(body.accountUserId, 180), bucket = getMediaBucket();
    const target = await validateStoryAdminTarget(account, owner);
    if (!["owner", "editor"].includes(target.role)) fail("readonly_target", "Selecione um usuário com permissão para operar.", 409);
    if (owner !== MASTER_STORY_OWNER && !await hasStoryGrant(bucket, owner, account)) fail("feature_disabled", "Habilite Stories e destaques para o destino antes de vincular navegadores.", 409);
    const result = await bindMasterBrowsers(bucket, body.targets, owner === MASTER_STORY_OWNER ? undefined : { owner, accountUserId: account });
    await recordAuditEvent(request, { ownerUserId: owner, action: "stories.bind_browsers", entityType: "workspace", entityId: owner,
      summary: "Vínculo de navegadores da extensão principal atualizado.", metadata: { count: result.updated, accountUserId: account } });
    return noStore(Response.json(result));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
