import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { STORY_CAPABILITIES, validateConfig } from '../extensions/story-bridge/bridge-core.js';
import { createHighlightManagementRunner, HIGHLIGHT_MANAGEMENT_JOURNAL as JOURNAL, HIGHLIGHT_DELETE_INTENTS as INTENTS, completeHighlightList } from '../extensions/story-bridge/highlight-management-runner.js';
import { createInstagramHighlightManagementPage, projectHighlightManagementResult } from '../extensions/story-bridge/instagram-highlight-management-page.js';
import { pageFixture, page, edge, OWNER, SELECTED } from './helpers/highlight-management-page-fixture.mjs';

const selectedArgs = { highlightId: SELECTED.id, highlightTitle: SELECTED.title };
const complete = highlights => ({ status: 'completed', complete: true, ownerInstagramUserId: OWNER, highlights });
const confirmed = { status: 'completed', ownerInstagramUserId: OWNER, highlightId: SELECTED.id, deleted: true, absentFromCompleteList: true };

test('PAGE dry-run constructs native contract without any request; no token leaves its return', async t => {
  const p = pageFixture(t); assert.equal((await p.invoke('prepare')).status, 'dry_run_ready');
  assert.equal((await p.invoke('delete', selectedArgs)).status, 'dry_run_ready');
  assert.equal(p.queries.length, 0); assert.equal(p.posts.length, 0);
});

test('native Relay reads all owner pages from the beginning with explicit completeness, no doc_id guessing', async t => {
  const p = pageFixture(t, { pages: [page([edge()], { has_next_page: true, end_cursor: 'cursor-a' }), page([edge({ id: 'highlight:2', title: 'Two' })], { has_previous_page: true })] });
  await p.invoke('prepare'); const result = await p.invoke('list');
  assert.equal(result.status, 'completed'); assert.equal(result.complete, true); assert.equal(result.highlights.length, 2);
  assert.equal(p.queries[0].variables.after, null); assert.equal(p.queries[1].variables.after, 'cursor-a'); assert.equal(p.queries[0].variables.user_id, OWNER);
  assert.equal(p.queries[0].config.fetchPolicy, 'network-only'); assert.equal(p.queries[0].config.networkCacheConfig.force, true); assert.equal(p.state.retained, p.state.disposed);
  assert.ok(!JSON.stringify(result).includes('synthetic-csrf')); assert.ok(!JSON.stringify(result).includes('private')); assert.equal(p.posts.length, 0);
});

test('a fresh explicit empty connection is complete; malformed/incomplete/duplicate/foreign data never becomes empty success', async t => {
  const empty = pageFixture(t, { pages: [page()] }); await empty.invoke('prepare'); assert.equal((await empty.invoke('list')).highlights.length, 0);
  for (const bad of [{ edges: [] }, page([], { has_previous_page: true }), page([], { has_next_page: true }), page([edge(), edge()]), page([edge(SELECTED, '9')]), page([edge({ id: 'not-an-id', title: 'Bad' })]), page([edge({ id: SELECTED.id, title: null })])]) {
    const p = pageFixture(t, { pages: [bad] }); await p.invoke('prepare'); const result = await p.invoke('list'); assert.equal(result.status, 'failed'); assert.equal(result.highlights, undefined); assert.equal(p.posts.length, 0);
  }
});

test('500 cap is fail-closed, not truncation; repeated cursor is rejected', async t => {
  const p = pageFixture(t, { pages: [page(Array.from({ length: 501 }, (_, i) => edge({ id: 'highlight:' + (i + 1), title: 'Fixture' })))] });
  await p.invoke('prepare'); assert.equal((await p.invoke('list')).status, 'failed');
  const loop = pageFixture(t, { pages: [page([edge()], { has_next_page: true, end_cursor: 'same' }), page([edge({ id: 'highlight:2', title: 'Two' })], { has_next_page: true, end_cursor: 'same' })] });
  await loop.invoke('prepare'); assert.equal((await loop.invoke('list')).status, 'failed'); assert.equal(loop.posts.length, 0);
});

