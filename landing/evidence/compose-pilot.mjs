import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const step=spawnSync(process.execPath,['scripts/compose-release.mjs','--stage-disabled'],{stdio:'inherit',windowsHide:true});
if(step.status!==0)throw Error('Public disabled baseline failed');
const files=JSON.parse(await readFile('evidence/build-artifacts.json','utf8')).publicAssets;
const privateFiles=files.filter(file=>/^assets\/[-a-zA-Z0-9_]+\.(?:js|css)$/.test(file.path));
if(privateFiles.length!==2)throw Error('Unexpected pilot bundle assets');
const result=(await readFile('dist/index.html','utf8'))
  .replace('<html lang="pt-BR">','<html lang="pt-BR" data-checkout="pilot">')
  .replace("connect-src 'none'","connect-src 'self'")
  .replace(/(src|href)="assets\//g,'$1="/planos-piloto/assets/')
  .replace(/<title>.*?<\/title>/,'<title>ResolvFlow · Piloto privado de Pix</title>');
if(!result.includes('data-checkout="pilot"')||!result.includes('/planos-piloto/assets/'))throw Error('Pilot HTML not mounted');
const assets=Object.fromEntries([['index.html',result],...await Promise.all(privateFiles.map(async file=>[file.path,await readFile('dist/'+file.path,'utf8')]))]);
const sha=Object.fromEntries(Object.entries(assets).map(([file,body])=>[file,createHash('sha256').update(body).digest('hex')]));
await writeFile('server/pilot-assets.generated.ts','export const pilotAssets = '+JSON.stringify(assets)+';\n');
await writeFile('evidence/private-assets.json',JSON.stringify(sha,null,2));
console.log(JSON.stringify({protectedAssets:Object.keys(assets).length,publicVariantsPreserved:8}));
