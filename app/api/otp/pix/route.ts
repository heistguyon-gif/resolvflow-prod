import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { createPixCharge, refreshPixPayment, workspaceUsesOtpSupplierBalance } from "../../../../lib/otp-billing";

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const payload = await request.json() as { action?: string; amountCents?: number; paymentId?: string; customerDocument?: string };
    if (payload.action === "status") {
      const paymentId = String(payload.paymentId || "").trim();
      if (!paymentId) return Response.json({ error: "Pagamento inválido." }, { status: 400 });
      const payment = await refreshPixPayment(paymentId, ctx.workspaceOwnerUserId);
      return Response.json({
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        priceLabel: "priceLabel" in payment ? payment.priceLabel : undefined,
        qrCode: payment.qrCode,
        ticketUrl: payment.ticketUrl,
      });
    }
    if (await workspaceUsesOtpSupplierBalance(ctx.workspaceOwnerUserId, ctx.email)) return Response.json({ error: "Esta conta usa o saldo da API, sem PIX da plataforma." }, { status: 400 });
    const charge = await createPixCharge({
      workspaceOwnerUserId: ctx.workspaceOwnerUserId,
      actorUserId: ctx.accountUserId,
      email: ctx.email,
      name: ctx.displayName,
      customerDocument: String(payload.customerDocument || ""),
      amountCents: Math.round(Number(payload.amountCents) || 0),
    });
    return Response.json(charge);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o pagamento." }, { status: 502 });
  }
}
