export const PROFILE_JOURNAL_KEY = "resolvProfileSetupJournal";
export const PROFILE_CAPABILITIES = { profileSetup: 1, bio: true, photo: true, photoProof: 1 };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const names = ["bio", "photo"];
const codes = ["session_changed", "challenge_detected", "profile_form_unknown", "profile_tab_timeout", "profile_origin_mismatch", "profile_manual_review_tab_open", "bio_save_unconfirmed", "photo_confirmation_unavailable", "photo_control_unavailable", "image_failed"];
const keys = (value, allowed) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));

export function validateProfileCommand(command, sessionId, instagramUserId) {
  if (!keys(command, ["kind", "id", "dispatchId", "browserId", "sessionId", "instagramUserId", "actions", "steps"]) || command.kind !== "profile_setup" || !UUID.test(command.id) || !UUID.test(command.dispatchId) || command.sessionId !== sessionId || command.instagramUserId !== instagramUserId || !/^\d{1,30}$/.test(instagramUserId)) throw new Error("invalid_command");
  if (!keys(command.actions, names) || !Object.keys(command.actions).length || !keys(command.steps, names)) throw new Error("invalid_command");
  for (const name of names) {
    const action = command.actions[name], step = command.steps[name];
    if (!action) { if (step) throw new Error("invalid_command"); continue; }
    if (!keys(step, ["status", "message"]) || !["pending", "confirmed"].includes(step.status)) throw new Error("invalid_command");
    if (name === "bio" && (!keys(action, ["text"]) || typeof action.text !== "string" || [...action.text].length > 150 || [...action.text].some(char => { const code = char.codePointAt(0); return code < 32 && ![9, 10, 13].includes(code) || code === 127; }))) throw new Error("invalid_command");
    if (name === "photo" && (!keys(action, ["imageId"]) || !UUID.test(action.imageId))) throw new Error("invalid_command");
  }
  return command;
}

export function createProfileRunner({ storage, request, session, applyBio, applyPhoto, identity: currentIdentity }) {
  let flight;
  const save = record => storage.set({ [PROFILE_JOURNAL_KEY]: record });
  const envelope = record => ({ browserId: record.browserId, sessionId: record.sessionId, instagramUserId: record.instagramUserId, jobId: record.jobId });
  const terminal = error => [400, 401, 404, 409].includes(error?.status);
  async function report(record) {
    if (!record.report) return;
    try { await request({ type: "setup_stage", ...envelope(record), ...record.report }); }
    catch (error) { if (!terminal(error)) throw error; }
    delete record.report; await save(record);
  }
  async function interrupt(record) {
    try { await request({ type: "setup_interrupt", ...envelope(record) }); }
    catch (error) { if (!terminal(error)) throw error; }
    record.acknowledged = true; await save(record);
  }
  async function recover() {
    const previous = (await storage.get(PROFILE_JOURNAL_KEY))[PROFILE_JOURNAL_KEY];
    if (!previous || previous.acknowledged) return;
    if (!previous.report && previous.stage) previous.report = { step: previous.stage, status: "uncertain", message: "execution_uncertain" };
    await save(previous); await report(previous); await interrupt(previous);
  }
  async function execute(command, identity) {
    const previous = (await storage.get(PROFILE_JOURNAL_KEY))[PROFILE_JOURNAL_KEY];
    if (previous?.jobId === command?.id) { await recover(); return; }
    const record = { ...identity, jobId: command.id, instagramUserId: command.instagramUserId, acknowledged: false, stage: null };
    await save(record);
    try { validateProfileCommand(command, identity.sessionId, identity.instagramUserId); if (command.browserId !== undefined && command.browserId !== identity.browserId) throw new Error("invalid_command"); }
    catch { await interrupt(record); return; }
    let sessionKey;
    const ensureIdentity = async () => {
      if (currentIdentity) { const current = await currentIdentity(); if (current.browserId !== identity.browserId || current.sessionId !== identity.sessionId) throw Object.assign(new Error("session_changed"), { code: "session_changed", beforeEffect: true }); }
      const logged = await session();
      if (sessionKey === undefined) sessionKey = logged.sessionKey;
      if (!logged.available || logged.id !== command.instagramUserId || logged.sessionKey !== sessionKey) throw Object.assign(new Error("session_changed"), { code: "session_changed", beforeEffect: true });
    };
    for (const name of names) {
      if (!command.actions[name] || command.steps[name].status === "confirmed") continue;
      record.stage = name; await save(record); // Durable before asking for the effect lease.
      try {
        await ensureIdentity();
        const permit = await request({ type: "setup_stage", ...envelope(record), step: name, status: "running", message: "running" });
        if (permit?.status !== "claimed") throw Object.assign(new Error("session_changed"), { code: "session_changed", beforeEffect: true });
        await ensureIdentity();
        let result;
        if (name === "bio") result = await applyBio({ text: command.actions.bio.text, ensureIdentity });
        else {
          const image = await request({ type: "setup_image", ...envelope(record), step: "photo" }, true);
          await ensureIdentity(); result = await applyPhoto({ image, ensureIdentity, imageId: command.actions.photo.imageId, instagramUserId: command.instagramUserId });
        }
        try { await ensureIdentity(); } catch (error) { error.beforeEffect = false; throw error; }
        const confirmed = result?.status === "confirmed" && (name === "bio" ? result.proof?.identityMatched === true && result.proof.afterReload === true && result.proof.textMatched === true : validPhotoProof(result.proof, command.actions.photo.imageId, command.instagramUserId));
        record.report = { step: name, status: confirmed ? "confirmed" : "uncertain", message: confirmed ? "confirmed" : result?.tabOpen === true && result.message === "profile_manual_review_tab_open" ? "profile_manual_review_tab_open" : name === "photo" ? "photo_confirmation_unavailable" : "bio_save_unconfirmed", ...(confirmed ? { proof: name === "photo" ? result.proof : { identityMatched: true, afterReload: true, textMatched: true } } : {}) };
      } catch (error) {
        const code = codes.includes(error?.code) ? error.code : "execution_uncertain";
        record.report = { step: name, status: error?.beforeEffect === true ? "failed" : "uncertain", message: code };
      }
      await save(record); const status = record.report.status;
      await report(record); record.stage = null; await save(record);
      if (status !== "confirmed") break;
    }
    await interrupt(record);
  }
  return {
    recover,
    run(command, identity) { if (!flight) flight = execute(command, identity).finally(() => { flight = null; }); return flight; },
  };
}

export function validPhotoProof(proof, imageId, instagramUserId) {
  return keys(proof, ["version", "imageId", "imageSha256", "instagramUserId", "identityMatched", "afterReload", "pixelsMatched", "expectedPixels", "avatarPixels"]) && proof.version === 1 && proof.imageId === imageId && proof.instagramUserId === instagramUserId && proof.identityMatched === true && proof.afterReload === true && proof.pixelsMatched === true && /^[a-f0-9]{64}$/.test(proof.imageSha256) && /^[a-f0-9]{64}$/.test(proof.expectedPixels) && proof.expectedPixels === proof.avatarPixels;
}
