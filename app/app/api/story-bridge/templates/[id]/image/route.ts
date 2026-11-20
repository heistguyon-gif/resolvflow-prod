import { fail, readState, storedImage, uuid } from "../../../../../../lib/story-bridge";
import { bridgeRoute } from "../../../../../../lib/story-bridge-routes";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return bridgeRoute(request, "viewer", async (bucket, owner) => {
    const id = uuid((await context.params).id);
    const template = (await readState(bucket, owner)).templates.find(t => t.id === id);
    if (!template) fail("not_found", "Modelo não encontrado.", 404);
    return storedImage(bucket, template);
  });
}
