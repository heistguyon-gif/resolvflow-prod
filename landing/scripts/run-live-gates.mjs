import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
const req=createRequire(import.meta.url), node=process.execPath;
const results={};
const env={...process.env,VERIFY_BUILT_PACKAGE:'1',NODE_OPTIONS:'--require="'+resolve('scripts/hide-console-preload.cjs').replaceAll(String.fromCharCode(92),'/')+'" --max-old-space-size=8192'};
function run(name,file,args) {
 const r=spawnSync(file,args,{env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 writeFileSync('evidence/'+name+'.log',(r.stdout??'')+(r.stderr??''));
 results[name]=r.status;writeFileSync('evidence/live-gates.json',JSON.stringify(results,null,2));
 if (r.status!==0) {console.error(name,r.status,(r.stdout??'').slice(-3000),(r.stderr??'').slice(-2000));process.exit(1);}
 console.log(name+' PASS');
}
run('types',node,[req.resolve('typescript/bin/tsc'),'--noEmit']);
run('lint',node,[join(dirname(req.resolve('eslint/package.json')),'bin/eslint.js'),'src','server']);
run('build','powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File','C:/Users/LMM/AppData/Roaming/agent-grid/agentgrid-bin/agentgrid.ps1','heavy','--','npm','run','build']);
run('compose',node,['scripts/compose-release.mjs']);
run('worker-build',node,[join(dirname(req.resolve('esbuild/package.json')),'bin/esbuild'),'server/worker.ts','--bundle','--format=esm','--platform=browser','--outfile=evidence/worker-bundle.mjs']);
run('tests',node,['--test','--test-concurrency=1','tests/checkout.test.mjs','tests/live-checkout.test.mjs','tests/live-checkout-ui.test.mjs','tests/package.test.mjs']);
