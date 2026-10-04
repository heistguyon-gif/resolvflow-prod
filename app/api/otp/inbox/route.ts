import { authErrorResponse, isPlatformAdminEmail, requireWorkspaceContext } from "../../../../lib/auth";
import { isOtpSelfSupplyEmail } from "../../../../lib/otp-billing";
import { getOwnedInboxOrder, listInbox, markInboxClosed, setActiveInboxOrder } from "../../../../lib/otp-inbox";

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "viewer");
    const apiId = new URL(request.url).searchParams.get("apiId");
    const inbox = await listInbox(ctx.accountUserId, apiId && apiId !== "all" ? apiId : null);
    if (!isPlatformAdminEmail(ctx.email) && !isOtpSelfSupplyEmail(ctx.email)) inbox.orders = inbox.orders.map((order) => ({ ...order, supplierApiName: "Serviço Gmail" }));
    return Response.json(inbox);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível ler os e-mails desta conta." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const payload = await request.json() as { action?: string; orderId?: string; supplierApiId?: string | null };
    if (payload.action !== "select" && payload.action !== "close") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const orderId = String(payload.orderId || "").trim();
    if (!orderId) return Response.json({ error: "Pedido inválido." }, { status: 400 });
    const owned = await getOwnedInboxOrder(ctx.accountUserId, orderId, payload.supplierApiId);
    if (!owned) return Response.json({ error: "Este Gmail não pertence a esta conta." }, { status: 404 });
    if (payload.action === "close") {
      await markInboxClosed(ctx.accountUserId, orderId, owned.supplierApiId);
      const inbox = await listInbox(ctx.accountUserId);
      if (!isPlatformAdminEmail(ctx.email) && !isOtpSelfSupplyEmail(ctx.email)) inbox.orders = inbox.orders.map((order) => ({ ...order, supplierApiName: "Serviço Gmail" }));
      return Response.json(inbox);
    }
    await setActiveInboxOrder(ctx.accountUserId, orderId, owned.supplierApiId);
    const inbox = await listInbox(ctx.accountUserId);
    if (!isPlatformAdminEmail(ctx.email) && !isOtpSelfSupplyEmail(ctx.email)) inbox.orders = inbox.orders.map((order) => ({ ...order, supplierApiName: "Serviço Gmail" }));
    return Response.json(inbox);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível atualizar a caixa." }, { status: 502 });
  }
}
