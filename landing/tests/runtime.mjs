import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React, { act } from 'react';

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(new URL('../../hotmail-export-20261112-candidate/.integration/ui-runtime/package.json', import.meta.url))('jsdom');
export function load(file, cache = new Map()) {
  const target = resolve(file);
  if (cache.has(target)) return cache.get(target).exports;
  if (/\.(png|jpeg|jpg)$/.test(target)) return { __esModule: true, default: 'data:image/png;base64,fixture' };
  const output = ts.transpileModule(readFileSync(target, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} }; cache.set(target, module);
  const local = name => { if (!name.startsWith('.')) return require(name); const base = resolve(dirname(target), name); const next = [base, base + '.ts', base + '.tsx'].find(existsSync); if (!next) throw Error('Missing dependency: ' + name); return load(next, cache); };
  new Function('require', 'module', 'exports', output)(local, module, module.exports);
  return module.exports;
}
export const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
export async function mount(Component, props = {}, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test/', pretendToBeVisual: true });
  if (options.live) dom.window.document.documentElement.dataset.checkout = 'live';
  const previous = new Map(), requests = [], warnings = [], scrolls = [];
  function set(key, value) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'navigator', 'FormData', 'localStorage', 'sessionStorage']) set(key, key === 'window' ? dom.window : dom.window[key]);
  set('requestAnimationFrame', fn => setTimeout(fn, 0));
  set('IS_REACT_ACT_ENVIRONMENT', true);
  const deny = kind => (...args) => { requests.push({ kind, args }); throw Error('Network is forbidden in this prototype'); };
  set('fetch', options.fetch ? (...args) => { requests.push({kind:'fetch', args}); return options.fetch(...args); } : deny('fetch')); dom.window.fetch = globalThis.fetch;
  dom.window.navigator.sendBeacon = deny('beacon');
  dom.window.XMLHttpRequest = class { constructor() { deny('xhr')(); } };
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolls.push(this.id); };
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); this.dataset.modal = 'true'; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const originalError = console.error; console.error = (...args) => warnings.push(args);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => root.render(React.createElement(Component, props))); await flush();
  const doc = dom.window.document;
  const button = text => [...doc.querySelectorAll('button')].find(node => node.textContent.includes(text));
  return { dom, doc, button, requests, warnings, scrolls,
    async click(text) { const node = button(text); assert.ok(node, 'Button: ' + text); await act(async () => node.click()); await flush(); },
    async toggle(name, value) { const input = doc.querySelector(`input[name="${name}"][value="${value}"]`); assert.ok(input); await act(async () => input.click()); await flush(); },
    async follow(selector) { const link = doc.querySelector(selector); assert.ok(link); await act(async () => link.click()); await flush(); },
    async rerender(props) { await act(async () => root.render(React.createElement(Component, props))); await flush(); },
    async close() { await act(async () => root.unmount()); assert.equal(dom.window.localStorage.length, 0); if (!options.live) assert.equal(dom.window.sessionStorage.length, 0); dom.window.close(); console.error = originalError; for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; assert.deepEqual(warnings, [], 'No React warnings'); if (!options.live) assert.deepEqual(requests, [], 'No transport calls'); },
  };
}
export { act };
