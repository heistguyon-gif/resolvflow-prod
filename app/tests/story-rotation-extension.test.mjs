import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as core from '../extensions/story-bridge/bridge-core.js';

const root = new URL('../extensions/story-bridge/', import.meta.url);
const before = new URL('./story-rotation-extension-evidence/before/', import.meta.url);
const source = (name, base = root) => readFileSync(new URL(name, base), 'utf8');
const owner = '52970422381', storyId = '4022913236764864774_' + owner, sessionId = crypto.randomUUID();
const linked = { name: 'Fixture', linkUrl: 'https://example.test', linkTitle: 'OPEN', createHighlight: false, highlightName: '', stickerX: .3, stickerY: .65 };
const command = template => ({ id: crypto.randomUUID(), dispatchId: crypto.randomUUID(), instagramUserId: owner, sessionId, template });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const identity = () => [1, 0, 0, 1, 0, 0];
const point = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function multiply(m, n) { return [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]]; }

function renderer(base = root, textWidth = 160) {
  let listener, matrix = identity(); const stack = [], images = [], rectangles = [], rotations = [], text = [];
  const ctx = new Proxy({
    save() { stack.push([...matrix]); }, restore() { matrix = stack.pop(); },
    translate(x, y) { matrix = multiply(matrix, [1, 0, 0, 1, x, y]); },
    rotate(angle) { rotations.push(angle); matrix = multiply(matrix, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]); },
    drawImage() { images.push([...matrix]); },
    roundRect(x, y, width, height) { rectangles.push({ matrix: [...matrix], x, y, width, height }); },
    fillText(value) { text.push(value); }, measureText: () => ({ width: textWidth }), createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (obj, key) => obj[key] ?? (() => {}) });
  const sandbox = { Uint8Array, atob, Blob, chrome: { runtime: { id: 'fixture-extension', onMessage: { addListener(fn) { listener = fn; } } } }, createImageBitmap: async () => ({ width: 1080, height: 1920, close() {} }), document: { createElement: () => ({ getContext: () => ctx, toDataURL: () => 'data:image/jpeg;base64,AA==' }) } };
  vm.createContext(sandbox); vm.runInContext(source('sticker-metrics.js'), sandbox); vm.runInContext(source('render.js', base), sandbox);
  return { images, rectangles, rotations, text, matrix: () => matrix, render(options) { return new Promise(resolve => listener({ type: 'RESOLV_STORY_RENDER', target: 'offscreen', imageBase64: 'AA==', contentType: 'image/jpeg', ...options }, { id: 'fixture-extension' }, resolve)); } };
}

function publisher() {
  const calls = []; let highlights = 0;
  const sandbox = { Uint8Array, TextEncoder, TextDecoder, URL, URLSearchParams, AbortSignal, atob, crypto, chrome: { cookies: { get: async ({ name }) => ({ value: name === 'ds_user_id' ? owner : 'synthetic-only-' + name }) } }, fetch: async (url, init) => {
    assert.ok(url.startsWith('https://i.instagram.com/rupload_igphoto/') || url === 'https://www.instagram.com/api/v1/media/configure_to_story/');
    calls.push({ url, init }); return Response.json(url.includes('rupload_igphoto') ? { status: 'ok', upload_id: 'fixture' } : { status: 'ok', media: { id: storyId } });
  } };
  vm.runInNewContext(source('publisher.js').replace(/\bexport /g, '') + '\nglobalThis.api = { publishStory, configureStory };', sandbox);
  return { ...sandbox.api, calls, count: () => highlights, payload: { expectedInstagramUserId: owner, highlightTransport: { assertReady: async () => {}, createHighlight: async () => { highlights++; return { status: 'confirmed', ownerMatches: true, storyMatches: true, titleMatches: true, reelId: '17915266020545970' }; } } } };
}

