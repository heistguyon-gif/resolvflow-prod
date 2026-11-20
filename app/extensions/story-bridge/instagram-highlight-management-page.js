import { instagramIdentityDocument } from "./instagram-identity.js";

// All native tokens, Relay records and response bodies remain in MAIN.
// Delete route is a MOBILE-reference hypothesis, not a live WEB validation.
export async function instagramHighlightManagementMAIN(target, deadlineMs, performEffect = false) {
  const blocked = errorEnum => ({ status: "failed", errorEnum, effectAttempted: false });
  if (!target || !/^\d{1,30}$/.test(target.userId || "") || !/^[a-f0-9-]{36}$/i.test(target.handle || "") || !Number.isFinite(deadlineMs) || Date.now() > deadlineMs) return blocked("page_native_contract_guard");
  const key = "__resolvHighlightManagement_" + target.handle;
  if (target.action !== "prepare") {
    const port = globalThis[key];
    return typeof port === "function" ? port(target, deadlineMs, performEffect) : blocked("page_native_contract_guard");
  }
  if (performEffect || globalThis[key]) return blocked("page_native_contract_guard");
  try {
    const userId = target.userId, load = globalThis.require;
    if (typeof load !== "function") throw Error();
    const config = load("PolarisConfig"), native = load("PolarisInstajax"), knob = load("justknobx"), sprinkle = load("SprinkleConfig");
    const route = id => "/api/v1/highlights/" + id + "/delete_reel/";
    const allowedHeaders = ["accept", "content-type", "x-requested-with", "x-csrftoken", "x-ig-app-id", "x-asbd-id", "x-ig-www-claim", "x-instagram-ajax", "x-web-session-id", "x-ig-max-touch-points", "x-web-device-id", "x-mid", "x-bloks-version-id"];
    function nativeRequest(path) {
      if (location.origin !== "https://www.instagram.com" || /\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(location.pathname) || document.querySelector('input[name="password"],iframe[src*="captcha"]') || String(config.getViewerId()) !== userId) throw Error();
      if (typeof native.getHeaders !== "function" || typeof native.map !== "function" || !native.map.toString().includes("5605") || sprinkle.param_name !== "jazoest") throw Error();
      const csrf = config.getCSRFToken(), jazoest = config.getSprinkleToken(), gate = knob._("5605");
      if (typeof csrf !== "string" || !csrf || typeof jazoest !== "string" || !jazoest || jazoest.length > 8192 || /[\r\n]/.test(jazoest) || typeof gate !== "boolean") throw Error();
      const headers = {}; let size = 0;
      for (const [key, raw] of Object.entries(native.getHeaders("POST", path))) {
        const name = key.toLowerCase();
        if (!allowedHeaders.includes(name) || name in headers || !["string", "number"].includes(typeof raw) || typeof raw === "number" && !Number.isFinite(raw)) throw Error();
        const value = String(raw); size += name.length + value.length;
        if (value.length > 8192 || /[\r\n]/.test(value) || size > 32768) throw Error();
        headers[name] = value;
      }
      headers.accept ??= "*/*"; headers["content-type"] ??= "application/x-www-form-urlencoded"; headers["x-requested-with"] ??= "XMLHttpRequest";
      if (headers.accept !== "*/*" || headers["content-type"] !== "application/x-www-form-urlencoded" || headers["x-requested-with"] !== "XMLHttpRequest" || headers["x-csrftoken"] !== csrf || !headers["x-web-session-id"] || !headers["x-instagram-ajax"] || !headers["x-ig-www-claim"]) throw Error();
      const fields = { jazoest }; let dtsg = null;
      if (gate) { dtsg = load("DTSG").getToken(); if (typeof dtsg !== "string" || !dtsg || dtsg.length > 8192 || /[\r\n]/.test(dtsg)) throw Error(); fields.fb_dtsg = dtsg; }
      return { headers, body: new URLSearchParams(fields).toString(), tag: JSON.stringify([userId, csrf, jazoest, gate, dtsg, headers["x-web-session-id"]]) };
    }
    const before = nativeRequest(route("highlight:1")).tag;
    let closed = false, used = false;
    const expires = Date.now() + 120000;
    const assertCurrent = deadline => { if (closed || Date.now() > expires || Date.now() > deadline || nativeRequest(route("highlight:1")).tag !== before) throw Error(); };
    const exactId = value => typeof value === "string" ? value : Number.isSafeInteger(value) && value >= 0 ? String(value) : "";
    const normalizeId = value => { const id = exactId(value); return /^(?:highlight:)?\d{1,100}$/.test(id) ? id.startsWith("highlight:") ? id : "highlight:" + id : null; };
    async function completeList(deadline) {
      assertCurrent(deadline);
      const relay = load("CometRelay"), environmentModule = load("PolarisRelayEnvironment"), environment = environmentModule.default ?? environmentModule;
      const queryModule = load("ProfileStoryHighlightsTrayContentQuery_connection.graphql"), query = queryModule.default ?? queryModule;
      const fragmentModule = load("PolarisProfileStoryHighlightsTrayContentFragment.graphql"), fragment = fragmentModule.default ?? fragmentModule, runtime = load("relay-runtime");
      if (query.kind !== "Request" || query.params?.operationKind !== "query" || fragment.kind !== "Fragment" || typeof relay.fetchQuery !== "function" || typeof environment.lookup !== "function" || typeof environment.retain !== "function" || typeof runtime.getSelector !== "function" || typeof runtime.createOperationDescriptor !== "function") throw Error();
      const highlights = [], ids = new Set(), cursors = new Set(); let after = null;
      for (let page = 0; page < 50; page++) {
        assertCurrent(deadline);
        const variables = { user_id: userId, first: 50, after, before: null, last: null, max_highlights_to_fetch_on_pagination: 50 };
        const operation = runtime.createOperationDescriptor(query, variables), retained = environment.retain(operation);
        let data;
        try {
          const observable = relay.fetchQuery(environment, query, variables, { fetchPolicy: "network-only", networkCacheConfig: { force: true } });
          const ref = await new Promise((resolve, reject) => {
            let subscription, last, finished = false;
            const finish = (ok, value) => { if (finished) return; finished = true; clearTimeout(timer); subscription?.unsubscribe?.(); if (ok) resolve(value); else reject(Error()); };
            const timer = setTimeout(() => finish(false), Math.max(1, Math.min(20000, deadline - Date.now())));
            try { subscription = observable.subscribe({ next: value => { last = value; }, error: () => finish(false), complete: () => finish(true, last) }); if (finished) subscription?.unsubscribe?.(); }
            catch { finish(false); }
          });
          assertCurrent(deadline);
          const selector = runtime.getSelector(fragment, ref);
          if (!selector || selector.kind === "PluralReaderSelector") throw Error();
          data = environment.lookup(selector);
          if (data.isMissingData === true) throw Error();
          data = data.data;
        } finally { retained.dispose(); }
        const connection = data?.highlights, info = connection?.page_info;
        if (!Array.isArray(connection?.edges) || !info || typeof info.has_next_page !== "boolean" || typeof info.has_previous_page !== "boolean" || page === 0 && info.has_previous_page || connection.edges.length > 500) throw Error();
        for (const edge of connection.edges) {
          const node = edge?.node, id = normalizeId(node?.id);
          if (!id || ids.has(id) || typeof node.title !== "string" || node.title.length > 1024 || exactId(node.user?.id) !== userId || highlights.length >= 500) throw Error();
          ids.add(id); highlights.push({ id, title: node.title });
        }
        if (JSON.stringify(highlights).length > 262144) throw Error();
        assertCurrent(deadline);
        if (!info.has_next_page) return { status: "completed", complete: true, ownerInstagramUserId: userId, highlights };
        if (!connection.edges.length || typeof info.end_cursor !== "string" || !info.end_cursor || info.end_cursor.length > 4096 || cursors.has(info.end_cursor)) throw Error();
        after = info.end_cursor; cursors.add(after);
      }
      throw Error();
    }
    const timer = setTimeout(() => { closed = true; delete globalThis[key]; }, 120000);
    const dispose = () => { closed = true; clearTimeout(timer); delete globalThis[key]; return { status: "disposed" }; };
    const port = async (next, deadline, effect) => {
      if (next.action === "dispose") return dispose();
      let attempted = false;
      try {
        assertCurrent(deadline);
        if (next.userId !== userId) throw Error();
        if (next.action === "list" && !effect) return await completeList(deadline);
        if (next.action !== "delete" || !/^highlight:\d{1,100}$/.test(next.highlightId || "") || typeof next.highlightTitle !== "string" || next.highlightTitle.length > 1024 || used) throw Error();
        if (!effect) { nativeRequest(route(next.highlightId)); return { status: "dry_run_ready" }; }
        if (!globalThis.navigator?.locks?.request) throw Error();
        return await navigator.locks.request("resolv-highlight-delete:" + userId, { mode: "exclusive", ifAvailable: true }, async lock => {
          if (!lock) return blocked("busy");
          try {
            assertCurrent(deadline); if (used) throw Error();
            const list = await completeList(deadline), selected = list.highlights.find(row => row.id === next.highlightId);
            if (!selected || selected.title !== next.highlightTitle) return blocked("selection_changed");
            const path = route(next.highlightId), { headers, body } = nativeRequest(path);
            assertCurrent(deadline); used = true; attempted = true;
            // One manual PAGE POST. No media delete, mobile signing or automatic retry.
            const response = await fetch("https://www.instagram.com" + path, { method: "POST", credentials: "include", redirect: "manual", headers, body, signal: AbortSignal.timeout(Math.max(1, Math.min(20000, deadline - Date.now()))) });
            const meta = { httpStatus: response.status, contentClass: (response.headers.get("content-type") || "").includes("json") ? "json" : (response.headers.get("content-type") || "").includes("html") ? "html" : "other" };
            if (response.type === "opaqueredirect" || response.status >= 300 && response.status < 400) { void response.body?.cancel().catch(() => {}); return { status: "uncertain", effectAttempted: true, errorEnum: "redirect", ...meta }; }
            const reader = response.body?.getReader(); if (!reader) throw Error();
            const chunks = []; let bytes = 0;
            try {
              for (;;) {
                let timeout;
                const part = await Promise.race([reader.read(), new Promise((_, reject) => { timeout = setTimeout(() => reject(Error()), Math.max(1, Math.min(20000, deadline - Date.now()))); })]).finally(() => clearTimeout(timeout));
                if (part.done) break; bytes += part.value.byteLength; if (bytes > 1048576) throw Error(); chunks.push(part.value);
              }
            } catch { void reader.cancel().catch(() => {}); throw Error(); }
            finally { try { reader.releaseLock(); } catch { /* pending read is being cancelled */ } }
            const raw = new Uint8Array(bytes); let offset = 0; for (const part of chunks) { raw.set(part, offset); offset += part.length; }
            const text = new TextDecoder().decode(raw); let payload;
            try { payload = JSON.parse(text); } catch { return { status: "uncertain", effectAttempted: true, ...meta, errorEnum: meta.contentClass === "html" || /^\s*</.test(text) ? "html_response" : "invalid_json" }; }
            if (!response.ok || payload?.status !== "ok" || payload.deleted === false) return { status: "uncertain", effectAttempted: true, ...meta, errorEnum: "delete_unconfirmed" };
            const afterList = await completeList(deadline);
            if (afterList.highlights.some(row => row.id === next.highlightId)) return { status: "uncertain", effectAttempted: true, ...meta, errorEnum: "delete_unconfirmed" };
            return { status: "completed", ownerInstagramUserId: userId, highlightId: next.highlightId, deleted: true, absentFromCompleteList: true, effectAttempted: true, ...meta };
          } catch { return { status: attempted ? "uncertain" : "failed", effectAttempted: attempted, errorEnum: attempted ? "delete_unconfirmed" : "read_failed" }; }
        });
      } catch { return { status: attempted ? "uncertain" : "failed", effectAttempted: attempted, errorEnum: attempted ? "delete_unconfirmed" : "page_native_contract_guard" }; }
    };
    Object.defineProperty(globalThis, key, { configurable: true, value: port });
    return { status: "dry_run_ready" };
  } catch { return blocked("page_native_contract_guard"); }
}

