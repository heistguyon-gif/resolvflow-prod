import { PILOT_PATH } from '../src/checkout/catalog';
import { createCheckout, type Bindings } from './worker';

const ALLOWED_ORIGIN='https://resolvflow.online';
const headers={'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'};
const failure=(status:number)=>Response.json({error:status===503?'pilot_unavailable':'not_found'},{status,headers});

export function createPilotService(fetcher:typeof fetch=fetch, now=Date.now, assets:Readonly<Record<string,string>>={}) {
  const checkout=createCheckout(fetcher,now,true);
  return async (request:Request,env:Bindings) => {
    const url=new URL(request.url);
    if(url.origin!==ALLOWED_ORIGIN || url.search) return failure(404);
    const path=url.pathname;
    if(env.PLAN_PRIVATE_PILOT_ENABLED!=='true') return failure(503);
    const prefix=PILOT_PATH+'/api/';
    if(path.startsWith(prefix)){
      const route=path.slice(prefix.length);
      const read=request.method==='GET'&&(route==='plans'||/^orders\/[0-9a-f-]{36}$/.test(route));
      const write=request.method==='POST'&&(route==='session'||route==='orders'||/^orders\/[0-9a-f-]{36}\/check$/.test(route));
      if(!read&&!write)return failure(404);
      return checkout.fetch(new Request(new URL('/api/checkout/'+route,url),request),env);
    }
    if(request.method!=='GET'&&request.method!=='HEAD')return failure(404);
    const asset=path===PILOT_PATH||path===PILOT_PATH+'/'?'index.html':path.slice(PILOT_PATH.length+1);
    if(path!==PILOT_PATH&&path!==PILOT_PATH+'/'&&
       (!path.startsWith(PILOT_PATH+'/assets/')||!/^assets\/[-a-zA-Z0-9_]+\.(?:js|css|png)$/.test(asset)))return failure(404);
    const body=Object.hasOwn(assets,asset)?assets[asset]:undefined;
    if(body===undefined)return failure(404);
    const secure=new Headers();
    for(const [name,value]of Object.entries(headers))secure.set(name,value);
    secure.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    secure.set('referrer-policy','no-referrer');
    secure.set('content-type',asset==='index.html'?'text/html; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
    return new Response(request.method==='HEAD'?null:body,{headers:secure});
  };
}
