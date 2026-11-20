import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { customerInbox, getOwnedInboxOrder, getOwnedInboxOrderById, listInbox, markInboxClosed, setActiveInboxOrder, setInboxHidden } from "../../../../lib/otp-inbox";
import {otpInboxPage,type InboxPageKind} from "../../../../lib/otp-inbox-page";
import {otpOrderStore} from "../../../../lib/otp-reliable-runtime";

function publicInbox(inbox: Awaited<ReturnType<typeof listInbox>>, privileged: boolean) {
  return privileged ? inbox : customerInbox(inbox);
}

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "viewer");
    const privileged = false;
    const apiId = new URL(request.url).searchParams.get("apiId");
    const params=new URL(request.url).searchParams,kind=params.get("kind");
    if(kind&&["open","history","hidden"].includes(kind)) {
      const page=await otpInboxPage(otpOrderStore().db,ctx.accountUserId,kind as InboxPageKind,params.get("cursor"),privileged&&apiId&&apiId!=="all"?apiId:null);
      return Response.json({...page,orders:page.orders.map(order=>({...order,price:"",supplierApiId:null,supplierApiName:"Serviço Gmail"}))},{headers:{"cache-control":"no-store"}});
    }
    const inbox = await listInbox(ctx.accountUserId, privileged && apiId && apiId !== "all" ? apiId : null);
    return Response.json(publicInbox(inbox, privileged));
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível ler os e-mails desta conta." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const privileged = false;
    const payload = await request.json() as { action?: string; orderId?: string; inboxId?: string; supplierApiId?: string | null };
    if (!["select", "close", "hide", "restore"].includes(String(payload.action))) return Response.json({ error: "Ação inválida." }, { status: 400 });
    const inboxId = String(payload.inboxId || "").trim();
    if (payload.action === "hide" || payload.action === "restore") {
      if (!inboxId) return Response.json({ error: "Pedido inválido." }, { status: 400 });
      const result = await setInboxHidden(ctx.accountUserId, inboxId, payload.action === "hide");
      if (result.state === "missing") return Response.json({ error: "Este Gmail não pertence a esta conta." }, { status: 404 });
      if (result.state === "open") return Response.json({ error: "Encerre o acompanhamento antes de ocultar este Gmail." }, { status: 409 });
      return Response.json(publicInbox(await listInbox(ctx.accountUserId), privileged));
    }
    const orderId = String(payload.orderId || "").trim();
    if (!inboxId && !orderId) return Response.json({ error: "Pedido inválido." }, { status: 400 });
    const owned = inboxId
      ? await getOwnedInboxOrderById(ctx.accountUserId, inboxId)
      : privileged ? await getOwnedInboxOrder(ctx.accountUserId, orderId, payload.supplierApiId) : null;
    if (!owned) return Response.json({ error: "Este Gmail não pertence a esta conta." }, { status: 404 });
    if (owned.hiddenAt) return Response.json({ error: "Restaure este Gmail antes de selecioná-lo." }, { status: 409 });
    if (payload.action === "close") {
      if(!owned.supplierApiId&&owned.orderId.startsWith("og_")) {
        let hasCode=false;
        try{const codes=JSON.parse(owned.codesJson);hasCode=Array.isArray(codes)&&codes.length>0;}catch{/* Keep uncertain orders in reconciliation. */}
        if(!hasCode&&!owned.closed)return Response.json({error:"Este Gmail ainda não recebeu código. Use Cancelar para conferir a devolução; o acompanhamento continuará até a confirmação."},{status:409});
      }
      await markInboxClosed(ctx.accountUserId, owned.orderId, owned.supplierApiId);
      return Response.json(publicInbox(await listInbox(ctx.accountUserId), privileged));
    }
    await setActiveInboxOrder(ctx.accountUserId, owned.orderId, owned.supplierApiId);
    return Response.json(publicInbox(await listInbox(ctx.accountUserId), privileged));
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível atualizar a caixa." }, { status: 502 });
  }
}
