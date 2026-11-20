import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/story-bridge.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const bridge=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const id=()=>crypto.randomUUID(), now=1700000000000, owner='test:owner';
const fields=(highlight=true,link=true)=>({name:'fixture',linkUrl:link?'https://example.test/a':'',linkTitle:link?'Visit':'',highlightName:highlight?'Saved':'',createHighlight:highlight});
function fixture(options={}) {
 const browser={id:id(),sessionId:id(),retiredSessions:[],label:'fixture',instagramUserId:'123',available:true,lastSeenAt:new Date(now).toISOString(),...(options.capable?{capabilities:{storyOptions:1}}:{})};
 const template={...bridge.templateFields(fields(options.highlight??true,options.link??true)),id:id(),imageKey:'synthetic',imageType:'image/png',createdAt:new Date(now).toISOString()};
 if(options.legacy) delete template.createHighlight;
 let state={version:1,credentialHash:'fixture',templates:[template],browsers:[browser],dispatches:[]}; let revision=0;
 const bucket={async get(){const snapshot=structuredClone(state),etag=String(revision);return {etag,async json(){return snapshot}}},async put(key,body,opts){assert.equal(opts.onlyIf.etagMatches,String(revision));state=JSON.parse(body);revision++;return {etag:String(revision)}}};
 const auth={owner,hash:'fixture'};
 const input={requestId:id(),templateId:template.id,targets:[{browserId:browser.id,sessionId:browser.sessionId,instagramUserId:'123'}]};
 const beat=(caps=browser.capabilities,extra={})=>bridge.heartbeat(bucket,auth,{browserId:browser.id,sessionId:browser.sessionId,label:'fixture',instagramUserId:'123',available:true,...(caps?{capabilities:caps}:{}),...extra},now+1);
 return {bucket,auth,browser,template,input,beat,get state(){return state}};
}
for(const highlight of [true,false]) for(const link of [true,false]) test(`template independent options highlight=${highlight} link=${link}`,()=>{
 const parsed=bridge.templateFields({...fields(highlight,link),createHighlight:String(highlight)});assert.equal(parsed.createHighlight,highlight);assert.equal(parsed.linkUrl,fields(highlight,link).linkUrl);
});
test('legacy missing flag remains enabled; malformed values fail closed',()=>{
 const f=fields();delete f.createHighlight;assert.equal(bridge.templateFields(f).createHighlight,true);
 for(const createHighlight of ['',null,0,'TRUE','0']) assert.throws(()=>bridge.templateFields({...f,createHighlight}));
 assert.throws(()=>bridge.templateFields({...fields(false),highlightName:'Unexpected'}));
 assert.throws(()=>bridge.templateFields({...fields(false,false),linkTitle:'orphan'}));
 assert.throws(()=>bridge.templateFields({...fields(),linkUrl:'javascript:alert(1)'}));
});
for(const highlight of [true,false]) for(const link of [true,false]) test(`enqueue/claim capability gate highlight=${highlight} link=${link}`,async()=>{
 const f=fixture({highlight,link});
 if(!highlight||!link) {await assert.rejects(bridge.publish(f.bucket,owner,f.input,now),{code:'extension_update_required'});assert.equal(f.state.dispatches.length,0);await f.beat({storyOptions:1});}
 const dispatched=await bridge.publish(f.bucket,owner,f.input,now+2);assert.equal(dispatched.createHighlight,highlight);
 const command=(await f.beat({storyOptions:1})).command;assert.equal(command.template.createHighlight,highlight);assert.equal(command.template.linkUrl,fields(highlight,link).linkUrl);
});
test('capability downgrade at claim expires queued command without dispatch',async()=>{
 const f=fixture({highlight:false,capable:true});await bridge.publish(f.bucket,owner,f.input,now);assert.equal((await f.beat()).command!==null,true);
 const g=fixture({highlight:false,capable:true});await bridge.publish(g.bucket,owner,g.input,now);assert.equal((await g.beat(undefined,{capabilities:undefined})).command,null);assert.equal(g.state.dispatches[0].jobs[0].message,'extension_update_required');
});
test('session rotation and delegation guard cannot claim stale selection',async()=>{
 const f=fixture({capable:true});await assert.rejects(bridge.publish(f.bucket,owner,{...f.input,targets:[{...f.input.targets[0],sessionId:id()}]},now),{code:'selected_browsers_unavailable'});
 await bridge.publish(f.bucket,owner,f.input,now);
 const body={browserId:f.browser.id,sessionId:f.browser.sessionId,label:'fixture',instagramUserId:'123',available:true,capabilities:{storyOptions:1}};
 assert.equal((await bridge.heartbeat(f.bucket,f.auth,body,now+1,{allowed:false,bindingKey:''})).command,null);
 assert.equal((await f.beat({storyOptions:1},{sessionId:id()})).command,null);assert.equal(f.state.dispatches[0].jobs[0].status,'expired');
});
test('no-highlight receipt requires story_published + story only and is idempotent',async()=>{
 const f=fixture({highlight:false,capable:true});await bridge.publish(f.bucket,owner,f.input,now);const {command}=await f.beat();
 const receipt={browserId:f.browser.id,sessionId:f.browser.sessionId,jobId:command.id,status:'published',message:'story_published',storyId:'123_123'};
 await assert.rejects(bridge.result(f.bucket,f.auth,{...receipt,highlightId:'highlight:1'},now+2));
 await assert.rejects(bridge.result(f.bucket,f.auth,{...receipt,message:'published'},now+2));
 await assert.rejects(bridge.result(f.bucket,f.auth,{...receipt,status:'partial',message:'highlight_failed'},now+2));
 assert.equal((await bridge.result(f.bucket,f.auth,receipt,now+2)).status,'published');
 await bridge.result(f.bucket,f.auth,receipt,now+3);assert.equal(f.state.dispatches.length,1);assert.equal(bridge.publicDispatch(f.state.dispatches[0]).jobs[0].message,'story_published');
});
test('legacy receipts still need highlight ID and keep existing acknowledgement',async()=>{
 const f=fixture({legacy:true});await bridge.publish(f.bucket,owner,f.input,now);const {command}=await f.beat();assert.equal(command.template.createHighlight,true);
 const receipt={browserId:f.browser.id,sessionId:f.browser.sessionId,jobId:command.id,status:'published',storyId:'123_123'};
 await assert.rejects(bridge.result(f.bucket,f.auth,receipt,now+2));await bridge.result(f.bucket,f.auth,{...receipt,highlightId:'highlight:1'},now+2);assert.equal(f.state.dispatches[0].jobs[0].message,'published');
});

