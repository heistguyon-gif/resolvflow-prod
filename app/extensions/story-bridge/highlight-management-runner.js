export const HIGHLIGHT_MANAGEMENT_CAPABILITIES = Object.freeze({ highlightManagement: 1 });
export const HIGHLIGHT_MANAGEMENT_JOURNAL = "resolvHighlightManagementJournal";
export const HIGHLIGHT_DELETE_INTENTS = "resolvHighlightDeleteIntents";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID = /^highlight:\d{1,100}$/;
const sameTarget = (a, b) => a.browserId === b.browserId && a.sessionId === b.sessionId && a.instagramUserId === b.instagramUserId;

export function validateHighlightManagementCommand(command, context) {
  if (!command || command.kind !== "highlight_management" || !UUID.test(command.id || "") || !UUID.test(command.requestId || "") || !["list", "delete"].includes(command.action) || !sameTarget(command, context) || !/^\d{1,30}$/.test(command.instagramUserId || "")) throw Error("Invalid highlight command");
  if (command.action === "delete" && (!ID.test(command.highlightId || "") || typeof command.highlightTitle !== "string" || command.highlightTitle.length > 1024)) throw Error("Invalid highlight selection");
}

export function completeHighlightList(value, owner) {
  if (value?.status !== "completed" || value.complete !== true || value.ownerInstagramUserId !== owner || !Array.isArray(value.highlights) || value.highlights.length > 500) throw Error("Incomplete highlight list");
  const seen = new Set();
  const highlights = value.highlights.map(row => {
    if (!row || typeof row.id !== "string" || !ID.test(row.id) || typeof row.title !== "string" || row.title.length > 1024 || seen.has(row.id)) throw Error("Invalid highlight list");
    seen.add(row.id); return { id: row.id, title: row.title };
  });
  if (JSON.stringify(highlights).length > 262144) throw Error("Oversized highlight list");
  return { complete: true, ownerInstagramUserId: owner, highlights };
}

function receiptFor(record) {
  const value = record.result;
  if (!value || !["completed", "failed", "uncertain"].includes(value.status)) throw Error("Invalid management receipt");
  if (value.status === "completed") {
    if (record.action === "list") return { status: "completed", message: "listed", ...completeHighlightList(value, record.instagramUserId) };
    if (value.highlightId !== record.highlightId || value.ownerInstagramUserId !== record.instagramUserId || value.deleted !== true || value.absentFromCompleteList !== true) throw Error("Invalid deletion receipt");
    return { status: "completed", message: "deleted", highlightId: record.highlightId, ownerInstagramUserId: record.instagramUserId, deleted: true, absentFromCompleteList: true };
  }
  const message = value.status === "uncertain" ? "execution_uncertain" : value.message === "identity_changed" ? "identity_changed" : record.action === "delete" ? "delete_failed" : "read_failed";
  return { status: value.status, message };
}

