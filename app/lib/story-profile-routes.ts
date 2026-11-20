import { authErrorResponse, requireWorkspaceContext, type WorkspaceRole } from "./auth";
import { getMediaBucket } from "./media-storage";
import { isFeatureEnabled } from "./feature-rollouts";
import { boundedBody, bridgeError, noStore, sameOrigin } from "./story-bridge-http";
import { fail } from "./story-bridge";

export async function profileSetupRoute(request: Request, role: WorkspaceRole, action: (bucket: R2Bucket, owner: string) => Promise<Response>) {
  try {
    const context = await requireWorkspaceContext(request, role);
    if (!isFeatureEnabled("profileSetup", context.email)) fail("feature_disabled", "Recurso indisponível para este login.", 403);
    if (!["GET", "HEAD"].includes(request.method)) sameOrigin(request);
    return noStore(await action(getMediaBucket(), context.workspaceOwnerUserId));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
export async function profileSetupJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") fail("content_type", "Envie JSON.", 415);
  const bytes = await boundedBody(request, 32_768);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail(); }
}
