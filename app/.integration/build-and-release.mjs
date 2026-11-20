import {spawnSync} from "node:child_process";

for (const script of ["run-gates.mjs","publish-public-plans.mjs"]) {
  const result = spawnSync(process.execPath, [".integration/"+script], {windowsHide:true,stdio:"inherit"});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
