import { fail, readState, storedImage, uuid, type Template } from "../../../../../../lib/story-bridge";
import { profileSetupRoute } from "../../../../../../lib/story-profile-routes";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return profileSetupRoute(request, "viewer", async (bucket, owner) => {
    const id = uuid((await context.params).id), image = (await readState(bucket, owner)).profileImages?.find(i => i.id === id);
    if (!image) fail("not_found", "Imagem não encontrada.", 404);
    return storedImage(bucket, image as Template);
  });
}
