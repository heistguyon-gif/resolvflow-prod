import { authErrorResponse, requireWorkspaceContext, type WorkspaceRole, type WorkspaceContext } from "./auth";
import { getMediaBucket } from "./media-storage";
import { requireStoriesAccess } from "./story-permissions";
import { bridgeError, noStore, sameOrigin } from "./story-bridge-http";

export async function bridgeRoute(request: Request, role: WorkspaceRole, action: (bucket: R2Bucket, owner: string, context: WorkspaceContext) => Promise<Response>) {
  try {
    const context = await requireWorkspaceContext(request, role);
    await requireStoriesAccess(context);
    if (request.method !== "GET" && request.method !== "HEAD") sameOrigin(request);
    return noStore(await action(getMediaBucket(), context.workspaceOwnerUserId, context));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
