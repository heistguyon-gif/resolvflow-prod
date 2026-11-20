import { MailError, MAIL_ROOT } from "./cloud-mail";

export const canManageMail = (email: string) => email.trim().toLowerCase() === "lucasbgn.affiliate@gmail.com";
type Packed = { ciphertext: string; iv: string };
type Codec = { encrypt(text: string): Promise<Packed>; decrypt(ciphertext: string, iv: string): Promise<string> };
type Entry = { archived: boolean; changedAt: string };
type Receipt = { requestId: string; fingerprint: string; action: "archive" | "restore"; count: number; at: string };
type State = { version: 1; entries: Record<string, Entry>; receipts: Receipt[] };
function fail(code: string, status = 409): never { throw new MailError(code, status); }
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");

// Presentation preferences only. Never changes mailbox credentials, history,
// availability, reservations, or the bot's inventory/snapshot contracts.
export function createMailOrganization(bucket: R2Bucket, codec: Codec, inventory: () => Promise<{ id: string; email: string }[]>, now = Date.now, root = MAIL_ROOT) {
  const key = async (actor: string) => {
    if (!canManageMail(actor)) fail("organization_forbidden", 403);
    return root + "organization/" + await hash(actor.trim().toLowerCase()) + ".json";
  };
  async function read(path: string) {
    const object = await bucket.get(path);
    if (!object) return { state: { version: 1, entries: {}, receipts: [] } as State, etag: undefined };
    const packed = await object.json<Packed>();
    const state = JSON.parse(await codec.decrypt(packed.ciphertext, packed.iv)) as State;
    if (state.version !== 1 || !state.entries || Array.isArray(state.entries) || !Array.isArray(state.receipts)) fail("organization_invalid");
    return { state, etag: object.etag };
  }
  return {
    async view(actor: string) {
      const { state } = await read(await key(actor));
      return { enabled: true, deletionReady: false, entries: state.entries };
    },
    async apply(actor: string, input: unknown) {
      const path = await key(actor);
      if (!input || typeof input !== "object" || Array.isArray(input)) fail("organization_invalid", 400);
      const body = input as Record<string, unknown>;
      if (Object.keys(body).some(k => !["requestId", "operation", "accountIds"].includes(k))
        || typeof body.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)
        || !["archive", "restore"].includes(body.operation as string) || !Array.isArray(body.accountIds)
        || !body.accountIds.length || body.accountIds.length > 200 || body.accountIds.some(id => typeof id !== "string" || !/^[a-f0-9]{32}$/i.test(id))
        || new Set(body.accountIds).size !== body.accountIds.length) fail("organization_invalid", 400);
      const ids = [...body.accountIds as string[]].sort(), operation = body.operation as "archive" | "restore", requestId = body.requestId.toLowerCase();
      const fingerprint = await hash(JSON.stringify([operation, ids]));
      const known = new Set((await inventory()).map(a => a.id));
      if (ids.some(id => !known.has(id))) fail("mail_not_found", 404);
      for (let attempt = 0; attempt < 8; attempt++) {
        const { state, etag } = await read(path), previous = state.receipts.find(r => r.requestId === requestId);
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail("organization_conflict");
          return { ...previous, replayed: true };
        }
        if (state.receipts.length >= 1000) fail("organization_capacity");
        const at = new Date(now()).toISOString();
        for (const id of ids) state.entries[id] = { archived: operation === "archive", changedAt: at };
        const receipt: Receipt = { requestId, fingerprint, action: operation, count: ids.length, at };
        state.receipts.push(receipt);
        const plaintext = JSON.stringify(state);
        if (new TextEncoder().encode(plaintext).length > 512000) fail("organization_capacity");
        const packed = await codec.encrypt(plaintext);
        const result = await bucket.put(path, JSON.stringify(packed), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
        if (result) return { ...receipt, replayed: false };
      }
      fail("mail_busy");
    },
  };
}
