import {spawnSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const stage=process.cwd(), app=resolve('../private-plan-pilot-app-20261118-candidate');
const anchor=resolve('../../node_modules');
const runner='C:/Users/LMM/AppData/Roaming/agent-grid/agentgrid-bin/agentgrid.ps1';
const preload=resolve('scripts/hide-console-preload.cjs').replaceAll('\\','/');
const env={...process.env,VERIFY_BUILT_PACKAGE:'1',NODE_OPTIONS:`--max-old-space-size=8192 --require="${preload}"`,WRANGLER_SEND_METRICS:'false'};
const results={};
function run(name,cwd,file,args){
 const r=spawnSync(file,args,{cwd,env,windowsHide:true,encoding:'utf8',maxBuffer:24576000});
 const log=(r.stdout??'')+(r.stderr??'');
 writeFileSync('evidence/'+name+'.log',log);
 results[name]={exit:r.status};
 if(name.includes('tests'))results[name].passed=Number(log.replace(/\x1b\[[0-9;?]*[A-Za-z]/g,'').match(/ℹ pass\s+(\d+)/)?.[1]??0);
 writeFileSync('evidence/pilot-gates.json',JSON.stringify(results,null,2));
 console.log(name,JSON.stringify(results[name]));
 if(r.status!==0){console.error(log.slice(-3500));process.exit(1);}
}
const node=process.execPath;
function n(name,cwd,args){run(name,cwd,node,args);}
function build(name,cwd){run(name,cwd,'powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',runner,'heavy','--','npm','run','build']);}
build('landing-build',stage);
n('landing-compose',stage,['evidence/compose-pilot.mjs']);
n('landing-types',stage,[anchor+'/typescript/bin/tsc','--noEmit']);
n('landing-lint',stage,[anchor+'/eslint/bin/eslint.js','src','server/worker.ts','server/pilot-service.ts','server/pilot-entry.ts']);
n('landing-tests',stage,['--test','--test-concurrency=1','tests/checkout.test.mjs','tests/live-checkout.test.mjs','tests/live-checkout-ui.test.mjs','tests/package.test.mjs']);
n('landing-entrypoint-bundle',stage,[anchor+'/esbuild/bin/esbuild','server/pilot-entry.ts','--bundle','--format=esm','--platform=browser','--external:cloudflare:workers','--outfile=evidence/private-worker-bundle.mjs']);
n('app-tests',app,['--test','tests/plan-checkout-pilot.test.mjs']);
n('app-types',app,[anchor+'/typescript/bin/tsc','--noEmit']);
n('app-lint',app,[anchor+'/eslint/bin/eslint.js','lib/plan-checkout-pilot.ts','app/planos-piloto/[[...parts]]/route.ts']);
build('app-build',app);
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const freeze=(cwd,basePath,changed)=>{
 const base=JSON.parse(readFileSync(resolve(cwd,basePath),'utf8'));
 const sources={...base.sources};
 for(const p of Object.keys(sources))if(!changed.includes(p)&&digest(resolve(cwd,p))!==sources[p])throw Error('Unexpected change '+p);
 for(const p of changed)sources[p]=digest(resolve(cwd,p));
 return {baseVersion:base.version,changed,sources};
};
const landing=freeze(stage,'evidence/pilot-baseline.json',['src/checkout/catalog.ts','src/checkout/LiveCheckoutDialog.tsx','src/checkout/PrivatePixPilot.tsx','src/App.tsx','server/worker.ts','server/pilot-entry.ts','server/pilot-service.ts','server/cloudflare-runtime.d.ts','server/pilot-assets.generated.ts','wrangler.stage.jsonc','tests/live-checkout.test.mjs','tests/package.test.mjs','evidence/compose-pilot.mjs']);
const operation=freeze(app,'.integration/pilot-baseline.json',['wrangler.jsonc','lib/plan-checkout-pilot.ts','app/planos-piloto/[[...parts]]/route.ts','tests/plan-checkout-pilot.test.mjs']);
writeFileSync('evidence/pilot-release-freeze.json',JSON.stringify({landing,operation,results},null,2));
console.log('PILOT_GATES_PASS');
