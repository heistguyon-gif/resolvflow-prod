import { authErrorResponse, requireWorkspaceContext } from "../../../lib/auth";
import { canReadCloudMail, parseMailImport, MailError } from "../../../lib/cloud-mail";
import { cloudMail, cloudMailOrganization, cloudMailDeletion, mailResponse, mailErrorResponse, mailJson, registerMailBridge } from "../../../lib/cloud-mail-runtime";
import { canManageMail } from "../../../lib/cloud-mail-organization";
export async function GET(request:Request){
 try{
  const ctx=await requireWorkspaceContext(request,"viewer");if(!canReadCloudMail(ctx.email))return mailResponse({error:"Acesso não autorizado."},403);
  const id=new URL(request.url).searchParams.get("id");
  const deletionId=new URL(request.url).searchParams.get("deletePreview");
  if(deletionId){if(!canManageMail(ctx.email))return mailResponse({error:"Recurso indisponível para este login."},403);return mailResponse(await cloudMailDeletion(ctx.email).preview(ctx.email,deletionId));}
  if(id)return mailResponse(await cloudMail(ctx.email).details(id));
  const state=await cloudMail(ctx.email).state();
  return mailResponse(canManageMail(ctx.email)?{...state,exportAllowed:ctx.role==="owner",organization:await cloudMailOrganization(ctx.email).view(ctx.email)}:state);
 }catch(e){return authErrorResponse(e)||mailErrorResponse(e);}
}
export async function POST(request:Request){
 try{
  const ctx=await requireWorkspaceContext(request,"viewer");if(!canReadCloudMail(ctx.email))return mailResponse({error:"Acesso não autorizado."},403);
  if(request.headers.get("origin")!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")return mailResponse({error:"Origem inválida."},403);
  const body=await mailJson(request),store=cloudMail(ctx.email);
  if(body.action==="delete"){
   if(!canManageMail(ctx.email))return mailResponse({error:"Recurso indisponível para este login."},403);
   if(Object.keys(body).some(k=>!["action","requestId","accountId","confirmEmail"].includes(k)))throw new MailError("organization_invalid",400);
   return mailResponse(await cloudMailDeletion(ctx.email).remove(ctx.email,{requestId:body.requestId,accountId:body.accountId,confirmEmail:body.confirmEmail}));
  }
  if(body.action==="organize"){
   if(!canManageMail(ctx.email))return mailResponse({error:"Recurso indisponível para este login."},403);
   if(Object.keys(body).some(k=>!["action","requestId","operation","accountIds"].includes(k)))throw new MailError("organization_invalid",400);
   return mailResponse(await cloudMailOrganization(ctx.email).apply(ctx.email,{requestId:body.requestId,operation:body.operation,accountIds:body.accountIds}));
  }
  if(body.action==="import"&&typeof body.text==="string")return mailResponse(await store.importAccounts(parseMailImport(body.text)));
  if(body.action==="refresh"&&typeof body.accountId==="string"){await store.snapshot(body.accountId);return mailResponse({updated:true,...await store.details(body.accountId)});}
  // Migration and service-key setup are principal-only and never rendered by UI.
  if(ctx.email.trim().toLowerCase()==="lucasbgn.affiliate@gmail.com"){
   if(body.action==="restore")return mailResponse(await store.importAccounts(body.accounts,body.cached||{}));
   if(body.action==="registerBridge"){await registerMailBridge(body.hash);return mailResponse({registered:true});}
  }
  throw new MailError("invalid",400);
 }catch(e){return authErrorResponse(e)||mailErrorResponse(e);}
}
