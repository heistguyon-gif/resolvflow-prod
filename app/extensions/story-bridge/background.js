import { createInstagramHighlightPage } from "./instagram-highlight-page.js";
import { createInstagramHighlightManagementPage } from "./instagram-highlight-management-page.js";
import { createHighlightManagementRunner, HIGHLIGHT_MANAGEMENT_CAPABILITIES } from "./highlight-management-runner.js";
/* global chrome */
import { bytesToBase64, createBridgeRunner, STORY_CAPABILITIES, validateConfig } from "./bridge-core.js";
import { publishStory, readInstagramSession } from "./publisher.js";
import { createProfileRunner, PROFILE_CAPABILITIES } from "./profile-runner.js";
import { createProfileUI } from "./profile-ui.js";
import { createInstagramUsernameReader } from "./instagram-identity.js";

import { createInstagramWebContextReader } from "./instagram-web-context.js";

const ALARM = "resolv-story-bridge";
let runner;
let starting;
async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const config = validateConfig(await (await fetch(chrome.runtime.getURL("bridge-config.json"))).json());
  const alarm = await chrome.alarms.get(ALARM);
  if (!alarm) await chrome.alarms.create(ALARM, { periodInMinutes: .5 });
  const identity = async () => {
    let { resolvStoryBrowserId: browserId } = await chrome.storage.local.get("resolvStoryBrowserId");
    let { resolvStorySessionId: sessionId } = await chrome.storage.session.get("resolvStorySessionId");
    if (!browserId) { browserId = crypto.randomUUID(); await chrome.storage.local.set({ resolvStoryBrowserId: browserId }); }
    if (!sessionId) { sessionId = crypto.randomUUID(); await chrome.storage.session.set({ resolvStorySessionId: sessionId }); }
    return { browserId, sessionId };
  };
  const rawRequest = async (body, binary = false) => {
    const response = await fetch(`${config.bridgeOrigin}/api/story-bridge/extension`, {
      method: "POST", headers: { authorization: `Bearer ${config.credential}`, "content-type": "application/json" },
      body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error("Ponte indisponível."), { status: response.status }); }
    if (!binary) return response.json();
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!["image/jpeg", "image/png"].includes(contentType)) throw new Error("Imagem inválida.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 10 * 1024 * 1024) throw new Error("Imagem grande demais.");
    return { imageBase64: bytesToBase64(bytes), contentType };
  };
  const profile = createProfileRunner({ storage: chrome.storage.local, request: rawRequest, identity, session: async () => {
    const before = await readInstagramSession();
    const cookies = await Promise.all(["sessionid", "csrftoken"].map(name => chrome.cookies.get({ url: "https://www.instagram.com/", name })));
    const after = await readInstagramSession();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(cookies.map(cookie => cookie?.value || ""))));
    return { id: after.id, available: before.available && after.available && before.id === after.id, sessionKey: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") };
  }, ...createProfileUI() });
  const highlights = createHighlightManagementRunner({ storage: chrome.storage.local, request: rawRequest, identity, session: readInstagramSession, prepare: createInstagramHighlightManagementPage() });
  const readUsername = createInstagramUsernameReader();
  const request = async (body, binary = false) => {
    if (body.type !== "heartbeat") return rawRequest(body, binary);
    await profile.recover();
    await highlights.recover();
    let reply;
    const instagramUsername = body.available ? await readUsername(body.instagramUserId) : null;
    // Strict old servers reject unknown fields before claiming jobs. First
    // retain 0.4.5 storyOptions support when only rotation is unsupported.
    const attempts = [
      { ...body, capabilities: { ...PROFILE_CAPABILITIES, ...STORY_CAPABILITIES, ...HIGHLIGHT_MANAGEMENT_CAPABILITIES }, instagramUsername },
      { ...body, capabilities: { ...PROFILE_CAPABILITIES, ...STORY_CAPABILITIES }, instagramUsername },
      { ...body, capabilities: { ...PROFILE_CAPABILITIES, storyOptions: 1 }, instagramUsername },
      { ...body, capabilities: PROFILE_CAPABILITIES, instagramUsername },
      { ...body, capabilities: { profileSetup: 1, bio: true, photo: true } },
      body,
    ];
    for (let index = 0; index < attempts.length; index++) {
      try { reply = await rawRequest(attempts[index]); break; }
      catch (error) { if (error?.status !== 400 || index === attempts.length - 1) throw error; }
    }
    if (reply?.command?.kind === "highlight_management") {
      await highlights.run(reply.command, { browserId: body.browserId, sessionId: body.sessionId, instagramUserId: body.instagramUserId });
      return { command: null };
    }
    if (reply?.command?.kind !== "profile_setup") return reply;
    await profile.run(reply.command, { browserId: body.browserId, sessionId: body.sessionId, instagramUserId: body.instagramUserId });
    return { command: null };
  };
  const prepareImage = async (image, sticker) => {
    const url = chrome.runtime.getURL("render.html");
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    if (!contexts.length) await chrome.offscreen.createDocument({ url: "render.html", reasons: ["BLOBS"], justification: "Preparar a imagem e o título do link do template sem abrir janela." });
    let timeout;
    try {
      const reply = await Promise.race([
        chrome.runtime.sendMessage({ type: "RESOLV_STORY_RENDER", target: "offscreen", imageBase64: image.imageBase64, contentType: image.contentType, ...sticker }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Preparação interrompida.")), 20000); }),
      ]);
      if (!reply?.ok || !reply.result?.imageBase64) throw new Error("Não foi possível preparar a imagem.");
      return reply.result;
    } finally { clearTimeout(timeout); await chrome.offscreen.closeDocument().catch(() => {}); }
  };
  const prepareHighlight = createInstagramHighlightPage();
  const publish = async payload => {
    if (payload.createHighlight === false) return publishStory(payload);
    const port = await prepareHighlight(payload.expectedInstagramUserId);
    try { return await publishStory({ ...payload, highlightTransport: port }); }
    finally { await port.dispose(); }
  };
  return createBridgeRunner({ storage: chrome.storage.local, identity, session: readInstagramSession, request, prepareImage, publish, readWebContext: createInstagramWebContextReader() });
}
function run() {
  starting ||= initialize().then(value => { runner = value; }).catch(() => { starting = null; });
  void starting.then(() => runner?.run()).catch(() => {});
}
chrome.runtime.onInstalled.addListener(run);
chrome.runtime.onStartup.addListener(run);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) run(); });
// Alarms remain the fallback. Page loads and session changes should recover
// detection immediately, including profiles opened after the worker started.
let wakeTimer;
function wake() {
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(run, 1000);
}
chrome.tabs?.onUpdated?.addListener((_tabId, change, tab) => {
  if (change.status === "complete" && tab.url?.startsWith("https://www.instagram.com/")) wake();
});
chrome.tabs?.onActivated?.addListener(() => wake());
chrome.cookies?.onChanged?.addListener(({ cookie }) => {
  if (["instagram.com", ".instagram.com", "www.instagram.com", ".www.instagram.com"].includes(cookie.domain) && ["ds_user_id", "sessionid", "csrftoken"].includes(cookie.name)) wake();
});
run();
