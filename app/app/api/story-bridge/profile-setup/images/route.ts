import { addProfileImage, fail, PROFILE_IMAGE_BYTES } from "../../../../../lib/story-bridge";
import { boundedBody } from "../../../../../lib/story-bridge-http";
import { profileSetupRoute } from "../../../../../lib/story-profile-routes";

export function POST(request: Request) {
  return profileSetupRoute(request, "editor", async (bucket, owner) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;")) fail("content_type", "Envie o formulário com a imagem.", 415);
    const bytes = await boundedBody(request, PROFILE_IMAGE_BYTES + 32_768);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "content-type": contentType } }).formData(); } catch { return fail(); }
    if ([...form.keys()].some(key => key !== "image") || form.getAll("image").length !== 1) fail();
    const image = form.get("image"); if (!image || typeof image === "string") fail();
    return Response.json({ image: await addProfileImage(bucket, owner, new Uint8Array(await image.arrayBuffer()), image.type) }, { status: 201 });
  });
}
