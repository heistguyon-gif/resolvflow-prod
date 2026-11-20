// A grant belongs to an authenticated actor in one workspace. No credentials or
// purchase data are kept here. Change and history are committed by the same CAS.
export const gmailPilotKey = (owner: string, actor: string) => `feature-access/gmail-central/v1/${encodeURIComponent(owner)}/${encodeURIComponent(actor)}.json`;
type Change = { requestId: string; enabled: boolean; at: string; actorEmail: string };
export type GmailPilotAccess = { version: 1; enabled: boolean; history: Change[] };
export async function readGmailPilotAccess(bucket: R2Bucket, owner: string, actor: string): Promise<GmailPilotAccess> {
  const object = await bucket.get(gmailPilotKey(owner, actor));
  if (!object) return { version: 1, enabled: false, history: [] };
  const state = await object.json<GmailPilotAccess>();
  if (state.version !== 1 || typeof state.enabled !== "boolean" || !Array.isArray(state.history)) throw new Error("Configuração de acesso inválida.");
  return state;
}
export async function setGmailPilotAccess(bucket: R2Bucket, owner: string, actor: string, enabled: boolean, actorEmail: string, requestId: string) {
  const key = gmailPilotKey(owner, actor);
  for (let attempt = 0; attempt < 8; attempt++) {
    const object = await bucket.get(key);
    const state: GmailPilotAccess = object ? await object.json<GmailPilotAccess>() : { version: 1, enabled: false, history: [] };
    if (state.version !== 1 || typeof state.enabled !== "boolean" || !Array.isArray(state.history)) throw new Error("Configuração de acesso inválida.");
    const old = state.history.find(item => item.requestId === requestId);
    if (old) {
      if (old.enabled !== enabled || old.actorEmail !== actorEmail) throw new Error("Esta solicitação já foi usada com outros valores.");
      return state;
    }
    if (state.history.length >= 2000) throw new Error("Histórico de acesso atingiu o limite. Nenhum registro foi removido.");
    state.enabled = enabled;
    state.history.push({ requestId, enabled, actorEmail, at: new Date().toISOString() });
    const written = await bucket.put(key, JSON.stringify(state), { onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
    if (written) return state;
  }
  throw new Error("O acesso está sendo atualizado. Tente novamente.");
}
