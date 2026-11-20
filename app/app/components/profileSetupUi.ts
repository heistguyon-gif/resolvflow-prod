export type SetupAction = "bio" | "photo";
export type SetupTarget = { browserId: string; sessionId: string; instagramUserId: string };
export type SetupBrowser = { id: string; sessionId: string; instagramUserId: string | null; instagramUsername?: string | null; instagramUsernameSeenAt?: string | null; label: string; available: boolean; lastSeenAt?: string; capabilities?: { profileSetup?: number; bio?: boolean; photo?: boolean } | null };
export type SetupActions = { bio?: { text: string }; photo?: { imageId: string } };
export type SetupStep = { status: "pending" | "running" | "confirmed" | "failed" | "uncertain" | "skipped"; message: string };
export type SetupJob = SetupTarget & { id: string; label: string; status: "queued" | "claimed" | "completed" | "partial" | "failed" | "uncertain" | "expired"; message: string; steps: Partial<Record<SetupAction, SetupStep>> };
export type SetupDispatch = { id: string; requestId: string; createdAt: string; actions: SetupActions; jobs: SetupJob[] };
export type SetupImage = { id: string; imageUrl: string; imageType: string; createdAt: string };
export type SetupSnapshot = { browsers: SetupBrowser[]; dispatches: SetupDispatch[]; images: SetupImage[]; pollAfterMs: number };
export type SetupCreate = { requestId: string; targets: SetupTarget[]; actions: SetupActions };
export type SetupRetry = { requestId: string; dispatchId: string; targets: (SetupTarget & { jobId: string })[]; reviewedUncertain: boolean };
export type SetupReview = { targets: (SetupTarget & { label: string })[]; actions: SetupActions; photoUrl?: string; photoName?: string; retry?: { dispatchId: string; jobId: string; requiresReview: boolean } };
export type SetupIntent = { kind: "create"; payload: SetupCreate; review: SetupReview } | { kind: "retry"; payload: SetupRetry; review: SetupReview };
export const actionLabels: Record<SetupAction, string> = { bio: "Bio", photo: "Foto" };
export const stepLabels: Record<SetupStep["status"], string> = { pending: "Aguardando", running: "Em execução", confirmed: "Confirmado", failed: "Falhou", uncertain: "Incerto · conferir perfil", skipped: "Não executado" };
export const jobLabels: Record<SetupJob["status"], string> = { queued: "Aguardando navegador", claimed: "Em execução", completed: "Todas as etapas confirmadas", partial: "Resultado parcial", failed: "Falhou", uncertain: "Incerto · conferir perfil", expired: "Expirado · não executado" };
export const actionKeys: SetupAction[] = ["bio", "photo"];
export const setupMessages: Record<string, string> = {
  profile_manual_review_tab_open: "A aba de edição ficou aberta no navegador selecionado. Confira a foto e conclua qualquer confirmação solicitada pelo Instagram antes de repetir.",
  profile_tab_timeout: "A página de edição não ficou pronta no prazo. Confira o navegador antes de tentar novamente.",
  profile_origin_mismatch: "A página aberta não corresponde ao Instagram esperado. Confira o navegador.",
  queued: "Aguardando o navegador selecionado.", running: "Atualização em andamento.", confirmed: "Alteração confirmada pelo navegador.",
  interrupted: "A execução foi interrompida. Confira o perfil antes de repetir.", execution_uncertain: "Não foi possível confirmar o resultado. Confira o perfil.",
  session_changed: "A sessão ou a conta conectada mudou. As etapas restantes foram interrompidas.", challenge_detected: "O Instagram solicitou uma verificação. Confira o perfil.",
  profile_form_unknown: "O formulário de edição não foi reconhecido. Nenhuma confirmação foi recebida.", bio_save_unconfirmed: "Não foi possível confirmar que a bio foi salva.",
  photo_confirmation_unavailable: "A foto não pôde ser confirmada. Confira a imagem no perfil.", photo_control_unavailable: "O controle de foto não foi encontrado.",
  image_failed: "Não foi possível preparar a foto.", execution_failed: "A etapa não pôde ser concluída.", stopped_after_failure: "Esta etapa não foi executada após a interrupção anterior.",
  queue_expired: "O navegador não recebeu o comando no prazo.", claim_timeout: "O navegador não confirmou o resultado no prazo. Confira o perfil.",
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const uuid = (value: unknown): value is string => text(value) && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const target = (value: unknown): value is SetupTarget & Record<string, unknown> => record(value) && uuid(value.browserId) && uuid(value.sessionId) && text(value.instagramUserId) && /^\d{1,30}$/.test(value.instagramUserId);
export const sameSetupTarget = (browser: SetupBrowser, item: SetupTarget) => browser.id === item.browserId && browser.sessionId === item.sessionId && browser.instagramUserId === item.instagramUserId;
export function setupTarget(browser: SetupBrowser, actions: SetupActions): SetupTarget | null {
  if (!browser.available || browser.capabilities?.profileSetup !== 1 || !uuid(browser.id) || !uuid(browser.sessionId) || !browser.instagramUserId || !/^\d{1,30}$/.test(browser.instagramUserId)) return null;
  if (actionKeys.some(key => actions[key] !== undefined && browser.capabilities?.[key] !== true)) return null;
  return { browserId: browser.id, sessionId: browser.sessionId, instagramUserId: browser.instagramUserId };
}
export function isSetupActions(value: unknown): value is SetupActions {
  if (!record(value) || !Object.keys(value).length || Object.keys(value).some(key => !actionKeys.includes(key as SetupAction))) return false;
  return (value.bio === undefined || record(value.bio) && text(value.bio.text) && [...value.bio.text].length <= 150)
    && (value.photo === undefined || record(value.photo) && text(value.photo.imageId));
}
export function isSetupDispatch(value: unknown): value is SetupDispatch {
  return record(value) && text(value.id) && text(value.requestId) && text(value.createdAt) && isSetupActions(value.actions) && Array.isArray(value.jobs) && value.jobs.every(job => record(job) && target(job) && text(job.id) && text(job.label) && text(job.message) && text(job.status) && Object.hasOwn(jobLabels, job.status) && record(job.steps) && Object.entries(job.steps).every(([key, step]) => actionKeys.includes(key as SetupAction) && record(step) && text(step.status) && Object.hasOwn(stepLabels, step.status) && text(step.message)));
}
export function isSetupImage(value: unknown): value is SetupImage {
  return record(value) && text(value.id) && text(value.imageUrl) && value.imageUrl.startsWith("/api/story-bridge/profile-setup/images/") && text(value.imageType) && ["image/png", "image/jpeg"].includes(value.imageType) && text(value.createdAt);
}
export function isSetupSnapshot(value: unknown): value is SetupSnapshot {
  return record(value) && Array.isArray(value.browsers) && value.browsers.every(browser => record(browser) && text(browser.id) && text(browser.sessionId) && text(browser.label) && (browser.instagramUserId === null || text(browser.instagramUserId)) && typeof browser.available === "boolean" && (browser.capabilities === undefined || browser.capabilities === null || record(browser.capabilities))) && Array.isArray(value.dispatches) && value.dispatches.every(isSetupDispatch) && Array.isArray(value.images) && value.images.every(isSetupImage);
}
export function setupJobState(dispatch: SetupDispatch, job: SetupJob): SetupJob["status"] {
  if (job.status === "completed" && actionKeys.some(key => dispatch.actions[key] !== undefined && job.steps[key]?.status !== "confirmed")) return "partial";
  return job.status;
}
export function setupCanRetry(dispatch: SetupDispatch, job: SetupJob) {
  if (dispatch.actions.bio && !dispatch.actions.bio.text.trim() && job.steps.bio?.status !== "confirmed") return false;
  return !["queued", "claimed", "completed"].includes(job.status) && actionKeys.some(key => dispatch.actions[key] !== undefined && job.steps[key]?.status !== "confirmed");
}
export const setupNeedsReview = (job: SetupJob) => job.status === "uncertain" || Object.values(job.steps).some(step => step.status === "uncertain");
export function readSetupIntent(raw: string | null, scopeKey: string): SetupIntent | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.scopeKey !== scopeKey || !record(value.intent)) return null;
    const { intent } = value;
    if (!["create", "retry"].includes(String(intent.kind)) || !record(intent.payload) || !uuid(intent.payload.requestId) || !record(intent.review) || !isSetupActions(intent.review.actions) || !Array.isArray(intent.review.targets) || !intent.review.targets.every(item => target(item) && record(item) && text(item.label))) return null;
    const payload = intent.payload;
    if (!Array.isArray(payload.targets) || !payload.targets.length || payload.targets.length > 100 || !payload.targets.every(target) || new Set(payload.targets.map(item => item.browserId)).size !== payload.targets.length) return null;
    if (intent.kind === "create" ? !isSetupActions(payload.actions) : !uuid(payload.dispatchId) || typeof payload.reviewedUncertain !== "boolean" || !payload.targets.every(item => record(item) && uuid(item.jobId))) return null;
    const reviewTargets = intent.review.targets;
    if (reviewTargets.length !== payload.targets.length || !payload.targets.every(item => reviewTargets.some(review => record(review) && review.browserId === item.browserId && review.sessionId === item.sessionId && review.instagramUserId === item.instagramUserId))) return null;
    if (intent.kind === "create" && JSON.stringify(payload.actions) !== JSON.stringify(intent.review.actions)) return null;
    if (intent.review.photoUrl !== undefined && (!text(intent.review.photoUrl) || !intent.review.photoUrl.startsWith("/api/story-bridge/profile-setup/images/"))) return null;
    // Validate the complete envelope before treating the stored request as a retry.
    return intent as SetupIntent;
  } catch { return null; }
}
