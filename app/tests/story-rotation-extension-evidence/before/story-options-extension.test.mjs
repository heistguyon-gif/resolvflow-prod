import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../extensions/story-bridge/bridge-core.js';

const dir = new URL('../extensions/story-bridge/', import.meta.url);
const before = new URL('./story-options-extension-evidence/before/', import.meta.url);
const read = (name, base = dir) => readFileSync(new URL(name, base), 'utf8');
const owner = '52970422381', storyId = '4022913236764864774_' + owner;
const sessionId = '7c547901-f087-4494-b90f-cd7a4eecf701';
const template = (link, highlight) => ({ name: 'Fixture', linkUrl: link ? 'https://example.test/landing' : '', linkTitle: link ? 'OPEN' : '', highlightName: highlight ? 'Fixture' : '', createHighlight: highlight });
const command = t => ({ id: crypto.randomUUID(), dispatchId: crypto.randomUUID(), sessionId, instagramUserId: owner, template: t });
function script(name, globals, exports, base = dir) {
  const context = { TextEncoder, TextDecoder, Uint8Array, URL, URLSearchParams, AbortSignal, crypto, atob, btoa, Blob, ...globals };
  vm.runInNewContext(read(name, base).replace(/\bexport /g, '') + `\nglobalThis.output = {${exports}};`, context);
  return context.output;
}
function publisher({ missingStory = false, rejectHighlight = false, base = dir } = {}) {
  const calls = [], stages = []; let ready = 0, highlights = 0;
  const port = { async assertReady() { ready++; }, async createHighlight() { highlights++; if (rejectHighlight) throw Error('fixture rejection'); return { status: 'confirmed', ownerMatches: true, storyMatches: true, titleMatches: true, reelId: '17915266020545970' }; } };
  const api = script('publisher.js', {
    chrome: { cookies: { async get({ name }) { return { value: name === 'ds_user_id' ? owner : 'synthetic-only-' + name }; } } },
    async fetch(url, init) {
      assert.ok(url.startsWith('https://i.instagram.com/rupload_igphoto/') || url === 'https://www.instagram.com/api/v1/media/configure_to_story/');
      calls.push({ url, init });
      return Response.json(url.includes('rupload_igphoto') ? { status: 'ok', upload_id: 'fixture_upload' } : { status: 'ok', ...(missingStory ? {} : { media: { id: storyId } }) });
    },
  }, 'publishStory,configureStory', base);
  return { ...api, calls, stages, port, counts: () => ({ ready, highlights }), payload: { imageBase64: btoa('fixture image'), expectedInstagramUserId: owner, onStage: s => stages.push(s) } };
}
function renderer(base = dir) {
  let listener, draws = 0, overlays = 0, closes = 0;
  const ctx = new Proxy({ measureText: () => ({ width: 100 }), createLinearGradient: () => ({ addColorStop() {} }), drawImage() { draws++; }, fillText() { overlays++; } }, { get: (o, key) => o[key] ?? (() => {}) });
  const globals = { chrome: { runtime: { id: 'fixture', onMessage: { addListener(fn) { listener = fn; } } } }, document: { createElement() { return { getContext: () => ctx, toDataURL: () => 'data:image/jpeg;base64,' + btoa('fixture rendered image') }; } }, createImageBitmap: async () => ({ width: 1080, height: 1920, close() { closes++; } }) };
  const context = vm.createContext({ ...globals, Uint8Array, Blob, atob });
  vm.runInContext(read('sticker-metrics.js'), context);
  vm.runInContext(read('render.js', base), context);
  return { counts: () => ({ draws, overlays, closes }), render(options) { return new Promise(resolve => listener({ type: 'RESOLV_STORY_RENDER', target: 'offscreen', imageBase64: btoa('fixture'), contentType: 'image/jpeg', ...options }, { id: 'fixture' }, resolve)); } };
}

test('baseline 0.4.4 rejects both optional fields; updated command validation accepts four independent combinations', () => {
  const old = script('bridge-core.js', {}, 'validateCommand', before);
  assert.throws(() => old.validateCommand(command(template(false, false)), sessionId, owner));
  for (const link of [false, true]) for (const highlight of [false, true]) {
    const c = command(template(link, highlight)); assert.equal(core.validateCommand(c, sessionId, owner), c);
  }
  const legacy = template(true, true); delete legacy.createHighlight;
  assert.ok(core.validateCommand(command(legacy), sessionId, owner));
});

