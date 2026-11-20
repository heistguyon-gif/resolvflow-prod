import { MailError, MAIL_ROOT } from "./cloud-mail";
import { canManageMail } from "./cloud-mail-organization";

type Packed = { ciphertext: string; iv: string };
type Codec = { encrypt(text: string): Promise<Packed>; decrypt(ciphertext: string, iv: string): Promise<string> };
type Catalog = { version: 1; accounts: { id: string; email: string }[] };
type RecordData = { email: string; history: unknown[]; lockUntil: number; deletion?: string; [key: string]: unknown };
type Tombstone = { version: 1; requestId: string; fingerprint: string; accountId: string; status: "pending" | "completed"; at: string };
// Trusted backend port only, never a confirmation supplied by the browser.
// acquire must durably bar all bot reservations/claims for this ID, including
// stale inventories; refuse pending/uncertain usage or unknown coverage.
export type MailDeletionGuard = {
  acquire(input: { accountId: string; requestId: string }): Promise<unknown>;
  verify(lease: unknown): Promise<void>;
  complete(lease: unknown): Promise<void>;
};
function fail(code: string, status = 409): never { throw new MailError(code, status); }
const hash = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, "0")).join("");

export function createMailDeletion(bucket: R2Bucket, codec: Codec, guard?: MailDeletionGuard, now = Date.now, root = MAIL_ROOT) {
  const read = async <T,>(key: string) => {
    const object = await bucket.get(root + key);
    if (!object) return null;
    const packed = await object.json<Packed>();
    return { value: JSON.parse(await codec.decrypt(packed.ciphertext, packed.iv)) as T, etag: object.etag };
  };
  const write = async (key: string, value: unknown, etag?: string) => {
    const packed = await codec.encrypt(JSON.stringify(value));
    const result = await bucket.put(root + key, JSON.stringify(packed), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
    if (!result) fail("mail_busy");
    return result.etag;
  };
  return {
    ready: Boolean(guard),
    async preview(actor: string, accountId: string) {
      if (!canManageMail(actor)) fail("organization_forbidden", 403);
      if (!/^[a-f0-9]{32}$/i.test(accountId)) fail("organization_invalid", 400);
      const catalog = await read<Catalog>("catalog.json"), account = catalog?.value.accounts.find(a => a.id === accountId);
      if (!account) fail("mail_not_found", 404);
      const record = await read<RecordData>(`accounts/${accountId}.json`);
      if (!record) fail("mail_not_found", 404);
      return { accountId, email: account!.email, messages: record!.value.history.length, deletionReady: Boolean(guard), blockedReason: guard ? null : "deletion_guard_required" };
    },
    async remove(actor: string, input: unknown) {
      if (!canManageMail(actor)) fail("organization_forbidden", 403);
      if (!input || typeof input !== "object" || Array.isArray(input)) fail("organization_invalid", 400);
      const body = input as Record<string, unknown>;
      if (Object.keys(body).some(k => !["accountId", "requestId", "confirmEmail"].includes(k))
        || typeof body.accountId !== "string" || !/^[a-f0-9]{32}$/i.test(body.accountId)
        || typeof body.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)
        || typeof body.confirmEmail !== "string" || body.confirmEmail.length > 254) fail("organization_invalid", 400);
      if (!guard) fail("deletion_guard_required");
      const id = body.accountId, requestId = body.requestId.toLowerCase(), email = body.confirmEmail;
      const fingerprint = await hash(JSON.stringify([actor.trim().toLowerCase(), id, email.toLowerCase()]));
      const tombKey = `deletions/${id}.json`, accountKey = `accounts/${id}.json`;
      let tomb = await read<Tombstone>(tombKey);
      if (tomb && (tomb.value.requestId !== requestId || tomb.value.fingerprint !== fingerprint)) fail("organization_conflict");
      if (tomb?.value.status === "completed") return { removed: true, replayed: true };
      const record = await read<RecordData>(accountKey);
      if (!tomb) {
        const catalog = await read<Catalog>("catalog.json"), account = catalog?.value.accounts.find(a => a.id === id);
        if (!account || !record) fail("mail_not_found", 404);
        if (account!.email.toLowerCase() !== email.toLowerCase() || record!.value.email.toLowerCase() !== email.toLowerCase()) fail("deletion_confirmation", 400);
      }
      if (record && record.value.lockUntil > now()) fail("mail_busy");
      const lease = await guard.acquire({ accountId: id, requestId });
      await guard.verify(lease);
      if (!tomb) {
        const pending: Tombstone = { version: 1, accountId: id, requestId, fingerprint, status: "pending", at: new Date(now()).toISOString() };
        const etag = await write(tombKey, pending); tomb = { value: pending, etag };
      }
      // Freeze through the same CAS used by mailbox reads. Never erase a token
      // rotated or a snapshot lease acquired by a competing reader.
      if (record && record.value.deletion !== requestId) {
        await write(accountKey, { ...record.value, deletion: requestId }, record.etag);
      }
      await guard.verify(lease);
      for (let attempt = 0; attempt < 8; attempt++) {
        const catalog = await read<Catalog>("catalog.json");
        if (!catalog || !catalog.value.accounts.some(a => a.id === id)) break;
        try {
          await write("catalog.json", { ...catalog.value, accounts: catalog.value.accounts.filter(a => a.id !== id) }, catalog.etag);
          break;
        } catch (e) { if (!(e instanceof MailError) || e.code !== "mail_busy" || attempt === 7) throw e; }
      }
      await guard.verify(lease);
      await bucket.delete(root + accountKey);
      // Local bot barrier is not released on failures/timeouts. Completion must
      // keep the old ID permanently inadmissible; history there is not rewritten.
      await guard.complete(lease);
      await write(tombKey, { ...tomb.value, status: "completed" }, tomb.etag);
      return { removed: true, replayed: false };
    },
  };
}