export function projectHighlightManagementResult(value, ownerId) {
  if (!value || !["completed", "failed", "uncertain", "dry_run_ready", "disposed"].includes(value.status)) throw Error("Invalid PAGE result");
  const result = { status: value.status };
  if (value.status === "completed") {
    if (value.ownerInstagramUserId !== ownerId) throw Error("Invalid PAGE owner");
    result.ownerInstagramUserId = ownerId;
    if (value.complete === true) {
      if (!Array.isArray(value.highlights) || value.highlights.length > 500) throw Error("Invalid PAGE list");
      const ids = new Set(); result.highlights = value.highlights.map(row => {
        if (!row || typeof row.id !== "string" || !/^highlight:\d{1,100}$/.test(row.id) || typeof row.title !== "string" || row.title.length > 1024 || ids.has(row.id)) throw Error("Invalid PAGE list");
        ids.add(row.id); return { id: row.id, title: row.title };
      }); result.complete = true;
    } else {
      if (!/^highlight:\d{1,100}$/.test(value.highlightId || "") || value.deleted !== true || value.absentFromCompleteList !== true) throw Error("Invalid PAGE deletion proof");
      Object.assign(result, { highlightId: value.highlightId, deleted: true, absentFromCompleteList: true });
    }
  }
  if (typeof value.effectAttempted === "boolean") result.effectAttempted = value.effectAttempted;
  if (["page_native_contract_guard", "selection_changed", "busy", "read_failed", "delete_unconfirmed", "redirect", "html_response", "invalid_json"].includes(value.errorEnum)) result.errorEnum = value.errorEnum;
  if (Number.isInteger(value.httpStatus) && value.httpStatus >= 0 && value.httpStatus <= 599) result.httpStatus = value.httpStatus;
  if (["json", "html", "other"].includes(value.contentClass)) result.contentClass = value.contentClass;
  return result;
}