test('delete uses one exact highlight-only PAGE POST, native headers/body and ACK plus complete post-list proof', async t => {
  const p = pageFixture(t); await p.invoke('prepare'); const result = await p.invoke('delete', selectedArgs, true);
  assert.equal(result.status, 'completed'); assert.equal(result.highlightId, SELECTED.id); assert.equal(result.absentFromCompleteList, true);
  assert.equal(p.posts.length, 1); assert.equal(p.queries.length, 2);
  const request = p.posts[0].init; assert.equal(request.credentials, 'include'); assert.equal(request.redirect, 'manual'); assert.equal(request.tag, undefined);
  assert.deepEqual([...new URLSearchParams(request.body).keys()].sort(), ['fb_dtsg', 'jazoest']);
  for (const name of Object.keys(request.headers)) assert.ok(!['origin', 'referer', 'authorization', 'cookie'].includes(name));
  assert.equal((await p.invoke('delete', selectedArgs, true)).status, 'failed'); assert.equal(p.posts.length, 1);
  assert.ok(!JSON.stringify(result).includes('synthetic-'));
});

test('stale title, missing target and owner/session changes refuse before any destructive request', async t => {
  for (const pages of [[page()], [page([edge({ ...SELECTED, title: 'Changed' })])], [page([edge(SELECTED, '9')])]]) {
    const p = pageFixture(t, { pages }); await p.invoke('prepare'); const result = await p.invoke('delete', selectedArgs, true); assert.equal(result.status, 'failed'); assert.equal(p.posts.length, 0);
  }
  const changed = pageFixture(t); await changed.invoke('prepare'); changed.state.csrf = 'synthetic-rotated'; assert.equal((await changed.invoke('delete', selectedArgs, true)).status, 'failed'); assert.equal(changed.posts.length, 0);
  const late = pageFixture(t, { afterQuery: state => { state.dtsg = 'synthetic-changed-during-read'; } }); await late.invoke('prepare'); assert.equal((await late.invoke('delete', selectedArgs, true)).status, 'failed'); assert.equal(late.posts.length, 0);
});

test('HTML, redirect, malformed JSON, network loss and weak ACK remain uncertain without destructive retry', async t => {
  for (const response of [() => new Response('<html>synthetic private response</html>', { headers: { 'content-type': 'text/html' } }), () => new Response('', { status: 302, headers: { location: 'https://elsewhere.test' } }), () => new Response('{'), () => Response.json({}), () => Response.json({ status: 'ok', deleted: false }), () => Response.json({ status: 'ok' }, { status: 403 })]) {
    const p = pageFixture(t, { response }); await p.invoke('prepare'); const result = await p.invoke('delete', selectedArgs, true); assert.equal(result.status, 'uncertain'); assert.equal(p.posts.length, 1);
    await p.invoke('delete', selectedArgs, true); assert.equal(p.posts.length, 1); assert.ok(!JSON.stringify(result).includes('private response'));
  }
  const lost = pageFixture(t, { fetchThrows: true }); await lost.invoke('prepare'); assert.equal((await lost.invoke('delete', selectedArgs, true)).status, 'uncertain'); assert.equal(lost.posts.length, 1);
});

test('ACK alone is insufficient: remaining ID or incomplete/foreign post-list cannot confirm', async t => {
  for (const post of [page([edge()]), { edges: [] }, page([edge({ id: 'highlight:2', title: 'Two' }, '9')])]) {
    const p = pageFixture(t, { pages: [page([edge()]), post] }); await p.invoke('prepare'); assert.equal((await p.invoke('delete', selectedArgs, true)).status, 'uncertain'); assert.equal(p.posts.length, 1);
  }
});

test('pending response body times out in fake time, remains uncertain and does not get another POST', async t => {
  let cancelled = false;
  const p = pageFixture(t, { fastTimers: true, response: () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }) });
  await p.invoke('prepare'); assert.equal((await p.invoke('delete', selectedArgs, true)).status, 'uncertain'); assert.equal(p.posts.length, 1); assert.equal(cancelled, true);
});

test('PAGE lock and one-use port admit one effect; disposal during late pre-list prevents late POST', async t => {
  const p = pageFixture(t); await p.invoke('prepare'); await Promise.all([p.invoke('delete', selectedArgs, true), p.invoke('delete', selectedArgs, true)]); assert.equal(p.posts.length, 1);
  const late = pageFixture(t, { pendingQuery: true }); await late.invoke('prepare'); const flight = late.invoke('delete', selectedArgs, true); await late.invoke('dispose'); late.pending[0]();
  assert.equal((await flight).status, 'failed'); assert.equal(late.posts.length, 0);
});

test('unsafe manual headers or an expired binding are blocked before effect', async t => {
  const p = pageFixture(t, { headers: { Origin: 'https://extension.test' } }); assert.equal((await p.invoke('prepare')).status, 'failed'); assert.equal(p.posts.length, 0);
  const expired = pageFixture(t); await expired.invoke('prepare'); assert.equal((await expired.invoke('delete', selectedArgs, true, Date.now() - 1)).status, 'failed'); assert.equal(expired.posts.length, 0);
});

