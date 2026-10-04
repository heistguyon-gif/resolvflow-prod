import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import { getMediaBucket } from "../../../../lib/media-storage";

const SOURCE_KEY = "handoff/resolvflow-fonte.zip";

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const object = await getMediaBucket().get(SOURCE_KEY);
    if (object) {
      await recordAuditEvent(request, {
        ownerUserId: context.workspaceOwnerUserId,
        action: "source.download",
        entityType: "workspace",
        entityId: context.workspaceOwnerUserId,
        summary: "Source package downloaded by the platform administrator.",
      });
    }
    if (!object) return Response.json({ error: "O pacote do código ainda não está disponível." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="resolvflow-fonte.zip"',
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível baixar o código." }, { status: 500 });
  }
}