test('rotation is a strict signed integer; missing is zero, no-link never forwards unused angle', () => {
  for (const angle of [-180, -90, -1, 0, 1, 90, 180]) {
    assert.ok(core.validateCommand(command({ ...linked, stickerRotation: angle }), sessionId, owner));
    assert.equal(core.stickerOptions({ ...linked, stickerRotation: angle }).rotation, angle);
  }
  for (const angle of [-181, 181, 1.5, NaN, Infinity, '20', null, false]) assert.throws(() => core.validateCommand(command({ ...linked, stickerRotation: angle }), sessionId, owner));
  assert.equal(core.stickerOptions(linked).rotation, 0);
  assert.deepEqual(core.stickerOptions({ ...linked, linkUrl: '', linkTitle: '', stickerRotation: 60 }), { hasLink: false, linkTitle: '' });
});

for (const angle of [-180, -90, -25, 0, 25, 90, 180]) {
  test(`canvas rotates only sticker around its center and wire geometry matches signed ${angle} degrees`, async () => {
    const r = renderer(), options = core.stickerOptions({ ...linked, stickerRotation: angle });
    const response = await r.render(options); assert.equal(response.ok, true);
    const image = response.result, rect = r.rectangles[0], cx = options.x * 1080, cy = options.y * 1920;
    assert.deepEqual(r.images, [identity()]); assert.deepEqual(r.matrix(), identity()); // Background and restored context stay unrotated.
    assert.equal(r.rotations.length, angle === 0 ? 0 : 1); if (angle) near(r.rotations[0], angle * Math.PI / 180);
    near(point(rect.matrix, cx, cy)[0], cx); near(point(rect.matrix, cx, cy)[1], cy);
    const right = point(rect.matrix, cx + rect.width / 2, cy), radians = angle * Math.PI / 180;
    near(right[0], cx + Math.cos(radians) * rect.width / 2); near(right[1], cy + Math.sin(radians) * rect.width / 2);
    if (angle === 90) assert.ok(right[1] > cy); if (angle === -90) assert.ok(right[1] < cy);
    near(image.width, rect.width / 1080); near(image.height, rect.height / 1920); assert.equal(image.rotation, angle);
    const p = publisher(); await p.publishStory({ ...p.payload, ...image, url: linked.linkUrl, createHighlight: false });
    const fields = new URLSearchParams(p.calls[1].init.body), link = JSON.parse(fields.get('story_link_stickers'))[0], tap = JSON.parse(fields.get('tap_models'))[0];
    assert.deepEqual(link, tap);
    for (const key of ['x', 'y', 'width', 'height', 'rotation']) assert.equal(link[key], image[key]);
    assert.equal(link.rotation, angle); // Wire is degrees, never Canvas radians.
    await p.configureStory('fixture', link, {}, false);
    const oldLink = JSON.parse(new URLSearchParams(p.calls.at(-1).init.body).get('story_link_stickers'))[0];
    for (const key of ['x', 'y', 'width', 'height', 'rotation']) assert.equal(oldLink[key], image[key]);
  });
}

test('0.4.5 ignores nonzero angle; new zero remains geometrically identical to legacy', async () => {
  const previous = renderer(before), current = renderer();
  const old = await previous.render({ ...core.stickerOptions(linked), rotation: 25 });
  assert.equal(previous.rotations.length, 0); assert.equal(old.result.rotation, undefined);
  const zero = await current.render(core.stickerOptions(linked));
  assert.deepEqual(current.rectangles, previous.rectangles);
  assert.deepEqual({ ...zero.result, rotation: undefined }, { ...old.result, rotation: undefined });
});

test('minimum scale and long text preserve exact rendered dimensions when tilted, while zero keeps legacy clamp', async () => {
  for (const textWidth of [160, 2500]) for (const angle of [-25, 25, 0]) {
    const r = renderer(root, textWidth), options = core.stickerOptions({ ...linked, stickerSize: 70, stickerRotation: angle, linkTitle: textWidth === 160 ? 'OPEN' : 'W'.repeat(40) });
    const image = (await r.render(options)).result, rect = r.rectangles[0];
    assert.ok(image.height < .03); near(image.height, rect.height / 1920);
    if (textWidth === 160) near(image.height, 76 * .7 / 1920);
    else assert.ok(image.height < 76 * .7 / 1920);
    const p = publisher(); await p.publishStory({ ...p.payload, ...image, url: linked.linkUrl, createHighlight: false });
    const fields = new URLSearchParams(p.calls[1].init.body), link = JSON.parse(fields.get('story_link_stickers'))[0], tap = JSON.parse(fields.get('tap_models'))[0];
    assert.deepEqual(link, tap); assert.equal(link.rotation, angle); assert.equal(link.width, image.width);
    assert.equal(link.height, angle === 0 ? .03 : image.height);
    await p.configureStory('fixture', link, {}, false);
    assert.equal(JSON.parse(new URLSearchParams(p.calls.at(-1).init.body).get('story_link_stickers'))[0].height, link.height);
  }
});

