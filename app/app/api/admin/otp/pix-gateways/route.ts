import { authErrorResponse, requirePlatformOwner } from "../../../../../lib/auth";
import { pixGatewayRuntime } from "../../../../../lib/pix-gateway-runtime";
import { PixGatewayError } from "../../../../../lib/pix-gateway-config";
import { BodyLimitError, readLimitedBody } from "../../../../../lib/request-body";
const headers={"cache-control":"private, no-store","x-content-type-options":"nosniff"};
function failure(error:unknown){
  const auth=authErrorResponse(error);if(auth){for(const[key,value]of Object.entries(headers))auth.headers.set(key,value);return auth;}
  return Response.json({error:"Não foi possível alterar ou ler a configuração Pix.",code:error instanceof BodyLimitError?"body_limit":error instanceof PixGatewayError?error.code:"storage_unavailable"},{status:error instanceof BodyLimitError?413:error instanceof PixGatewayError?error.status:503,headers});
}
export async function GET(request:Request){
  try{const ctx=await requirePlatformOwner(request);if(ctx.email.trim().toLowerCase()!=="lucasbgn.affiliate@gmail.com")return Response.json({error:"Forbidden"},{status:403,headers});return Response.json(await pixGatewayRuntime(ctx.accountUserId).registry.state(),{headers});}catch(error){return failure(error);}
}
export async function POST(request:Request){
  try{
    const ctx=await requirePlatformOwner(request);
    if(ctx.email.trim().toLowerCase()!=="lucasbgn.affiliate@gmail.com"||request.headers.get("origin")!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")return Response.json({error:"Forbidden"},{status:403,headers});
    const bytes=await readLimitedBody(request,32768);let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new PixGatewayError("invalid_input",400);}
    return Response.json(await pixGatewayRuntime(ctx.accountUserId).registry.command(body,ctx.email),{headers});
  }catch(error){return failure(error);}
}
