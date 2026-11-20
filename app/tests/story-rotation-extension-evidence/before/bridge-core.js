export const JOURNAL_KEY = "resolvStoryJournal";
export const STORY_CAPABILITIES = Object.freeze({ storyOptions: 1 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IG_ID = /^\d+(?:_\d+)?$/;
const HIGHLIGHT_ID = /^(?:highlight:)?\d+$/;
const STICKER_STYLES = ["blue", "dark", "gradient", "orange", "mint", "violet", "custom"];
const isColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function validateConfig(value) {
  const origin = new URL(value?.bridgeOrigin);
  const local = ["localhost", "127.0.0.1"].includes(origin.hostname) && origin.protocol === "http:";
  const hosted = ["resolvflow.online", "top.resolvflow.online"].includes(origin.hostname) && origin.protocol === "https:" && !origin.port;
  if ((!local && !hosted) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Configuração da ponte inválida.");
  if (typeof value.credential !== "string" || !/^[0-9a-f]{64}$/.test(value.credential)) throw new Error("Baixe a extensão do seu workspace na tela de Stories.");
  return { bridgeOrigin: origin.origin, credential: value.credential };
}

export function validateCommand(command, sessionId, instagramUserId) {
  if (!command || !UUID.test(command.id) || !UUID.test(command.dispatchId) || command.sessionId !== sessionId || command.instagramUserId !== instagramUserId || !/^\d{1,30}$/.test(instagramUserId)) throw new Error("Ordem de outra sessão.");
  const template = command.template;
  if (!template || !String(template.name || "").trim() || typeof template.linkUrl !== "string" || typeof template.linkTitle !== "string" || template.linkTitle.length > 40 || typeof template.highlightName !== "string" || template.highlightName.length > 30 || (template.createHighlight !== undefined && typeof template.createHighlight !== "boolean")) throw new Error("Template inválido.");
  if (template.createHighlight === false ? template.highlightName !== "" : !template.highlightName.trim()) throw new Error("Template inválido.");
  const hasLink = template.linkUrl !== "";
  if (hasLink ? !template.linkTitle.trim() : template.linkTitle !== "") throw new Error("Link inválido.");
  if (template.stickerStyle !== undefined && !STICKER_STYLES.includes(template.stickerStyle)) throw new Error("Template inválido.");
  if (template.stickerSize !== undefined && (!Number.isInteger(template.stickerSize) || template.stickerSize < 70 || template.stickerSize > 320)) throw new Error("Template inválido.");
  for (const color of [template.stickerBackground, template.stickerForeground]) if (color !== undefined && !isColor(color)) throw new Error("Template inválido.");
  if (template.stickerStyle === "custom" && (!isColor(template.stickerBackground) || !isColor(template.stickerForeground))) throw new Error("Template inválido.");
  for (const axis of [template.stickerX, template.stickerY]) if (axis !== undefined && (typeof axis !== "number" || axis < 0.05 || axis > 0.95)) throw new Error("Template inválido.");
  if (hasLink) {
    const link = new URL(template.linkUrl);
    if (!["https:", "http:"].includes(link.protocol) || link.username || link.password || link.href.length > 2048) throw new Error("Link inválido.");
  }
  return command;
}

function validId(value, highlight = false) {
  const string = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return string.length <= 100 && (highlight ? HIGHLIGHT_ID : IG_ID).test(string) ? string : undefined;
}

// Diagnostic remains local; never forward upstream bodies, error messages or cookies.
export function sanitizedHighlightDiagnostic(value) {
  const kinds = ["timeout", "network", "http_error", "remote_rejection", "html_response", "invalid_json", "missing_story_id", "missing_highlight_id", "interrupted"];
  if (!value || value.version !== 1 || value.stage !== "highlight" || !kinds.includes(value.kind)) return undefined;
  return { version: 1, stage: "highlight", kind: value.kind, ...(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {}) };
}

export function publicationResult(result, createHighlight = result?.createHighlight !== false) {
  const storyId = validId(result?.mediaId);
  const highlightId = validId(result?.highlight?.reel?.id ?? result?.highlight?.id ?? result?.highlight?.reel?.pk, true);
  if (!storyId) return { status: "uncertain", message: "execution_uncertain" };
  if (!createHighlight) return { status: "published", storyId, message: "story_published" };
  if (result.highlightError || !highlightId) return { status: "partial", storyId, message: "highlight_failed" };
  return { status: "published", storyId, highlightId, message: "published" };
}

export function interruptedResult(record) {
  const storyId = validId(record.storyId);
  if (storyId && record.createHighlight === false) return { status: "published", storyId, message: "story_published" };
  if (storyId) return { status: "partial", storyId, message: "highlight_failed" };
  return record.phase === "publishing" || record.phase === "highlighting"
    ? { status: "uncertain", message: "execution_uncertain" }
    : { status: "failed", message: "publish_failed" };
}

export function failureResult(error, record) {
  const storyId = validId(record.storyId);
  if (storyId && record.createHighlight === false) return { status: "published", storyId, message: "story_published" };
  if (storyId) return { status: "partial", storyId, message: "highlight_failed" };
  if (error?.code === "session_changed") return { status: "failed", message: "session_unavailable" };
  const refused = [400,401,403,404,422].includes(error?.status);
  if (refused || !["publishing", "highlighting"].includes(record.phase)) return { status: "failed", message: "publish_failed" };
  return { status: "uncertain", message: "execution_uncertain" };
}

export function stickerOptions(template = {}) {
  if (template.linkUrl === "") return { hasLink: false, linkTitle: "" };
  const validColors = isColor(template.stickerBackground) && isColor(template.stickerForeground);
  const style = STICKER_STYLES.includes(template.stickerStyle) && (template.stickerStyle !== "custom" || validColors) ? template.stickerStyle : "blue";
  const size = Number.isInteger(template.stickerSize) && template.stickerSize >= 70 && template.stickerSize <= 320 ? template.stickerSize : 100;
  const axis = (value, fallback) => typeof value === "number" && value >= 0.05 && value <= 0.95 ? value : fallback;
  return { hasLink: true, linkTitle: String(template.linkTitle || ""), style, scale: size / 100, x: axis(template.stickerX, 0.5), y: axis(template.stickerY, 0.75), ...(style === "custom" ? { background: template.stickerBackground.toUpperCase(), foreground: template.stickerForeground.toUpperCase() } : {}) };
}

export function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export function createBridgeRunner({ storage, identity, session, request, prepareImage, publish, readWebContext = async () => undefined, now = () => new Date().toISOString() }) {
  let flight = null;
  const save = record => storage.set({ [JOURNAL_KEY]: record });
  async function acknowledge(record) {
    try {
      await request({ type: "result", browserId: record.browserId, sessionId: record.sessionId, jobId: record.jobId, ...record.result });
    } catch (error) {
      // A conflict is a terminal server decision (expired/revoked/new session), never a reason to repeat Instagram.
      if (![404,409].includes(error?.status)) throw error;
    }
    await save({ ...record, acknowledged: true });
  }
  async function tick() {
    const previous = (await storage.get(JOURNAL_KEY))[JOURNAL_KEY];
    if (previous && !previous.acknowledged) {
      const recovered = previous.result ? previous : { ...previous, result: interruptedResult(previous) };
      await save(recovered);
      await acknowledge(recovered);
    }
    const { browserId, sessionId } = await identity();
    const logged = await session();
    const reply = await request({ type: "heartbeat", browserId, sessionId, instagramUserId: logged.id, available: logged.available, label: logged.id ? `Instagram ${logged.id} · ${browserId.slice(0, 8)}` : `Navegador ${browserId.slice(0, 8)}` });
    if (!reply?.command) return;
    const command = reply.command;
    // Defense in depth: an acknowledged job from the server must never cause another publication.
    if (previous?.jobId === command.id) return;
    let record = { jobId: command.id, browserId, sessionId, phase: "preparing", updatedAt: now(), acknowledged: false };
    await save(record); // Durable before any Instagram side effect.
    const checkpoint = async fields => { record = { ...record, ...fields, updatedAt: now() }; await save(record); };
    try {
      validateCommand(command, sessionId, logged.id);
      await checkpoint({ createHighlight: command.template.createHighlight !== false });
      if (!logged.available) throw Object.assign(new Error("Sessão indisponível."), { code: "session_changed" });
      const image = await request({ type: "image", browserId, sessionId, jobId: command.id }, true);
      const prepared = await prepareImage(image, stickerOptions(command.template));
      const current = await session();
      if (!current.available || current.id !== command.instagramUserId) throw Object.assign(new Error("Sessão alterada."), { code: "session_changed" });
      const web = await readWebContext(command.instagramUserId);
      const result = await publish({
        ...prepared, web, url: command.template.linkUrl, createHighlight: record.createHighlight, highlightTitle: command.template.highlightName,
        expectedInstagramUserId: command.instagramUserId,
        onStage: phase => checkpoint({ phase }), onStoryPublished: storyId => checkpoint({ storyId }),
      });
      const highlightDiagnostic = sanitizedHighlightDiagnostic(result?.highlightDiagnostic);
      await checkpoint({ result: publicationResult(result, record.createHighlight), ...(highlightDiagnostic && record.createHighlight ? { highlightDiagnostic } : {}) });
    } catch (error) {
      await checkpoint({ result: failureResult(error, record) });
    }
    await acknowledge(record);
  }
  return { run() { if (!flight) flight = tick().finally(() => { flight = null; }); return flight; } };
}