test('tilted geometry requires positive finite normalized dimensions before any effect', async () => {
  for (const patch of [{ width: undefined }, { height: undefined }, { width: 0 }, { height: -1 }, { height: NaN }, { width: Infinity }, { width: 1.01 }, { height: '0.02' }]) {
    const p = publisher(); await assert.rejects(p.publishStory({ ...p.payload, imageBase64: 'AA==', url: linked.linkUrl, createHighlight: false, rotation: 25, width: .5, height: .02, ...patch }));
    assert.equal(p.calls.length, 0);
  }
});

test('no-link ignores angle entirely while both highlight choices preserve their result', async () => {
  for (const createHighlight of [false, true]) {
    const r = renderer(), options = core.stickerOptions({ ...linked, linkUrl: '', linkTitle: '', stickerRotation: 90 });
    const image = (await r.render(options)).result; assert.equal(r.rotations.length, 0); assert.equal(r.text.length, 0); assert.deepEqual(Object.keys(image), ['imageBase64']);
    const p = publisher(), result = await p.publishStory({ ...p.payload, ...image, url: '', rotation: 90, createHighlight });
    const fields = new URLSearchParams(p.calls[1].init.body);
    for (const key of ['story_link_stickers', 'story_sticker_ids', 'tap_models']) assert.equal(fields.has(key), false);
    assert.equal(p.count(), Number(createHighlight)); assert.equal(core.publicationResult(result).message, createHighlight ? 'published' : 'story_published');
  }
});

test('invalid rotation fails render/publish before any Instagram effect, and session guard still applies', async () => {
  for (const rotation of [181, -181, 1.1, '15', null]) {
    assert.equal((await renderer().render({ ...core.stickerOptions(linked), rotation })).ok, false);
    const p = publisher(); await assert.rejects(p.publishStory({ ...p.payload, imageBase64: 'AA==', url: linked.linkUrl, rotation, createHighlight: false })); assert.equal(p.calls.length, 0);
  }
  const p = publisher(); await assert.rejects(p.publishStory({ ...p.payload, imageBase64: 'AA==', url: linked.linkUrl, rotation: 25, createHighlight: false, expectedInstagramUserId: '9' })); assert.equal(p.calls.length, 0);
});

test('runner forwards template angle through actual renderer into publication and preserves durable receipt', async () => {
  const state = {}, commandValue = command({ ...linked, stickerRotation: -35 }), r = renderer(), p = publisher(); let receipt;
  const runner = core.createBridgeRunner({ storage: { get: async () => structuredClone(state), set: async v => Object.assign(state, structuredClone(v)) }, identity: async () => ({ browserId: 'fixture', sessionId }), session: async () => ({ id: owner, available: true }), request: async b => { if (b.type === 'heartbeat') return { command: commandValue }; if (b.type === 'image') return { imageBase64: 'AA==', contentType: 'image/jpeg' }; receipt = b; return {}; }, prepareImage: async (_image, options) => (await r.render(options)).result, publish: data => p.publishStory(data) });
  await runner.run(); assert.equal(receipt.message, 'story_published'); assert.equal(receipt.storyId, storyId);
  assert.equal(JSON.parse(new URLSearchParams(p.calls[1].init.body).get('tap_models'))[0].rotation, -35);
  await runner.run(); assert.equal(p.calls.length, 2);
});

