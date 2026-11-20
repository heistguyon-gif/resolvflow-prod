import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { load, css, mount, flush } from './helpers/pix-ui-runtime.mjs';

const { MetaAppsPanel } = load('app/components/MetaAppsPanel.tsx', { './MetaAppsPanel.module.css': css });
const ID = '55555555-5555-4555-8555-555555555555';
const tutorial = { redirectUri: 'https://resolvflow.online/api/meta/callback', webhookUrlPattern: 'https://resolvflow.online/api/meta/webhook/<id-do-app-no-painel>', scopes: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights'] };
const app = { id: ID, key: 'workspace:' + ID, label: 'App principal', appId: '123456789', status: 'active', createdAt: '2026-11-20', health: { total: 5, active: 3, down: 2 },
  setup: { redirectUri: tutorial.redirectUri, webhookUrl: 'https://resolvflow.online/api/meta/webhook/' + ID, verifyToken: 'rfv_' + 'a'.repeat(48), scopes: tutorial.scopes } };

test('empty state until an app is registered; generic tutorial shows redirect URI and the exact scopes', async () => {
  const ui = await mount(MetaAppsPanel, { canOperate: true, contextKey: 'ws' }, () => Response.json({ canManage: true, apps: [], tutorial }));
  try {
    const text = () => ui.dom.window.document.body.textContent;
    assert.match(text(), /Nenhum app cadastrado ainda/);
    await ui.click('Como criar o app');
    assert.match(text(), /developers\.facebook\.com/);
    assert.match(text(), /https:\/\/resolvflow\.online\/api\/meta\/callback/);
    for (const scope of tutorial.scopes) assert.ok(text().includes(scope), scope);
    assert.match(text(), /A URL e o token aparecem aqui depois que o app é cadastrado/);
  } finally { await ui.close(); }
});

test('register posts label/appId/secret, then shows counts and the per-app webhook + verify token', async () => {
  let apps = [];
  const ui = await mount(MetaAppsPanel, { canOperate: true, contextKey: 'ws' }, (req) => {
    if (req.method === 'POST') { apps = [app]; return Response.json({ id: ID, apps }, { status: 201 }); }
    return Response.json({ canManage: true, apps, tutorial });
  });
  const NodeEvent = globalThis.Event; globalThis.Event = ui.dom.window.Event;
  let changedEvents = 0; ui.dom.window.addEventListener('resolvflow:meta-apps-changed', () => changedEvents++);
  try {
    await ui.click('Cadastrar app');
    for (const [name, value] of [['label', 'App principal'], ['appId', '123456789'], ['appSecret', 'b'.repeat(32)]]) await ui.value(`input[name="${name}"]`, value);
    const form = ui.dom.window.document.querySelector('form');
    await act(async () => form.dispatchEvent(new ui.dom.window.Event('submit', { bubbles: true, cancelable: true }))); await flush();
    const post = ui.requests.find((r) => r.method === 'POST');
    assert.deepEqual(post.body, { label: 'App principal', appId: '123456789', appSecret: 'b'.repeat(32) });
    const text = ui.dom.window.document.body.textContent;
    assert.ok(text.includes(app.setup.webhookUrl) && text.includes(app.setup.verifyToken), 'tutorial opens for the new app');
    await ui.click('×');
    const card = ui.dom.window.document.querySelector('article[aria-label="App App principal"]');
    assert.match(card.textContent, /Perfis conectados5/); assert.match(card.textContent, /Ativos3/); assert.match(card.textContent, /Caídos2/);
    assert.ok(!ui.dom.window.document.body.innerHTML.includes('b'.repeat(32)), 'secret is never rendered');
    assert.equal(changedEvents, 1, 'connect queue is told to refresh');
  } finally { globalThis.Event = NodeEvent; await ui.close(); }
});

test('read-only members cannot register', async () => {
  const ui = await mount(MetaAppsPanel, { canOperate: false, contextKey: 'ws' }, () => Response.json({ canManage: false, apps: [app], tutorial }));
  try { assert.equal(ui.find('Somente leitura').disabled, true); assert.equal(ui.find('Desativar'), undefined); }
  finally { await ui.close(); }
});

const { ConnectQueue } = load('app/components/ConnectQueue.tsx', { './ConnectQueue.module.css': css, './MetaAppsPanel.module.css': css });
test('(A) connect flow: empty state pointing to Apps Meta until an app exists, then only that app; refreshes on panel change', async () => {
  let apps = [];
  const ui = await mount(ConnectQueue, { canOperate: true, contextKey: 'ws' }, () => Response.json({ isPlatformAdmin: false, canDirectConnect: true, canBotInvite: false, botApps: [], apps, mine: [], queue: [] }));
  const NodeEvent = globalThis.Event; globalThis.Event = ui.dom.window.Event;
  try {
    const doc = ui.dom.window.document;
    assert.match(doc.body.textContent, /Nenhum app Meta cadastrado ainda/);
    assert.equal(doc.querySelector('a[href="#apps-meta"]')?.textContent, 'Apps Meta');
    assert.equal(ui.find('Conectar contas').disabled, true);
    assert.doesNotMatch(doc.body.textContent, /MK ?\d|App 01|App Prado|App Teste/);
    apps = [{ key: 'workspace:' + ID, label: 'App principal' }];
    await act(async () => ui.dom.window.dispatchEvent(new ui.dom.window.Event('resolvflow:meta-apps-changed'))); await flush();
    assert.doesNotMatch(doc.body.textContent, /Nenhum app Meta cadastrado ainda/);
    assert.equal(ui.find('Conectar contas').disabled, false);
    assert.equal(ui.requests.filter((r) => r.url === '/api/meta/connect-queue').length, 2);
  } finally { globalThis.Event = NodeEvent; await ui.close(); }
});