test('invalid identity, booleans, URL/title pairs and missing highlight title fail before effects', () => {
  const patches = [{ createHighlight: 'false' }, { createHighlight: 0 }, { linkUrl: '', linkTitle: 'STALE' }, { linkUrl: 'https://example.test', linkTitle: '' }, { linkUrl: 'javascript:alert(1)' }, { linkUrl: 'https://user:password@example.test' }, { highlightName: '' }];
  for (const patch of patches) assert.throws(() => core.validateCommand(command({ ...template(true, true), ...patch }), sessionId, owner));
  assert.throws(() => core.validateCommand(command(template(false, false)), 'other', owner));
  assert.throws(() => core.validateCommand(command(template(false, false)), sessionId, '9'));
  assert.throws(() => core.validateCommand(command({ ...template(false, false), highlightName: 'stale' }), sessionId, owner));
});

for (const link of [false, true]) for (const highlight of [false, true]) {
  test(`runner -> renderer -> publisher: link=${link}, highlight=${highlight}`, async () => {
    const p = publisher(), r = renderer(), t = template(link, highlight), c = command(t), sent = [], state = {}, phases = [];
    const runner = core.createBridgeRunner({
      storage: { get: async () => structuredClone(state), set: async data => { phases.push(data[core.JOURNAL_KEY].phase); Object.assign(state, structuredClone(data)); } },
      identity: async () => ({ browserId: 'fixture-browser', sessionId }), session: async () => ({ id: owner, available: true }),
      request: async body => { sent.push(body); if (body.type === 'heartbeat') return { command: c }; if (body.type === 'image') return { imageBase64: btoa('fixture'), contentType: 'image/jpeg' }; return {}; },
      prepareImage: async (_image, options) => { const rendered = await r.render(options); assert.equal(rendered.ok, true); if (!link) assert.deepEqual(Object.keys(rendered.result), ['imageBase64']); return rendered.result; },
      publish: data => p.publishStory({ ...data, ...(highlight ? { highlightTransport: p.port } : {}) }),
    });
    await runner.run();
    assert.equal(p.calls.length, 2); // One upload, one configure; highlight is the existing native port.
    const fields = new URLSearchParams(p.calls[1].init.body);
    for (const field of ['story_sticker_ids', 'story_link_stickers', 'tap_models']) assert.equal(fields.has(field), link);
    assert.equal(r.counts().overlays, Number(link)); assert.equal(r.counts().closes, 1);
    assert.equal(p.counts().highlights, Number(highlight)); assert.equal(phases.includes('highlighting'), highlight);
    const receipt = sent.find(b => b.type === 'result');
    assert.equal(receipt.status, 'published'); assert.equal(receipt.storyId, storyId); assert.equal(receipt.message, highlight ? 'published' : 'story_published');
    assert.equal(Boolean(receipt.highlightId), highlight); assert.equal(state[core.JOURNAL_KEY].createHighlight, highlight); assert.equal(state[core.JOURNAL_KEY].acknowledged, true);
    await runner.run(); assert.equal(p.calls.length, 2); // Same acknowledged job cannot post again.
  });
}

test('offscreen baseline fails no-link while new render omits overlay and all sticker geometry', async () => {
  assert.equal((await renderer(before).render({ hasLink: false, linkTitle: '' })).ok, false);
  const r = renderer(), result = await r.render({ hasLink: false, linkTitle: '' });
  assert.equal(result.ok, true); assert.equal(r.counts().overlays, 0); assert.deepEqual(Object.keys(result.result), ['imageBase64']);
});

test('both configure branches omit all sticker metadata when absent and preserve existing linked shape', async () => {
  const p = publisher();
  for (const modern of [false, true]) {
    await p.configureStory('fixture', null, {}, modern);
    const fields = new URLSearchParams(p.calls.at(-1).init.body);
    assert.equal(fields.get('upload_id'), 'fixture');
    assert.ok([...fields.keys()].every(k => !/sticker|tap_models/.test(k)));
  }
});

test('publisher legacy highlight default and partial diagnostic remain; false does not preflight the native port', async () => {
  const p = publisher({ rejectHighlight: true });
  const result = await p.publishStory({ ...p.payload, url: '', highlightTransport: p.port });
  assert.equal(p.counts().highlights, 1); assert.equal(core.publicationResult(result).status, 'partial');
  assert.equal(result.highlightDiagnostic.kind, 'network');
  const noHighlight = publisher();
  const plain = await noHighlight.publishStory({ ...noHighlight.payload, url: '', createHighlight: false });
  assert.equal(noHighlight.counts().ready, 0); assert.equal(noHighlight.counts().highlights, 0);
  assert.equal(core.publicationResult(plain).message, 'story_published');
});

test('no mode can report published without a confirmed Story ID, and invalid flag causes zero effects', async () => {
  const p = publisher({ missingStory: true });
  assert.equal(core.publicationResult(await p.publishStory({ ...p.payload, url: '', createHighlight: false })).status, 'uncertain');
  const bad = publisher(); await assert.rejects(bad.publishStory({ ...bad.payload, url: '', createHighlight: 'false' })); assert.equal(bad.calls.length, 0);
});

