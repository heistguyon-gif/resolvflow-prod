import { instagramIdentityDocument } from "./instagram-identity.js";

// Same two public fields and timing as the original content-script publisher.
// Values stay in memory for this Instagram request; never journal/heartbeat/log.
export function instagramWebContextDocument() {
  if (location.origin !== "https://www.instagram.com") return null;
  let claim = "0";
  try { claim = sessionStorage.getItem("www-claim-v2") || "0"; } catch { /* original fallback */ }
  let ajax = "";
  for (const node of document.querySelectorAll("script[type='application/json']")) {
    const match = (node.textContent || "").match(/"rollout_hash":"(\d+)"/);
    if (match) { ajax = match[1]; break; }
  }
  return { claim, ajax };
}

export function createInstagramWebContextReader({ chromeApi = globalThis.chrome, timeoutMs = 12000 } = {}) {
  const allowed = tab => {
    try { const url = new URL(tab.url); return url.origin === "https://www.instagram.com" && tab.status === "complete" && (!tab.pendingUrl || tab.pendingUrl === tab.url) && !/\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(url.pathname); } catch { return false; }
  };
  const unavailable = () => Object.assign(new Error("Contexto da página Instagram não confirmado; nenhum Story iniciado."), { code: "web_context_unavailable" });
  const snapshot = async () => Promise.all(["ds_user_id", "sessionid", "csrftoken"].map(async name => (await chromeApi.cookies.get({ url: "https://www.instagram.com/", name }))?.value || ""));
  return async expectedId => {
    let active = true, timer;
    const read = async () => {
      const before = await snapshot();
      if (!active || !/^\d{1,30}$/.test(expectedId) || before[0] !== expectedId || before.some(value => !value)) throw unavailable();
      const tabs = (await chromeApi.tabs.query({ url: "https://www.instagram.com/*" })).filter(allowed).slice(0,5);
      const contexts = await Promise.all(tabs.map(async tab => {
        try {
          if (!active || !allowed(await chromeApi.tabs.get(tab.id))) return null;
          const identities = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: "MAIN", func: instagramIdentityDocument, args: [expectedId] });
          if (!active || identities.length !== 1 || identities[0].result?.instagramUserId !== expectedId || !identities[0].documentId) return null;
          const replies = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, documentIds: [identities[0].documentId] }, world: "MAIN", func: instagramWebContextDocument });
          if (!active || replies.length !== 1 || replies[0].documentId !== identities[0].documentId) return null;
          const result = replies[0].result;
          if (!result || typeof result.claim !== "string" || result.claim.length > 4096 || /[\r\n]/.test(result.claim) || typeof result.ajax !== "string" || (result.ajax && !/^\d{1,30}$/.test(result.ajax))) return null;
          return { claim: result.claim, ajax: result.ajax };
        } catch { return null; }
      }));
      const after = await snapshot(), found = contexts.filter(Boolean);
      if (!active || before.some((value,index) => value !== after[index]) || !found.length || found.some(value => value.claim !== found[0].claim || value.ajax !== found[0].ajax)) throw unavailable();
      return {
        ...found[0],
        // Bind this context to the exact session/CSRF used for its collection.
        // The closure stays local; no cookie values enter the returned data.
        assertSession: async supplied => {
          let validationTimer;
          try {
            const current = await Promise.race([snapshot(), new Promise((_,reject) => { validationTimer = setTimeout(() => reject(unavailable()),Math.max(1,Math.min(12000,timeoutMs))); })]);
            if (supplied.userId !== before[0] || supplied.sessionId !== before[1] || supplied.csrf !== before[2] || before.some((value,index) => value !== current[index])) throw unavailable();
          } finally { clearTimeout(validationTimer); }
        },
      };
    };
    try {
      return await Promise.race([read(), new Promise((_,reject) => { timer = setTimeout(() => { active = false; reject(unavailable()); }, Math.max(1,Math.min(12000,timeoutMs))); })]);
    } finally { active = false; clearTimeout(timer); }
  };
}
