import { PixGatewayError } from "../../../../lib/pix-gateway-config";
import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { createPixCharge, refreshPixPayment, isPrincipalPixTopup, workspaceUsesOtpSupplierBalance } from "../../../../lib/otp-billing";
import { BodyLimitError, readLimitedBody } from "../../../../lib/request-body";

export async function POST(request: Request) {
  const response=await processPost(request);response.headers.set("cache-control","private, no-store");return response;
}
async function processPost(request:Request){
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    if(request.headers.get("origin")!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")return Response.json({error:"Origem inválida."},{status:403});
    let payload:{ action?: string; amountCents?: number; paymentId?: string; customerDocument?: string; requestId?: string };
    try{payload=JSON.parse(new TextDecoder().decode(await readLimitedBody(request,32768)));}catch(error){if(error instanceof BodyLimitError)throw error;throw new PixGatewayError("invalid_input",400);}
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new PixGatewayError("invalid_input",400);
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
    if (!isPrincipalPixTopup(ctx.email, ctx.workspaceOwnerUserId) && await workspaceUsesOtpSupplierBalance(ctx.workspaceOwnerUserId, ctx.email)) return Response.json({ error: "Esta conta usa o saldo da API, sem PIX da plataforma." }, { status: 400 });
    if(!Number.isSafeInteger(payload.amountCents))throw new PixGatewayError("invalid_amount",400);
    const charge = await createPixCharge({
      workspaceOwnerUserId: ctx.workspaceOwnerUserId,
      actorUserId: ctx.accountUserId,
      email: ctx.email,
      name: ctx.displayName,
      requestId: payload.requestId,
      customerDocument: String(payload.customerDocument || ""),
      amountCents: Math.round(Number(payload.amountCents) || 0),
    });
    return Response.json(charge);
  } catch (error) {
    if(error instanceof BodyLimitError)return Response.json({error:"Pedido muito grande.",code:"body_limit"},{status:413});
    if(error instanceof PixGatewayError)return Response.json({error:"Não foi possível concluir o pagamento. Confira o mesmo pedido.",code:error.code},{status:error.status,headers:{"cache-control":"private, no-store"}});
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível confirmar o pagamento. Confira o mesmo pedido.",code:"payment_unavailable" }, { status: 502 });
  }
}
