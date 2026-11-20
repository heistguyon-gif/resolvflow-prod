import { fail, MASTER_STORY_OWNER, newCredential, rotateCredential } from "../../../../lib/story-bridge";
import { packageOrigin } from "../../../../lib/story-bridge-http";
import { bridgeRoute } from "../../../../lib/story-bridge-routes";
import { createStoryExtensionZip, createStoryExtensionUpdateZip } from "../../../../lib/story-extension-package";
import { isPlatformOwnerEmail } from "../../../../lib/platform-access";

export async function GET(request: Request) {
  return bridgeRoute(request, "viewer", async () => new Response(createStoryExtensionUpdateZip(packageOrigin(request)) as BodyInit,
    { headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="story-extension-update.zip"' } }));
}

export async function POST(request: Request) {
  return bridgeRoute(request, "owner", async (bucket, owner, context) => {
    if (owner === MASTER_STORY_OWNER && !isPlatformOwnerEmail(context.email)) fail("owner_only", "Somente o proprietário da plataforma pode gerar o pacote da extensão principal.", 403);
    const origin = packageOrigin(request);
    const token = newCredential();
    // Generate successfully before rotation. Never persist/log the token or ZIP.
    const zip = createStoryExtensionZip(origin, token);
    await rotateCredential(bucket, owner, token, { accountUserId: context.accountUserId, platformOwner: isPlatformOwnerEmail(context.email) });
    return new Response(zip as BodyInit, { headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="story-bridge.zip"' } });
  });
}
