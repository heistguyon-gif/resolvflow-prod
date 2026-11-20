import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/story-bridge.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const bridge=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const id=()=>crypto.randomUUID(), now=1700000000000, owner='nexoflow:lucasbgn.affiliate@gmail.com';
const fields=(highlight=true,link=true)=>({name:'fixture',linkUrl:link?'https://example.test/a':'',linkTitle:link?'Visit':'',highlightName:highlight?'Saved':'',createHighlight:highlight});
function fixture(options={}) {
 const browser={id:id(),sessionId:id(),retiredSessions:[],label:'fixture',instagramUserId:'123',available:true,lastSeenAt:new Date(now).toISOString(),...(options.capable?{capabilities:{storyOptions:1}}:{})};
 const template={...bridge.templateFields(fields(options.highlight??true,options.link??true)),id:id(),imageKey:'synthetic',imageType:'image/png',createdAt:new Date(now).toISOString()};
 if(options.legacy) delete template.createHighlight;
 let state={version:1,credentialHash:'fixture',templates:[template],browsers:[browser],dispatches:[]}; let revision=0;
 const bucket={async get(){const snapshot=structuredClone(state),etag=String(revision);return {etag,async json(){return snapshot}}},async put(key,body,opts){assert.equal(opts.onlyIf.etagMatches,String(revision));state=JSON.parse(body);revision++;return {etag:String(revision)}}};
 const auth={owner,hash:'fixture'};
 const input={requestId:id(),templateId:template.id,targets:[{browserId:browser.id,sessionId:browser.sessionId,instagramUserId:'123'}]};
 const beat=(caps=browser.capabilities,extra={},at=now+1)=>bridge.heartbeat(bucket,auth,{browserId:browser.id,sessionId:browser.sessionId,label:'fixture',instagramUserId:'123',available:true,...(caps?{capabilities:caps}:{}),...extra},at);
 return {bucket,auth,browser,template,input,beat,get state(){return state}};
}

