import { instagramIdentityDocument } from "./instagram-identity.js";

// Native request contract derived from reviewed/tested c370ebd2? PAGE source.
// No effects on import. Native auth/body construction and response stay in MAIN.
export async function instagramHighlightPageMAIN(target, deadlineMs, performEffect = false) {

async function executeNative(target,proofExpiresAtMs,performEffect=false){
 const userId=target.userId,storyId=target.storyId,pk=storyId.split('_')[0],title=target.title;
 let request;
 try{
  if(!Number.isFinite(proofExpiresAtMs)||Date.now()>proofExpiresAtMs||!/^\d{1,30}$/.test(userId)||!/^\d{1,30}_\d{1,30}$/.test(storyId)||storyId!==pk+'_'+userId||typeof title!=='string'||!title.trim()||title.length>30||/[\x00-\x1f\x7f]/.test(title))throw Error();
  if(location.origin!=='https://www.instagram.com'||/\/(challenge|checkpoint|accounts\/login)(\/|$)/.test(location.pathname))throw Error();
  const load=globalThis.require;if(typeof load!=='function')throw Error();
  const config=load('PolarisConfig'),native=load('PolarisInstajax'),knob=load('justknobx'),sprinkle=load('SprinkleConfig');
  if(String(config.getViewerId())!==userId||typeof native.getHeaders!=='function'||typeof native.map!=='function'||!native.map.toString().includes('5605'))throw Error();
  const csrf=config.getCSRFToken();
  if(typeof csrf!=='string'||!csrf||sprinkle.param_name!=='jazoest')throw Error();
  const sprinkleToken=config.getSprinkleToken();
  if(typeof sprinkleToken!=='string'||!sprinkleToken||sprinkleToken.length>8192||/[\r\n]/.test(sprinkleToken))throw Error();
  const nativeHeaders=native.getHeaders('POST','/api/v1/highlights/create_reel/');
  const allowed=['accept','content-type','x-requested-with','x-csrftoken','x-ig-app-id','x-asbd-id','x-ig-www-claim','x-instagram-ajax','x-web-session-id','x-ig-max-touch-points','x-web-device-id','x-mid','x-bloks-version-id'];
  const headers={};let total=0;
  for(const [rawName,rawValue]of Object.entries(nativeHeaders)){
   const name=rawName.toLowerCase();
   if(!allowed.includes(name)||name in headers||!['string','number'].includes(typeof rawValue)||typeof rawValue==='number'&&!Number.isFinite(rawValue))throw Error();
   const value=String(rawValue);total+=name.length+value.length;
   if(value.length>8192||/[\r\n]/.test(value)||total>32768)throw Error();headers[name]=value;
  }
  // Only qwest defaults observed on native wire; never synthesize auth/Origin/Referer/Cookie.
  headers.accept??='*/*';headers['content-type']??='application/x-www-form-urlencoded';headers['x-requested-with']??='XMLHttpRequest';
  if(headers.accept!=='*/*'||headers['content-type']!=='application/x-www-form-urlencoded'||headers['x-requested-with']!=='XMLHttpRequest'
    ||headers['x-csrftoken']!==csrf||!headers['x-web-session-id']||!headers['x-instagram-ajax']||!headers['x-ig-www-claim'])throw Error();
  const fields={cover:JSON.stringify({media_id:pk}),media_ids:JSON.stringify([pk+'_'+userId]),source:'self_profile',title};
  fields[sprinkle.param_name]=sprinkleToken;
  const gate=knob._('5605');let token;
  if(gate===true){token=load('DTSG').getToken();if(typeof token!=='string'||!token||token.length>8192||/[\r\n]/.test(token))throw Error();fields.fb_dtsg=token;}
  else if(gate!==false)throw Error();
  request={method:'POST',credentials:'include',redirect:'manual',headers,body:new URLSearchParams(fields).toString()};
  // Recheck current authenticated native state synchronously before fetch; no secret leaves MAIN.
  if(String(config.getViewerId())!==userId||config.getCSRFToken()!==csrf||config.getSprinkleToken()!==sprinkleToken
    ||knob._('5605')!==gate||(gate&&load('DTSG').getToken()!==token)||Date.now()>proofExpiresAtMs)throw Error();
  if(!performEffect)return {status:'dry_run_ready'};
 }catch{return {status:'blocked',errorEnum:'page_native_contract_guard'};}
 try{
  // ONLY HTTP effect. No spoofed Origin/Referer/Sec-Fetch. Browser supplies native PAGE headers.
  const response=await fetch('https://www.instagram.com/api/v1/highlights/create_reel/',{...request,signal:AbortSignal.timeout(20000)});
  const mime=response.headers.get('content-type')||'';
  const meta={httpStatus:response.status,contentClass:mime.includes('json')?'json':mime.includes('html')?'html':'other',redirectClass:'not_observed'};
  if(response.type==='opaqueredirect'||(response.status>=300&&response.status<400)){
   await response.body?.cancel();return {status:'uncertain',...meta,redirectClass:'observed_destination_unknown',errorEnum:'redirect'};
  }
  const reader=response.body?.getReader();if(!reader)return {status:'uncertain',...meta,errorEnum:'missing_body'};
  const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1048576){await reader.cancel();return {status:'uncertain',...meta,errorEnum:'body_limit'};}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const text=new TextDecoder().decode(bytes);
  if(meta.contentClass==='html'||/^\s*(?:<!doctype|<html)/i.test(text)){
   return {status:'uncertain',...meta,contentClass:'html',errorEnum:'html_response'};
  }
  let data;try{data=JSON.parse(text)}catch{return {status:'uncertain',...meta,errorEnum:'invalid_json'};}
  const reel=data?.reel,id=reel?.id??data?.id??reel?.pk;
  const reelId=typeof id==='string'?id:Number.isSafeInteger(id)?String(id):'';
  const validId=/^(?:highlight:)?\d+$/.test(reelId);
  const exactId=value=>typeof value==='string'?value:Number.isSafeInteger(value)?String(value):'';
  const matches=reel&&typeof reel==='object'?{
   ownerMatches:exactId(reel.user?.pk??reel.user?.id??reel.user_id)===userId,
   storyMatches:Array.isArray(reel.items)&&reel.items.some(item=>exactId(item.id)===storyId||exactId(item.pk)===pk),
   titleMatches:reel.title===title
  }:{};
  const confirmed=response.ok&&(!data.status||data.status==='ok')&&validId&&matches.ownerMatches&&matches.storyMatches&&matches.titleMatches;
  return {status:confirmed?'confirmed':'uncertain',...meta,...(validId?{reelId}:{}),...matches,...(!confirmed?{errorEnum:'unconfirmed'}:{})};
 }catch{return {status:'uncertain',errorEnum:'page_transport_uncertain'};}
}

  const blocked = () => ({ status: "blocked", errorEnum: "page_native_contract_guard" });
  if (!target || !Number.isFinite(deadlineMs) || Date.now() > deadlineMs) return blocked();
  if (typeof target.userId !== "string" || !/^\d{1,30}$/.test(target.userId) || typeof target.storyId !== "string" || typeof target.title !== "string") return blocked();
  const action = target.action;
  if (!action) return performEffect ? blocked() : executeNative(target, deadlineMs, false);
  if (!/^[a-f0-9-]{36}$/i.test(target.handle || "") || !/^\d{1,30}$/.test(target.userId)) return blocked();
  const key = "__resolvHighlightPort_" + target.handle;
  if (action === "prepare") {
    if (performEffect || globalThis[key]) return blocked();
    try {
      const sessionTag = () => {
        const load = globalThis.require, config = load("PolarisConfig"), native = load("PolarisInstajax"), gate = load("justknobx")._("5605");
        const headers = native.getHeaders("POST", "/api/v1/highlights/create_reel/");
        const webSession = Object.entries(headers).find(([name]) => name.toLowerCase() === "x-web-session-id")?.[1];
        return JSON.stringify([String(config.getViewerId()), config.getCSRFToken(), config.getSprinkleToken(), gate, gate ? load("DTSG").getToken() : null, webSession]);
      };
      const before = sessionTag();
      const ready = await executeNative(target, deadlineMs, false);
      if (ready.status !== "dry_run_ready" || sessionTag() !== before) return blocked();
      const owner = target.userId, expires = Date.now() + 120000;
      let used = false;
      const timer = setTimeout(() => { delete globalThis[key]; }, 120000);
      const clear = () => { clearTimeout(timer); delete globalThis[key]; };
      const port = async (next, deadline, effect) => {
        if (next.action === "dispose") { clear(); return { status: "disposed" }; }
        try {
          if (used || next.userId !== owner || Date.now() > expires || Date.now() > deadline || sessionTag() !== before) throw Error();
          if (next.action === "validate" && !effect) return executeNative(next, deadline, false);
          if (next.action !== "create" || !effect) throw Error();
          used = true; clear(); // One admission, including uncertain/failed transport.
          return await executeNative(next, deadline, true);
        } catch { return blocked(); }
      };
      Object.defineProperty(globalThis, key, { value: port, configurable: true });
      return ready;
    } catch { return blocked(); }
  }
  const port = globalThis[key];
  return typeof port === "function" ? port(target, deadlineMs, performEffect) : blocked();
}

