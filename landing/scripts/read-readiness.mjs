import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const secretNames=['PLAN_LEZTY_API_KEY','PLAN_LEZTY_WEBHOOK_SECRET','PLAN_DATA_KEY_HEX','PLAN_SUPPORT_TOKEN'];
const cli=resolve('../../node_modules/wrangler/bin/wrangler.js');
const query=(args)=>spawnSync(process.execPath,[cli,...args,'--name','resolvflow-landing-variants-20261118'],{encoding:'utf8',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
const result={at:new Date().toISOString(),mutations:0};
const s=query(['secret','list','--format','json']);
if(s.status===0){
 const names=new Set(JSON.parse(s.stdout).map(x=>x.name));
 result.secrets=Object.fromEntries(secretNames.map(name=>[name,names.has(name)]));
}else result.secretsError='metadata_unavailable';
const d=query(['deployments','list','--json']);
if(d.status===0){
 const active=JSON.parse(d.stdout).sort((a,b)=>Date.parse(a.created_on)-Date.parse(b.created_on)).at(-1);
 result.active={deploymentId:active?.id,versions:active?.versions};
}else result.deploymentsError='metadata_unavailable';
const b=spawnSync(process.execPath,[cli,'r2','bucket','list'],{encoding:'utf8',windowsHide:true});
if(b.status===0){
 result.isolatedBucketPresent=/\bresolvflow-landing-plan-orders\b/.test(b.stdout);
}else result.bucketMetadataError='metadata_unavailable';
writeFileSync('evidence/activation-readproof.json',JSON.stringify(result,null,2));console.log(result);
