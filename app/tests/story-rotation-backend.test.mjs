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

test('rotation defaults legacy to zero, accepts integer boundaries and canonical form strings',()=>{
 for(const rotation of [undefined,-180,-90,0,90,180,'-180','0','180']) {
 const f=bridge.templateFields({...fields(),stickerRotation:rotation});assert.equal(f.stickerRotation,Number(rotation??0));assert.equal(bridge.viewSticker(f).stickerRotation,Number(rotation??0));
 }
 for(const rotation of [NaN,Infinity,-Infinity,1.5,-181,181,null,true,'',' ',' 1','1 ','+1','1.0','1e2','01','180x','NaN','Infinity',{},[]]) assert.throws(()=>bridge.templateFields({...fields(),stickerRotation:rotation}));
 assert.equal(bridge.viewSticker(fields()).stickerRotation,0);
});
for(const highlight of [true,false]) for(const link of [true,false]) test(`rotation compatibility highlight=${highlight} link=${link}`,async()=>{
 const f=fixture({highlight,link,capable:true});
 await bridge.mutate(f.bucket,owner,state=>{state.templates[0].stickerRotation=45});
 if(link) {await assert.rejects(bridge.publish(f.bucket,owner,f.input,now),{code:'extension_update_required'});assert.equal(f.state.dispatches.length,0);await f.beat({storyOptions:1,stickerRotation:1});}
 await bridge.publish(f.bucket,owner,f.input,now+2);
 const {command}=await f.beat(link?{storyOptions:1,stickerRotation:1}:{storyOptions:1});assert.equal(command.template.stickerRotation,45);assert.equal(command.template.createHighlight,highlight);
});
test('zero-degree linked legacy template still reaches older extension',async()=>{
 const f=fixture({legacy:true});await bridge.publish(f.bucket,owner,f.input,now);const {command}=await f.beat();assert.equal(command.template.stickerRotation,0);assert.equal(command.template.createHighlight,true);
});
test('rotation capability downgrade prevents queued claim',async()=>{
 const f=fixture({capable:true});await bridge.mutate(f.bucket,owner,state=>{state.templates[0].stickerRotation=-90;state.browsers[0].capabilities={storyOptions:1,stickerRotation:1}});
 await bridge.publish(f.bucket,owner,f.input,now);assert.equal((await f.beat({storyOptions:1})).command,null);assert.equal(f.state.dispatches[0].jobs[0].status,'expired');
});
test('capability validation and stale session/delegation guard remain independent',async()=>{
 const f=fixture({capable:true});for(const value of [true,0,2,'1',null]) await assert.rejects(f.beat({storyOptions:1,stickerRotation:value}));
 await f.beat({storyOptions:1,stickerRotation:1});await bridge.publish(f.bucket,owner,f.input,now);
 const body={browserId:f.browser.id,sessionId:f.browser.sessionId,label:'fixture',instagramUserId:'123',available:true,capabilities:{storyOptions:1,stickerRotation:1}};
 assert.equal((await bridge.heartbeat(f.bucket,f.auth,body,now+1,{allowed:false,bindingKey:''})).command,null);
 assert.equal((await f.beat({storyOptions:1,stickerRotation:1},{sessionId:id()})).command,null);
});
test('copy persists rotation and replay returns same template without extra image writes',async()=>{
 const f=fixture({capable:true});const images=new Map();let writes=0;
 const bucket={async get(key){if(key.startsWith('story-bridge/workspaces/')&&key.endsWith('/state.json'))return f.bucket.get(key);return images.get(key)},async put(key,body,options){if(key.endsWith('/state.json'))return f.bucket.put(key,body,options);writes++;images.set(key,{body});return {etag:'image'}}};
 const copy={id:id(),sourceOwner:'original',sourceTemplateId:id()};const fieldsCopy=bridge.templateFields({...fields(false),stickerRotation:'-180'});
 const first=await bridge.addTemplate(bucket,owner,fieldsCopy,new Uint8Array([255,216,255]),copy);
 const again=await bridge.addTemplate(bucket,owner,fieldsCopy,new Uint8Array([255,216,255]),copy);
 assert.equal(first.stickerRotation,-180);assert.equal(again.id,first.id);assert.equal(again.stickerRotation,-180);assert.equal(writes,1);
 assert.equal(f.state.templates.find(t=>t.id===first.id).stickerRotation,-180);
});
