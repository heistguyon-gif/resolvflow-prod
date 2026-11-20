import { createStoryExtensionUpdateZip, STORY_EXTENSION_VERSION } from "../../../../../lib/story-extension-package";
import { packageOrigin } from "../../../../../lib/story-bridge-http";
import { profileSetupRoute } from "../../../../../lib/story-profile-routes";

export function GET(request: Request) {
  return profileSetupRoute(request, "owner", async () => new Response(createStoryExtensionUpdateZip(packageOrigin(request)) as BodyInit, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="story-bridge-update-${STORY_EXTENSION_VERSION}.zip"` } }));
}