const caps={storyOptions:1,stickerRotation:1,highlightManagement:1};
async function hf(){const f=fixture({capable:true});await f.beat(caps);return f;}
const target=f=>f.input.targets[0];
async function listing(f,items=[{id:'highlight:123',title:'Keep'}]) {
 const op=await bridge.createHighlightOperation(f.bucket,owner,{action:'list',requestId:id(),target:target(f)},now+2);
 const {command}=await f.beat(caps);
 assert.equal(command.kind,'highlight_management');assert.equal(command.action,'list');
 await bridge.highlightResult(f.bucket,f.auth,{type:'highlight_result',browserId:f.browser.id,sessionId:f.browser.sessionId,instagramUserId:'123',jobId:op.id,status:'completed',message:'listed',complete:true,highlights:items,ownerInstagramUserId:'123'},now+3);
 return op;
}
const deletion=(f,list,extra={})=>({action:'delete',requestId:id(),target:target(f),listOperationId:list.id,highlightId:'highlight:123',confirmed:true,confirmedTitle:'Keep',...extra});
const receipt=(f,op,extra={})=>({type:'highlight_result',browserId:f.browser.id,sessionId:f.browser.sessionId,instagramUserId:'123',jobId:op.id,status:'completed',message:'deleted',highlightId:'highlight:123',ownerInstagramUserId:'123',deleted:true,absentFromCompleteList:true,...extra});
test('own list complete, empty distinct from failed and safe public projection',async()=>{
 const f=await hf();await listing(f,[]);const overview=await bridge.highlightOverview(f.bucket,owner,now+4);assert.deepEqual(overview.operations[0].highlights,[]);assert.equal(overview.operations[0].status,'completed');assert.equal('ack' in overview.operations[0],false);
});
test('list malformed/duplicate/incomplete/wrong owner is never empty success',async()=>{
 const f=await hf();const op=await bridge.createHighlightOperation(f.bucket,owner,{action:'list',requestId:id(),target:target(f)},now+2);await f.beat(caps);
 const r=receipt(f,op,{message:'listed',complete:true,highlights:[],highlightId:undefined,deleted:undefined,absentFromCompleteList:undefined});
 for(const extra of [{complete:false},{highlights:null},{ownerInstagramUserId:'999'},{highlights:[{id:'highlight:1',title:'a'},{id:'highlight:1',title:'b'}]},{highlights:[{id:'story:1',title:'x'}]},{highlights:Array.from({length:501},(_,i)=>({id:'highlight:'+i,title:'x'}))}]) await assert.rejects(bridge.highlightResult(f.bucket,f.auth,{...r,...extra},now+3));
 assert.equal(f.state.highlightOperations[0].status,'claimed');
});
test('snapshot confirmation requires exact title/id/profile/session and freshness',async()=>{
 const f=await hf(),list=await listing(f);
 for(const extra of [{confirmed:false},{confirmedTitle:'Other'},{highlightId:'highlight:999'},{target:{...target(f),sessionId:id()}}]) await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,deletion(f,list,extra),now+4));
 await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+130000));
});
test('delete receipt strict proof and stable ack, no duplicate side effect on replay',async()=>{
 const f=await hf(),list=await listing(f),body=deletion(f,list);const op=await bridge.createHighlightOperation(f.bucket,owner,body,now+4);
 assert.equal((await bridge.createHighlightOperation(f.bucket,owner,body,now+5)).id,op.id);
 await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,{...body,confirmedTitle:'other'},now+5),{code:'idempotency_conflict'});
 const {command}=await f.beat(caps,{},now+5);assert.equal(command.action,'delete');assert.equal(command.highlightTitle,'Keep');assert.equal((await f.beat(caps)).command,null);
 for(const extra of [{deleted:false},{absentFromCompleteList:false},{highlightId:'highlight:999'},{ownerInstagramUserId:'999'}]) await assert.rejects(bridge.highlightResult(f.bucket,f.auth,receipt(f,op,extra),now+6));
 assert.equal((await bridge.highlightResult(f.bucket,f.auth,receipt(f,op),now+6)).status,'completed');assert.equal((await bridge.highlightResult(f.bucket,f.auth,receipt(f,op),now+7)).status,'completed');
 await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+8),{code:'delete_already_requested'});
 assert.equal(f.state.dispatches.length,0);assert.equal(f.state.templates.length,1);
});
test('claim timeout is uncertain, cannot auto-retry even after a fresh list',async()=>{
 const f=await hf(),list=await listing(f),op=await bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+4);await f.beat(caps,{},now+5);
 bridge.expire(f.state,now+130000);assert.equal(f.state.highlightOperations.find(o=>o.id===op.id).status,'uncertain');
 await assert.rejects(bridge.highlightResult(f.bucket,f.auth,receipt(f,op),now+130000),{code:'stale_job'});
 await bridge.mutate(f.bucket,owner,state=>{state.browsers[0].lastSeenAt=new Date(now+130000).toISOString();const l=state.highlightOperations.find(o=>o.id===list.id);l.completedAt=new Date(now+130000).toISOString();});
 await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+130001),{code:'delete_already_requested'});
});
test('capability and credential restrictions isolate master/delegated targets',async()=>{
 const f=fixture({capable:true});await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,{action:'list',requestId:id(),target:target(f)},now),{code:'extension_update_required'});
 await f.beat(caps);await bridge.mutate(f.bucket,owner,state=>{state.browsers[0].delegation={owner:'other',accountUserId:'other',instagramUserId:'123'}});
 await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,{action:'list',requestId:id(),target:target(f)},now),{code:'selected_browsers_unavailable'});
 await assert.rejects(bridge.highlightOverview(f.bucket,'other',now),{code:'feature_disabled'});
});
test('capability downgrade/rotation stops queued operation; own story and setup share serialization',async()=>{
 const f=await hf();await bridge.createHighlightOperation(f.bucket,owner,{action:'list',requestId:id(),target:target(f)},now+2);
 await assert.rejects(bridge.publish(f.bucket,owner,f.input,now+3),{code:'browser_busy'});
 assert.equal((await f.beat({storyOptions:1})).command,null);assert.equal(f.state.highlightOperations[0].message,'extension_update_required');
 const g=await hf();await bridge.createHighlightOperation(g.bucket,owner,{action:'list',requestId:id(),target:target(g)},now+2);assert.equal((await g.beat(caps,{sessionId:id()})).command,null);assert.equal(g.state.highlightOperations[0].status,'expired');
});
test('actor-bound nonprincipal package cannot claim management',async()=>{
 const f=await hf();await bridge.createHighlightOperation(f.bucket,owner,{action:'list',requestId:id(),target:target(f)},now+2);
 const auth={...f.auth,accountUserId:'nonprincipal',platformOwner:false};
 assert.equal((await bridge.heartbeat(f.bucket,auth,{browserId:f.browser.id,sessionId:f.browser.sessionId,instagramUserId:'123',available:true,label:'fixture',capabilities:caps},now+3)).command,null);
});
test('request CAS retry preserves one queued intent and stable public idempotency',async()=>{
 const f=await hf();let conflict=true;const bucket={get:f.bucket.get,async put(...args){if(conflict){conflict=false;return null}return f.bucket.put(...args)}};
 const body={action:'list',requestId:id(),target:target(f)};const a=await bridge.createHighlightOperation(bucket,owner,body,now+2),b=await bridge.createHighlightOperation(bucket,owner,body,now+3);assert.equal(a.id,b.id);assert.equal(f.state.highlightOperations.length,1);
});
test('conflicting final ack rejected; late successful deletion cannot erase uncertainty',async()=>{
 const f=await hf(),list=await listing(f),op=await bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+4);await f.beat(caps,{},now+5);
 await bridge.highlightResult(f.bucket,f.auth,{...receipt(f,op),status:'uncertain',message:'execution_uncertain',highlightId:undefined,ownerInstagramUserId:undefined,deleted:undefined,absentFromCompleteList:undefined},now+6);
 await assert.rejects(bridge.highlightResult(f.bucket,f.auth,receipt(f,op),now+7),{code:'stale_job'});assert.equal(f.state.highlightOperations.find(o=>o.id===op.id).status,'uncertain');
});
test('delete claim rechecks list freshness and never claims an expired confirmation',async()=>{
 const f=await hf(),list=await listing(f);await bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+100000).catch(()=>{});
 // Refresh only the synthetic browser to isolate confirmation TTL from heartbeat TTL.
 await bridge.mutate(f.bucket,owner,state=>{state.browsers[0].lastSeenAt=new Date(now+110000).toISOString()});
 const op=await bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+110001);assert.equal((await f.beat(caps,{},now+121000)).command,null);assert.equal(f.state.highlightOperations.find(o=>o.id===op.id).message,'stale_list');
});
test('real route gates exact normalized actor AND master workspace, not role',async()=>{
 const {default:vm}=await import('node:vm');
 const route=readFileSync(new URL('../app/api/story-bridge/highlights/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [email,workspace,allowed] of [['lucasbgn.affiliate@gmail.com',owner,true],[' LUCASBGN.AFFILIATE@GMAIL.COM ',owner,true],['other@example.test',owner,false],['lucasbgn.affiliate@gmail.com','other',false]]) {
  const f=await hf(),exports={};const sandbox={exports,Response,require(name){if(name.endsWith('story-bridge-routes'))return {bridgeRoute:async(req,role,action)=>action(f.bucket,workspace,{email,role:'owner'})};if(name.endsWith('story-bridge-http'))return {jsonBody:async r=>r.json()};return bridge;}};
  vm.runInNewContext(code,sandbox);if(allowed)assert.equal((await exports.GET(new Request('https://app.local/api/story-bridge/highlights'))).status,200);else await assert.rejects(exports.GET(new Request('https://app.local/api/story-bridge/highlights')),{code:'feature_disabled'});
 }
});

test('confirmation and claim preserve exact title spaces instead of trimming',async()=>{
 const f=await hf(),list=await listing(f,[{id:'highlight:123',title:'  Keep  '}]);
 assert.equal(f.state.highlightOperations[0].highlights[0].title,'  Keep  ');
 await assert.rejects(bridge.createHighlightOperation(f.bucket,owner,deletion(f,list),now+4),{code:'stale_selection'});
 await bridge.createHighlightOperation(f.bucket,owner,deletion(f,list,{confirmedTitle:'  Keep  '}),now+4);
 assert.equal((await f.beat(caps,{},now+5)).command.highlightTitle,'  Keep  ');
});
