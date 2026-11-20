import {authErrorResponse,requirePlatformAdmin} from "../../../../../lib/auth";
import {reliableOtpEnabled,otpOrderStore,coordinatedOtpFetch} from "../../../../../lib/otp-reliable-runtime";
import {getInstacasterApiKey,getWorkspaceSupplierApi} from "../../../../../lib/otp-billing";
import {otpGmailKey,otpGmailFetch} from "../../../../../lib/otpgmail-fallback";
import {otpProviderFetch} from "../../../../../lib/otp-provider";
import {otpHash} from "../../../../../lib/otp-provider-coordinator";
import {durableOtpAdmin} from "../../../../../lib/otp-durable-runtime";
import {PurchaseError} from "../../../../../lib/otp-durable-purchase";

export async function GET(request:Request) {
  try {
    await requirePlatformAdmin(request);
    const page=await durableOtpAdmin().list(new URL(request.url).searchParams.get("cursor")||undefined);
    return Response.json({enabled:true,items:[...page.items,...(!new URL(request.url).searchParams.has("cursor")&&reliableOtpEnabled()?await otpOrderStore().reviews():[])],cursor:page.cursor},{headers:{"cache-control":"no-store"}});
  } catch(error) {return authErrorResponse(error)||Response.json({error:"Não foi possível carregar a conferência."},{status:502});}
}

export async function POST(request:Request) {
  try {
    const admin=await requirePlatformAdmin(request);
    const origin=request.headers.get("origin");
    if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Origem inválida."},{status:403});
    const body=await request.json() as {itemId?:string;action?:string;orderId?:string;note?:string;confirmedNoDelivery?:boolean};
    const note=String(body.note||"").trim();
    if (note.length<10 || note.length>1000 || !["deliver","refund"].includes(body.action||"")) return Response.json({error:"Descreva a conferência realizada (10 a 1.000 caracteres)."},{status:400});
    if(typeof body.itemId==="string"&&body.itemId.startsWith("durable|")) {
      if(body.action!=="refund")return Response.json({error:"Para pedidos duráveis, a vinculação de entrega exige investigação adicional. Nenhuma entrega será presumida."},{status:400});
      const operation=await durableOtpAdmin().resolve(body.itemId,{actor:admin.accountUserId,note,confirmedNoDelivery:body.confirmedNoDelivery===true});
      return Response.json({ok:true,operation},{headers:{"cache-control":"no-store"}});
    }
    if (!reliableOtpEnabled()) return Response.json({error:"Conferência legada ainda não ativada."},{status:409});
    const store=otpOrderStore(),item=(await store.reviews()).find(item=>item.id===body.itemId);
    if (!item) return Response.json({error:"Pedido não está disponível para conferência."},{status:409});
    const token=await store.acquire(item.operation_id,item.account_user_id);
    if (!token) return Response.json({error:"Este pedido está sendo conferido em outra sessão."},{status:409});
    try {
      const resolution={actor:admin.accountUserId,note};
      if (body.action==="refund") {
        if (body.confirmedNoDelivery!==true) return Response.json({error:"Confirme no fornecedor que nenhum Gmail foi entregue antes de devolver o crédito."},{status:400});
        await store.fail(item.id,"review_no_delivery",resolution);
      } else {
        const rawId=String(body.orderId||"").trim().replace(/^og_/,"");
        if (!/^[A-Za-z0-9_-]{1,61}$/.test(rawId)) return Response.json({error:"Informe o identificador do pedido confirmado no fornecedor."},{status:400});
        const key=item.provider==="otpgmail" ? otpGmailKey() : item.supplier_api_id ? (await getWorkspaceSupplierApi(item.workspace_owner_user_id,item.supplier_api_id,{requireEnabled:false}))?.key || "" : await getInstacasterApiKey();
        if (!key || await otpHash(`${item.provider}:${key}`)!==item.provider_key_hash) return Response.json({error:"A credencial original precisa estar disponível para conferir este pedido."},{status:409});
        const result=item.provider==="otpgmail" ? await otpGmailFetch(key,`/orders/${rawId}`,{},await coordinatedOtpFetch("otpgmail",key)) : await otpProviderFetch(key,`/v1/orders/${rawId}`,"GET",undefined,await coordinatedOtpFetch("instacaster",key));
        const envelope=result.data as {data?:{orderId?:string;email?:string;status?:string;product?:string};orderId?:string;order_id?:string;email?:string;status?:string;price?:string;product?:string};
        const order=item.provider==="otpgmail" ? envelope.data : envelope;
        const confirmedId=item.provider==="otpgmail" ? (order as {orderId?:string})?.orderId : (order as {order_id?:string})?.order_id;
        if (!result.response.ok || typeof order?.email!=="string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email) || confirmedId!==rawId || order.product&&order.product!=="ig_gmail_otp") return Response.json({error:"O fornecedor não confirmou este Gmail."},{status:409});
        const orderId=item.provider==="otpgmail" ? `og_${rawId}` : rawId;
        const assigned=await store.db.prepare("SELECT account_user_id FROM otp_inbox WHERE order_id=? LIMIT 1").bind(orderId).first();
        if (assigned) return Response.json({error:"Este pedido já está registrado. Confira a conta de destino antes de prosseguir."},{status:409});
        await store.delivered(item.id,{orderId,email:order.email,status:order.status || "active"},resolution);
      }
    } finally {await store.finish(item.operation_id,token);}
    return Response.json({ok:true,items:await store.reviews()});
  } catch(error) {return authErrorResponse(error)||Response.json({error:error instanceof PurchaseError?error.message:"Não foi possível concluir a conferência. Atualize e confira o mesmo item antes de repetir.",refreshRequired:true},{status:error instanceof PurchaseError?error.status:502});}
}
