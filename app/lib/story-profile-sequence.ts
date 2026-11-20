// Optional coordinator over the two existing services. No Instagram calls and no new effect runner.
import { createSetup, digestToken, expire, fail, mutate, onlyKeys, publish, readState, record, uuid, READY_MS, type ProfileSequence, type State, type Target } from "./story-bridge";

export const PROFILE_SEQUENCE_PROTOCOL = { enabled: false, version: 1, profileSetup: 1, photoProof: 1, sequence: "photo-story-highlight", automaticReplay: false } as const;
// This release is photo-only. Sequence domain remains prepared/tested, never activated by API.
export function requireProfileSequenceRelease(): never {
  return fail("feature_disabled", "A sequência está em preparação. Este piloto permite somente foto isolada.", 403);
}

const matches = (a: Target, b: Target) => a.browserId === b.browserId && a.sessionId === b.sessionId && a.instagramUserId === b.instagramUserId;
function exactTarget(input: unknown): Target {
  const body = record(input); onlyKeys(body, ["browserId", "sessionId", "instagramUserId"]);
  if (typeof body.instagramUserId !== "string" || !/^\d{1,30}$/.test(body.instagramUserId)) fail();
  return { browserId: uuid(body.browserId), sessionId: uuid(body.sessionId), instagramUserId: body.instagramUserId };
}
function sourceJobs(state: State, sequence: ProfileSequence) {
  const photo = state.profileSetups?.find(d => d.requestId === sequence.photoRequestId);
  const story = state.dispatches.find(d => d.requestId === sequence.storyRequestId);
  return { photo, photoJob: photo?.jobs.find(j => matches(j, sequence.target)), story, storyJob: story?.jobs.find(j => matches(j, sequence.target)) };
}
function view(state: State, sequence: ProfileSequence) {
  const { photo, photoJob, story, storyJob } = sourceJobs(state, sequence);
  const photoStep = photoJob?.steps.photo ?? { status: "pending", message: "queued" };
  const photoConfirmed = photoStep.status === "confirmed" && photoStep.proof?.version === 1;
  const blocked = !!photoJob && !["queued", "claimed"].includes(photoJob.status) && !photoConfirmed;
  const storyConfirmed = !!storyJob?.storyId && ["published", "partial"].includes(storyJob.status);
  const storyStatus = blocked ? "skipped" : storyConfirmed ? "confirmed" : !storyJob ? "pending" : storyJob.status === "claimed" ? "running" : storyJob.status === "queued" ? "pending" : storyJob.status === "uncertain" ? "uncertain" : "failed";
  const highlightStatus = blocked ? "skipped" : storyJob?.status === "published" && storyJob.highlightId ? "confirmed" : storyConfirmed ? "uncertain" : ["failed", "uncertain"].includes(storyStatus) ? "skipped" : "pending";
  const status = blocked ? "stopped" : highlightStatus === "confirmed" ? "completed" : storyConfirmed ? "partial" : storyJob && !["queued", "claimed"].includes(storyJob.status) ? "stopped" : "waiting";
  return { id: sequence.id, requestId: sequence.requestId, createdAt: sequence.createdAt, target: sequence.target, imageId: sequence.imageId, templateId: sequence.templateId, status,
    steps: { photo: photoStep, story: { status: storyStatus, message: storyJob?.message ?? (blocked ? "stopped_after_failure" : "queued"), ...(storyConfirmed ? { storyId: storyJob!.storyId } : {}) }, highlight: { status: highlightStatus, message: storyJob?.message ?? (blocked ? "stopped_after_failure" : "queued"), ...(highlightStatus === "confirmed" ? { highlightId: storyJob!.highlightId } : {}) } },
    photoDispatchId: photo?.id ?? null, storyDispatchId: story?.id ?? null };
}
function available(state: State, sequence: ProfileSequence, now: number) {
  const b = state.browsers.find(b => b.id === sequence.target.browserId);
  if (state.credentialHash !== sequence.credentialHash || !b || b.delegation || !matches({ browserId: b.id, sessionId: b.sessionId, instagramUserId: b.instagramUserId }, sequence.target) || !b.available || now - Date.parse(b.lastSeenAt) > READY_MS || b.capabilities?.photoProof !== 1) fail("sequence_identity_changed", "A identidade da sequência não está mais disponível.", 409);
}
export async function profileSequenceOverview(bucket: R2Bucket, owner: string, now = Date.now()) {
  const state = await readState(bucket, owner); expire(state, now);
  return { protocol: PROFILE_SEQUENCE_PROTOCOL, sequences: (state.profileSequences ?? []).map(s => view(state, s)), pollAfterMs: 5000 };
}
export async function createProfileSequence(bucket: R2Bucket, owner: string, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["requestId", "target", "imageId", "templateId"]);
  const requestId = uuid(body.requestId), target = exactTarget(body.target), imageId = uuid(body.imageId), templateId = uuid(body.templateId);
  const fingerprint = await digestToken(JSON.stringify({ target, imageId, templateId }));
  return mutate(bucket, owner, state => {
    expire(state, now);
    const existing = state.profileSequences?.find(s => s.requestId === requestId);
    if (existing) { if (existing.fingerprint !== fingerprint) fail("idempotency_conflict", "Solicitação já usada com outros dados.", 409); return view(state, existing); }
    const template = state.templates.find(t => t.id === templateId);
    if (!template || !state.profileImages?.some(i => i.id === imageId)) fail("not_found", "Conteúdo não encontrado neste workspace.", 404);
    const sequence: ProfileSequence = { id: crypto.randomUUID(), requestId, fingerprint, createdAt: new Date(now).toISOString(), target, imageId, templateId, templateSnapshot: JSON.stringify(template), credentialHash: state.credentialHash, photoRequestId: crypto.randomUUID(), storyRequestId: crypto.randomUUID() };
    available(state, sequence, now);
    if ((state.profileSequences ?? []).some(s => s.target.instagramUserId === target.instagramUserId && view(state, s).status === "waiting")) fail("browser_busy", "Já existe uma sequência pendente para esta conta.", 409);
    (state.profileSequences ??= []).push(sequence);
    return view(state, sequence); // Preparing an intent does not queue any effects.
  });
}
export async function advanceProfileSequence(bucket: R2Bucket, owner: string, input: unknown, now = Date.now()) {
  const body = record(input); onlyKeys(body, ["sequenceId", "target"]);
  const sequenceId = uuid(body.sequenceId), target = exactTarget(body.target), state = await readState(bucket, owner); expire(state, now);
  const sequence = state.profileSequences?.find(s => s.id === sequenceId);
  if (!sequence) fail("not_found", "Sequência não encontrada.", 404);
  if (!matches(sequence.target, target)) fail("sequence_identity_changed", "Alvo diferente da sequência original.", 409);
  const { photoJob, storyJob } = sourceJobs(state, sequence);
  // Terminal results are returned even offline. They never create a replacement dispatch.
  if (storyJob || ["stopped", "partial", "completed"].includes(view(state, sequence).status)) return view(state, sequence);
  available(state, sequence, now);
  if (!photoJob) {
    await createSetup(bucket, owner, { requestId: sequence.photoRequestId, targets: [target], actions: { photo: { imageId: sequence.imageId } } }, now, current => available(current, sequence, now));
  } else if (photoJob.steps.photo?.status === "confirmed" && photoJob.steps.photo.proof?.version === 1) {
    await publish(bucket, owner, { requestId: sequence.storyRequestId, templateId: sequence.templateId, targets: [target] }, now, undefined, current => {
      available(current, sequence, now);
      const { photo, photoJob: confirmed } = sourceJobs(current, sequence);
      if (confirmed?.steps.photo?.status !== "confirmed" || confirmed.steps.photo.proof?.version !== 1) fail("sequence_photo_unconfirmed", "Foto não confirmada.", 409);
      const position = current.profileSetups!.indexOf(photo!);
      if (current.profileSetups!.slice(position + 1).some(d => d.actions.photo && d.jobs.some(j => j.instagramUserId === target.instagramUserId))) fail("sequence_photo_changed", "Outra operação de foto exige nova conferência.", 409);
      if (JSON.stringify(current.templates.find(t => t.id === sequence.templateId)) !== sequence.templateSnapshot) fail("sequence_template_changed", "O template mudou depois da revisão.", 409);
    });
  }
  const current = await readState(bucket, owner); expire(current, now);
  return view(current, current.profileSequences!.find(s => s.id === sequenceId)!);
}
