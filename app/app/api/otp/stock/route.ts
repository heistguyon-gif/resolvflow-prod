import { authErrorResponse, isPlatformAdminEmail, requireWorkspaceContext } from "../../../../lib/auth";
import { otpGmailKey, otpGmailStock } from "../../../../lib/otpgmail-fallback";
import { canViewOtpStock } from "../../../../lib/otp-stock-visibility";

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "viewer");
    if (!canViewOtpStock(ctx.email, request.url, isPlatformAdminEmail(ctx.email))) return Response.json({ available: false }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    const key = otpGmailKey();
    if (!key) return Response.json({ available: false }, { headers: { "Cache-Control": "private, no-store" } });
    const stock = await otpGmailStock(key);
    const adminView=new URL(request.url).hostname==="top.resolvflow.online"&&isPlatformAdminEmail(ctx.email);
    return Response.json(adminView?{available:true,...stock}:{available:true,total:stock.total,checkedAt:stock.checkedAt}, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ available: false }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