test('projection strips raw errors/headers/tokens and rejects incomplete lists and wrong ownership', () => {
  const projected = projectHighlightManagementResult({ ...confirmed, headers: 'secret', token: 'secret', rawBody: 'secret' }, OWNER); assert.ok(!JSON.stringify(projected).includes('secret'));
  assert.throws(() => projectHighlightManagementResult({ ...confirmed, ownerInstagramUserId: '9' }, OWNER));
  assert.throws(() => projectHighlightManagementResult({ status: 'completed', complete: true, highlights: [{ id: 'invalid', title: 'Bad' }], ownerInstagramUserId: OWNER }, OWNER));
  assert.throws(() => completeHighlightList({ ...complete([]), complete: false }, OWNER));
});

test('Chrome factory pins exact tab/document/owner; MAIN receives no tokens; no fallback into another document', async t => {
  const p = pageFixture(t, { pages: [page()] }), frames = []; let gone = false;
  const chromeApi = { tabs: { query: async () => [{ id: 2, active: true, url: 'https://www.instagram.com/', status: 'complete' }, { id: 3, url: 'https://www.instagram.com/', status: 'complete' }], get: async () => ({ url: 'https://www.instagram.com/', status: 'complete' }) }, scripting: { async executeScript(args) {
    frames.push(args); assert.equal(args.world, 'MAIN'); assert.ok(!JSON.stringify(args.args).includes('synthetic-'));
    if (args.target.frameIds) return [{ frameId: 0, documentId: 'document-2', result: { instagramUserId: OWNER } }];
    assert.deepEqual(args.target.documentIds, ['document-2']); if (gone) return [];
    const result = await p.main(...args.args); return [{ frameId: 0, documentId: 'document-2', result }];
  } } };
  const port = await createInstagramHighlightManagementPage({ chromeApi })(OWNER); assert.equal((await port.list()).complete, true);
  gone = true; assert.equal((await port.deleteHighlight(selectedArgs)).status, 'uncertain'); await port.deleteHighlight(selectedArgs); assert.equal(p.posts.length, 0);
  assert.equal(frames.filter(row => row.args?.[0]?.action === 'delete').length, 1); await port.dispose();
});

function runnerFixture(overrides = {}) {
  const context = { browserId: crypto.randomUUID(), sessionId: crypto.randomUUID(), instagramUserId: OWNER }, state = {}, receipts = [], stages = [];
  let effects = 0, prepared = 0;
  const storage = { get: async () => structuredClone(state), set: async value => { stages.push(structuredClone(value)); Object.assign(state, structuredClone(value)); } };
  const port = { list: async () => complete([SELECTED]), deleteHighlight: async () => { effects++; assert.equal(state[JOURNAL].phase, 'deleting'); assert.equal(state[INTENTS].entries.at(-1).state, 'in_flight'); return confirmed; }, dispose: async () => {} };
  const options = { storage, identity: async () => context, session: async () => ({ id: OWNER, available: true }), request: async b => { receipts.push(structuredClone(b)); }, prepare: async () => { prepared++; return port; } };
  const runner = createHighlightManagementRunner({ ...options, ...overrides });
  const command = (action = 'delete') => ({ kind: 'highlight_management', id: crypto.randomUUID(), requestId: crypto.randomUUID(), ...context, action, ...(action === 'delete' ? selectedArgs : {}) });
  return { runner, state, receipts, stages, port, context, storage, options, command, counts: () => ({ effects, prepared }) };
}

test('runner lists without images/Story and posts only sanitized complete result', async () => {
  const f = runnerFixture(); await f.runner.run(f.command('list'), f.context);
  assert.equal(f.counts().effects, 0); assert.equal(f.receipts[0].type, 'highlight_result'); assert.equal(f.receipts[0].message, 'listed'); assert.equal(f.receipts[0].complete, true); assert.equal(f.state[JOURNAL].acknowledged, true);
});

test('foreign command identity is rejected without touching journal or acknowledging another target', async () => {
  for (const patch of [{ browserId: crypto.randomUUID() }, { sessionId: crypto.randomUUID() }, { instagramUserId: '9' }, { highlightId: '../media/delete' }]) {
    const f = runnerFixture(); await assert.rejects(f.runner.run({ ...f.command(), ...patch }, f.context));
    assert.equal(f.counts().prepared, 0); assert.equal(f.receipts.length, 0); assert.equal(f.state[JOURNAL], undefined);
  }
});

