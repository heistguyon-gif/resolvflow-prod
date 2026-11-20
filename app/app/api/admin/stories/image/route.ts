import { authErrorResponse, requirePlatformOwner } from "../../../../../lib/auth";
import { getMediaBucket } from "../../../../../lib/media-storage";
import { bridgeError, noStore } from "../../../../../lib/story-bridge-http";
import { fail, readState, uuid } from "../../../../../lib/story-bridge";
import { storyLibrary } from "../../../../../lib/admin-stories";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const params = new URL(request.url).searchParams, bucket = getMediaBucket();
    const owner = params.get("workspace") || "", id = uuid(params.get("template"));
    await storyLibrary(bucket, owner);
    const template = (await readState(bucket, owner)).templates.find(item => item.id === id);
    if (!template) fail("not_found", "Template não encontrado.", 404);
    const image = await bucket.get(template.imageKey);
    if (!image) fail("not_found", "Imagem não encontrada.", 404);
    return noStore(new Response(image.body, { headers: { "content-type": template.imageType, "x-content-type-options": "nosniff" } }));
  } catch (error) { return noStore(authErrorResponse(error) ?? bridgeError(error)); }
}