test('interrupted receipts with confirmed no-highlight Story are published; legacy receipts remain partial', async () => {
  for (const phase of ['publishing', 'highlighting']) {
    assert.equal(core.interruptedResult({ phase, storyId, createHighlight: false }).message, 'story_published');
    assert.equal(core.failureResult(Error('fixture'), { phase, storyId, createHighlight: false }).status, 'published');
    assert.equal(core.interruptedResult({ phase, storyId }).status, 'partial');
    assert.equal(core.interruptedResult({ phase, createHighlight: false }).status, 'uncertain');
  }
  let publishes = 0; const sent = [], state = { [core.JOURNAL_KEY]: { jobId: crypto.randomUUID(), browserId: 'fixture', sessionId, phase: 'publishing', createHighlight: false, storyId, acknowledged: false } };
  const runner = core.createBridgeRunner({ storage: { get: async () => state, set: async data => Object.assign(state, data) }, identity: async () => ({ browserId: 'fixture', sessionId }), session: async () => ({ id: owner, available: true }), request: async body => { sent.push(body); return {}; }, publish: () => { publishes++; }, prepareImage: () => assert.fail('No render during recovery') });
  await runner.run(); assert.equal(publishes, 0); assert.equal(sent[0].message, 'story_published'); assert.equal(state[core.JOURNAL_KEY].acknowledged, true);
});

function backgroundHarness({ oldServer = false } = {}) {
  let preparePorts = 0, disposed = 0; const requests = [], messages = [], noOp = { addListener() {} }, offscreen = renderer();
  const chrome = { storage: { local: { setAccessLevel: async () => {} }, session: { setAccessLevel: async () => {} } }, alarms: { get: async () => ({}), onAlarm: noOp }, offscreen: { createDocument: async () => {}, closeDocument: async () => {} }, runtime: { getURL: name => 'chrome-extension://fixture/' + name, getContexts: async () => [], sendMessage: async m => { messages.push(m); return offscreen.render(m); }, onInstalled: noOp, onStartup: noOp }, tabs: { onUpdated: noOp, onActivated: noOp }, cookies: { onChanged: noOp } };
  const context = { chrome, crypto, TextEncoder, Uint8Array, URL, AbortSignal, setTimeout, clearTimeout, STORY_CAPABILITIES: core.STORY_CAPABILITIES, validateConfig: core.validateConfig, PROFILE_CAPABILITIES: { profileSetup: 1, photo: true, bio: true }, createProfileRunner: () => ({ recover: async () => {} }), createProfileUI: () => ({}), createInstagramUsernameReader: () => async () => 'fixture', createInstagramWebContextReader: () => async () => ({}), readInstagramSession: async () => ({ id: owner, available: true }), createBridgeRunner: deps => deps, publishStory: async payload => ({ portPresent: Boolean(payload.highlightTransport) }), createInstagramHighlightPage: () => async () => { preparePorts++; return { dispose: async () => { disposed++; } }; }, async fetch(url, init) { if (url.endsWith('/bridge-config.json')) return Response.json({ bridgeOrigin: 'https://resolvflow.online', credential: 'a'.repeat(64) }); assert.equal(url, 'https://resolvflow.online/api/story-bridge/extension'); const body = JSON.parse(init.body); requests.push(body); return oldServer && body.capabilities?.storyOptions ? new Response('', { status: 400 }) : Response.json({ command: null }); } };
  const source = read('background.js').replace(/^import .*;\r?$/gm, '').replace(/\nrun\(\);\s*$/, '\nglobalThis.initializeTest = initialize;');
  vm.runInNewContext(source, context);
  return { initialize: context.initializeTest, requests, messages, counts: () => ({ preparePorts, disposed }) };
}

test('background only prepares/disposes native highlight transport for enabled or legacy jobs', async () => {
  const h = backgroundHarness(), deps = await h.initialize();
  assert.equal((await deps.publish({ createHighlight: false, expectedInstagramUserId: owner })).portPresent, false); assert.equal(h.counts().preparePorts, 0);
  assert.equal((await deps.publish({ createHighlight: true, expectedInstagramUserId: owner })).portPresent, true);
  await deps.publish({ expectedInstagramUserId: owner }); assert.equal(h.counts().preparePorts, 2); assert.equal(h.counts().disposed, 2);
});

test('real background offscreen message and result carry no sticker fields without link', async () => {
  const h = backgroundHarness(), deps = await h.initialize();
  const result = await deps.prepareImage({ imageBase64: 'AA==', contentType: 'image/jpeg' }, core.stickerOptions(template(false, false)));
  assert.deepEqual(Object.keys(result), ['imageBase64']);
  assert.equal(h.messages[0].hasLink, false);
  for (const k of ['style', 'background', 'foreground', 'scale', 'x', 'y', 'width', 'height']) assert.equal(Object.hasOwn(h.messages[0], k), false);
});

