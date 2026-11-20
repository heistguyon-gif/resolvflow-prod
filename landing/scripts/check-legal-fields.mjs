// Pre-deploy guard: fails while publish-stage legal pages still contain
// [PREENCHER: ...] fields that only Lucas can supply (supplier identity, deadline).
import { readFileSync } from 'node:fs';
let missing = [];
for (const file of ['publish-stage/termos/index.html', 'publish-stage/privacidade/index.html']) {
  const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const m of html.matchAll(/data-fill-required="([a-z]+)">\[PREENCHER: ([^\]]+)\]/g)) missing.push(`${file}: ${m[1]} -> ${m[2]}`);
}
if (missing.length) { console.error('LEGAL_FIELDS_MISSING\n' + missing.join('\n')); process.exit(1); }
console.log('LEGAL_FIELDS_OK');
