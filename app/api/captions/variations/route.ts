import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { generateCaptionVariations } from "../../../../lib/caption-variations";

export async function POST(request: Request) {
  try {
    await requireOwnerId(request);
    const payload = await request.json() as { caption?: string; count?: number };
    const result = await generateCaptionVariations(payload.caption || "", Number(payload.count) || 6);
    return Response.json(result);
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar as variações." }, { status: 500 });
  }
}
