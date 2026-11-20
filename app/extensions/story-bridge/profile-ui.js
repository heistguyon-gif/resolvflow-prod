import { instagramIdentityDocument } from "./instagram-identity.js";
import { photoDocumentProof } from "./photo-proof.js";

// Only DOM controls used by the logged-in user. No Instagram private API calls.
// Selectors are conservative and need real-DOM validation before general rollout.
export function profileDocumentTask({ action, text, imageBase64, contentType, photoOnly }) {
  if (location.origin !== "https://www.instagram.com") return { error: "profile_origin_mismatch" };
  const visible = element => !!element && !element.disabled && !!element.getClientRects().length;
  const value = element => String(element?.textContent || element?.getAttribute("aria-label") || "").trim();
  const buttons = pattern => [...document.querySelectorAll('button,[role="button"]')].filter(element => visible(element) && pattern.test(value(element)));
  const challenge = /\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(location.pathname) || !!document.querySelector('iframe[src*="captcha"],input[name="password"]') || /(?:confirme que você é humano|confirm you.re human|captcha)/i.test(document.body?.innerText || "");
  if (challenge) return { error: "challenge_detected" };
  if (!location.pathname.startsWith("/accounts/edit")) return { error: "profile_form_unknown" };
  const candidates = [...document.querySelectorAll('textarea[name="biography"],textarea[name="bio"],textarea#pepBio,textarea[aria-label="Bio"],textarea[aria-label="Biografia"]')];
  for (const label of document.querySelectorAll("label")) if (/^(bio|biografia)$/i.test(value(label))) {
    const field = document.getElementById(label.htmlFor); if (field?.tagName === "TEXTAREA") candidates.push(field);
  }
  const fields = [...new Set(candidates)].filter(visible);
  if (["inspect", "fillBio", "saveBio"].includes(action) && !photoOnly && fields.length !== 1) return { error: "profile_form_unknown" };
  const field = fields[0], origin = performance.timeOrigin;
  if (action === "inspect") return { text: field?.value ?? "", documentOrigin: origin };
  if (action === "fillBio") {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true }));
    return { filled: field.value === text };
  }
  if (action === "saveBio") {
    const choices = buttons(/^(enviar|submit|salvar|save)$/i).filter(button => !field.form || field.form.contains(button));
    if (choices.length !== 1) return { error: "profile_form_unknown" };
    choices[0].click(); return { clicked: true };
  }
  if (action === "openPhoto") {
    const choices = buttons(/^(alterar foto(?: do perfil)?|trocar foto(?: do perfil)?|change photo|change profile photo|edit profile picture)$/i);
    if (choices.length !== 1) return { error: "photo_control_unavailable" };
    choices[0].click(); return { clicked: true };
  }
  if (action === "uploadPhoto") {
    const files = [...document.querySelectorAll('input[type="file"]')].filter(input => !input.disabled && /image|png|jpg|jpeg/i.test(input.accept));
    if (files.length !== 1) return { error: "photo_control_unavailable" };
    const binary = atob(imageBase64), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], contentType === "image/png" ? "profile.png" : "profile.jpg", { type: contentType }));
    files[0].files = transfer.files; files[0].dispatchEvent(new Event("change", { bubbles: true }));
    return { attempted: true };
  }
  return { error: "profile_form_unknown" };
}

