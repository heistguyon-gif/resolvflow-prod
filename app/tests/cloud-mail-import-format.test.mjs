import test from 'node:test';
import assert from 'node:assert/strict';
import {loadStoryModule} from './helpers/story-modules.mjs';
const {parseMailImport}=process.env.MAIL_IMPORT_BUNDLE
 ? {parseMailImport:(await import(process.env.MAIL_IMPORT_BUNDLE)).a}
 : loadStoryModule('lib/cloud-mail.ts');
const token='FAKE-ONLY-'+ 'x'.repeat(100);
const client='11111111-1111-4111-8111-111111111111';
const line=(email='fixture@hotmail.com')=>`${email}|SYNTHETIC_PASSWORD|${token}|${client}`;
test('four fields and legacy five fields preserve credential positions with encrypted-record source fields for future full export',()=>{
 for(const input of [line(),line()+'|recovery@example.test']){
  const [row]=parseMailImport(input);
  assert.deepEqual(Object.keys(row).sort(),['client','email','id','importFields','refresh']);
  assert.equal(row.email,'fixture@hotmail.com');assert.equal(row.refresh,token);assert.equal(row.client,client);
  assert.match(row.id,/^[a-f0-9]{32}$/);
 }
});
test('mixed layouts, BOM, CRLF, whitespace and empty lines accepted',()=>{
 const rows=parseMailImport('\uFEFF '+line().replace('fixture','FIXTURE')+' \r\n\r\n'+line('other@hotmail.com')+'|recovery@example.test\r\n');
 assert.equal(rows.length,2);assert.equal(rows[0].email,'fixture@hotmail.com');
});
test('invalid shape, supplied recovery, shifted token/client, and truncated token remain rejected',()=>{
 for(const input of ['',line()+'|',line()+'|invalid',line()+'|recovery@example.test|extra',`fixture@hotmail.com|pass|${client}|${token}`,`fixture@hotmail.com|pass|short|${client}`,'fixture@hotmail.com|pass|'+token]){
  assert.throws(()=>parseMailImport(input),e=>e.code==='import_invalid');
 }
});
test('duplicates across layouts rejected; batch has no artificial 200 cap',()=>{
 assert.throws(()=>parseMailImport(line()+'\n'+line('FIXTURE@hotmail.com')+'|recovery@example.test'),e=>e.code==='import_duplicate');
 assert.equal(parseMailImport(Array.from({length:200},(_,i)=>line(`fixture${i}@hotmail.com`)).join('\n')).length,200);
 assert.equal(parseMailImport(Array.from({length:205},(_,i)=>line(`fixture${i}@hotmail.com`)).join('\n')).length,205);
});

test('Microsoft pipe format preserves separator-bearing password and refresh bytes in four and five fields',()=>{for(const tail of ['', '|recovery@example.test']){const original='fixture@example.test| valid----password |'+token+'----legacy|'+client+tail;const [row]=parseMailImport(original);assert.equal(row.source,undefined);assert.equal(row.refresh,token+'----legacy');assert.deepEqual(row.importFields,original.split('|'));}});
