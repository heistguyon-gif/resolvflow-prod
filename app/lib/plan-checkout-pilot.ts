import { BodyLimitError, readLimitedBody } from './request-body';

const owner='lucasbgn.affiliate@gmail.com';
const host='https://resolvflow.online';
const privateHeaders={'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'};
export type PlanPilotBinding={fetch(request:Request):Promise<Response>};
type Principal={email:string;workspaceOwnerUserId:string;role:string;mustChangePassword?:boolean};
const error=(status:number,code:string)=>Response.json({error:code},{status,headers:privateHeaders});

export async function forwardPlanPilot(request:Request,principal:Principal,binding:PlanPilotBinding|undefined) {
  const url=new URL(request.url);
  if(url.origin!==host) return error(404,'not_found');
  if(principal.email.trim().toLowerCase()!==owner || principal.workspaceOwnerUserId!=='nexoflow:'+owner || principal.role!=='owner' || principal.mustChangePassword) return error(403,'forbidden');
  if(!binding) return error(503,'pilot_unavailable');
  const method=request.method;
  if(method!=='GET'&&method!=='HEAD'&&method!=='POST') return error(405,'method_not_allowed');
  if(method==='POST'&&(request.headers.get('origin')!==host||request.headers.get('sec-fetch-site')==='cross-site')) return error(403,'invalid_origin');
  const headers=new Headers();
  for(const name of ['accept','origin','sec-fetch-site','content-type','cf-connecting-ip']){
    const value=request.headers.get(name);
    if(value)headers.set(name,value);
  }
  const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>/^__Host-rf-plan-checkout=[a-f0-9]{64}$/.test(v));
  if(token)headers.set('cookie',token);
  try {
    const body=method==='POST'?(await readLimitedBody(request,4096)).buffer:undefined;
    const upstream=await binding.fetch(new Request(url,{method,headers,body,redirect:'manual'}));
    const responseHeaders=new Headers(upstream.headers);
    for(const [name,value]of Object.entries(privateHeaders))responseHeaders.set(name,value);
    responseHeaders.set('vary','Cookie');
    return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
  } catch (err) {
    return err instanceof BodyLimitError ? error(413,'invalid_input') : error(503,'pilot_unavailable');
  }
}
