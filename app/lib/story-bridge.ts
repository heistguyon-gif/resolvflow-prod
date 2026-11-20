// Pure bridge domain + R2 persistence. No application auth, Instagram or D1 calls.
// A publication selects at most 100 browsers; the registry also retains closed profiles.
export const LIMITS = { templates: 100, browsers: 100, registeredBrowsers: 2000, dispatches: 500, sessions: 100, stateBytes: 2 * 1024 * 1024, imageBytes: 10 * 1024 * 1024 };
export const READY_MS = 75_000;
export const QUEUED_MS = 60_000;
export const CLAIM_MS = 120_000;
export class BridgeError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}
export function fail(code = "invalid_input", message = "Dados inválidos.", status = 400): never { throw new BridgeError(code, message, status); }
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail();
  return value.toLowerCase();
}
export function textField(value: unknown, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value) || (required && !value.trim())) fail();
  return value.trim();
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
export function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) fail();
}
export const STICKER_STYLES = ["blue", "dark", "gradient", "orange", "mint", "violet", "custom"] as const;
export type StickerStyle = (typeof STICKER_STYLES)[number];
export type TemplateFields = { name: string; linkUrl: string; linkTitle: string; highlightName: string; createHighlight?: boolean; stickerStyle: StickerStyle; stickerSize: number; stickerRotation?: number; stickerX: number; stickerY: number; stickerBackground?: string; stickerForeground?: string };
export type Template = TemplateFields & { id: string; imageKey: string; imageType: string; createdAt: string; copiedFrom?: { owner: string; templateId: string } };
export type SetupCapabilities = { profileSetup?: 1; bio?: boolean; photo?: boolean; storyOptions?: 1; stickerRotation?: 1; highlightManagement?: 1; photoProof?: 1 };
export type Browser = { id: string; sessionId: string; retiredSessions: string[]; label: string; instagramUserId: string; available: boolean; lastSeenAt: string; capabilities?: SetupCapabilities; instagramUsername?: string | null; instagramUsernameSeenAt?: string | null; delegation?: { owner: string; accountUserId: string; instagramUserId: string } };
export type Target = { browserId: string; sessionId: string; instagramUserId: string };
export type Status = "queued" | "claimed" | "expired" | "published" | "partial" | "failed" | "uncertain";
export type Job = { id: string; browserId: string; sessionId: string; instagramUserId: string; label: string; status: Status; message: string; deadline: number; claimedUntil?: number; storyId?: string; highlightId?: string; ack?: string };
export type Dispatch = { id: string; requestId: string; templateId: string; templateName: string; template: Template; createdAt: string; jobs: Job[]; delegatedOwner?: string };
export type SetupStepName = "bio" | "photo";
export type SetupStep = { status: "pending" | "running" | "confirmed" | "failed" | "uncertain" | "skipped"; message: string; ack?: string; proof?: Record<string, unknown> };
export type SetupActions = { bio?: { text: string }; photo?: { imageId: string } };
export type SetupImage = { id: string; imageKey: string; imageType: string; createdAt: string; sha256?: string };
export type SetupJob = Target & { id: string; label: string; status: "queued" | "claimed" | "completed" | "partial" | "failed" | "uncertain" | "expired"; message: string; deadline: number; claimedUntil?: number; retryDispatchId?: string; steps: Partial<Record<SetupStepName, SetupStep>> };
export type SetupDispatch = { id: string; requestId: string; fingerprint: string; createdAt: string; actions: SetupActions; image?: SetupImage; sourceDispatchId?: string; jobs: SetupJob[] };
export type ProfileSequence = { id: string; requestId: string; fingerprint: string; createdAt: string; target: Target; imageId: string; templateId: string; templateSnapshot: string; credentialHash: string | null; photoRequestId: string; storyRequestId: string };
export type HighlightOperation = { id: string; requestId: string; fingerprint: string; action: "list" | "delete"; target: Target; label: string; status: "queued" | "claimed" | "completed" | "failed" | "uncertain" | "expired"; message: string; createdAt: string; deadline: number; claimedUntil?: number; completedAt?: string; listOperationId?: string; highlightId?: string; highlightTitle?: string; highlights?: { id: string; title: string }[]; ack?: string };
export type State = { highlightOperations?: HighlightOperation[]; version: 1; credentialHash: string | null; templates: Template[]; browsers: Browser[]; dispatches: Dispatch[]; profileSetups?: SetupDispatch[]; profileImages?: SetupImage[]; profileSequences?: ProfileSequence[] };
export type Authority = { owner: string; hash: string; accountUserId?: string; platformOwner?: boolean };
export const MASTER_STORY_OWNER = "nexoflow:lucasbgn.affiliate@gmail.com";
export const storyBindingKey = (browser?: Browser) => browser?.delegation ? `${browser.delegation.owner}|${browser.delegation.accountUserId}|${browser.delegation.instagramUserId}` : "";
export const stateKey = (owner: string) => `story-bridge/workspaces/${encodeURIComponent(owner)}/state.json`;
export const credentialKey = (hash: string) => `story-bridge/credentials/${hash}.json`;
const fresh = (): State => ({ version: 1, credentialHash: null, templates: [], browsers: [], dispatches: [] });
export async function readState(bucket: R2Bucket, owner: string): Promise<State> {
  const object = await bucket.get(stateKey(owner));
  return object ? await object.json<State>() : fresh();
}
function capacity(state: State, body: string) {
  if ((state.highlightOperations?.length ?? 0) > LIMITS.dispatches || (state.profileSequences?.length ?? 0) > LIMITS.dispatches || state.templates.length > LIMITS.templates || (state.profileImages?.length ?? 0) > 100 || (state.profileSetups?.length ?? 0) > LIMITS.dispatches || state.browsers.length > LIMITS.registeredBrowsers || state.dispatches.length > LIMITS.dispatches || state.browsers.some(b => b.retiredSessions.length > LIMITS.sessions) || new TextEncoder().encode(body).length > LIMITS.stateBytes) {
    fail("state_limit", "O histórico da ponte atingiu o limite. Peça suporte para preservar e ampliar o armazenamento.", 409);
  }
}
// The callback may execute again on conflicts: no external effects inside it.
export async function mutate<T>(bucket: R2Bucket, owner: string, fn: (state: State) => T, hash?: string): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const object = await bucket.get(stateKey(owner));
    const state = object ? await object.json<State>() : fresh();
    if (hash !== undefined && state.credentialHash !== hash) fail("unauthorized", "Credencial inválida.", 401);
    const result = fn(state);
    const body = JSON.stringify(state);
    capacity(state, body);
    const written = await bucket.put(stateKey(owner), body, { onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
    if (written) return result;
  }
  fail("busy", "A ponte está ocupada. Tente novamente em instantes.", 503);
}
export function templateFields(input: Record<string, unknown>): TemplateFields {
  const name = textField(input.name, 120);
  const createHighlight = input.createHighlight === undefined ? true : input.createHighlight === true || input.createHighlight === "true" ? true : input.createHighlight === false || input.createHighlight === "false" ? false : fail();
  const linkUrl = textField(input.linkUrl, 2048, false);
  const linkTitle = textField(input.linkTitle, 40, false);
  if (linkUrl) {
    let url: URL;
    try { url = new URL(linkUrl); } catch { return fail(); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !linkTitle) fail();
  } else if (linkTitle) fail();
  const highlightName = textField(input.highlightName, 30, createHighlight);
  if (!createHighlight && highlightName) fail();
  return { name, linkUrl, linkTitle, highlightName, createHighlight, ...stickerFields(input) };
}
function stickerNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fail();
}
function stickerRotation(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value === "string") {
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(value)) return fail();
    value = Number(value);
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < -180 || value > 180) return fail();
  return value === 0 ? 0 : value;
}
function stickerFields(input: Record<string, unknown>) {
  const rawStyle = input.stickerStyle;
  const stickerStyle: StickerStyle = rawStyle === undefined || rawStyle === "" ? "blue" : STICKER_STYLES.includes(rawStyle as StickerStyle) ? rawStyle as StickerStyle : fail();
  const stickerSize = input.stickerSize === undefined || input.stickerSize === "" ? 100 : stickerNumber(input.stickerSize);
  if (!Number.isInteger(stickerSize) || stickerSize < 70 || stickerSize > 320) fail();
  const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fail();
  // Validate supplied colors even for a preset, but only persist them for custom.
  if (input.stickerBackground !== undefined) color(input.stickerBackground);
  if (input.stickerForeground !== undefined) color(input.stickerForeground);
  const colors = stickerStyle === "custom" ? { stickerBackground: color(input.stickerBackground), stickerForeground: color(input.stickerForeground) } : {};
  const axis = (value: unknown, fallback: number) => {
    if (value === undefined || value === "") return fallback;
    const number = stickerNumber(value);
    if (number < 0.05 || number > 0.95) fail();
    return Math.round(number * 10000) / 10000;
  };
  return { stickerStyle, stickerSize, stickerRotation: stickerRotation(input.stickerRotation), stickerX: axis(input.stickerX, 0.5), stickerY: axis(input.stickerY, 0.75), ...colors };
}
export function viewSticker(input: Partial<TemplateFields>) {
  const validColors = typeof input.stickerBackground === "string" && /^#[0-9a-f]{6}$/i.test(input.stickerBackground) && typeof input.stickerForeground === "string" && /^#[0-9a-f]{6}$/i.test(input.stickerForeground);
  const style = STICKER_STYLES.includes(input.stickerStyle as StickerStyle) && (input.stickerStyle !== "custom" || validColors) ? input.stickerStyle as StickerStyle : "blue";
  const stickerSize = Number.isInteger(input.stickerSize) && (input.stickerSize as number) >= 70 && (input.stickerSize as number) <= 320 ? input.stickerSize as number : 100;
  const axis = (value: number | undefined, fallback: number) => typeof value === "number" && value >= 0.05 && value <= 0.95 ? Math.round(value * 10000) / 10000 : fallback;
  return { stickerStyle: style, stickerSize, stickerRotation: stickerRotation(input.stickerRotation), stickerX: axis(input.stickerX, 0.5), stickerY: axis(input.stickerY, 0.75), ...(style === "custom" && validColors ? { stickerBackground: input.stickerBackground!.toUpperCase(), stickerForeground: input.stickerForeground!.toUpperCase() } : {}) };
}
export function imageType(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > LIMITS.imageBytes) fail("image_size", "A imagem deve ter até 10 MB.", 413);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return "image/png";
  return fail("image_type", "Envie uma imagem JPEG ou PNG.");
}
export async function addTemplate(bucket: R2Bucket, owner: string, fields: TemplateFields, bytes: Uint8Array, copy?: { id: string; sourceOwner: string; sourceTemplateId: string }) {
  const previous = copy ? (await readState(bucket, owner)).templates.find(template => template.id === copy.id) : undefined;
  const matchesCopy = (template: Template) => template.copiedFrom?.owner === copy?.sourceOwner && template.copiedFrom?.templateId === copy?.sourceTemplateId;
  if (previous) {
    if (!matchesCopy(previous)) fail("idempotency_conflict", "Este envio já pertence a outro template.", 409);
    return publicTemplate(previous);
  }
  if ((await readState(bucket, owner)).templates.length >= LIMITS.templates) fail("state_limit", "O limite de modelos foi atingido. Peça suporte para preservar e ampliar o armazenamento.", 409);
  const id = copy ? uuid(copy.id) : crypto.randomUUID();
  const template: Template = { ...fields, id, imageKey: `story-bridge/workspaces/${encodeURIComponent(owner)}/images/${id}${copy ? `/${encodeURIComponent(copy.sourceOwner)}/${copy.sourceTemplateId}` : ""}`, imageType: imageType(bytes), createdAt: new Date().toISOString(), ...(copy ? { copiedFrom: { owner: copy.sourceOwner, templateId: copy.sourceTemplateId } } : {}) };
  const written = await bucket.put(template.imageKey, bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: template.imageType, cacheControl: "no-store" } });
  if (!written && !copy) fail("busy", "Não foi possível salvar a imagem.", 503);
  // Do not delete on ambiguous CAS/storage failures: the state may already reference the image.
  await mutate(bucket, owner, state => {
    const existing = state.templates.find(item => item.id === id);
    if (existing) {
      if (!copy || !matchesCopy(existing)) fail("idempotency_conflict", "Este envio já pertence a outro template.", 409);
      return;
    }
    state.templates.push(template);
  });
  return publicTemplate(template);
}
export function expire(state: State, now: number) {
  for (const op of state.highlightOperations ?? []) {
    if (op.status === "queued" && now >= op.deadline) { op.status = "expired"; op.message = "queue_expired"; }
    if (op.status === "claimed" && now >= (op.claimedUntil ?? 0)) { op.status = "uncertain"; op.message = "execution_uncertain"; }
  }
  for (const dispatch of state.profileSetups ?? []) for (const job of dispatch.jobs) {
    if (job.status === "queued" && now >= job.deadline) endSetup(job, "queue_expired", "expired");
    if (job.status === "claimed" && now >= (job.claimedUntil ?? 0)) endSetup(job, "claim_timeout");
  }
  for (const dispatch of state.dispatches) for (const job of dispatch.jobs) {
    if (job.status === "queued" && now >= job.deadline) { job.status = "expired"; job.message = "queue_expired"; }
    if (job.status === "claimed" && now >= (job.claimedUntil ?? 0)) { job.status = "uncertain"; job.message = "claim_timeout"; }
  }
}
function invalidate(state: State, browserId?: string) {
  for (const op of state.highlightOperations ?? []) if (!browserId || op.target.browserId === browserId) {
    if (op.status === "queued") { op.status = "expired"; op.message = "session_changed"; }
    else if (op.status === "claimed") { op.status = "uncertain"; op.message = "session_changed"; }
  }
  for (const dispatch of state.profileSetups ?? []) for (const job of dispatch.jobs) {
    if ((!browserId || job.browserId === browserId) && ["queued", "claimed"].includes(job.status)) endSetup(job, "session_changed", job.status === "queued" ? "expired" : undefined);
  }
  for (const dispatch of state.dispatches) for (const job of dispatch.jobs) {
    if (browserId && job.browserId !== browserId) continue;
    if (job.status === "queued") { job.status = "expired"; job.message = "session_changed"; }
    else if (job.status === "claimed") { job.status = "uncertain"; job.message = "session_changed"; }
  }
}
export const publicTemplate = (t: Template) => ({ id: t.id, name: t.name, linkUrl: t.linkUrl, linkTitle: t.linkTitle, highlightName: t.highlightName, createHighlight: t.createHighlight !== false, ...viewSticker(t), imageUrl: `/api/story-bridge/templates/${t.id}/image`, createdAt: t.createdAt });
export const publicDispatch = (d: Dispatch) => ({ id: d.id, templateName: d.templateName, createHighlight: d.template.createHighlight !== false, createdAt: d.createdAt, jobs: d.jobs.map(j => ({ id: j.id, browserId: j.browserId, label: j.label, status: j.status, message: j.message, ...(j.storyId ? { storyId: j.storyId } : {}), ...(j.highlightId ? { highlightId: j.highlightId } : {}) })) });
function ready(b: Browser, now: number) { return b.available && !!b.instagramUserId && now - Date.parse(b.lastSeenAt) <= READY_MS; }
function heartbeatUsername(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^[a-z0-9._]{1,30}$/i.test(value) || !/[a-z0-9_]/i.test(value)) fail();
  return value.toLowerCase();
}
function publicInstagramIdentity(b: Browser, now: number) {
  const age = now - Date.parse(b.instagramUsernameSeenAt ?? ""), name = b.instagramUsername;
  const fresh = ready(b, now) && Number.isFinite(age) && age >= 0 && age <= READY_MS && typeof name === "string" && /^[a-z0-9._]{1,30}$/.test(name) && /[a-z0-9_]/.test(name);
  return { instagramUsername: fresh ? name : null, instagramUsernameSeenAt: fresh ? b.instagramUsernameSeenAt! : null };
}
export async function overview(bucket: R2Bucket, owner: string, now = Date.now()) {
  const state = await readState(bucket, owner);
  return projectOverview(state, now);
}
export function projectOverview(state: State, now = Date.now()) {
  expire(state, now); // Read projection expires jobs; next mutation persists it.
  return { serverTime: now, extensionConfigured: Boolean(state.credentialHash), templates: state.templates.map(publicTemplate), browsers: state.browsers.map(b => ({ id: b.id, sessionId: b.sessionId, label: b.label, instagramUserId: b.instagramUserId, ...publicInstagramIdentity(b, now), available: ready(b, now), lastSeenAt: b.lastSeenAt, capabilities: b.capabilities ?? null })), dispatches: state.dispatches.map(publicDispatch), pollAfterMs: 5000 };
}
export async function publish(bucket: R2Bucket, owner: string, input: unknown, now = Date.now(), delegation?: { owner: string; template: Template }, guard?: (state: State) => void) {
  const body = record(input); onlyKeys(body, ["templateId", "requestId", "targets"]);
  const templateId = uuid(body.templateId), requestId = uuid(body.requestId);
  // Missing targets are accepted only for replay of an already persisted request.
  const targets = body.targets === undefined ? undefined : publishTargets(body.targets);
  return mutate(bucket, owner, state => {
    expire(state, now);
    const existing = state.dispatches.find(d => d.requestId === requestId);
    if (existing) {
      if (existing.delegatedOwner !== delegation?.owner || existing.templateId !== templateId || (targets && targetSet(targets) !== targetSet(existing.jobs))) fail("idempotency_conflict", "Esta solicitação já foi usada para outro modelo ou seleção.", 409);
      return publicDispatch(existing);
    }
    if (!targets) fail("selection_required", "Selecione ao menos um navegador.");
    guard?.(state);
    const template = delegation ? delegation.template : state.templates.find(t => t.id === templateId);
    if (template && template.id !== templateId) fail();
    if (!template) fail("not_found", "Modelo não encontrado.", 404);
    // Resolve and validate every snapshot inside each CAS attempt, before creating jobs.
    const browsers = targets.map(target => {
      const browser = state.browsers.find(b => b.id === target.browserId);
      if (browser?.delegation?.owner !== delegation?.owner) fail("browser_scope", "Este navegador está vinculado a outra conta. Atualize a seleção.", 409);
      if (!browser || !ready(browser, now) || browser.sessionId !== target.sessionId || browser.instagramUserId !== target.instagramUserId) fail("selected_browsers_unavailable", "A seleção de navegadores não está mais disponível. Atualize e selecione novamente.", 409);
      if (!supportsStoryOptions(browser, template)) fail("extension_update_required", "Atualize a extensao para estas opcoes de Story.", 409);
      return browser;
    });
    for (const browser of browsers) if (setupBusy(state, browser.id, browser.instagramUserId)) fail("browser_busy", "Um navegador selecionado já possui uma execução em andamento.", 409);
    const dispatch: Dispatch = { id: crypto.randomUUID(), requestId, templateId, templateName: template.name, template: structuredClone(template), createdAt: new Date(now).toISOString(), jobs: browsers.map(b => ({ id: crypto.randomUUID(), browserId: b.id, sessionId: b.sessionId, instagramUserId: b.instagramUserId, label: b.label, status: "queued", message: "queued", deadline: now + QUEUED_MS })) };
    if (delegation) dispatch.delegatedOwner = delegation.owner;
    state.dispatches.push(dispatch);
    return publicDispatch(dispatch);
  });
}
function publishTargets(input: unknown): Target[] {
  if (!Array.isArray(input) || input.length > LIMITS.browsers) fail();
  if (!input.length) fail("selection_required", "Selecione ao menos um navegador.");
  const targets: Target[] = [], seen = new Set<string>();
  for (const value of input) {
    const target = record(value); onlyKeys(target, ["browserId", "sessionId", "instagramUserId"]);
    const browserId = uuid(target.browserId), sessionId = uuid(target.sessionId);
    // textField rejects control characters (including a trailing newline after a UUID).
    textField(target.browserId, 36); textField(target.sessionId, 36);
    const instagramUserId = textField(target.instagramUserId, 30);
    if (instagramUserId !== target.instagramUserId || !/^[0-9]{1,30}$/.test(instagramUserId) || seen.has(browserId)) fail();
    seen.add(browserId);
    targets.push({ browserId, sessionId, instagramUserId });
  }
  return targets;
}
function targetSet(targets: Target[]) {
  return JSON.stringify(targets.map(t => [t.browserId, t.sessionId, t.instagramUserId]).sort((a, b) => a[0].localeCompare(b[0])));
}
export async function digestToken(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), b => b.toString(16).padStart(2, "0")).join("");
}
export function newCredential() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}
export async function rotateCredential(bucket: R2Bucket, owner: string, token: string, issuer?: { accountUserId: string; platformOwner: boolean }) {
  const hash = await digestToken(token);
  const lookup = await bucket.put(credentialKey(hash), JSON.stringify({ owner, ...issuer }), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
  if (!lookup) fail("busy", "Não foi possível preparar o pacote.", 503);
  await mutate(bucket, owner, state => { invalidate(state); state.browsers.forEach(b => { b.available = false; b.instagramUsername = null; b.instagramUsernameSeenAt = null; }); state.credentialHash = hash; });
}
export async function authorize(bucket: R2Bucket, authorization: string | null): Promise<Authority> {
  if (!authorization || !/^Bearer [0-9a-f]{64}$/.test(authorization)) fail("unauthorized", "Credencial inválida.", 401);
  const hash = await digestToken(authorization.slice(7));
  const object = await bucket.get(credentialKey(hash));
  const lookup = object ? await object.json<{ owner: string; accountUserId?: string; platformOwner?: boolean }>() : null;
  if (!lookup?.owner) fail("unauthorized", "Credencial inválida.", 401);
  const state = await readState(bucket, lookup.owner);
  if (state.credentialHash !== hash) fail("unauthorized", "Credencial inválida.", 401);
  return { owner: lookup.owner, hash, ...(lookup.accountUserId ? { accountUserId: lookup.accountUserId, platformOwner: lookup.platformOwner === true } : {}) };
}
export async function heartbeat(bucket: R2Bucket, auth: Authority, input: unknown, now = Date.now(), claimGuard?: { allowed: boolean; bindingKey: string }) {
  const body = record(input); onlyKeys(body, ["type", "browserId", "sessionId", "instagramUserId", "instagramUsername", "label", "available", "capabilities"]);
  const capabilities = setupCapabilities(body.capabilities);
  const browserId = uuid(body.browserId), sessionId = uuid(body.sessionId), label = textField(body.label, 120);
  const instagramUserId = body.instagramUserId === null ? "" : textField(body.instagramUserId, 40, false);
  if ((instagramUserId && !/^\d+$/.test(instagramUserId)) || typeof body.available !== "boolean") fail();
  const available = body.available && !!instagramUserId;
  const suppliedUsername = heartbeatUsername(body.instagramUsername);
  const instagramUsername = available ? suppliedUsername : null;
  const instagramUsernameSeenAt = instagramUsername ? new Date(now).toISOString() : null;
  return mutate(bucket, auth.owner, state => {
    expire(state, now);
    let browser = state.browsers.find(b => b.id === browserId);
    if (browser) {
      if (browser.retiredSessions.includes(sessionId)) fail("stale_session", "Esta sessão foi encerrada.", 409);
      if (browser.sessionId !== sessionId) {
        browser.retiredSessions.push(browser.sessionId);
        invalidate(state, browserId);
      } else if (browser.instagramUserId !== instagramUserId || !available || !ready(browser, now)) invalidate(state, browserId);
      if (browser.delegation && instagramUserId && browser.delegation.instagramUserId !== instagramUserId) delete browser.delegation;
      Object.assign(browser, { sessionId, label, instagramUserId, instagramUsername, instagramUsernameSeenAt, available, lastSeenAt: new Date(now).toISOString(), capabilities });
    } else {
      browser = { id: browserId, sessionId, retiredSessions: [], label, instagramUserId, instagramUsername, instagramUsernameSeenAt, available, lastSeenAt: new Date(now).toISOString(), capabilities };
      state.browsers.push(browser);
    }
    // A downgrade cannot continue an unknown command. Preserve confirmed steps.
    for (const dispatch of state.profileSetups ?? []) for (const job of dispatch.jobs) if (job.browserId === browserId && ["queued", "claimed"].includes(job.status) && !supportsSetup(browser, dispatch.actions)) endSetup(job, "extension_update_required", job.status === "queued" ? "expired" : undefined);
    if (!available || claimGuard && (!claimGuard.allowed || claimGuard.bindingKey !== storyBindingKey(browser)) || setupClaimed(state, browserId, instagramUserId)) return { command: null };
    if (auth.owner === MASTER_STORY_OWNER && (auth.platformOwner === true || !auth.accountUserId) && !browser.delegation) {
      for (const op of state.highlightOperations ?? []) {
        if (op.status !== "queued" || op.target.browserId !== browserId || op.target.sessionId !== sessionId || op.target.instagramUserId !== instagramUserId) continue;
        if (browser.capabilities?.highlightManagement !== 1) { op.status = "expired"; op.message = "extension_update_required"; continue; }
        if (op.action === "delete") {
          const list = state.highlightOperations?.find(item => item.id === op.listOperationId && item.status === "completed" && item.action === "list" && exactHighlightTarget(item.target, op.target));
          const age = now - Date.parse(list?.completedAt ?? "");
          if (!Number.isFinite(age) || age < 0 || age > 120_000 || !list?.highlights?.some(item => item.id === op.highlightId && item.title === op.highlightTitle)) { op.status = "expired"; op.message = "stale_list"; continue; }
        }
        op.status = "claimed"; op.message = "claimed"; op.claimedUntil = now + CLAIM_MS;
        return { command: { kind: "highlight_management", id: op.id, requestId: op.requestId, action: op.action, browserId, sessionId, instagramUserId, ...(op.highlightId ? { highlightId: op.highlightId, highlightTitle: op.highlightTitle } : {}) } };
      }
    }
    for (const dispatch of state.dispatches) {
      if (dispatch.delegatedOwner !== browser.delegation?.owner) continue;
      const job = dispatch.jobs.find(j => j.browserId === browserId && j.sessionId === sessionId && j.instagramUserId === instagramUserId && j.status === "queued");
      if (!job) continue;
      if (!supportsStoryOptions(browser, dispatch.template)) {
        job.status = "expired"; job.message = "extension_update_required";
        continue;
      }
      job.status = "claimed"; job.message = "claimed"; job.claimedUntil = now + CLAIM_MS;
      const { name, linkUrl, linkTitle, highlightName } = dispatch.template;
      return { command: { id: job.id, dispatchId: dispatch.id, sessionId, instagramUserId: job.instagramUserId, template: { name, linkUrl, linkTitle, highlightName, createHighlight: dispatch.template.createHighlight !== false, ...viewSticker(dispatch.template) } } };
    }
    for (const dispatch of state.profileSetups ?? []) {
      if (browser.delegation) break;
      const job = dispatch.jobs.find(j => j.browserId === browserId && j.sessionId === sessionId && j.instagramUserId === instagramUserId && j.status === "queued");
      if (!job || !supportsSetup(browser, dispatch.actions)) continue;
      job.status = "claimed"; job.message = "claimed"; job.claimedUntil = now + SETUP_CLAIM_MS;
      return { command: { kind: "profile_setup", ...(browser.capabilities?.photoProof === 1 ? { browserId } : {}), id: job.id, dispatchId: dispatch.id, sessionId, instagramUserId, actions: dispatch.actions, steps: publicSetupSteps(job.steps) } };
    }
    return { command: null };
  }, auth.hash);
}
function ownedJob(state: State, body: Record<string, unknown>) {
  const browserId = uuid(body.browserId), sessionId = uuid(body.sessionId), jobId = uuid(body.jobId);
  const browser = state.browsers.find(b => b.id === browserId && b.sessionId === sessionId);
  const dispatch = state.dispatches.find(d => d.jobs.some(j => j.id === jobId && j.browserId === browserId && j.sessionId === sessionId));
  const job = dispatch?.jobs.find(j => j.id === jobId);
  if (!browser || !dispatch || !job) fail("job_not_found", "Comando não disponível para esta sessão.", 404);
  return { dispatch, job, browser };
}
export const RESULT_CODES = ["published", "story_published", "highlight_failed", "publish_failed", "session_unavailable", "image_failed", "execution_uncertain", "session_changed", "interrupted", "highlight_unconfirmed", "story_unconfirmed"];
export async function result(bucket: R2Bucket, auth: Authority, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["type", "browserId", "sessionId", "jobId", "status", "message", "storyId", "highlightId"]);
  if (typeof body.status !== "string" || !["published", "partial", "failed", "uncertain"].includes(body.status)) fail();
  if (body.message !== undefined && (typeof body.message !== "string" || !RESULT_CODES.includes(body.message))) fail();
  const storyId = body.storyId === undefined ? undefined : textField(body.storyId, 100);
  const highlightId = body.highlightId === undefined ? undefined : textField(body.highlightId, 100);
  if (storyId && !/^\d+(?:_\d+)?$/.test(storyId)) fail();
  if (highlightId && !/^(?:highlight:)?\d+$/.test(highlightId)) fail();
  if ((body.status === "published" && !storyId) || (body.status === "partial" && !storyId) || (body.status === "failed" && (storyId || highlightId)) || (highlightId && !storyId)) fail();
  const status = body.status as Status;
  const message = body.message as string | undefined ?? ({ published: "published", partial: "highlight_failed", failed: "publish_failed", uncertain: "execution_uncertain" } as Record<string, string>)[status];
  const ack = JSON.stringify({ status, message, storyId, highlightId });
  return mutate(bucket, auth.owner, state => {
    expire(state, now);
    const { job, dispatch } = ownedJob(state, body);
    const createHighlight = dispatch.template.createHighlight !== false;
    if (status === "published" && (createHighlight ? !highlightId || message !== "published" : !!highlightId || message !== "story_published")) fail();
    if (!createHighlight && (highlightId || status === "partial" || ["published", "highlight_failed", "highlight_unconfirmed"].includes(message))) fail();
    if (message === "story_published" && (createHighlight || status !== "published")) fail();
    if (job.ack === ack) return { ok: true, status: job.status };
    if (job.status !== "claimed") fail("stale_job", "O comando já foi encerrado. Não republique.", 409);
    Object.assign(job, { status, message, ...(storyId ? { storyId } : {}), ...(highlightId ? { highlightId } : {}), ack });
    return { ok: true, status };
  }, auth.hash);
}
export async function jobImage(bucket: R2Bucket, auth: Authority, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["type", "browserId", "sessionId", "jobId"]);
  const template = await mutate(bucket, auth.owner, state => {
    expire(state, now);
    const { dispatch, job, browser } = ownedJob(state, body);
    if (job.status !== "claimed" || browser.instagramUserId !== job.instagramUserId || !ready(browser, now)) fail("stale_job", "O comando não está mais disponível.", 409);
    return dispatch.template;
  }, auth.hash);
  return storedImage(bucket, template);
}
export async function storedImage(bucket: R2Bucket, template: Template) {
  const object = await bucket.get(template.imageKey);
  if (!object) fail("not_found", "Imagem não encontrada.", 404);
  return new Response(object.body, { headers: { "content-type": template.imageType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

export const SETUP_QUEUE_MS = 5 * 60_000, SETUP_CLAIM_MS = 12 * 60_000, PROFILE_IMAGE_BYTES = 8 * 1024 * 1024;
export const SETUP_ORDER: SetupStepName[] = ["bio", "photo"];
export const SETUP_CODES = ["queued", "running", "confirmed", "interrupted", "execution_uncertain", "session_changed", "challenge_detected", "profile_form_unknown", "profile_tab_timeout", "profile_origin_mismatch", "profile_manual_review_tab_open", "bio_save_unconfirmed", "photo_confirmation_unavailable", "photo_control_unavailable", "image_failed", "execution_failed", "stopped_after_failure"];
function supportsStoryOptions(browser: Browser, template: Template) {
  return (!!template.linkUrl && template.createHighlight !== false || browser.capabilities?.storyOptions === 1) && (!template.linkUrl || stickerRotation(template.stickerRotation) === 0 || browser.capabilities?.stickerRotation === 1);
}
function setupCapabilities(input: unknown): SetupCapabilities | undefined {
  if (input === undefined) return undefined;
  const body = record(input); onlyKeys(body, ["profileSetup", "bio", "photo", "photoProof", "storyOptions", "stickerRotation", "highlightManagement"]);
  if (body.highlightManagement !== undefined && body.highlightManagement !== 1) fail();
  if (body.stickerRotation !== undefined && body.stickerRotation !== 1) fail();
  if (body.storyOptions !== undefined && body.storyOptions !== 1) fail();
  if (body.photoProof !== undefined && body.photoProof !== 1) fail();
  if (body.profileSetup !== undefined) {
    if (body.profileSetup !== 1 || ["bio", "photo"].some(key => typeof body[key] !== "boolean")) fail();
  } else if ((body.storyOptions !== 1 && body.highlightManagement !== 1) || ["bio", "photo", "photoProof"].some(key => body[key] !== undefined)) fail();
  return body as SetupCapabilities;
}
function supportsSetup(browser: Browser, actions: SetupActions) {
  return browser.capabilities?.profileSetup === 1 && Object.keys(actions).every(key => browser.capabilities?.[key as SetupStepName] === true);
}
// Legacy publication may queue legacy publications, but cannot overlap a setup.
function setupBusy(state: State, browserId: string, instagramUserId: string) {
  return (state.highlightOperations ?? []).some(op => (op.target.browserId === browserId || op.target.instagramUserId === instagramUserId) && ["queued", "claimed"].includes(op.status)) || (state.profileSetups ?? []).some(d => d.jobs.some(j => (j.browserId === browserId || j.instagramUserId === instagramUserId) && ["queued", "claimed"].includes(j.status)));
}
function setupClaimed(state: State, browserId: string, instagramUserId: string) {
  return (state.highlightOperations ?? []).some(op => (op.target.browserId === browserId || op.target.instagramUserId === instagramUserId) && op.status === "claimed") || state.dispatches.some(d => d.jobs.some(j => j.browserId === browserId && j.status === "claimed")) || (state.profileSetups ?? []).some(d => d.jobs.some(j => (j.browserId === browserId || j.instagramUserId === instagramUserId) && j.status === "claimed"));
}
function setupStatus(job: SetupJob) {
  const steps = Object.values(job.steps);
  if (steps.some(step => step.status === "running" || step.status === "pending")) return;
  job.status = steps.every(step => step.status === "confirmed") ? "completed" : steps.some(step => step.status === "uncertain") ? "uncertain" : steps.some(step => step.status === "confirmed") ? "partial" : "failed";
  job.message = job.status;
}
function endSetup(job: SetupJob, message: string, status?: "expired") {
  for (const step of Object.values(job.steps)) {
    if (step.status === "running") Object.assign(step, { status: "uncertain", message });
    if (step.status === "pending") Object.assign(step, { status: "skipped", message });
  }
  setupStatus(job); if (status) job.status = status;
  job.message = message;
}
function publicSetupSteps(steps: SetupJob["steps"]) {
  return Object.fromEntries(Object.entries(steps).map(([name, step]) => [name, { status: step.status, message: step.message, ...(step.proof ? { proof: step.proof } : {}) }]));
}
export function publicSetupDispatch(dispatch: SetupDispatch) {
  return { id: dispatch.id, requestId: dispatch.requestId, createdAt: dispatch.createdAt, actions: dispatch.actions, jobs: dispatch.jobs.map(job => ({ id: job.id, browserId: job.browserId, sessionId: job.sessionId, instagramUserId: job.instagramUserId, label: job.label, status: job.status, message: job.message, steps: publicSetupSteps(job.steps) })) };
}
export const publicProfileImage = (image: SetupImage) => ({ id: image.id, imageType: image.imageType, createdAt: image.createdAt, imageUrl: `/api/story-bridge/profile-setup/images/${image.id}` });
export async function setupOverview(bucket: R2Bucket, owner: string, now = Date.now()) {
  const state = await readState(bucket, owner); expire(state, now);
  return { browsers: state.browsers.filter(b => !b.delegation).map(b => ({ id: b.id, sessionId: b.sessionId, instagramUserId: b.instagramUserId, ...publicInstagramIdentity(b, now), label: b.label, available: ready(b, now), lastSeenAt: b.lastSeenAt, capabilities: b.capabilities ?? null })), dispatches: (state.profileSetups ?? []).map(publicSetupDispatch), images: (state.profileImages ?? []).map(publicProfileImage), pollAfterMs: 5000 };
}
export async function addProfileImage(bucket: R2Bucket, owner: string, bytes: Uint8Array, mime: string) {
  if (bytes.length > PROFILE_IMAGE_BYTES) fail("image_size", "A foto deve ter até 8 MiB.", 413);
  const type = imageType(bytes); if (mime !== type) fail("image_type", "O tipo da foto não corresponde ao arquivo.");
  if ((await readState(bucket, owner)).profileImages?.length === 100) fail("state_limit", "O limite de fotos foi atingido.", 409);
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID(), image: SetupImage = { sha256, id, imageKey: `story-bridge/workspaces/${encodeURIComponent(owner)}/profile-images/${id}`, imageType: type, createdAt: new Date().toISOString() };
  const written = await bucket.put(image.imageKey, bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: type, cacheControl: "no-store" } });
  if (!written) fail("busy", "Não foi possível salvar a foto.", 503);
  await mutate(bucket, owner, state => { (state.profileImages ??= []).push(image); });
  return publicProfileImage(image);
}
function setupActions(input: unknown): SetupActions {
  const body = record(input); onlyKeys(body, SETUP_ORDER);
  if (!Object.keys(body).length) fail("actions_required", "Selecione ao menos uma ação.");
  const actions: SetupActions = {};
  if (body.bio !== undefined) {
    const bio = record(body.bio); onlyKeys(bio, ["text"]);
    if (typeof bio.text !== "string" || Array.from(bio.text).length > 150 || Array.from(bio.text).some(char => { const code = char.codePointAt(0)!; return code < 32 && ![9, 10, 13].includes(code) || code === 127; })) fail();
    actions.bio = { text: bio.text };
  }
  if (body.photo !== undefined) { const photo = record(body.photo); onlyKeys(photo, ["imageId"]); actions.photo = { imageId: uuid(photo.imageId) }; }
  return actions;
}
function setupSelection(state: State, targets: Target[], actions: SetupActions, now: number) {
  return targets.map(target => {
    const browser = state.browsers.find(b => b.id === target.browserId);
    if (browser?.delegation) fail("browser_scope", "Este navegador está vinculado a outra conta.", 409);
    if (!browser || !ready(browser, now) || browser.sessionId !== target.sessionId || browser.instagramUserId !== target.instagramUserId) fail("selected_browsers_unavailable", "A seleção não está mais disponível. Atualize e selecione novamente.", 409);
    if (!supportsSetup(browser, actions)) fail("extension_update_required", "Atualize a extensão dos navegadores selecionados.", 409);
    if (setupBusy(state, browser.id, browser.instagramUserId) || state.dispatches.some(d => d.jobs.some(j => (j.browserId === browser.id || j.instagramUserId === browser.instagramUserId) && ["queued", "claimed"].includes(j.status)))) fail("browser_busy", "Um navegador selecionado já possui uma execução em andamento.", 409);
    return browser;
  });
}
export async function createSetup(bucket: R2Bucket, owner: string, input: unknown, now = Date.now(), guard?: (state: State) => void) {
  const body = record(input); onlyKeys(body, ["requestId", "targets", "actions"]);
  const requestId = uuid(body.requestId), actions = setupActions(body.actions);
  if (body.targets === undefined) fail("selection_required", "Selecione ao menos um navegador.");
  const targets = publishTargets(body.targets), fingerprint = await digestToken(JSON.stringify({ actions, targets: targetSet(targets) }));
  let imageHash: string | undefined;
  if (actions.photo) {
    const image = (await readState(bucket, owner)).profileImages?.find(i => i.id === actions.photo!.imageId);
    if (image && !image.sha256) {
      const object = await bucket.get(image.imageKey);
      if (object) imageHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await new Response(object.body).arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }
  }
  return mutate(bucket, owner, state => {
    expire(state, now);
    const existing = state.profileSetups?.find(d => d.requestId === requestId);
    if (existing) { if (existing.fingerprint !== fingerprint) fail("idempotency_conflict", "Esta solicitação já foi usada com outros dados.", 409); return publicSetupDispatch(existing); }
    guard?.(state);
    const browsers = setupSelection(state, targets, actions, now);
    const image = actions.photo ? state.profileImages?.find(i => i.id === actions.photo!.imageId) : undefined;
    if (actions.photo && !image) fail("not_found", "Foto não encontrada neste workspace.", 404);
    const dispatch: SetupDispatch = { id: crypto.randomUUID(), requestId, fingerprint, createdAt: new Date(now).toISOString(), actions, ...(image ? { image: { ...structuredClone(image), ...(imageHash ? { sha256: imageHash } : {}) } } : {}), jobs: browsers.map(b => ({ id: crypto.randomUUID(), browserId: b.id, sessionId: b.sessionId, instagramUserId: b.instagramUserId, label: b.label, status: "queued", message: "queued", deadline: now + SETUP_QUEUE_MS, steps: Object.fromEntries(SETUP_ORDER.filter(name => actions[name] !== undefined).map(name => [name, { status: "pending", message: "queued" }])) })) };
    (state.profileSetups ??= []).push(dispatch); return publicSetupDispatch(dispatch);
  });
}
export async function retrySetup(bucket: R2Bucket, owner: string, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["requestId", "dispatchId", "targets", "reviewedUncertain"]);
  const requestId = uuid(body.requestId), dispatchId = uuid(body.dispatchId);
  if (!Array.isArray(body.targets)) fail("selection_required", "Selecione ao menos um navegador.");
  const jobIds = body.targets.map(value => { const target = record(value); onlyKeys(target, ["jobId", "browserId", "sessionId", "instagramUserId"]); return uuid(target.jobId); });
  const targets = publishTargets(body.targets.map(value => { const target = { ...record(value) }; delete target.jobId; return target; }));
  if (typeof body.reviewedUncertain !== "boolean") fail();
  const reviewed = body.reviewedUncertain;
  const fingerprint = await digestToken(JSON.stringify({ dispatchId, reviewed, targets: targets.map((t, i) => [t.browserId, t.sessionId, t.instagramUserId, jobIds[i]]).sort((a, b) => a[0].localeCompare(b[0])) }));
  return mutate(bucket, owner, state => {
    expire(state, now);
    const existing = state.profileSetups?.find(d => d.requestId === requestId);
    if (existing) { if (existing.fingerprint !== fingerprint) fail("idempotency_conflict", "Esta solicitação já foi usada com outros dados.", 409); return publicSetupDispatch(existing); }
    const source = state.profileSetups?.find(d => d.id === dispatchId); if (!source) fail("not_found", "Execução não encontrada.", 404);
    const sourceJobs = targets.map((t, i) => {
      const job = source.jobs.find(j => j.id === jobIds[i] && j.browserId === t.browserId && j.sessionId === t.sessionId && j.instagramUserId === t.instagramUserId);
      if (!job || job.retryDispatchId || ["queued", "claimed", "completed"].includes(job.status)) fail("retry_unavailable", "A etapa não está disponível para retentativa.", 409);
      if (Object.values(job.steps).some(step => step.status === "uncertain") && !reviewed) fail("review_required", "Confira o resultado incerto antes de autorizar nova tentativa.", 409);
      return job;
    });
    setupSelection(state, targets, source.actions, now);
    const dispatch: SetupDispatch = { ...structuredClone(source), id: crypto.randomUUID(), requestId, fingerprint, sourceDispatchId: source.id, createdAt: new Date(now).toISOString(), jobs: sourceJobs.map(job => ({ ...structuredClone(job), id: crypto.randomUUID(), status: "queued", message: "queued", deadline: now + SETUP_QUEUE_MS, claimedUntil: undefined, steps: Object.fromEntries(Object.entries(job.steps).map(([name, step]) => [name, step.status === "confirmed" ? { ...step, ack: undefined } : { status: "pending", message: "queued" }])) })) };
    sourceJobs.forEach(job => { job.retryDispatchId = dispatch.id; });
    state.profileSetups!.push(dispatch); return publicSetupDispatch(dispatch);
  });
}
function ownedSetup(state: State, body: Record<string, unknown>, now: number) {
  const browserId = uuid(body.browserId), sessionId = uuid(body.sessionId), jobId = uuid(body.jobId);
  const dispatch = state.profileSetups?.find(d => d.jobs.some(j => j.id === jobId && j.browserId === browserId && j.sessionId === sessionId));
  const job = dispatch?.jobs.find(j => j.id === jobId);
  const browser = state.browsers.find(b => b.id === browserId && b.sessionId === sessionId);
  if (!dispatch || !job || !browser || browser.instagramUserId !== job.instagramUserId || body.instagramUserId !== job.instagramUserId) fail("stale_job", "Comando não disponível para esta conta/sessão.", 409);
  if (!ready(browser, now) || !supportsSetup(browser, dispatch.actions)) fail("stale_job", "A sessão não está mais disponível.", 409);
  return { dispatch, job, browser };
}
export async function setupStage(bucket: R2Bucket, auth: Authority, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["type", "browserId", "sessionId", "instagramUserId", "jobId", "step", "status", "message", "proof"]);
  if (!SETUP_ORDER.includes(body.step as SetupStepName) || !["running", "confirmed", "failed", "uncertain"].includes(body.status as string) || !SETUP_CODES.includes(body.message as string)) fail();
  const name = body.step as SetupStepName, status = body.status as SetupStep["status"];
  if (status === "running" && body.message !== "running" || status === "confirmed" && body.message !== "confirmed" || ["failed", "uncertain"].includes(status) && ["queued", "running", "confirmed"].includes(body.message as string)) fail();
  const ack = JSON.stringify({ status, message: body.message, ...(body.proof !== undefined ? { proof: body.proof } : {}) });
  if ((body.proof !== undefined && name !== "photo") || (name === "bio" && status === "confirmed")) {
    const proof = record(body.proof); onlyKeys(proof, ["identityMatched", "afterReload", "textMatched"]);
    if (name !== "bio" || status !== "confirmed" || proof.identityMatched !== true || proof.afterReload !== true || proof.textMatched !== true) fail();
  }
  return mutate(bucket, auth.owner, state => {
    expire(state, now); const { dispatch, job, browser } = ownedSetup(state, body, now), step = job.steps[name];
    if (name === "photo" && (body.proof !== undefined || status === "confirmed")) {
      const proof = record(body.proof); onlyKeys(proof, ["version", "imageId", "imageSha256", "instagramUserId", "identityMatched", "afterReload", "pixelsMatched", "expectedPixels", "avatarPixels"]);
      if (status !== "confirmed" || browser.capabilities?.photoProof !== 1 || proof.version !== 1 || proof.imageId !== dispatch.actions.photo?.imageId || !dispatch.image?.sha256 || proof.imageSha256 !== dispatch.image.sha256 || proof.instagramUserId !== job.instagramUserId || proof.identityMatched !== true || proof.afterReload !== true || proof.pixelsMatched !== true || typeof proof.expectedPixels !== "string" || !/^[a-f0-9]{64}$/.test(proof.expectedPixels) || proof.avatarPixels !== proof.expectedPixels) fail();
    }
    if (!step) fail();
    if (step.ack === ack) return { ok: true, status: job.status };
    if (job.status !== "claimed") fail("stale_job", "A execução já foi encerrada.", 409);
    if (status === "running") {
      if (step.status !== "pending" || SETUP_ORDER.slice(0, SETUP_ORDER.indexOf(name)).some(key => job.steps[key] && job.steps[key]!.status !== "confirmed")) fail("stage_conflict", "A etapa não está disponível.", 409);
    } else if (step.status !== "running" && !(status === "failed" && step.status === "pending")) fail("stage_conflict", "A etapa não foi iniciada.", 409);
    Object.assign(step, { status, message: body.message as string, ack, ...(status === "confirmed" && body.proof ? { proof: structuredClone(body.proof) } : {}) });
    browser.lastSeenAt = new Date(now).toISOString(); job.claimedUntil = now + SETUP_CLAIM_MS;
    if (["failed", "uncertain"].includes(status)) endSetup(job, body.message as string); else setupStatus(job);
    return { ok: true, status: job.status };
  }, auth.hash);
}
export async function setupImage(bucket: R2Bucket, auth: Authority, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["type", "browserId", "sessionId", "instagramUserId", "jobId", "step"]);
  if (body.step !== "photo") fail();
  const image = await mutate(bucket, auth.owner, state => {
    expire(state, now); const { dispatch, job } = ownedSetup(state, body, now);
    if (job.status !== "claimed" || !["pending", "running"].includes(job.steps[body.step as SetupStepName]?.status ?? "")) fail("stale_job", "Imagem não disponível.", 409);
    return dispatch.image;
  }, auth.hash);
  if (!image) fail("not_found", "Imagem não encontrada.", 404);
  return storedImage(bucket, image as Template);
}
export async function setupInterrupt(bucket: R2Bucket, auth: Authority, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["type", "browserId", "sessionId", "instagramUserId", "jobId"]);
  return mutate(bucket, auth.owner, state => {
    expire(state, now); const { job } = ownedSetup(state, body, now);
    if (job.status === "claimed") endSetup(job, "interrupted");
    return { ok: true, status: job.status };
  }, auth.hash);
}
export const publicHighlightOperation = (op: HighlightOperation) => {
  return { id: op.id, requestId: op.requestId, action: op.action, target: op.target, label: op.label, status: op.status, message: op.message, createdAt: op.createdAt, ...(op.completedAt ? { completedAt: op.completedAt } : {}), ...(op.highlights ? { highlights: op.highlights } : {}), ...(op.highlightId ? { highlightId: op.highlightId, highlightTitle: op.highlightTitle } : {}) };
};
function highlightTarget(input: unknown): Target {
  const value = record(input); onlyKeys(value, ["browserId", "sessionId", "instagramUserId"]);
  const instagramUserId = textField(value.instagramUserId, 30);
  if (!/^[0-9]{1,30}$/.test(instagramUserId) || value.instagramUserId !== instagramUserId) fail();
  return { browserId: uuid(value.browserId), sessionId: uuid(value.sessionId), instagramUserId };
}
function highlightTitle(input: unknown): string {
  textField(input, 120, false);
  return input as string; // Exact snapshot title, including leading/trailing spaces.
}
function highlightId(input: unknown) {
  if (typeof input !== "string" || !/^highlight:[0-9]{1,30}$/.test(input)) return fail();
  return input;
}
function exactHighlightTarget(a: Target, b: Target) { return a.browserId === b.browserId && a.sessionId === b.sessionId && a.instagramUserId === b.instagramUserId; }
export async function highlightOverview(bucket: R2Bucket, owner: string, now = Date.now()) {
  if (owner !== MASTER_STORY_OWNER) fail("feature_disabled", "Recurso indisponivel.", 403);
  const state = await readState(bucket, owner); expire(state, now);
  return { serverTime: now, browsers: projectOverview(state, now).browsers.filter(b => !state.browsers.find(raw => raw.id === b.id)?.delegation), operations: (state.highlightOperations ?? []).map(publicHighlightOperation) };
}
export async function createHighlightOperation(bucket: R2Bucket, owner: string, input: unknown, now = Date.now()) {
  if (owner !== MASTER_STORY_OWNER) fail("feature_disabled", "Recurso indisponivel.", 403);
  const body = record(input); onlyKeys(body, ["action", "requestId", "target", "listOperationId", "highlightId", "confirmed", "confirmedTitle"]);
  if (body.action !== "list" && body.action !== "delete") fail();
  const action = body.action, requestId = uuid(body.requestId), target = highlightTarget(body.target);
  const selection = action === "delete" ? { listOperationId: uuid(body.listOperationId), highlightId: highlightId(body.highlightId), confirmedTitle: highlightTitle(body.confirmedTitle), confirmed: body.confirmed } : {};
  if (action === "list" && ["listOperationId", "highlightId", "confirmed", "confirmedTitle"].some(key => body[key] !== undefined)) fail();
  if (action === "delete" && body.confirmed !== true) fail("confirmation_required", "Confirme um destaque.");
  const fingerprint = JSON.stringify({ action, target, ...selection });
  return mutate(bucket, owner, state => {
    expire(state, now);
    const existing = (state.highlightOperations ?? []).find(op => op.requestId === requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) fail("idempotency_conflict", "Solicitacao ja utilizada.", 409);
      return publicHighlightOperation(existing);
    }
    const browser = state.browsers.find(b => b.id === target.browserId);
    if (!browser || browser.delegation || !exactHighlightTarget({ browserId: browser.id, sessionId: browser.sessionId, instagramUserId: browser.instagramUserId }, target) || !ready(browser, now)) fail("selected_browsers_unavailable", "Atualize o perfil selecionado.", 409);
    if (browser.capabilities?.highlightManagement !== 1) fail("extension_update_required", "Atualize a extensao.", 409);
    if (setupBusy(state, browser.id, browser.instagramUserId) || state.dispatches.some(d => d.jobs.some(j => (j.browserId === browser.id || j.instagramUserId === browser.instagramUserId) && ["queued", "claimed"].includes(j.status)))) fail("browser_busy", "Perfil ocupado.", 409);
    let selected: { id: string; title: string } | undefined;
    if (action === "delete") {
      const list = state.highlightOperations?.find(op => op.id === selection.listOperationId && op.action === "list" && op.status === "completed" && exactHighlightTarget(op.target, target));
      if (!list?.completedAt || now - Date.parse(list.completedAt) < 0 || now - Date.parse(list.completedAt) > 120_000) fail("stale_list", "Consulte novamente os destaques.", 409);
      selected = list.highlights?.find(item => item.id === selection.highlightId && item.title === selection.confirmedTitle);
      if (!selected) fail("stale_selection", "Selecao nao confere com a lista.", 409);
      if (state.highlightOperations?.some(op => op.action === "delete" && op.target.instagramUserId === target.instagramUserId && op.highlightId === selected!.id && (op.listOperationId === list.id || ["queued", "claimed", "uncertain", "completed"].includes(op.status)))) fail("delete_already_requested", "Exclusao ja solicitada; confira o historico, sem repetir.", 409);
    }
    const operation: HighlightOperation = { id: crypto.randomUUID(), requestId, fingerprint, action, target, label: browser.label, status: "queued", message: "queued", createdAt: new Date(now).toISOString(), deadline: now + QUEUED_MS, ...(selected ? { listOperationId: selection.listOperationId, highlightId: selected.id, highlightTitle: selected.title } : {}) };
    (state.highlightOperations ??= []).push(operation);
    return publicHighlightOperation(operation);
  });
}
export async function highlightResult(bucket: R2Bucket, auth: Authority, input: unknown, now = Date.now()) {
  if (auth.owner !== MASTER_STORY_OWNER || (auth.accountUserId && !auth.platformOwner)) fail("feature_disabled", "Recurso indisponivel.", 403);
  const body = record(input); onlyKeys(body, ["type", "browserId", "sessionId", "jobId", "instagramUserId", "status", "message", "complete", "highlights", "ownerInstagramUserId", "highlightId", "deleted", "absentFromCompleteList"]);
  const target = highlightTarget({ browserId: body.browserId, sessionId: body.sessionId, instagramUserId: body.instagramUserId }), jobId = uuid(body.jobId);
  if (!["completed", "failed", "uncertain"].includes(String(body.status)) || !["listed", "deleted", "read_failed", "delete_failed", "execution_uncertain", "identity_changed"].includes(String(body.message))) fail();
  // Canonicalize receipts, so harmless JSON key ordering does not change an ack.
  let highlights: { id: string; title: string }[] | undefined;
  if (body.highlights !== undefined) {
    if (!Array.isArray(body.highlights) || body.highlights.length > 500) fail();
    highlights = body.highlights.map(item => { const row = record(item); onlyKeys(row, ["id", "title"]); return { id: highlightId(row.id), title: highlightTitle(row.title) }; });
    if (new Set(highlights.map(h => h.id)).size !== highlights.length) fail();
  }
  const ack = JSON.stringify([body.status, body.message, body.complete, highlights, body.ownerInstagramUserId, body.highlightId, body.deleted, body.absentFromCompleteList]);
  return mutate(bucket, auth.owner, state => {
    expire(state, now);
    const op = state.highlightOperations?.find(item => item.id === jobId && exactHighlightTarget(item.target, target));
    const browser = state.browsers.find(item => item.id === target.browserId && item.sessionId === target.sessionId && item.instagramUserId === target.instagramUserId && !item.delegation);
    if (!op || !browser) fail("job_not_found", "Comando nao disponivel.", 404);
    if (op.ack === ack) return { ok: true, status: op.status };
    if (op.status !== "claimed") fail("stale_job", "Comando encerrado; nao repita.", 409);
    if (body.status === "completed") {
      if (body.ownerInstagramUserId !== target.instagramUserId) fail();
      if (op.action === "list") {
        if (body.message !== "listed" || body.complete !== true || !highlights || ["highlightId", "deleted", "absentFromCompleteList"].some(key => body[key] !== undefined)) fail();
      } else if (body.message !== "deleted" || body.highlightId !== op.highlightId || body.deleted !== true || body.absentFromCompleteList !== true || highlights !== undefined || body.complete !== undefined) fail();
    } else if (["listed", "deleted"].includes(String(body.message)) || ["complete", "highlights", "ownerInstagramUserId", "highlightId", "deleted", "absentFromCompleteList"].some(key => body[key] !== undefined)) fail();
    op.status = body.status as HighlightOperation["status"]; op.message = String(body.message); op.completedAt = new Date(now).toISOString(); op.ack = ack;
    if (op.action === "list" && op.status === "completed") op.highlights = highlights;
    return { ok: true, status: op.status };
  }, auth.hash);
}
