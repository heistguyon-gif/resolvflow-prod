import {authErrorResponse,requireWorkspaceContext} from "../../../../lib/auth";
import {getInstacasterApiKey} from "../../../../lib/otp-billing";
import {otpGmailFetch,otpGmailKey} from "../../../../lib/otpgmail-fallback";
import {otpProviderFetch} from "../../../../lib/otp-provider";
import {gmailConnection,type GmailConnection} from "../../../../lib/gmail-connection";
import {canUseGmailCentral} from "../../../../lib/gmail-pilot-runtime";
export async function GET(request:Request){
 try{
  const ctx=await requireWorkspaceContext(request,"viewer");
  if(!await canUseGmailCentral(ctx))return Response.json({error:"Recurso indisponível."},{status:403});
  const read=async(id:GmailConnection["id"])=>{
   let configured=false;
   try{
    const key=id==="supplier_1"?otpGmailKey():await getInstacasterApiKey();configured=Boolean(key);
    if(!key)return gmailConnection(id,false,0,null);
    const limited:typeof fetch=(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(8000)});
    const r=id==="supplier_1"?await otpGmailFetch(key,"/services",{},limited):await otpProviderFetch(key,"/v1/products","GET",undefined,limited);
    return gmailConnection(id,true,r.response.status,r.data);
   }catch{return gmailConnection(id,configured,0,null);}
  };
  return Response.json({connections:await Promise.all([read("supplier_1"),read("supplier_2")])},{headers:{"cache-control":"private, no-store"}});
 }catch(error){return authErrorResponse(error)||Response.json({error:"Não foi possível verificar as conexões."},{status:502});}
}