export function createInstagramHighlightManagementPage({ chromeApi = globalThis.chrome, contextTimeoutMs = 12000 } = {}) {
  const unavailable = () => Error("Highlight PAGE context unavailable");
  const validTab = tab => { try { return new URL(tab.url).origin === "https://www.instagram.com" && tab.status === "complete" && (!tab.pendingUrl || tab.pendingUrl === tab.url) && !/\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(new URL(tab.url).pathname); } catch { return false; } };
  return async ownerId => {
    if (!/^\d{1,30}$/.test(ownerId || "")) throw unavailable();
    const contextDeadline = Date.now() + Math.max(1, Math.min(12000, contextTimeoutMs));
    async function bounded(promise, deadline) {
      let timer;
      try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), Math.max(1, deadline - Date.now())); })]); }
      finally { clearTimeout(timer); }
    }
    const tabs = (await bounded(chromeApi.tabs.query({ url: "https://www.instagram.com/*" }), contextDeadline)).filter(validTab).sort((a, b) => Number(b.active === true) - Number(a.active === true) || a.id - b.id).slice(0, 5);
    let binding;
    for (const tab of tabs) {
      if (!validTab(await bounded(chromeApi.tabs.get(tab.id), contextDeadline))) continue;
      const rows = await bounded(chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: "MAIN", func: instagramIdentityDocument, args: [ownerId] }), contextDeadline);
      if (rows.length === 1 && rows[0].frameId === 0 && rows[0].documentId && rows[0].result?.instagramUserId === ownerId) { binding = { tabId: tab.id, documentId: rows[0].documentId }; break; }
    }
    if (!binding) throw unavailable();
    const handle = crypto.randomUUID();
    const call = async (action, values = {}, effect = false) => {
      const deadline = action === "prepare" ? contextDeadline : Date.now() + (action === "delete" ? 60000 : action === "list" ? 30000 : 12000);
      if (Date.now() >= deadline || !validTab(await bounded(chromeApi.tabs.get(binding.tabId), deadline))) throw unavailable();
      const rows = await bounded(chromeApi.scripting.executeScript({ target: { tabId: binding.tabId, documentIds: [binding.documentId] }, world: "MAIN", func: instagramHighlightManagementMAIN, args: [{ userId: ownerId, handle, action, ...values }, deadline, effect] }), deadline + 1000);
      if (rows.length !== 1 || rows[0].frameId !== 0 || rows[0].documentId !== binding.documentId) throw unavailable();
      return projectHighlightManagementResult(rows[0].result, ownerId);
    };
    if ((await call("prepare")).status !== "dry_run_ready") throw unavailable();
    let used = false;
    return {
      list: () => call("list"),
      async deleteHighlight({ highlightId, highlightTitle }) { if (used) return { status: "uncertain", errorEnum: "delete_unconfirmed" }; used = true; try { return await call("delete", { highlightId, highlightTitle }, true); } catch { return { status: "uncertain", errorEnum: "delete_unconfirmed" }; } },
      async dispose() { used = true; try { await call("dispose"); } catch { /* Document gone; never repeat an effect. */ } },
    };
  };
}
