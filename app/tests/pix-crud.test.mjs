import test from 'node:test';
import assert from 'node:assert/strict';
import { bucket, codec, database, configModule, paymentsModule } from './helpers/pix-gateway-fixture.mjs';

const actor = 'lucasbgn.affiliate@gmail.com';
const legacy = async () => [{ provider: 'leztypay', hasApiKey: true, hasWebhookSecret: true }];
const failCode = code => error => error.code === code;

async function fixture(hasPayments = async () => false) {
 const store = bucket(), encryption = await codec(), audit = [];
 const registry = configModule.createPixGatewayRegistry(store, encryption, async entry => audit.push(entry), legacy, Date.now, undefined, hasPayments);
 const send = async (action, fields) => registry.command({ action, requestId: crypto.randomUUID(), expectedRevision: (await registry.state()).revision, ...fields }, actor);
 const add = async () => (await send('create', { label: 'Fixture', provider: 'bravopay', apiKey: 'fixture-api', webhookSecret: 'fixture-secret' })).state.gateways.at(-1);
 return { registry, store, encryption, send, add, audit };
}

test('deactivate requires the exact current selection and persists pause without fallback', async () => {
 const { registry, send, add } = await fixture();
 await assert.rejects(send('deactivate', { configId: 'legacy-leztypay', version: 1 }), failCode('confirmation_required'));
 await assert.rejects(send('deactivate', { configId: 'legacy-leztypay', version: 2, confirmed: true }), failCode('active_changed'));
 await send('deactivate', { configId: 'legacy-leztypay', version: 1, confirmed: true });
 await add();
 assert.equal(await registry.active(), null);
 assert.equal((await registry.state()).paused, true);
 await send('activate', { configId: 'legacy-leztypay', version: 1 });
 assert.equal((await registry.active()).ref.configId, 'legacy-leztypay');
 assert.equal((await registry.state()).paused, false);
});

test('only proven never selected, unreferenced configs can be erased and the admin receipt replays', async () => {
 let referenced = true;
 const { registry, send, add, audit } = await fixture(async () => referenced);
 const { id } = await add();
 await assert.rejects(send('delete', { configId: id }), failCode('confirmation_required'));
 await assert.rejects(send('delete', { configId: id, confirmed: true }), failCode('config_has_history'));
 referenced = false;
 const request = { action: 'delete', configId: id, confirmed: true, requestId: crypto.randomUUID(), expectedRevision: (await registry.state()).revision };
 const deleted = await registry.command(request, actor);
 const replay = await registry.command(request, actor);
 assert.equal(deleted.state.revision, replay.state.revision);
 assert.equal(replay.state.gateways.some(row => row.id === id), false);
 assert.equal(audit.at(-1).configId, id);
 await assert.rejects(registry.resolve({ configId: id, version: 1 }), failCode('config_not_found'));
});

test('activation wins a concurrent delete through CAS and marks even pre-D1 reservations as ineligible', async () => {
 let started, release;
 const checking = new Promise(resolve => { started = resolve; });
 const releaseCheck = new Promise(resolve => { release = resolve; });
 const { registry, send, add } = await fixture(async () => { started(); await releaseCheck; return false; });
 const { id } = await add();
 const deleting = assert.rejects(send('delete', { configId: id, confirmed: true }), failCode('revision_conflict'));
 await checking;
 await send('activate', { configId: id, version: 1 });
 release();
 await deleting;
 await send('deactivate', { configId: id, version: 1, confirmed: true });
 await assert.rejects(send('delete', { configId: id, confirmed: true }), failCode('config_has_history'));
 await send('archive', { configId: id });
 assert.equal((await registry.resolve({ configId: id, version: 1 })).provider, 'bravopay');
 assert.equal((await registry.state()).gateways.find(row => row.id === id).canDelete, false);
});

test('paused gateway admits no new charges and replays the original intent across archive and switch', async () => {
 const { registry, store, encryption, send, add } = await fixture();
 const f = database();
 try {
  const { id } = await add();
  await send('activate', { configId: id, version: 1 });
  let effects = 0;
  const payments = paymentsModule.createPixGatewayPayments(f.db, store, encryption, registry, { create: async () => { effects++; throw Error('Lost response'); } });
  const input = { requestId: crypto.randomUUID(), workspaceOwnerUserId: 'owner', actorUserId: 'actor', email: 'fixture@example.test', amountCents: 500, customerDocument: '11144477735' };
  const payment = await payments.create(input);
  await send('deactivate', { configId: id, version: 1, confirmed: true });
  await send('archive', { configId: id });
  await assert.rejects(payments.create({ ...input, requestId: crypto.randomUUID() }), failCode('gateway_unavailable'));
  assert.equal((await payments.resume(input)).id, payment.id);
  await send('activate', { configId: 'legacy-leztypay', version: 1 });
  assert.equal((await payments.resume(input)).id, payment.id);
  assert.equal(effects, 1);
  assert.equal(f.balance(), 0);
 } finally { f.sqlite.close(); }
});