test('runner persists identity/intent before delete, single-flights concurrent jobs and replay only acknowledges', async () => {
  const f = runnerFixture(), c = f.command(); await Promise.all([f.runner.run(c, f.context), f.runner.run(c, f.context)]);
  assert.equal(f.counts().effects, 1); assert.equal(f.receipts[0].message, 'deleted'); assert.equal(f.receipts[0].absentFromCompleteList, true);
  await f.runner.run(c, f.context); assert.equal(f.counts().effects, 1); assert.equal(f.receipts.length, 2);
});

test('malformed list, stale title and changed session fail without creating a deletion intent', async () => {
  for (const value of [{ status: 'failed' }, { ...complete([]), complete: false }, complete([{ ...SELECTED, title: 'Changed' }])]) {
    const f = runnerFixture(); f.port.list = async () => value; await f.runner.run(f.command(), f.context); assert.equal(f.counts().effects, 0); assert.equal(f.state[INTENTS], undefined); assert.equal(f.receipts[0].status, 'failed');
  }
  const f = runnerFixture({ session: async () => ({ id: '9', available: true }) }); await f.runner.run(f.command(), f.context); assert.equal(f.counts().prepared, 0); assert.equal(f.receipts[0].message, 'identity_changed');
});

test('uncertain deletion remains blocked across later list operations and different request IDs', async () => {
  const f = runnerFixture(); f.port.deleteHighlight = async () => ({ status: 'uncertain' }); const c = f.command();
  await f.runner.run(c, f.context); assert.equal(f.state[INTENTS].entries[0].state, 'uncertain');
  await f.runner.run(f.command('list'), f.context); const prepared = f.counts().prepared;
  await f.runner.run(f.command(), f.context); assert.equal(f.counts().prepared, prepared); assert.equal(f.receipts.at(-1).status, 'uncertain');
});

test('crashed deleting journal recovers as uncertain without invoking PAGE or clearing intents', async () => {
  const f = runnerFixture(), c = f.command(); f.state[JOURNAL] = { jobId: c.id, requestId: c.requestId, ...f.context, action: 'delete', phase: 'deleting', ...selectedArgs, acknowledged: false };
  f.state[INTENTS] = { version: 1, entries: [{ jobId: c.id, ...f.context, highlightId: SELECTED.id, state: 'in_flight' }] };
  await f.runner.recover(); assert.equal(f.receipts[0].message, 'execution_uncertain'); assert.equal(f.counts().prepared, 0); assert.equal(f.state[INTENTS].entries[0].state, 'in_flight');
});

test('lost ACK retries only the stored receipt and strips unknown persisted result fields', async () => {
  const f = runnerFixture(); let acks = 0;
  const runner = createHighlightManagementRunner({ ...f.options, request: async b => { f.receipts.push(b); if (++acks === 1) throw Error('synthetic response lost'); } });
  await assert.rejects(runner.run(f.command(), f.context)); assert.equal(f.counts().effects, 1); f.state[JOURNAL].result.rawToken = 'synthetic-secret-never-forward';
  await runner.recover(); assert.equal(f.counts().effects, 1); assert.equal(f.state[JOURNAL].acknowledged, true); assert.ok(!JSON.stringify(f.receipts).includes('never-forward'));
});

test('intent persistence failure or identity change before effect cannot trigger deletion', async () => {
  const f = runnerFixture(); const runner = createHighlightManagementRunner({ ...f.options, storage: { get: f.storage.get, set: async value => { if (Object.hasOwn(value, INTENTS)) throw Error('synthetic storage failure'); return f.storage.set(value); } } });
  await runner.run(f.command(), f.context); assert.equal(f.counts().effects, 0); assert.equal(f.receipts[0].status, 'uncertain');
  const changed = runnerFixture(); let checks = 0;
  const another = createHighlightManagementRunner({ ...changed.options, session: async () => ({ id: ++checks < 4 ? OWNER : '9', available: true }) });
  await another.run(changed.command(), changed.context); assert.equal(changed.counts().effects, 0); assert.equal(changed.receipts[0].status, 'uncertain');
});

test('delete completion requires both ACK and owner/target absence proof; a weak result is uncertain', async () => {
  for (const result of [{ status: 'completed', highlightId: SELECTED.id, ownerInstagramUserId: OWNER, deleted: true }, { ...confirmed, ownerInstagramUserId: '9' }, { ...confirmed, highlightId: 'highlight:2' }]) {
    const f = runnerFixture(); f.port.deleteHighlight = async () => result; await f.runner.run(f.command(), f.context); assert.equal(f.receipts[0].status, 'uncertain');
  }
});

