import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = f => readFileSync(new URL('../publish-stage/' + f + '/index.html', import.meta.url), 'utf8');
for (const doc of ['termos', 'privacidade']) {
  test(`${doc}: published (no draft status), neutral provider wording, new support e-mail`, () => {
    const html = read(doc);
    assert.match(html, /data-publication="published"/);
    for (const banned of [/rascunho/i, /não vigente/i, /Não publicar/i, /draft-banner/, /lezty/i, /\bLucas\b/, /medchatbot/i, /Confirmar antes da publicação/])
      assert.doesNotMatch(html, banned, String(banned));
    assert.match(html, /mailto:backfasupport@gmail\.com/);
    assert.match(html, /processador de pagamentos?|processador do Pix/);
  });
}
test('fields only Lucas can fill live in a single marked place (Termos)', () => {
  const fields = [...read('termos').matchAll(/data-fill-required="([a-z]+)"/g)].map(m => m[1]);
  // Before Lucas fills them: exactly these four; after: none.
  assert.ok(fields.every(f => ['nome', 'documento', 'endereco', 'prazo'].includes(f)) && new Set(fields).size === fields.length);
  assert.equal([...read('privacidade').matchAll(/data-fill-required=/g)].length, 0);
});