test('heartbeat advertises storyOptions=1 and old-server fallback drops only unsupported capability', async () => {
  for (const oldServer of [false, true]) {
    const h = backgroundHarness({ oldServer }), deps = await h.initialize();
    await deps.request({ type: 'heartbeat', available: true, instagramUserId: owner });
    assert.equal(h.requests[0].capabilities.storyOptions, 1);
    assert.equal(h.requests.length, oldServer ? 2 : 1);
    if (oldServer) { assert.equal(h.requests[1].capabilities.storyOptions, undefined); assert.equal(h.requests[1].capabilities.profileSetup, 1); }
  }
});

test('manifest bumps only version without changing permissions, hosts or worker registration', () => {
  const old = JSON.parse(read('manifest.json', before)), current = JSON.parse(read('manifest.json'));
  assert.equal(current.version, '0.4.5'); assert.deepEqual({ ...current, version: old.version }, old);
});

test('no-highlight still enforces session proof before any upload, and legacy highlight requires native readiness', async () => {
  const p = publisher();
  await assert.rejects(p.publishStory({ ...p.payload, url: '', createHighlight: false, web: { assertSession: async () => { throw Object.assign(Error('fixture session changed'), { code: 'session_changed' }); } } }));
  assert.equal(p.calls.length, 0);
  await assert.rejects(p.publishStory({ ...p.payload, url: '' })); assert.equal(p.calls.length, 0);
});

test('lost server acknowledgement retries only the receipt, preserving durable no-highlight identity', async () => {
  const c = command(template(false, false)), state = {}; let effects = 0, receipts = 0;
  const runner = core.createBridgeRunner({ storage: { get: async () => structuredClone(state), set: async data => Object.assign(state, structuredClone(data)) }, identity: async () => ({ browserId: 'fixture', sessionId }), session: async () => ({ id: owner, available: true }), prepareImage: async image => image,
    request: async b => { if (b.type === 'heartbeat') return { command: c }; if (b.type === 'image') return { imageBase64: 'AA==' }; if (b.type === 'result') { receipts++; assert.equal(b.message, 'story_published'); if (receipts === 1) throw Error('fixture response lost'); } return {}; },
    publish: async p => { effects++; assert.equal(state[core.JOURNAL_KEY].createHighlight, false); await p.onStoryPublished(storyId); return { mediaId: storyId }; },
  });
  await assert.rejects(runner.run()); assert.equal(state[core.JOURNAL_KEY].acknowledged, false);
  await runner.run(); assert.equal(effects, 1); assert.equal(receipts, 2); assert.equal(state[core.JOURNAL_KEY].acknowledged, true);
});

test('session changes during image preparation prevent any publication in optional modes', async () => {
  let checks = 0, effects = 0, receipt;
  const c = command(template(false, false)), state = {};
  const runner = core.createBridgeRunner({ storage: { get: async () => state, set: async data => Object.assign(state, data) }, identity: async () => ({ browserId: 'fixture', sessionId }), session: async () => ({ id: ++checks === 1 ? owner : '9', available: true }), prepareImage: async image => image, publish: async () => { effects++; }, request: async b => { if (b.type === 'heartbeat') return { command: c }; if (b.type === 'image') return {}; receipt = b; return {}; } });
  await runner.run(); assert.equal(effects, 0); assert.equal(receipt.message, 'session_unavailable');
});

test('public updateOnly ZIP bundles the current 0.4.5 entrypoints without config or additional access', async () => {
  const filename = new URL('../lib/story-extension-package.ts', import.meta.url);
  const source = readFileSync(filename, 'utf8').replace(/^import (\w+) from "(.+)\?raw";$/gm, (_, name, path) => `const ${name} = ${JSON.stringify(readFileSync(new URL(path, filename), 'utf8'))};`);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const factory = (await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))).createStoryExtensionZip;
  const bytes = factory('https://resolvflow.online', 'a'.repeat(64), true), view = new DataView(bytes.buffer), files = new Map(); let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true), nameSize = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true), start = offset + 30 + nameSize + extra;
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameSize)); files.set(name, new TextDecoder().decode(bytes.subarray(start, start + size))); offset = start + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50); assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(files.has('bridge-config.json'), false); assert.equal(JSON.parse(files.get('manifest.json')).version, '0.4.5');
  for (const name of ['background.js', 'bridge-core.js', 'publisher.js', 'render.js', 'instagram-highlight-page.js', 'instagram-web-context.js', 'profile-runner.js']) assert.equal(files.get(name), read(name));
});
