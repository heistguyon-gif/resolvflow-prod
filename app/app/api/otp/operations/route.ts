import {authErrorResponse,requireWorkspaceContext} from "../../../../lib/auth";
import {durableOtpStore} from "../../../../lib/otp-durable-runtime";
import {PurchaseError} from "../../../../lib/otp-durable-purchase";

export async function GET(request:Request) {
  try {
    const ctx=await requireWorkspaceContext(request,"viewer");
    const id=new URL(request.url).searchParams.get("id");
    const store=durableOtpStore(ctx);
    if(new URL(request.url).searchParams.get("recent")==="1")return Response.json({operations:await store.recent()},{headers:{"cache-control":"private, no-store"}});
    if (id) {
      const operation=await store.status(id);
      return operation ? Response.json(operation,{headers:{"cache-control":"no-store"}}) : Response.json({error:"Pedido não encontrado."},{status:404});
    }
    return Response.json({enabled:true,operations:await store.pending()},{headers:{"cache-control":"no-store"}});
  } catch(error) { return authErrorResponse(error) || Response.json({error:error instanceof PurchaseError?error.message:"Não foi possível conferir os pedidos."},{status:error instanceof PurchaseError?error.status:502}); }
}

export async function POST(request:Request) {
  try {
    const ctx=await requireWorkspaceContext(request,"editor");
    const origin=request.headers.get("origin");
    if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Origem inválida."},{status:403});
    const payload=await request.json() as {action?:string;operationId?:string};
    if(payload.action==="review"&&typeof payload.operationId==="string")return Response.json(await durableOtpStore(ctx).requestReview(payload.operationId),{headers:{"cache-control":"private, no-store"}});
    if(payload.action!=="cancel"||typeof payload.operationId!=="string")return Response.json({error:"Pedido inválido."},{status:400});
    return Response.json(await durableOtpStore(ctx).cancel(payload.operationId),{headers:{"cache-control":"private, no-store"}});
  }catch(error){return authErrorResponse(error)||Response.json({error:error instanceof PurchaseError?error.message:"Não foi possível cancelar. Confira o pedido antes de repetir."},{status:error instanceof PurchaseError?error.status:502});}
}