export function createProfileUI({ chromeApi = globalThis.chrome, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, waitTimeoutMs = 20000, pollMs = 250 } = {}) {
  const failure = (code, beforeEffect) => Object.assign(new Error(code), { code, beforeEffect });
  const waitMs = Math.max(1, Math.min(20000, waitTimeoutMs)), interval = Math.max(1, Math.min(500, pollMs));
  const bounded = async (promise, milliseconds) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(failure("profile_tab_timeout", true)), milliseconds); })]); }
    finally { clearTimeout(timer); }
  };
  const transient = error => /about:blank|no frame|frame.*(?:removed|not found)|context.*(?:invalid|destroyed|not found)|cannot find context|document.*(?:unloaded|not found)|receiving end does not exist|tab.*(?:loading|navigating)/i.test(String(error?.message ?? ""));
  const checkUrl = url => {
    if (!url || url === "about:blank") return false;
    let parsed; try { parsed = new URL(url); } catch { throw failure("profile_origin_mismatch", true); }
    if (parsed.origin !== "https://www.instagram.com") throw failure("profile_origin_mismatch", true);
    if (/\/(?:challenge|checkpoint|accounts\/login)(?:\/|$)/.test(parsed.pathname)) throw failure("challenge_detected", true);
    return true;
  };
  const checkedTab = async (tabId, milliseconds = 5000) => {
    const tab = await bounded(chromeApi.tabs.get(tabId), milliseconds);
    const allowed = checkUrl(tab.url);
    if (tab.pendingUrl) checkUrl(tab.pendingUrl);
    return allowed && tab.status === "complete" && (!tab.pendingUrl || tab.pendingUrl === tab.url);
  };
  const call = async (tabId, args, ensureIdentity, milliseconds = 5000) => {
    const deadline = now() + milliseconds, remaining = () => Math.max(1, deadline - now());
    if (!await checkedTab(tabId, remaining())) throw Object.assign(failure("profile_tab_timeout", true), { retryInspection: true });
    await bounded(ensureIdentity(), remaining());
    if (now() >= deadline) throw failure("profile_tab_timeout", true);
    const replies = await bounded(chromeApi.scripting.executeScript({ target: { tabId }, func: profileDocumentTask, args: [args] }), remaining());
    if (replies.length !== 1 || !replies[0].result) throw failure("profile_form_unknown", true);
    return replies[0].result;
  };
  const inspectReady = async (tabId, ensureIdentity, accept = () => true, timeoutCode = "profile_tab_timeout", photoOnly = false) => {
    const deadline = now() + waitMs;
    for (let attempt = 0; attempt <= Math.ceil(waitMs / interval) && now() < deadline; attempt++) {
      const remaining = Math.max(1, Math.min(5000, deadline - now()));
      let current;
      try { current = await call(tabId, { action: "inspect", ...(photoOnly ? { photoOnly: true } : {}) }, ensureIdentity, remaining); }
      catch (error) {
        if (["challenge_detected", "session_changed", "profile_origin_mismatch"].includes(error?.code)) throw error;
        if (!error?.retryInspection && error?.code !== "profile_tab_timeout" && !transient(error)) throw failure("profile_form_unknown", true);
      }
      if (["challenge_detected", "profile_origin_mismatch"].includes(current?.error)) throw failure(current.error, true);
      if (current && !current.error && typeof current.text === "string" && Number.isFinite(current.documentOrigin) && accept(current)) return current;
      await pause(Math.min(interval, Math.max(0, deadline - now())));
    }
    throw failure(timeoutCode, true);
  };
  async function withEditor(ensureIdentity, task, photoOnly = false) {
    await ensureIdentity();
    const tab = await chromeApi.tabs.create({ url: "https://www.instagram.com/accounts/edit/", active: false });
    let keepTab = false;
    try {
      const initial = await inspectReady(tab.id, ensureIdentity, () => true, "profile_tab_timeout", photoOnly);
      await ensureIdentity(); const result = await task(tab.id, initial);
      keepTab = result?.status !== "confirmed";
      return result;
    } catch (error) {
      keepTab = error?.code === "challenge_detected" || error?.beforeEffect !== true;
      throw error;
    } finally { if (!keepTab) await chromeApi.tabs.remove(tab.id).catch(() => {}); }
  }
  return {
    applyBio: ({ text, ensureIdentity }) => withEditor(ensureIdentity, async (tabId, initial) => {
      let clicked = false;
      try {
        if (initial.text !== text) {
          await ensureIdentity(); const filled = await call(tabId, { action: "fillBio", text }, ensureIdentity);
          if (!filled.filled) throw failure(filled.error || "profile_form_unknown", true);
          await ensureIdentity();
          // Boundary is conservative: a click may have reached the UI even if IPC fails.
          clicked = true; const saved = await call(tabId, { action: "saveBio" }, ensureIdentity);
          if (!saved.clicked) throw failure(saved.error || "bio_save_unconfirmed", false);
          await pause(700);
        }
        await ensureIdentity(); await bounded(chromeApi.tabs.reload(tabId), 5000);
        await inspectReady(tabId, ensureIdentity, current => current.documentOrigin !== initial.documentOrigin && current.text === text, "bio_save_unconfirmed");
        return { status: "confirmed", proof: { identityMatched: true, afterReload: true, textMatched: true } };
      } catch (error) { if (clicked) error.beforeEffect = false; throw error; }
    }),
    applyPhoto: async ({ image, ensureIdentity, imageId, instagramUserId }) => {
      let bytes;
      try {
        const binary = atob(image.imageBase64); bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, i) => byte === bytes[i]);
        const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        if (!bytes.length || bytes.length > 8 * 1024 * 1024 || !(png && image.contentType === "image/png" || jpeg && image.contentType === "image/jpeg")) throw new Error();
      } catch { throw failure("image_failed", true); }
      return withEditor(ensureIdentity, async (tabId, initial) => {
        const editorIdentity = async (beforeEffect = false) => {
          await ensureIdentity();
          if (!await checkedTab(tabId)) throw failure("photo_confirmation_unavailable", beforeEffect);
          const replies = await bounded(chromeApi.scripting.executeScript({ target: { tabId }, world: "MAIN", func: instagramIdentityDocument, args: [instagramUserId] }), 5000);
          await ensureIdentity();
          const own = replies?.length === 1 && replies[0].result;
          if (!own || own.instagramUserId !== instagramUserId || !/^[a-z0-9._]{1,30}$/.test(own.instagramUsername)) throw failure("photo_confirmation_unavailable", beforeEffect);
          return own;
        };
        const inspectProof = async () => {
          await ensureIdentity();
          if (!await checkedTab(tabId)) throw failure("photo_confirmation_unavailable", false);
          const own = await editorIdentity();
          const replies = await bounded(chromeApi.scripting.executeScript({ target: { tabId }, func: photoDocumentProof, args: [{ instagramUsername: own.instagramUsername, imageBase64: image.imageBase64, contentType: image.contentType }] }), 5000);
          await ensureIdentity();
          const after = await bounded(chromeApi.scripting.executeScript({ target: { tabId }, world: "MAIN", func: instagramIdentityDocument, args: [instagramUserId] }), 5000);
          if (after?.length !== 1 || after[0].result?.instagramUserId !== own.instagramUserId || after[0].result?.instagramUsername !== own.instagramUsername) throw failure("session_changed", false);
          const result = replies?.length === 1 && replies[0].result;
          if (!result || result.error || result.matches !== true || !/^[a-f0-9]{64}$/.test(result.expectedPixels) || result.expectedPixels !== result.avatarPixels || !Number.isFinite(result.documentOrigin)) throw failure("photo_confirmation_unavailable", false);
          return result;
        };
        await editorIdentity(true); const opened = await call(tabId, { action: "openPhoto", photoOnly: true }, ensureIdentity);
        if (opened.error || opened.clicked !== true) throw failure(opened.error || "photo_control_unavailable", true);
        await pause(400); await editorIdentity(true);
        let uploaded;
        try { uploaded = await call(tabId, { action: "uploadPhoto", photoOnly: true, imageBase64: image.imageBase64, contentType: image.contentType }, ensureIdentity); }
        catch (error) { throw failure(["session_changed", "challenge_detected", "profile_origin_mismatch", "profile_tab_timeout"].includes(error?.code) ? error.code : "photo_confirmation_unavailable", false); }
        if (uploaded.error) throw failure(uploaded.error, true);
        // From here all failures may follow an effect. No upload/click is retried.
        try {
          if (!uploaded.attempted) throw failure("photo_confirmation_unavailable", false);
          await pause(1000);
          // Do not reload away from an unresolved crop/dialog. Require an initial exact match first.
          await inspectProof();
          await ensureIdentity(); await bounded(chromeApi.tabs.reload(tabId), 5000);
          await inspectReady(tabId, ensureIdentity, current => current.documentOrigin !== initial.documentOrigin, "photo_confirmation_unavailable", true);
          const persisted = await inspectProof();
          if (persisted.documentOrigin === initial.documentOrigin) throw failure("photo_confirmation_unavailable", false);
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const imageSha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
          return { status: "confirmed", proof: { version: 1, imageId, imageSha256, instagramUserId, identityMatched: true, afterReload: true, pixelsMatched: true, expectedPixels: persisted.expectedPixels, avatarPixels: persisted.avatarPixels } };
        } catch (error) {
          if (["session_changed", "challenge_detected", "profile_origin_mismatch"].includes(error?.code)) throw failure(error.code, false);
          return { status: "uncertain", message: "profile_manual_review_tab_open", tabOpen: true };
        }
      }, true);
    },
  };
}
