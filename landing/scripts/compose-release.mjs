import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readdir, unlink } from 'node:fs/promises';
const old = new URL('../../landing-variants-20261118/dist/', import.meta.url);
const root = new URL('../', import.meta.url);
const stageOnly = process.argv.includes('--stage-disabled');
const dest = new URL(stageOnly ? 'publish-stage/' : 'publish/',root);
const checks = JSON.parse(await readFile(new URL('../../.agent-grid/backups/RF-20261118-landing-variants-release/remote-verification.json',root),'utf8')).checks;
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
async function write(path,bytes) {
  const target = new URL(path,dest);
  await mkdir(new URL('.',target),{recursive:true});
  await writeFile(target,bytes);
}
for (const entry of checks) {
  const relative=entry.route.endsWith('/') ? entry.route.slice(1)+'index.html' : entry.route.slice(1);
  const bytes=await readFile(new URL(relative,old));
  if (sha(bytes)!==entry.sha256) throw Error('Published asset drift '+relative);
  if (stageOnly || relative!=='3/index.html') await write(relative,bytes);
}
await write('_headers',await readFile(new URL('_headers',old)));
if(stageOnly) {
 const paths=await readdir(dest,{recursive:true,withFileTypes:true});
 if(paths.filter(entry=>entry.isFile()).length!==checks.length+1) throw Error('Unexpected files in disabled landing assets.');
 console.log('DISABLED_LANDING_COMPOSED',checks.length,'published paths byte-identical');
 process.exit(0);
}
const artifacts=JSON.parse(await readFile(new URL('evidence/build-artifacts.json',root),'utf8'));
const checkoutAssets=artifacts.publicAssets.filter(a=>a.path.startsWith('assets/'));
const checkoutAssetDir=new URL('3/assets/',dest);
await mkdir(checkoutAssetDir,{recursive:true});
const expectedAssetNames=new Set(checkoutAssets.map(item=>item.path.slice('assets/'.length)));
for(const item of await readdir(checkoutAssetDir,{withFileTypes:true})) {
  if(item.isFile() && !expectedAssetNames.has(item.name)) {
    if(!/^(?:app|style|brand-original|reels-contact-sheet)-[A-Za-z0-9_-]+\.(?:js|css|png)$/.test(item.name)) throw Error('Unexpected checkout asset '+item.name);
    await unlink(new URL(item.name,checkoutAssetDir));
  }
}
for (const item of checkoutAssets) {
  await write('3/'+item.path,await readFile(new URL('dist/'+item.path,root)));
}
const html=(await readFile(new URL('dist/index.html',root),'utf8')).replace('<html lang="pt-BR">','<html lang="pt-BR" data-checkout="live">')
  .replace("connect-src 'none'","connect-src 'self'")
  .replace(/<title>[^<]+<\/title>/,'<title>ResolvFlow · Checkout Pix</title>');
await write('3/index.html',html);
console.log('LANDING_3_COMPOSED',sha(Buffer.from(html)),'original routes and assets verified against release receipt');
