import { authErrorResponse, requirePlatformOwner } from "../../../../lib/auth";
import { getMediaBucket } from "../../../../lib/media-storage";
import { bridgeError, jsonBody, noStore, sameOrigin } from "../../../../lib/story-bridge-http";
import { fail, onlyKeys, record, textField } from "../../../../lib/story-bridge";
import { setStoryGrant } from "../../../../lib/story-access";
import { copyStoryTemplate, storyAdminOptions, storyLibrary, validateStoryAdminTarget } from "../../../../lib/admin-stories";
import { recordAuditEvent } from "../../../../lib/audit";

export async function GET(request: Request) {
  try {
    const context = await requirePlatformOwner(request);
    const bucket = getMediaBucket(), workspace = new URL(request.url).searchParams.get("workspace");
    return noStore(Response.json(workspace ? { templates: await storyLibrary(bucket, workspace) } : {
      targets: await storyAdminOptions(bucket), defaultSourceOwnerUserId: context.workspaceOwnerUserId,
    }));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
export async function POST(request: Request) {
  try {
    const context = await requirePlatformOwner(request); sameOrigin(request);
    const body = record(await jsonBody(request));
    const owner = textField(body.workspaceOwnerUserId, 180), account = textField(body.accountUserId, 180);
    const bucket = getMediaBucket();
    await validateStoryAdminTarget(account, owner, body.action !== "access" || body.enabled === true);
    if (body.action === "access") {
      onlyKeys(body, ["action", "workspaceOwnerUserId", "accountUserId", "enabled"]);
      if (typeof body.enabled !== "boolean") fail();
      if (account === context.accountUserId) fail("owner_access", "O acesso do login principal permanece habilitado.");
      const grant = await setStoryGrant(bucket, owner, account, body.enabled);
      await recordAuditEvent(request, { ownerUserId: owner, action: "stories.access", entityType: "user", entityId: account,
        summary: body.enabled ? "Stories e destaques habilitados." : "Stories e destaques desabilitados.", metadata: { enabled: body.enabled } });
      return noStore(Response.json({ grant }));
    }
    if (body.action === "copy_template") {
      onlyKeys(body, ["action", "workspaceOwnerUserId", "accountUserId", "sourceOwnerUserId", "templateId", "requestId"]);
      const sourceOwner = textField(body.sourceOwnerUserId, 180);
      await storyLibrary(bucket, sourceOwner); // Validate source against the admin directory.
      const templateId = textField(body.templateId, 36);
      const template = await copyStoryTemplate(bucket, sourceOwner, templateId, owner, textField(body.requestId, 36));
      await recordAuditEvent(request, { ownerUserId: owner, action: "stories.copy_template", entityType: "story_template", entityId: template.id,
        summary: "Template de story copiado para o workspace.", metadata: { sourceOwnerUserId: sourceOwner, sourceTemplateId: templateId } });
      return noStore(Response.json({ template }));
    }
    fail();
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
