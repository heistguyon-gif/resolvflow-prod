import { authErrorResponse, requirePlatformOwner } from "../../../../../lib/auth";
import { getOtpExchange } from "../../../../../lib/admin-otp-exchange";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    return Response.json(await getOtpExchange(), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) { denied.headers.set("cache-control", "private, no-store"); return denied; }
    return Response.json({ error: "Conversão para dólar indisponível. Tente atualizar os saldos." }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