// Single worker flight + durable per-delete receipts. Lists never clear uncertain intents.
export function createHighlightManagementRunner({ storage, identity, session, request, prepare, now = () => new Date().toISOString() }) {
  let flight = null;
  const save = record => storage.set({ [HIGHLIGHT_MANAGEMENT_JOURNAL]: record });
  async function intents() {
    const value = (await storage.get(HIGHLIGHT_DELETE_INTENTS))[HIGHLIGHT_DELETE_INTENTS];
    if (value === undefined) return { version: 1, entries: [] };
    if (!value || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 500 || value.entries.some(row => !UUID.test(row.jobId || "") || !ID.test(row.highlightId || "") || !/^\d{1,30}$/.test(row.instagramUserId || "") || !["in_flight", "uncertain", "completed", "no_effect"].includes(row.state))) throw Error("Invalid deletion journal");
    return value;
  }
  async function acknowledge(record) {
    if (!UUID.test(record.jobId || "") || !UUID.test(record.requestId || "") || !UUID.test(record.browserId || "") || !UUID.test(record.sessionId || "") || !/^\d{1,30}$/.test(record.instagramUserId || "") || !["list", "delete"].includes(record.action)) throw Error("Invalid receipt identity");
    const result = receiptFor(record);
    try { await request({ type: "highlight_result", browserId: record.browserId, sessionId: record.sessionId, jobId: record.jobId, instagramUserId: record.instagramUserId, ...result }); }
    catch (error) { if (![404, 409].includes(error?.status)) throw error; }
    await save({ ...record, result, acknowledged: true });
  }
  async function recover() {
    const record = (await storage.get(HIGHLIGHT_MANAGEMENT_JOURNAL))[HIGHLIGHT_MANAGEMENT_JOURNAL];
    if (!record || record.acknowledged) return;
    if (!record.result) record.result = record.action === "delete" && record.phase === "deleting"
      ? { status: "uncertain", message: "execution_uncertain" }
      : { status: "failed", message: record.action === "delete" ? "delete_failed" : "read_failed" };
    await save(record); await acknowledge(record);
  }
  async function execute(command, context) {
    // A foreign/malformed command must not even overwrite or acknowledge this
    // profile's journal under somebody else's operation identity.
    validateHighlightManagementCommand(command, context);
    await recover();
    const previous = (await storage.get(HIGHLIGHT_MANAGEMENT_JOURNAL))[HIGHLIGHT_MANAGEMENT_JOURNAL];
    if (previous?.jobId === command?.id) {
      if (!sameTarget(previous, context) || previous.requestId !== command.requestId || previous.action !== command.action || previous.highlightId !== command.highlightId || previous.highlightTitle !== command.highlightTitle) return;
      if (previous.result) await acknowledge(previous);
      return;
    }
    let record = { jobId: command?.id, requestId: command?.requestId, action: command?.action, ...context, ...(command?.action === "delete" ? { highlightId: command.highlightId, highlightTitle: command.highlightTitle } : {}), phase: "preparing", updatedAt: now(), acknowledged: false };
    let port, deleteIntent;
    const checkpoint = async fields => { record = { ...record, ...fields, updatedAt: now() }; await save(record); };
    try {
      const checkIdentity = async () => {
        const actual = await identity(), logged = await session();
        if (actual.browserId !== context.browserId || actual.sessionId !== context.sessionId || !logged.available || logged.id !== command.instagramUserId) throw Object.assign(Error("Identity changed"), { code: "identity_changed" });
      };
      await checkIdentity(); await save(record);
      if (command.action === "delete") {
        const journal = await intents(), old = journal.entries.find(row => row.jobId === command.id);
        if (old) {
          if (!sameTarget(old, context) || old.requestId !== command.requestId || old.highlightId !== command.highlightId || old.highlightTitle !== command.highlightTitle) throw Error("Intent conflict");
          await checkpoint({ result: old.result || { status: "uncertain", message: "execution_uncertain" } });
          await acknowledge(record); return;
        }
        // An uncertain/in-flight/confirmed delete for this exact immutable ID is never replayed under a new job.
        if (journal.entries.some(row => row.instagramUserId === command.instagramUserId && row.highlightId === command.highlightId && row.state !== "no_effect")) {
          await checkpoint({ result: { status: "uncertain", message: "execution_uncertain" } }); await acknowledge(record); return;
        }
        if (journal.entries.length >= 500) throw Error("Deletion journal capacity");
      }
      port = await prepare(command.instagramUserId);
      await checkIdentity();
      const list = completeHighlightList(await port.list(), command.instagramUserId);
      if (command.action === "list") await checkpoint({ result: { status: "completed", message: "listed", ...list } });
      else {
        const selected = list.highlights.find(row => row.id === command.highlightId);
        if (!selected || selected.title !== command.highlightTitle) throw Error("Selection changed");
        await checkIdentity();
        deleteIntent = { jobId: command.id, requestId: command.requestId, ...context, highlightId: command.highlightId, highlightTitle: command.highlightTitle, nonce: crypto.randomUUID(), state: "in_flight", updatedAt: now() };
        const journal = await intents();
        if (journal.entries.some(row => row.jobId === command.id || row.instagramUserId === command.instagramUserId && row.highlightId === command.highlightId && row.state !== "no_effect") || journal.entries.length >= 500) throw Error("Intent conflict");
        journal.entries.push(deleteIntent); await storage.set({ [HIGHLIGHT_DELETE_INTENTS]: journal });
        if ((await intents()).entries.find(row => row.jobId === command.id)?.nonce !== deleteIntent.nonce) throw Error("Intent lost");
        await checkpoint({ phase: "deleting" });
        await checkIdentity();
        const result = await port.deleteHighlight({ highlightId: command.highlightId, highlightTitle: command.highlightTitle });
        const confirmed = result?.status === "completed" && result.ownerInstagramUserId === command.instagramUserId && result.highlightId === command.highlightId && result.deleted === true && result.absentFromCompleteList === true;
        const noEffect = result?.status === "failed" && result.effectAttempted === false;
        const receipt = confirmed ? { status: "completed", message: "deleted", highlightId: command.highlightId, ownerInstagramUserId: command.instagramUserId, deleted: true, absentFromCompleteList: true }
          : noEffect ? { status: "failed", message: "delete_failed" } : { status: "uncertain", message: "execution_uncertain" };
        const stored = await intents(), row = stored.entries.find(row => row.jobId === command.id);
        if (!row || row.nonce !== deleteIntent.nonce) throw Error("Intent lost");
        Object.assign(row, { state: confirmed ? "completed" : noEffect ? "no_effect" : "uncertain", result: receipt, updatedAt: now() });
        await storage.set({ [HIGHLIGHT_DELETE_INTENTS]: stored });
        await checkpoint({ result: receipt });
      }
    } catch (error) {
      const uncertain = record.phase === "deleting" || Boolean(deleteIntent);
      await checkpoint({ result: { status: uncertain ? "uncertain" : "failed", message: uncertain ? "execution_uncertain" : error?.code === "identity_changed" ? "identity_changed" : command?.action === "delete" ? "delete_failed" : "read_failed" } });
    } finally { await port?.dispose().catch(() => {}); }
    await acknowledge(record);
  }
  return {
    async recover() { if (!flight) await recover(); },
    run(command, context) { if (!flight) flight = execute(command, context).finally(() => { flight = null; }); return flight; },
  };
}
