import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const dir = ".integration/";
const old = "1d5b2b4e-bfaa-4ad6-a428-f1cc3ad163ae";
const receipt = (path, value) => writeFileSync(dir+path, JSON.stringify(value,null,2)+"\n");
const freeze = createHash("sha256").update(readFileSync(dir+"source-freeze.json")).digest("hex");
const gates = JSON.parse(readFileSync(dir+"gates.json","utf8"));
const variant = JSON.parse(readFileSync(dir+"variant3-checks.json","utf8"));
assert.equal(variant.variant3,true);
assert.equal(variant.fixedSimulationCards.length,5);
assert.equal(variant.requests,0);
assert.equal(gates.freezeSHA256,freeze);
for (const step of ["verify-before","tests","types","lint","build","verify-after"]) assert.equal(gates.checks[step]?.exit,0,step);
function run(file,args) {
  const result=spawnSync(file,args,{windowsHide:true,encoding:"utf8",maxBuffer:12_000_000});
  if(result.status!==0) throw Error("Command failed: "+args.join(" ")+" exit "+result.status);
  return result.stdout;
}
const node=process.execPath;
function deployment() {
  const data=JSON.parse(run(node,["../../node_modules/wrangler/bin/wrangler.js","deployments","list","--json"]));
  const last=(Array.isArray(data)?data:data.deployments).sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1);
  return { id:last.id, at:last.created_on, versions:last.versions.map(({version_id,percentage})=>({version_id,percentage})) };
}
const verify=()=>run(node,[dir+"source-freeze.mjs","--verify"]);
verify();
const before=deployment();
receipt("deployment-before.json",before);
assert.deepEqual(before.versions,[{version_id:old,percentage:100}],"Production base changed");
const deploy=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command","npx.cmd --no-install wrangler deploy"],
  {windowsHide:true,encoding:"utf8",maxBuffer:12_000_000});
writeFileSync(dir+"deploy.log",(deploy.stdout??"")+(deploy.stderr??""));
if(deploy.status!==0) {
  receipt("deployment-after-error.json",deployment());
  throw Error("Wrangler deployment exit "+deploy.status+"; inspect readback before retry");
}
const after=deployment();
receipt("deployment-after.json",after);
assert.equal(after.versions.length,1);
assert.equal(after.versions[0].percentage,100);
assert.notEqual(after.versions[0].version_id,old);
const wranglerVersion=(deploy.stdout??"").match(/Current Version ID:\s*([0-9a-f-]{36})/)?.[1];
assert.equal(after.versions[0].version_id,wranglerVersion,"Deployment receipt must match the active version");
console.log(JSON.stringify({freeze,before,after}));

const base="https://resolvflow.online";
const endpoints=[
  ["/planos",200,"text/html"],
  ["/planos-assets/brand-original.png",200,"image/png"],
  ["/planos-assets/reels-contact-sheet.png",200,"image/png"],
  ["/login",200,"text/html"],
  ["/",302,"text/html"],
  ["/dashboard",302,"text/html"],
  ["/planos-piloto",302,"text/html"],
  ["/admin/measurement",302,"text/html"],
  ["/api/admin/measurement",401,"application/json"],
  ["/api/measurement/public",[401,404],"application/json"],
  ["/api/checkout/orders",401,"application/json"],
];
const checks=[];
for(const [path,expected,accept] of endpoints){
  const response=await fetch(base+path,{headers:{accept},redirect:"manual",signal:AbortSignal.timeout(8000)});
  const check={path,expected,status:response.status,ok:[expected].flat().includes(response.status)};
  if(path==="/planos"&&response.ok){
    const html=await response.text();
    check.variant=html.includes("Escolha os destinos")&&html.includes("Simular compra");
    check.noExternalPixelScript=!/src=["'][^"']*connect\.facebook\.net/.test(html);
    check.ok&&=check.variant&&check.noExternalPixelScript;
  }else if(path.includes(".png")&&response.ok){
    const local=createHash("sha256").update(readFileSync("public"+path)).digest("hex");
    const remote=createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    check.byteMatch=local===remote;
    check.ok&&=check.byteMatch;
  }else await response.body?.cancel();
  checks.push(check);
  receipt("public-checks.json",checks);
}
assert.ok(checks.every(check=>check.ok),"Inspect public-checks.json before deciding on follow-up");
