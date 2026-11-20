// Read-only identity projection. No navigation, network request, cookie value or page body leaves this module.
const username = value => typeof value === "string" && /^[a-z0-9._]{1,30}$/i.test(value) && /[a-z0-9_]/i.test(value) ? value.toLowerCase() : null;

export function instagramIdentityDocument(expectedId) {
  if (location.origin !== "https://www.instagram.com" || !/^\d{1,30}$/.test(expectedId) || /\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(location.pathname) || document.querySelector('iframe[src*="captcha"],input[name="password"]')) return null;
  const found = new Set(), seen = new Set(); let nodes = 0;
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 18 || nodes++ >= 10000 || seen.has(value)) return;
    seen.add(value);
    // Only a structured user record with the current numeric ID is evidence. Links/URL/text are never evidence.
    const ids = [value.pk, value.pk_id, value.id].filter(id => typeof id === "string" && /^\d{1,30}$/.test(id) || Number.isSafeInteger(id) && id >= 0).map(String);
    if (ids.length && ids.every(id => id === expectedId) && typeof value.username === "string" && /^[a-z0-9._]{1,30}$/i.test(value.username) && /[a-z0-9_]/i.test(value.username)) found.add(value.username.toLowerCase());
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  // Legacy viewer bootstrap and current JSON hydration, without evaluating scripts or guessing an API endpoint.
  visit(globalThis._sharedData?.config?.viewer);
  let remaining = 1024 * 1024;
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    const text = script.textContent || "";
    if (text.length > remaining) continue;
    remaining -= text.length;
    try { visit(JSON.parse(text)); } catch { /* An unfamiliar document is not identity evidence. */ }
    if (!remaining || nodes >= 10000) break;
  }
  return found.size === 1 ? { instagramUserId: expectedId, instagramUsername: [...found][0] } : null;
}

export function createInstagramUsernameReader({ chromeApi = globalThis.chrome, timeoutMs = 12000 } = {}) {
  const allowedTab = tab => {
    try { const url = new URL(tab.url); return url.origin === "https://www.instagram.com" && tab.status === "complete" && (!tab.pendingUrl || tab.pendingUrl === tab.url) && !/\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(url.pathname); } catch { return false; }
  };
  const snapshot = async () => {
    const values = await Promise.all(["ds_user_id", "sessionid", "csrftoken"].map(name => chromeApi.cookies.get({ url: "https://www.instagram.com/", name })));
    return values.map(cookie => cookie?.value || "");
  };
  return async expectedId => {
    if (typeof expectedId !== "string" || !/^\d{1,30}$/.test(expectedId)) return null;
    let active = true, timer;
    const read = async () => {
      const before = await snapshot();
      if (!active || before[0] !== expectedId || before.some(value => !value)) return null;
      const tabs = await chromeApi.tabs.query({ url: "https://www.instagram.com/*" });
      const candidates = tabs.filter(allowedTab).slice(0, 5), found = new Set();
      // A stalled/background tab must not consume the entire identity deadline
      // before another tab with the authenticated user can be examined.
      const repliesByTab = await Promise.all(candidates.map(async tab => {
        let deadline;
        try {
          return await Promise.race([(async () => {
            if (!allowedTab(await chromeApi.tabs.get(tab.id)) || !active) return null;
            return chromeApi.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", injectImmediately: true, func: instagramIdentityDocument, args: [expectedId] });
          })(), new Promise(resolve => { deadline = setTimeout(() => resolve(null), Math.max(1, Math.min(10000, timeoutMs * .8))); })]);
        } catch { return null; }
        finally { clearTimeout(deadline); }
      }));
      if (!active) return null;
      for (const replies of repliesByTab) {
        if (!replies) continue;
        if (replies.length !== 1) return null;
        const result = replies[0].result, name = username(result?.instagramUsername);
        if (result && (result.instagramUserId !== expectedId || !name)) return null;
        if (name) found.add(name);
      }
      const after = await snapshot();
      if (!active || before.some((value, index) => value !== after[index]) || found.size !== 1) return null;
      return [...found][0];
    };
    try {
      return await Promise.race([read(), new Promise(resolve => { timer = setTimeout(() => { active = false; resolve(null); }, Math.max(1, Math.min(12000, timeoutMs))); })]);
    } catch { return null; }
    finally { active = false; clearTimeout(timer); }
  };
}
