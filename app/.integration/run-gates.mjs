import { spawnSync } from "node:child_process";
import { readFileSync,writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const manifest=".integration/source-freeze.json";
const baseline=createHash("sha256").update(readFileSync(manifest)).digest("hex");
const freeze=JSON.parse(readFileSync(manifest,"utf8"));
const preload=resolve("../campaign-profile-queues-20261116-candidate/.integration/hide-console-preload.cjs").replaceAll("\\","/");
const env={...process.env,NODE_OPTIONS:`--max-old-space-size=8192 --require="${preload}"`,WRANGLER_SEND_METRICS:"false"};
const result={freezeSHA256:baseline,checks:{}};
const save=()=>writeFileSync(".integration/gates.json",JSON.stringify(result,null,2)+"\n");
function run(name, file, args) {
  const child=spawnSync(file,args,{env,windowsHide:true,encoding:"utf8",maxBuffer:20_000_000});
  const log=(child.stdout??"")+(child.stderr??"")+(child.error?.message??"");
  writeFileSync(".integration/"+name+".log",log);
  result.checks[name]={exit:child.status};
  save();
  console.log(name,child.status);
  if(child.status!==0){console.error(log.slice(-6000));process.exit(1);}
}
const node=process.execPath;
run("verify-before",node,[".integration/source-freeze.mjs","--verify"]);
run("tests",node,["--test","tests/meta-measurement.test.mjs"]);
run("types",node,["../../node_modules/typescript/bin/tsc","--noEmit"]);
run("lint",node,["../../node_modules/eslint/bin/eslint.js",...freeze.changes,...freeze.additions.filter(file=>/\.(ts|tsx)$/.test(file))]);
run("build","powershell.exe",["-NoLogo","-NoProfile","-ExecutionPolicy","Bypass","-File",
  "C:/Users/LMM/AppData/Roaming/agent-grid/agentgrid-bin/agentgrid.ps1","heavy","--","npm","run","build"]);
run("verify-after",node,[".integration/source-freeze.mjs","--verify"]);
result.finishedAt=new Date().toISOString();save();
