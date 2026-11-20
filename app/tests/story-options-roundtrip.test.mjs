import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadStoryModule } from './helpers/story-modules.mjs';
import { createBridgeRunner } from '../extensions/story-bridge/bridge-core.js';

const local = path => fileURLToPath(new URL(path, import.meta.url));
const domain = loadStoryModule(local('../lib/story-bridge.ts'));

test('ZIP de atualização contém os mesmos scripts exercitados e preserva a configuração local', () => {
  const packager = local('../lib/story-extension-package.ts');
  const rawModules = {};
  for (const [,name] of readFileSync(packager,'utf8').matchAll(/from "([^"]+)\?raw"/g)) {
    rawModules[name+'?raw'] = readFileSync(local('../lib/'+name),'utf8');
  }
  const {createStoryExtensionUpdateZip, STORY_EXTENSION_VERSION} = loadStoryModule(packager,rawModules);
  const zip = Buffer.from(createStoryExtensionUpdateZip('https://resolvflow.online'));
  const files = new Map();
  let start = 0;
  while (zip.readUInt32LE(start) === 0x04034b50) {
    const size = zip.readUInt32LE(start+18);
    const filenameEnd = start+30+zip.readUInt16LE(start+26);
    const dataStart = filenameEnd+zip.readUInt16LE(start+28);
    files.set(zip.toString('utf8',start+30,filenameEnd),zip.subarray(dataStart,dataStart+size));
    start = dataStart+size;
  }
  assert.equal(STORY_EXTENSION_VERSION,'0.4.7');
  assert.equal(JSON.parse(files.get('manifest.json')).version,STORY_EXTENSION_VERSION);
  for (const name of ['background.js','bridge-core.js','publisher.js','render.js']) {
    assert.deepEqual(files.get(name),readFileSync(local('../extensions/story-bridge/'+name)));
  }
  assert.equal(files.has('bridge-config.json'),false);
});

class MemoryBucket {
  objects = new Map();
  revision = 0;
  async put(key, value, options) {
    const current = this.objects.get(key);
    const condition = options?.onlyIf;
    if (condition?.etagMatches && current?.etag !== condition.etagMatches) return null;
    if (condition?.etagDoesNotMatch === '*' && current) return null;
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const object = {
      etag: String(++this.revision),
      json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      get body() { return new Blob([bytes]).stream(); },
    };
    this.objects.set(key, object);
    return object;
  }
  async get(key) { return this.objects.get(key) ?? null; }
}

for (const link of [false,true]) {
  for (const highlight of [false,true]) {
    test(`template multipart, fila, extensão e recibo: link=${link}, destaque=${highlight}`, async () => {
      const bucket = new MemoryBucket();
      const owner = 'workspace-test';
      const token = domain.newCredential();
      await domain.rotateCredential(bucket, owner, token);
      const auth = await domain.authorize(bucket, 'Bearer ' + token);
      const route = loadStoryModule(local('../app/api/story-bridge/templates/route.ts'), {
        '../../../../lib/story-bridge-routes': { bridgeRoute: (_request,_role,callback) => callback(bucket,owner) },
      });
      const form = new FormData();
      form.set('name', 'Template de teste');
      form.set('createHighlight', String(highlight));
      form.set('highlightName', highlight ? 'Coleção' : '');
      form.set('linkUrl', link ? 'https://example.org/oferta' : '');
      form.set('linkTitle', link ? 'Ver oferta' : '');
      const degrees = link ? (highlight ? 12 : -7) : 0;
      if (link) form.set('stickerRotation', String(degrees));
      form.set('image', new Blob([Uint8Array.of(255,216,255,0)], { type:'image/jpeg' }), 'teste.jpg');
      const response = await route.POST(new Request('https://example.org/api/story-bridge/templates', { method:'POST', body:form }));
      assert.equal(response.status,201);
      const {template} = await response.json();
      if (link) assert.equal(template.stickerRotation,degrees);
      const target = {browserId:crypto.randomUUID(),sessionId:crypto.randomUUID(),instagramUserId:'123'};
      let effects = 0;
      const memory = {};
      const runner = createBridgeRunner({
        identity: async () => target,
        session: async () => ({id:'123',available:true}),
        storage: { get: async key => ({[key]:structuredClone(memory[key])}), set: async value => Object.assign(memory,structuredClone(value)) },
        request: async body => {
          if (body.type==='heartbeat') return domain.heartbeat(bucket, auth, {...body,capabilities:{profileSetup:1,bio:true,photo:true,storyOptions:1,stickerRotation:1}});
          if (body.type==='result') return domain.result(bucket, auth, body);
          assert.equal(body.type,'image');
          const img = await domain.jobImage(bucket,auth,body);
          return {imageBase64:Buffer.from(await img.arrayBuffer()).toString('base64'),contentType:'image/jpeg'};
        },
        prepareImage: async (image,sticker) => {
          if (link) assert.equal(sticker.rotation,degrees);
          return image;
        },
        publish: async payload => {
          effects++;
          assert.equal(payload.createHighlight,highlight);
          assert.equal(payload.url || '',template.linkUrl);
          await payload.onStoryPublished('777_123');
          return {mediaId:'777_123', ...(highlight ? {highlight:{reel:{id:'highlight:456'}}} : {})};
        },
      });
      await runner.run();
      const request = {templateId:template.id, targets:[target],requestId:crypto.randomUUID()};
      await domain.publish(bucket,owner,request);
      await runner.run();
      const replay = await domain.publish(bucket,owner,request);
      await runner.run();
      assert.equal(effects,1,'repetir o pedido não deve reenviar o story');
      assert.equal(replay.jobs[0].status,'published');
      assert.equal(replay.jobs[0].storyId,'777_123');
      assert.equal(replay.jobs[0].message,highlight ? 'published' : 'story_published');
      assert.equal(replay.jobs[0].highlightId,highlight ? 'highlight:456' : undefined);
    });
  }
}
