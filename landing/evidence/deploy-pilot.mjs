import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const landing=process.cwd(),app=resolve('../private-plan-pilot-app-20261118-candidate'),cli=resolve('../../node_modules/wrangler/bin/wrangler.js');
const read=f=>JSON.parse(readFileSync(f,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const freeze=read('evidence/pilot-release-freeze.json');
const gates=read('evidence/pilot-gates.json');
const workerd=read('evidence/workerd-pilot-proof.json');
if(workerd.screen!==200||workerd.asset!==200||!workerd.catalog||workerd.publicAssets!==404||workerd.vendorRequests!==0)throw Error('Internal service proof missing');
const state={at:new Date().toISOString(),financialOperations:0,publicCheckoutEnabled:false};
function save(){writeFileSync('evidence/pilot-release-state.json',JSON.stringify(state,null,2));}
for(const key of ['landing-build','landing-compose','landing-types','landing-lint','landing-tests','landing-entrypoint-bundle','app-tests','app-types','app-lint','app-build'])if(gates[key]?.exit!==0)throw Error('Failed or missing gate '+key);
for(const [dir,source] of [[landing,freeze.landing],[app,freeze.operation]])for(const [path,digest] of Object.entries(source.sources))if(sha(readFileSync(resolve(dir,path)))!==digest)throw Error('Manifest drift '+path);
const config=read('wrangler.stage.jsonc');
if(config.name!=='resolvflow-landing-variants-20261118'||config.vars.PLAN_CHECKOUT_ENABLED!=='false'||config.vars.PLAN_PRIVATE_PILOT_ENABLED!=='true'||config.assets.directory!=='./publish-stage'||config.main!=='server/pilot-entry.ts')throw Error('Landing config mismatch');
const ops=JSON.parse(readFileSync(resolve(app,'wrangler.jsonc'),'utf8').replace(/^\ufeff/,''));
if(ops.name!=='nexoflow-operacao-mk'||ops.services?.length!==1||ops.services[0].entrypoint!=='PlanCheckoutPilot'||ops.services[0].service!==config.name)throw Error('Internal service binding mismatch');
if(!readFileSync(resolve(app,'dist/server/index.js'),'utf8').includes('/planos-piloto'))throw Error('Protected route missing from app bundle');
const prior=read('../../.agent-grid/backups/RF-20261118-landing-variants-release/remote-verification.json').checks;
for(const row of prior) {
 const file=row.route.endsWith('/')?row.route.slice(1)+'index.html':row.route.slice(1);
 if(sha(readFileSync('publish-stage/'+file))!==row.sha256)throw Error('Landing assets changed '+file);
}
if(readdirSync('publish-stage',{recursive:true,withFileTypes:true}).filter(r=>r.isFile()).length!==prior.length+1)throw Error('Unexpected public asset');
const call=(cwd,args,timeout=25000)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',windowsHide:true,timeout,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
const options=['--config','wrangler.stage.jsonc'];
const active=(cwd,opts=[])=>{
 const r=call(cwd,['deployments','list','--json',...opts]);
 if(r.status!==0)throw Error('Unable to read deployments');
 const x=JSON.parse(r.stdout).sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
 if(x.versions.length!==1||x.versions[0].percentage!==100)throw Error('Unexpected traffic distribution');
 return {id:x.id,version:x.versions[0].version_id,percentage:100,time:x.created_on};
};
state.before={landing:active(landing,options),app:active(app)};
if(state.before.landing.version!==freeze.landing.baseVersion||state.before.app.version!==freeze.operation.baseVersion)throw Error('Active version changed; recompose before release');
if(process.argv.includes('--preflight')){console.log(JSON.stringify({preflight:true,bases:state.before}));process.exit(0);}
save();
function deploy(kind,cwd,opts=[]){
 state[kind]={attempted:true};save();
 const r=call(cwd,['deploy',...opts],240000);
 const announced=(r.stdout??'').match(/Current Version ID:\s*([a-f0-9-]{36})/)?.[1]??null;
 const remote=active(cwd,opts);
 Object.assign(state[kind],{exit:r.status,announced,remote,confirmed:r.status===0&&Boolean(announced)&&remote.version===announced&&remote.id!==state.before[kind].id});save();
 if(!state[kind].confirmed)throw Error('Unconfirmed '+kind+' deploy. Inspect state before retry.');
}
const origin='https://resolvflow-landing-variants-20261118.lucasbgn-affiliate.workers.dev';
async function request(url,opts={}){
 const r=await fetch(url,{...opts,redirect:'manual',signal:AbortSignal.timeout(12000)});
 return {status:r.status,location:r.headers.get('location'),data:await r.arrayBuffer()};
}
deploy('landing',landing,options);
const landingChecks=[];
for(const row of prior){
 const r=await request(origin+row.route);
 landingChecks.push({route:row.route,pass:r.status===200&&sha(Buffer.from(r.data))===row.sha256});
}
const catalog=await request(origin+'/api/checkout/plans');
const plan=JSON.parse(Buffer.from(catalog.data).toString());
const hidden=await request(origin+'/_plans-private/');
const stageHealth=await request(origin+'/api/checkout/webhooks/leztypay');
const health=JSON.parse(Buffer.from(stageHealth.data).toString());
const unsigned=await request(origin+'/api/checkout/webhooks/leztypay',{method:'POST',headers:{'content-type':'application/json'},body:'{"type":"ping"}'});
const secretMeta=call(landing,['secret','list','--format','json',...options]);
const names=secretMeta.status===0?new Set(JSON.parse(secretMeta.stdout).map(x=>x.name)):new Set();
state.landing.publicChecks=landingChecks;
state.landing.gates={disabled:plan.enabled===false&&plan.privatePilot===false,hidden:404===hidden.status,webhook:health.readyForSignedPing===true&&health.acceptingOrders===false&&unsigned.status===401,secretPresence:['PLAN_DATA_KEY_HEX','PLAN_SUPPORT_TOKEN','PLAN_LEZTY_API_KEY','PLAN_LEZTY_WEBHOOK_SECRET'].every(n=>names.has(n))};
save();
if(landingChecks.some(c=>!c.pass)||Object.values(state.landing.gates).some(ok=>!ok))throw Error('Landing isolation check failed; operational access not published');
if(active(app).version!==state.before.app.version)throw Error('Operational version advanced before private pilot publication');
deploy('app',app);
const real='https://resolvflow.online';
const checks=[];
const ui=await request(real+'/planos-piloto',{headers:{accept:'text/html'}});
const next=ui.location&&new URL(ui.location,real);
checks.push({case:'anonymous_ui_redirects_to_login',status:ui.status,pass:ui.status===302&&next?.origin===real&&next?.pathname==='/login'});
const spoofed={'accept':'application/json','oai-authenticated-user-email':'lucasbgn.affiliate@gmail.com','oai-authenticated-user-id':'synthetic-spoof'};
for(const route of ['/planos-piloto/assets/fake.js','/planos-piloto/api/plans','/planos-piloto/api/orders/18310ff7-8722-4f84-8f16-2e08da96bd0a']){
 const r=await request(real+route,{headers:spoofed});
 checks.push({route,status:r.status,pass:r.status===401});
}
for(const route of ['/planos-piloto/api/session','/planos-piloto/api/orders']){
 const r=await request(real+route,{method:'POST',headers:{...spoofed,origin:real,'content-type':'application/json'},body:'{}'});
 checks.push({route,status:r.status,pass:r.status===401});
}
for(const route of ['/api/admin/otp/pix-gateways','/api/story-bridge/package','/api/story-bridge/highlights']){
 const r=await request(real+route,{headers:{accept:'application/json'}});
 checks.push({route,status:r.status,pass:r.status===401});
}
state.app.publicChecks=checks;
state.verified=checks.every(c=>c.pass);
state.authenticatedSessionExercise=false;
save();
console.log(JSON.stringify({landing:state.landing.remote,app:state.app.remote,checks:checks.filter(c=>c.pass).length,verified:state.verified}));
if(!state.verified)process.exitCode=1;
