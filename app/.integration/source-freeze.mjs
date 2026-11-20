import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const manifest = ".integration/source-freeze.json";
const checksum = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const base = JSON.parse(readFileSync(".integration/base.json", "utf8"));
const owned = [
  "app/admin/measurement", "app/api/admin/measurement", "app/api/measurement", "app/planos", "lib/measurement", "public/planos-assets",
];
const additions = [
  ...owned.flatMap(folder => readdirSync(folder,{recursive:true,withFileTypes:true})
    .filter(item=>item.isFile()).map(item=>(item.parentPath+"/"+item.name).replaceAll("\\","/"))),
  "app/components/MeasurementDashboard.tsx", "app/components/Measurement.module.css",
].filter(file=>!Object.hasOwn(base.inventory,file)).sort();
const changes = ["worker/index.ts"];
const sources = Object.fromEntries([...new Set([...Object.keys(base.inventory),...additions])].sort().map(file=>[file,checksum(file)]));
for (const [file,hash] of Object.entries(base.inventory)) if (!changes.includes(file)&&sources[file]!==hash) throw Error("Unexpected drift " + file);
const current = {active:base.active, baseCount:Object.keys(base.inventory).length, changes, additions, sources};
if (process.argv.includes("--verify")) {
  if (JSON.stringify(JSON.parse(readFileSync(manifest,"utf8")))!==JSON.stringify(current)) throw Error("Freeze drift");
} else writeFileSync(manifest, JSON.stringify(current,null,2)+"\n");
console.log(JSON.stringify({baseline:current.baseCount,sources:Object.keys(sources).length,changed:changes.length,added:additions.length,sha256:checksum(manifest)}));
