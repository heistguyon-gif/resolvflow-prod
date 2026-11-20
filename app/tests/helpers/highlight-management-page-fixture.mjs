import vm from 'node:vm';
import { readFileSync } from 'node:fs';
export const OWNER = '52970422381';
export const SELECTED = { id: 'highlight:17915266020545970', title: 'Synthetic fixture' };
export const edge = (row = SELECTED, owner = OWNER) => ({ node: { ...row, user: { id: owner }, cover_media: { private: 'discard-this-field' } } });
export const page = (edges = [], info = {}) => ({ edges, page_info: { has_next_page: false, has_previous_page: false, end_cursor: null, ...info } });
const file = new URL('../../extensions/story-bridge/instagram-highlight-management-page.js', import.meta.url);

export function pageFixture(t, options = {}) {
  const queries = [], posts = [], pending = [], frames = [], timers = new Map(); let current, afterQuery = options.afterQuery;
  const state = { viewer: OWNER, csrf: 'synthetic-csrf', sprinkle: 'synthetic-sprinkle', dtsg: 'synthetic-dtsg', webSession: 'synthetic-web-session', locked: false, retained: 0, disposed: 0 };
  const pages = [...(options.pages ?? [page([edge()]), page()])];
  const environment = { retain() { state.retained++; return { dispose() { state.disposed++; } }; }, lookup() { return { data: { highlights: current }, isMissingData: options.missingData === true }; } };
  const query = { kind: 'Request', params: { operationKind: 'query' } }, fragment = { kind: 'Fragment' };
  const modules = {
    PolarisConfig: { getViewerId: () => state.viewer, getCSRFToken: () => state.csrf, getSprinkleToken: () => state.sprinkle },
    PolarisInstajax: { map() { return '5605'; }, getHeaders(method, path) { assertRequest(method, path); return { 'X-CSRFToken': state.csrf, 'X-Web-Session-ID': state.webSession, 'X-Instagram-Ajax': 'synthetic-ajax', 'X-IG-WWW-Claim': 'synthetic-claim', ...(options.headers || {}) }; } },
    justknobx: { _: () => true }, SprinkleConfig: { param_name: 'jazoest' }, DTSG: { getToken: () => state.dtsg }, PolarisRelayEnvironment: environment,
    'ProfileStoryHighlightsTrayContentQuery_connection.graphql': query, 'PolarisProfileStoryHighlightsTrayContentFragment.graphql': fragment,
    'relay-runtime': { createOperationDescriptor(q, variables) { if (q !== query) throw Error('Unexpected query'); return { variables }; }, getSelector(f) { if (f !== fragment) throw Error('Unexpected fragment'); return { kind: 'SingularReaderSelector' }; } },
    CometRelay: { fetchQuery(env, q, variables, config) {
      if (env !== environment || q !== query) throw Error('Unexpected environment/query');
      queries.push({ variables, config });
      return { subscribe(observer) {
        const emit = () => { current = pages.shift(); if (afterQuery) { const fn = afterQuery; afterQuery = null; fn(state); } observer.next({ __id: 'synthetic-root' }); observer.complete(); };
        if (options.pendingQuery) pending.push(emit); else emit();
        return { unsubscribe() {} };
      } };
    } },
  };
  const assertRequest = (method, path) => { if (method !== 'POST' || !/^\/api\/v1\/highlights\/highlight:\d+\/delete_reel\/$/.test(path)) throw Error('Unexpected native header route'); };
  let seq = 0;
  const clock = options.fastTimers ? {
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, fn); if (ms <= 20000) queueMicrotask(() => { if (timers.has(id)) { timers.delete(id); fn(); } }); return id; }, clearTimeout(id) { timers.delete(id); },
  } : { setTimeout(fn, ms) { const id = setTimeout(fn, ms); id.unref?.(); timers.set(id, fn); return id; }, clearTimeout(id) { clearTimeout(id); timers.delete(id); } };
  const sandbox = { URLSearchParams, AbortSignal, TextEncoder, TextDecoder, Uint8Array, Date, ...clock, document: { querySelector: () => options.password ? {} : null }, location: { origin: 'https://www.instagram.com', pathname: '/' },
    require(name) { if (!Object.hasOwn(modules, name)) throw Error('Missing native module'); return modules[name]; },
    navigator: { locks: { async request(name, args, cb) { if (name !== 'resolv-highlight-delete:' + OWNER || args.ifAvailable !== true) throw Error('Unexpected lock'); if (state.locked) return cb(null); state.locked = true; try { return await cb({}); } finally { state.locked = false; } } } },
    async fetch(url, init) {
      if (url !== 'https://www.instagram.com/api/v1/highlights/' + SELECTED.id + '/delete_reel/' || init.method !== 'POST') throw Error('Forbidden network route');
      posts.push({ url, init });
      if (options.fetchThrows) throw Error('synthetic upstream secret - must not leave PAGE');
      return options.response ? options.response() : Response.json({ status: 'ok' });
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(file, 'utf8').replace(/^import .*;\r?$/gm, '').replace(/\bexport /g, '') + '\nglobalThis.MAIN = instagramHighlightManagementMAIN;', sandbox);
  const handle = crypto.randomUUID();
  const invoke = (action, values = {}, effect = false, deadline = Date.now() + 10000) => sandbox.MAIN({ action, userId: OWNER, handle, ...values }, deadline, effect);
  t.after(async () => { await invoke('dispose'); for (const id of timers.keys()) clock.clearTimeout(id); });
  return { state, queries, posts, pages, pending, frames, modules, invoke, main: sandbox.MAIN, handle };
}