async function backgroundFixture(kind, unsupported = false) {
  const browserId = crypto.randomUUID(), sessionId = crypto.randomUUID(), state = { resolvStoryBrowserId: browserId, resolvStorySessionId: sessionId }, sent = [];
  let profileRuns = 0, deletes = 0, listed = 0; const noOp = { addListener() {} };
  const storage = { get: async key => ({ [key]: structuredClone(state[key]) }), set: async values => Object.assign(state, structuredClone(values)), setAccessLevel: async () => {} };
  const command = kind ? { kind, id: crypto.randomUUID(), requestId: crypto.randomUUID(), action: 'delete', browserId, sessionId, instagramUserId: OWNER, ...selectedArgs } : null;
  const context = { crypto, TextEncoder, Uint8Array, URL, AbortSignal, setTimeout, clearTimeout, STORY_CAPABILITIES, validateConfig, HIGHLIGHT_MANAGEMENT_CAPABILITIES: { highlightManagement: 1 }, createHighlightManagementRunner,
    createInstagramHighlightManagementPage: () => async () => ({ list: async () => { listed++; return complete([SELECTED]); }, deleteHighlight: async () => { deletes++; return confirmed; }, dispose: async () => {} }),
    createProfileRunner: () => ({ recover: async () => {}, run: async () => { profileRuns++; } }), PROFILE_CAPABILITIES: { profileSetup: 1, photo: true, bio: true, photoProof: 1 }, createProfileUI: () => ({}), createInstagramUsernameReader: () => async () => 'synthetic', createInstagramWebContextReader: () => async () => ({}), readInstagramSession: async () => ({ id: OWNER, available: true }), createBridgeRunner: options => options, createInstagramHighlightPage: () => () => assert.fail('No Story native port'), publishStory: () => assert.fail('No Story publication'),
    chrome: { storage: { local: storage, session: storage }, alarms: { get: async () => ({}), onAlarm: noOp }, runtime: { getURL: name => 'chrome-extension://fixture/' + name, onInstalled: noOp, onStartup: noOp }, tabs: { onUpdated: noOp, onActivated: noOp }, cookies: { onChanged: noOp } },
    async fetch(url, init) {
      if (url.endsWith('bridge-config.json')) return Response.json({ bridgeOrigin: 'https://resolvflow.online', credential: 'a'.repeat(64) });
      assert.equal(url, 'https://resolvflow.online/api/story-bridge/extension'); const body = JSON.parse(init.body); sent.push(body);
      assert.ok(['heartbeat', 'highlight_result'].includes(body.type));
      if (body.type === 'heartbeat' && unsupported && body.capabilities?.highlightManagement) return new Response('', { status: 400 });
      return Response.json(body.type === 'heartbeat' ? { command } : {});
    },
  };
  const file = new URL('../extensions/story-bridge/background.js', import.meta.url);
  vm.runInNewContext(readFileSync(file, 'utf8').replace(/^import .*;\r?$/gm, '').replace(/\nrun\(\);\s*$/, '\nglobalThis.init = initialize;'), context);
  const deps = await context.init(); const reply = await deps.request({ type: 'heartbeat', browserId, sessionId, instagramUserId: OWNER, available: true });
  return { sent, reply, profileRuns, deletes, listed, state };
}

test('actual background intercepts management command without Story/image/profile path and returns exact management receipt', async () => {
  const f = await backgroundFixture('highlight_management');
  assert.equal(f.reply.command, null); assert.equal(f.deletes, 1); assert.equal(f.listed, 1); assert.equal(f.profileRuns, 0);
  assert.equal(f.sent[0].capabilities.highlightManagement, 1); assert.equal(f.sent[0].capabilities.stickerRotation, 1); assert.equal(f.sent[0].capabilities.storyOptions, 1);
  assert.equal(f.sent[1].type, 'highlight_result'); assert.equal(f.sent[1].message, 'deleted'); assert.equal(f.sent.length, 2);
  const profile = await backgroundFixture('profile_setup'); assert.equal(profile.profileRuns, 1); assert.equal(profile.deletes, 0);
});

test('background fallback drops management only first, retaining 0.4.6 rotation/options', async () => {
  const f = await backgroundFixture(null, true); assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1].capabilities.highlightManagement, undefined); assert.equal(f.sent[1].capabilities.stickerRotation, 1); assert.equal(f.sent[1].capabilities.storyOptions, 1); assert.equal(f.deletes, 0);
});