test('delegated target must match owner and binding snapshot, including capability guard',async()=>{
 const f=fixture({highlight:false,capable:true});
 f.browser.delegation={owner:'recipient',accountUserId:'actor',instagramUserId:'123'};
 // Update only synthetic state through the same persistence boundary.
 await bridge.mutate(f.bucket,owner,state=>{state.browsers[0].delegation=f.browser.delegation});
 await assert.rejects(bridge.publish(f.bucket,owner,f.input,now),{code:'browser_scope'});
 await assert.rejects(bridge.publish(f.bucket,owner,f.input,now,{owner:'wrong',template:f.template}),{code:'browser_scope'});
 const dispatch=await bridge.publish(f.bucket,owner,f.input,now,{owner:'recipient',template:f.template});assert.equal(dispatch.createHighlight,false);
 const body={browserId:f.browser.id,sessionId:f.browser.sessionId,label:'fixture',instagramUserId:'123',available:true,capabilities:{storyOptions:1}};
 assert.equal((await bridge.heartbeat(f.bucket,f.auth,body,now+1,{allowed:true,bindingKey:'stale'})).command,null);
 const key=bridge.storyBindingKey(f.browser);
 assert.equal((await bridge.heartbeat(f.bucket,f.auth,body,now+2,{allowed:true,bindingKey:key})).command.template.createHighlight,false);
});
test('malformed capabilities rejected without replacing existing heartbeat',async()=>{
 const f=fixture({capable:true});for(const caps of [{storyOptions:true},{storyOptions:2},{storyOptions:1,bio:true},{profileSetup:1,bio:true},{storyOptions:1,extra:1}]) await assert.rejects(f.beat(caps));
 assert.equal(f.state.browsers[0].capabilities.storyOptions,1);
 await f.beat({profileSetup:1,bio:true,photo:false,storyOptions:1});assert.equal(f.state.browsers[0].capabilities.profileSetup,1);
});
