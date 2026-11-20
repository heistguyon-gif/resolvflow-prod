import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=name=>readFileSync(resolve(root,name),'utf8');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const list=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?list(resolve(dir,entry.name)):[resolve(dir,entry.name)]);

test('base preservada e catálogo/campanha/asset copiados sem alteração',()=>{
 const baseline=JSON.parse(read('../landing-checkout-20261118-candidate/evidence/baseline.json'));
 for(const[file,expected]of Object.entries(baseline.files))assert.equal(hash(resolve(baseline.source,file)),expected,'source '+file);
 // planProposals.ts was intentionally rewritten (neutral copy, 2026-11-20); it must match the main worker candidate instead of the 18/11 baseline.
 assert.equal(hash(resolve(root,'src/shared/planProposals.ts')),hash(resolve(root,'../d1-blackfy-20261120-candidate/app/planos/variant/shared/planProposals.ts')),'planProposals matches main worker');
 for(const file of ['src/shared/CampaignDemo.tsx','src/shared/simulation.ts','assets/brand-original.png','assets/reels-contact-sheet.png'])assert.equal(hash(resolve(root,file)),baseline.files[file],file);
});
test('bundle publico consome apenas a API same-origin de checkout e nao carrega segredos',()=>{
 for(const name of ['.env','.dev.vars','node_modules'])assert.equal(existsSync(resolve(root,name)),false,name);
 const source=list(resolve(root,'src')).filter(file=>/\.(ts|tsx)$/.test(file)).map(file=>readFileSync(file,'utf8')).join('\n');
 assert.doesNotMatch(source,/\bXMLHttpRequest\b|\bsendBeacon\s*\(|\bWebSocket\s*\(|\blocalStorage\b|api\/otp\/pix|api\.leztypay|api\.bravopay/);
 assert.doesNotMatch(source,/PLAN_LEZTY_API_KEY|PLAN_DATA_KEY_HEX|PLAN_SUPPORT_TOKEN/);
 assert.match(source,/const root=privatePilot \? PILOT_PATH\+'\/api' : '\/api\/checkout'/);
 assert.match(source,/const PILOT_PATH = '\/planos-piloto'/);
 assert.equal(Object.keys(JSON.parse(read('package.json')).scripts).some(name=>/deploy/.test(name)),false);
});
test('artefatos compilados têm CSP sem rede, noindex, hashes e somente inventário permitido',{skip:!process.env.VERIFY_BUILT_PACKAGE},()=>{
 const artifacts=JSON.parse(read('evidence/build-artifacts.json'));
 assert.equal(artifacts.publicDir,false);assert.equal(artifacts.liveCheckout,false);assert.equal(artifacts.deployed,false);assert.deepEqual(artifacts.externalOrigins,[]);
 assert.equal(artifacts.publicAssets.length,6);
 for(const file of artifacts.publicAssets){assert.equal(hash(resolve(root,'dist',file.path)),file.sha256);assert.match(file.path,/^(index\.html|_headers|assets\/[\w.-]+\.(js|css|png))$/);}
 for(const file of artifacts.previews)assert.equal(hash(resolve(root,'preview',file.path)),file.sha256);
 for(const file of ['dist/index.html','preview/index.html','preview/preview.html']){const html=read(file);assert.match(html,/noindex,nofollow/);assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);assert.doesNotMatch(html,/<(?:script|link|img)[^>]+(?:src|href)="https?:/);}
 const preview=read('preview/index.html');assert.equal(preview.includes('data:image/png;base64,'),true);assert.match(read('preview/preview.html'),/data-width="360"/);assert.match(read('preview/preview.html'),/data-width="1440"/);
 for(const image of artifacts.publicAssets.filter(file=>file.path.endsWith('.png'))){assert.equal(preview.includes(image.path.split('/').at(-1)),false,'Inline image must not retain a relative asset URL');const data='data:image/png;base64,'+readFileSync(resolve(root,'dist',image.path)).toString('base64');assert.ok(preview.includes(data),'Every source image is embedded byte-exact');}
});
