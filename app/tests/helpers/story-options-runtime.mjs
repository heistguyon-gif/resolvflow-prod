import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { loadStoryModule } from './story-modules.mjs';

const qaRequire = createRequire(new URL('../../../hotmail-export-20261112-candidate/.integration/ui-runtime/package.json', import.meta.url));
const { JSDOM } = qaRequire('jsdom');
const css = new Proxy({}, { get: (_, key) => String(key) });
const { StoryTemplates } = loadStoryModule(fileURLToPath(new URL('../../app/components/StoryTemplates.tsx', import.meta.url)), {
  './StoryTemplates.module.css': { __esModule: true, default: css },
  './ProfileSetup': { ProfileSetup: () => null },
  './StoryInviteCapture': { StoryInviteCapture: () => null },
});
export const pause = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
export const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
export const template = (overrides = {}) => ({ id: 'template-1', name: 'Template exemplo', linkUrl: '', linkTitle: '', createHighlight: false, highlightName: '', imageUrl: '/fixture.png', createdAt: '2026-11-18T00:00:00Z', ...overrides });
export const browser = (overrides = {}) => ({ id: 'browser-1', sessionId: 'session-1', label: 'Perfil exemplo A', instagramUserId: '101', available: true, lastSeenAt: new Date().toISOString(), capabilities: { storyOptions: 1 }, ...overrides });
export const snapshot = (overrides = {}) => ({ templates: [], browsers: [], dispatches: [], pollAfterMs: 5000, extensionConfigured: true, serverTime: Date.now(), ...overrides });

export async function mountStory({ state = snapshot(), role = 'editor', scopeKey = 'fixture-a', storiesOnly = true, fetcher } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test/', pretendToBeVisual: true });
  const previous = new Map(), requests = [], warnings = [];
  function global(key, value) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'navigator', 'File', 'Blob', 'FormData', 'URL']) global(key, key === 'window' ? dom.window : dom.window[key]);
  global('IS_REACT_ACT_ENVIRONMENT', true);
  dom.window.URL.createObjectURL = () => 'blob:fixture-image';
  dom.window.URL.revokeObjectURL = () => {};
  Object.defineProperty(dom.window.document, 'fonts', { value: { ready: Promise.resolve() } });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: text => ({ width: text.length * 15 }) });
  // Polls are exercised explicitly through Atualizar, without waiting real intervals.
  dom.window.setInterval = () => 1;
  dom.window.clearInterval = () => {};
  let currentState = state;
  global('fetch', async (url, init = {}) => {
    assert.ok(String(url).startsWith('/api/story-bridge'), 'Only the mocked Story bridge is allowed');
    const call = { url: String(url), ...init, method: init.method || 'GET' }; requests.push(call);
    if (fetcher) { const result = await fetcher(call, currentState); if (result !== undefined) return result; }
    if (call.method === 'GET' && url === '/api/story-bridge') return json(currentState);
    if (call.method === 'POST' && url === '/api/story-bridge/templates') {
      const values = Object.fromEntries(init.body.entries()); delete values.image;
      const saved = template({ ...values, createHighlight: values.createHighlight === 'true', stickerRotation: Number(values.stickerRotation || 0) });
      currentState = { ...currentState, templates: [saved, ...currentState.templates.filter(item => item.id !== saved.id)] };
      return json({ template: saved });
    }
    if (call.method === 'POST' && url === '/api/story-bridge/publish') {
      const body = JSON.parse(init.body), chosen = currentState.templates.find(item => item.id === body.templateId);
      const dispatch = { id: 'dispatch-1', templateName: chosen.name, createHighlight: chosen.createHighlight ?? true, createdAt: new Date().toISOString(), jobs: body.targets.map((target, i) => ({ id: 'job-'+i, browserId: target.browserId, label: target.browserId, status: 'queued', message: 'queued' })) };
      currentState = { ...currentState, dispatches: [dispatch] };
      return json({ dispatch });
    }
    throw Error('Unexpected mock request: '+call.method+' '+url);
  });
  dom.window.fetch = globalThis.fetch;
  dom.window.XMLHttpRequest = class { constructor() { throw Error('External transport is forbidden'); } };
  dom.window.navigator.sendBeacon = () => { throw Error('External transport is forbidden'); };
  const originalError = console.error; console.error = (...args) => warnings.push(args);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => root.render(React.createElement(StoryTemplates, { scopeKey, role, storiesOnly }))); await pause();
  const doc = dom.window.document;
  const node = selector => { const found = doc.querySelector(selector); assert.ok(found, selector); return found; };
  return { dom, doc, requests, warnings, node,
    setState(next) { currentState = next; },
    posts(path = '') { return requests.filter(call => call.method === 'POST' && call.url.endsWith(path)); },
    async click(selector) { await act(async () => node(selector).click()); await pause(); },
    async fill(selector, value) {
      await act(async () => {
        const input = node(selector);
        const proto = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      }); await pause();
    },
    async upload() { await act(async () => { const input = node('#story-image'); Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File(['synthetic-jpeg'], 'fixture.jpg', { type: 'image/jpeg' })] }); input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await pause(); },
    async submit() { await act(async () => node('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); await pause(); },
    async refresh() { await act(async () => node('.summary button').click()); await pause(); },
    async close() { await act(async () => root.unmount()); dom.window.close(); console.error = originalError; for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; assert.deepEqual(warnings, [], 'No React runtime warnings'); },
  };
}
export { act };