async function heartbeat(server, failureStatus) {
  const sent = [], noOp = { addListener() {} };
  const sandbox = { URL, TextEncoder, Uint8Array, AbortSignal, crypto, setTimeout, clearTimeout, STORY_CAPABILITIES: core.STORY_CAPABILITIES, HIGHLIGHT_MANAGEMENT_CAPABILITIES: { highlightManagement: 1 }, createInstagramHighlightManagementPage: () => () => assert.fail('No management PAGE from legacy fixture'), createHighlightManagementRunner: () => ({ recover: async () => {}, run: async () => assert.fail('No management command in legacy fixture') }), validateConfig: core.validateConfig, PROFILE_CAPABILITIES: { profileSetup: 1, bio: true, photo: true, photoProof: 1 }, createProfileRunner: () => ({ recover: async () => {} }), createProfileUI: () => ({}), createInstagramUsernameReader: () => async () => null, createInstagramWebContextReader: () => async () => ({}), readInstagramSession: async () => ({ id: '', available: false }), createInstagramHighlightPage: () => () => assert.fail('No native preflight from heartbeat'), createBridgeRunner: data => data,
    chrome: { storage: { local: { setAccessLevel: async () => {} }, session: { setAccessLevel: async () => {} } }, alarms: { get: async () => ({}), onAlarm: noOp }, runtime: { getURL: file => 'chrome-extension://fixture/' + file, onInstalled: noOp, onStartup: noOp }, tabs: { onUpdated: noOp, onActivated: noOp }, cookies: { onChanged: noOp } },
    async fetch(url, init) { if (url.endsWith('bridge-config.json')) return Response.json({ bridgeOrigin: 'https://resolvflow.online', credential: 'a'.repeat(64) }); assert.equal(url, 'https://resolvflow.online/api/story-bridge/extension'); const body = JSON.parse(init.body); assert.equal(body.type, 'heartbeat'); sent.push(body); if (server === 'network') throw new TypeError('synthetic network failure'); const reject = failureStatus || (server === '0.4.6' ? body.capabilities?.highlightManagement : server === '0.4.5' ? body.capabilities?.stickerRotation : server === '0.4.4' ? body.capabilities?.storyOptions : server === 'minimal' ? Object.hasOwn(body, 'instagramUsername') : server === 'old' ? body.capabilities : false); return reject ? new Response('', { status: failureStatus || 400 }) : Response.json({ command: null }); },
  };
  vm.runInNewContext(source('background.js').replace(/^import .*;\r?$/gm, '').replace(/\nrun\(\);\s*$/, '\nglobalThis.init = initialize;'), sandbox);
  const deps = await sandbox.init();
  return { sent, request: () => deps.request({ type: 'heartbeat', available: false, instagramUserId: '' }) };
}

test('heartbeat progressively preserves 0.4.5 storyOptions, then 0.4.4/profile and older servers', async () => {
  for (const [server, count] of [['new', 1], ['0.4.6', 2], ['0.4.5', 3], ['0.4.4', 4], ['minimal', 5], ['old', 6]]) {
    const h = await heartbeat(server); await h.request(); assert.equal(h.sent.length, count);
    assert.equal(h.sent[0].capabilities.stickerRotation, 1); assert.equal(h.sent[0].capabilities.storyOptions, 1);
    if (count >= 2) { assert.equal(h.sent[1].capabilities.highlightManagement, undefined); assert.equal(h.sent[1].capabilities.stickerRotation, 1); assert.equal(h.sent[1].capabilities.storyOptions, 1); }
    if (count >= 3) { assert.equal(h.sent[2].capabilities.stickerRotation, undefined); assert.equal(h.sent[2].capabilities.storyOptions, 1); }
    if (count >= 4) { assert.equal(h.sent[3].capabilities.storyOptions, undefined); assert.equal(h.sent[3].capabilities.photoProof, 1); }
  }
});

test('network/auth/server heartbeat failures never trigger version fallback or a publication', async () => {
  const network = await heartbeat('network'); await assert.rejects(network.request()); assert.equal(network.sent.length, 1);
  for (const status of [401, 403, 409, 429, 503]) { const h = await heartbeat('new', status); await assert.rejects(h.request()); assert.equal(h.sent.length, 1); }
});

test('0.4.7 changes neither permissions nor allowed hosts nor external execution surface', () => {
  const old = JSON.parse(source('manifest.json', before)), next = JSON.parse(source('manifest.json'));
  assert.equal(next.version, '0.4.7'); assert.deepEqual({ ...next, version: old.version }, old);
  assert.equal(next.externally_connectable, undefined); assert.equal(next.content_scripts, undefined);
});
