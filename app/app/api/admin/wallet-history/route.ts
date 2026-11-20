import {env} from "cloudflare:workers";
import {authErrorResponse,requirePlatformOwner} from "../../../../lib/auth";
import {isFeatureEnabled} from "../../../../lib/feature-rollouts";
import {readWalletHistory,WalletHistoryInputError} from "../../../../lib/admin-wallet-history";
const headers={"cache-control":"private, no-store"};
export async function GET(request:Request){
  try{
    const ctx=await requirePlatformOwner(request);
    if(!isFeatureEnabled("adminWalletHistory",ctx.email))return Response.json({error:"Recurso indisponível."},{status:403,headers});
    return Response.json(await readWalletHistory(env.DB,new URL(request.url).searchParams),{headers});
  }catch(error){
    const auth=authErrorResponse(error);if(auth){for(const [key,value] of Object.entries(headers))auth.headers.set(key,value);return auth;}
    return Response.json({error:error instanceof WalletHistoryInputError?error.message:"Não foi possível carregar o histórico de saldo."},{status:error instanceof WalletHistoryInputError?400:502,headers});
  }
}
