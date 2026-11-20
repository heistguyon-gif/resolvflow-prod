import { addTemplate, fail, LIMITS, templateFields } from "../../../../lib/story-bridge";
import { boundedBody } from "../../../../lib/story-bridge-http";
import { bridgeRoute } from "../../../../lib/story-bridge-routes";

export async function POST(request: Request) {
  return bridgeRoute(request, "editor", async (bucket, owner) => {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) fail("content_type", "Envie o formulário com a imagem.", 415);
    const bytes = await boundedBody(request, LIMITS.imageBytes + 32_768);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type")! } }).formData(); } catch { return fail(); }
    const required = ["name", "linkUrl", "linkTitle", "highlightName", "image"];
    const optional = ["stickerRotation", "createHighlight", "stickerStyle", "stickerSize", "stickerX", "stickerY", "stickerBackground", "stickerForeground"];
    const keys = [...form.keys()];
    if (keys.some(key => !required.includes(key) && !optional.includes(key)) || required.some(key => form.getAll(key).length !== 1) || optional.some(key => form.getAll(key).length > 1)) fail();
    const image = form.get("image");
    if (!image || typeof image === "string") fail("image_type", "Selecione uma imagem JPEG ou PNG.");
    if (image.size > LIMITS.imageBytes) fail("image_size", "A imagem deve ter até 10 MB.", 413);
    const fields = templateFields(Object.fromEntries(form.entries()));
    return Response.json({ template: await addTemplate(bucket, owner, fields, new Uint8Array(await image.arrayBuffer())) }, { status: 201 });
  });
}