export function createInstagramHighlightPage({ chromeApi = globalThis.chrome, contextTimeoutMs = 12000 } = {}) {
  const unavailable = () => Object.assign(new Error("Native PAGE context unavailable."), { code: "page_context_unavailable" });
  const validTab = tab => {
    try { return new URL(tab.url).origin === "https://www.instagram.com" && tab.status === "complete" && (!tab.pendingUrl || tab.pendingUrl === tab.url) && !/\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(new URL(tab.url).pathname); } catch { return false; }
  };
  return async ownerId => {
    if (!/^\d{1,30}$/.test(ownerId) || !chromeApi?.scripting?.executeScript) throw unavailable();
    const contextDeadline = Date.now() + Math.max(1, Math.min(12000, contextTimeoutMs));
    const waitContext = async promise => {
      const remaining = contextDeadline - Date.now();
      if (remaining <= 0) throw unavailable();
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), remaining); })]); }
      finally { clearTimeout(timer); }
    };
    const tabs = (await waitContext(chromeApi.tabs.query({ url: "https://www.instagram.com/*" }))).filter(validTab).sort((a, b) => Number(b.active === true) - Number(a.active === true) || a.id - b.id).slice(0, 5);
    const candidates = [];
    for (const tab of tabs) {
      if (!validTab(await waitContext(chromeApi.tabs.get(tab.id)))) continue;
      const rows = await waitContext(chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: "MAIN", func: instagramIdentityDocument, args: [ownerId] }));
      if (rows.length === 1 && rows[0].frameId === 0 && rows[0].documentId && rows[0].result?.instagramUserId === ownerId) candidates.push({ tabId: tab.id, documentId: rows[0].documentId });
    }
    if (!candidates.length) throw unavailable();
    const binding = candidates[0], handle = crypto.randomUUID();
    let used = false;
    const probe = { userId: ownerId, storyId: "1_" + ownerId, title: "Preflight", handle };
    const call = async (action, values = {}, effect = false) => {
      if (!validTab(await chromeApi.tabs.get(binding.tabId))) throw unavailable();
      const waitMs = effect ? 25000 : action === "prepare" ? Math.min(12000, contextDeadline - Date.now()) : Math.max(1, Math.min(12000, contextTimeoutMs));
      if (waitMs <= 0) throw unavailable();
      let timer;
      try {
        const result = await Promise.race([
          chromeApi.scripting.executeScript({ target: { tabId: binding.tabId, documentIds: [binding.documentId] }, world: "MAIN", func: instagramHighlightPageMAIN, args: [{ ...probe, ...values, action }, Date.now() + waitMs, effect] }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), waitMs); }),
        ]);
        if (result.length !== 1 || result[0].frameId !== 0 || result[0].documentId !== binding.documentId) throw unavailable();
        return project(result[0].result);
      } finally { clearTimeout(timer); }
    };
    if ((await call("prepare")).status !== "dry_run_ready") throw unavailable();
    return {
      async assertReady() { if (used || (await call("validate")).status !== "dry_run_ready") throw unavailable(); },
      async createHighlight({ storyId, title }) {
        if (used) return { status: "blocked", errorEnum: "port_used" };
        used = true;
        try { return await call("create", { storyId, title }, true); }
        catch { return { status: "uncertain", errorEnum: "page_transport_uncertain" }; }
      },
      async dispose() { used = true; try { await call("dispose"); } catch { /* document gone; no effect/retry */ } },
    };
  };
}

function project(value) {
  const statuses = ["dry_run_ready", "confirmed", "uncertain", "blocked", "disposed"];
  if (!value || !statuses.includes(value.status)) throw Error("Invalid PAGE result");
  const result = { status: value.status };
  if (typeof value.reelId === "string" && /^(?:highlight:)?\d{1,100}$/.test(value.reelId)) result.reelId = value.reelId;
  for (const key of ["ownerMatches", "storyMatches", "titleMatches"]) if (typeof value[key] === "boolean") result[key] = value[key];
  if (Number.isInteger(value.httpStatus) && value.httpStatus >= 0 && value.httpStatus <= 599) result.httpStatus = value.httpStatus;
  if (["json", "html", "other"].includes(value.contentClass)) result.contentClass = value.contentClass;
  if (["not_observed", "observed_destination_unknown"].includes(value.redirectClass)) result.redirectClass = value.redirectClass;
  if (["page_native_contract_guard", "redirect", "missing_body", "body_limit", "html_response", "invalid_json", "unconfirmed", "page_transport_uncertain", "port_used"].includes(value.errorEnum)) result.errorEnum = value.errorEnum;
  return result;
}
