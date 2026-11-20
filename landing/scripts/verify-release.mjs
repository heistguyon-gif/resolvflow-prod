import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
const gates = JSON.parse(await readFile('evidence/live-gates.json','utf8'));
if (Object.values(gates).some(exit=>exit!==0) || Object.keys(gates).length!==6) throw Error('Gate failed or missing.');
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
const sources = {};
for (const root of ['src','server','tests','scripts','assets']) {
  for (const rel of await readdir(root,{recursive:true})) {
    const p=(root+'/'+rel).replaceAll(String.fromCharCode(92),'/');
    if ((await stat(p)).isFile()) sources[p]=sha(await readFile(p));
  }
}
for(const p of ['wrangler.jsonc','package.json','tsconfig.json','eslint.config.mjs']) sources[p]=sha(await readFile(p));
const assets = {};
for(const rel of await readdir('publish',{recursive:true})){
 const path=('publish/'+rel).replaceAll(String.fromCharCode(92),'/');
 if ((await stat(path)).isFile()) assets[path.slice(8)]=sha(await readFile(path));
}
const receipt=JSON.parse(await readFile('../../.agent-grid/backups/RF-20261118-landing-variants-release/remote-verification.json','utf8'));
for(const row of receipt.checks){
 const path=row.route.endsWith('/')?row.route.slice(1)+'index.html':row.route.slice(1);
 if(path!=='3/index.html' && assets[path]!==row.sha256)throw Error('Prior publication not preserved: '+path);
}
const entry=await readFile('publish/3/index.html','utf8');
if(!entry.includes('data-checkout="live"')||!entry.includes("connect-src 'self'"))throw Error('Wrong checkout entry.');
for(const ref of entry.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) if(!assets['3/'+ref[1]])throw Error('Missing asset '+ref[1]);
const proof={at:new Date().toISOString(),sources,assets,gates,preservedPublishedPaths:receipt.checks.filter(r=>r.route!=='/3/').length,workerBundleSha:sha(await readFile('evidence/worker-bundle.mjs')),realCharges:0,published:false};
await writeFile('evidence/final-manifest.json',JSON.stringify(proof,null,2));
console.log(JSON.stringify({sourceCount:Object.keys(sources).length,assetCount:Object.keys(assets).length,preserved:proof.preservedPublishedPaths,manifestSha:sha(await readFile('evidence/final-manifest.json'))}));
