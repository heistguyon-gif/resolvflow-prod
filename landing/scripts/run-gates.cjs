const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');
const collect = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collect(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const files = ['package.json','tsconfig.json','eslint.config.mjs',...['src','assets','scripts','tests'].flatMap(collect)].map(file=>file.replaceAll('\\','/')).sort();
const freeze = Object.fromEntries(files.map(file=>[file,hash(file)]));
const artifactsOnly=process.argv.includes('--artifacts-only');
let reusedChecks=[];
if(artifactsOnly){
 const previousFreeze=JSON.parse(fs.readFileSync('evidence/input-freeze.json','utf8'));
 const previousGates=JSON.parse(fs.readFileSync('evidence/gates.json','utf8'));
 const artifactFiles=new Set(['scripts/build.mjs','scripts/run-gates.cjs','scripts/run-gates.ps1','tests/package.test.mjs']);
 if(Object.keys(previousFreeze.files).sort().join('\n')!==Object.keys(freeze).sort().join('\n'))throw Error('Source inventory changed');
 for(const[file,expected]of Object.entries(previousFreeze.files))if(!artifactFiles.has(file)&&hash(file)!==expected)throw Error('Cannot reuse checks; source changed: '+file);
 reusedChecks=previousGates.checks.filter(check=>['types','lint','runtime-tests'].includes(check.name));
 if(reusedChecks.length!==3||reusedChecks.some(check=>check.exitCode!==0))throw Error('Missing passing source checks');
 reusedChecks=reusedChecks.map(check=>({...check,reusedFrom:previousGates.startedAt,unchangedSourceHashes:true}));
}
fs.writeFileSync('evidence/input-freeze.json',JSON.stringify({capturedAt:new Date().toISOString(),files:freeze},null,2)+'\n');
const gates = {status:'running',startedAt:new Date().toISOString(),checks:reusedChecks,artifactsOnly,published:false,liveCheckout:false};
const save = ()=>fs.writeFileSync('evidence/gates.json',JSON.stringify(gates,null,2)+'\n'); save();
const preload = path.resolve(root,'scripts/hide-console-preload.cjs').replaceAll('\\','/');
function run(name,exe,args,env=process.env){
 console.log('GATE_START '+name);const start=Date.now();
 const result=cp.spawnSync(exe,args,{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,env:{...env,NODE_OPTIONS:[env.NODE_OPTIONS,'--require "'+preload+'"'].filter(Boolean).join(' ')}});
 const output=(result.stdout||'')+(result.stderr||'')+(result.error?String(result.error):'');fs.writeFileSync('evidence/'+name+'.log',output);console.log(output);
 gates.checks.push({name,exe,args,exitCode:result.status,durationMs:Date.now()-start});
 if(result.status!==0){gates.status='failed_'+name;save();process.exit(1);}save();
}
if(!artifactsOnly){
 run('types',process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit']);
 run('lint',process.execPath,[path.join(path.dirname(require.resolve('eslint/package.json')),'bin/eslint.js'),'src']);
 run('runtime-tests',process.execPath,['--test','--test-concurrency=1','tests/checkout.test.mjs','tests/package.test.mjs']);
}
const agentGrid='C:/Users/LMM/AppData/Local/Programs/Agent Grid/Agent Grid.exe';
if(fs.existsSync(agentGrid))run('build',agentGrid,['C:/Users/LMM/AppData/Local/Programs/Agent Grid/resources/app.asar/scripts/heavy/agentgrid.mjs','heavy','--',process.execPath,'scripts/build.mjs'],{...process.env,ELECTRON_RUN_AS_NODE:'1'});else run('build',process.execPath,['scripts/build.mjs']);
run('artifact-check',process.execPath,['--test','tests/package.test.mjs'],{...process.env,VERIFY_BUILT_PACKAGE:'1'});
for(const[file,expected]of Object.entries(freeze))if(hash(file)!==expected)throw Error('Source drift: '+file);
const baseline=JSON.parse(fs.readFileSync('evidence/baseline.json','utf8'));
for(const[file,expected]of Object.entries(baseline.files))if(hash(path.join(baseline.source,file))!==expected)throw Error('Read-only source changed: '+file);
if(hash('src/shared/planProposals.ts')!==baseline.files['src/shared/planProposals.ts'])throw Error('Plan hypotheses changed');
const artifacts=JSON.parse(fs.readFileSync('evidence/build-artifacts.json','utf8'));
const manifest={status:'ready_for_independent_review',createdAt:new Date().toISOString(),packageRoot:root,files:freeze,contract:baseline.contract,artifacts,checks:gates.checks.map(({name,exitCode})=>({name,exitCode})),sourceLandingPreserved:true,liveCheckout:false,published:false,visualQa:'pending canvas inspection; no screenshots claimed'};
fs.writeFileSync('evidence/manifest.json',JSON.stringify(manifest,null,2)+'\n');gates.status='pass';gates.completedAt=new Date().toISOString();gates.manifestSha256=hash('evidence/manifest.json');save();console.log('LANDING_CHECKOUT_GATES_PASS');
