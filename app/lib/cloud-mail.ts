import { sortMailEvents } from "./cloud-mail-chronology";
import { validateMixotpUrl, readMixotpCode, MixotpReadError } from "./cloud-mail-mixotp";
import { hasCompleteMailImport, matchesMailExportFilter, type MailExportFilter, type MailExportRow, type MailPackageMessage } from "./cloud-mail-export-format";
// Private reader partitioned by authenticated login. All Microsoft credentials and message history are
// encrypted at rest. No arbitrary URLs, mail writes, or account deletion API.
export { MAIL_READERS, canReadCloudMail } from "./cloud-mail-access";
export class MailError extends Error { constructor(public code: string, public status = 409, public wait?: number) { super(code); } }
export const MAIL_ROOT = "private-mail-reader/v1/";
// Server-owned mapping: neither workspace IDs nor request fields select storage.
export function mailRootForLogin(email: string) {
  const login = email.trim().toLowerCase();
  if (login === "lucasbgn.affiliate@gmail.com") return MAIL_ROOT;
  if (login === "wendelmarques167@gmail.com") return "private-mail-reader/logins/wendel/v1/";
  if (login === "henriquerbrandao06@gmail.com") return "private-mail-reader/logins/henrique/v1/";
  if (login === "soaresyago-_-@hotmail.com") return "private-mail-reader/logins/yago/v1/";
  throw new MailError("organization_forbidden", 403);
}
type Packed = { ciphertext: string; iv: string };
type Credentials = { id: string; email: string; refresh?: string; client?: string; source?: "microsoft_graph" | "mixotp"; mixotpUrl?: string; importFields?: string[] };
export type MailMessage = { id: string; receivedAt: string; observedAt?: string; sender: string; subject: string; text?: string; folder: string; code: string | null };
const metadata = (m: MailMessage) => ({ id: m.id, receivedAt: m.receivedAt, ...(m.observedAt ? { observedAt: m.observedAt } : {}), sender: m.sender, subject: m.subject, folder: m.folder, code: m.code });
type RecordState = Credentials & { version: 1; status: string; checked: string | null; historyObservedAt?: string; cooldown: number; lockUntil: number; lock: string | null; history: MailMessage[]; recent: MailMessage[]; deletion?: string; access?: string; expires?: number; diagnostic?: { stage: string; kind: string } };
type Catalog = { version: 1; accounts: { id: string; email: string }[] };
type Codec = { encrypt: (text: string) => Promise<Packed>; decrypt: (ciphertext: string, iv: string) => Promise<string> };
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{32}$/i.test(id);
const validEmail = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(s);
const fail = (code: string, status = 409): never => { throw new MailError(code, status); };
export function storedMailHistoryStats(state: Pick<RecordState, 'history' | 'status' | 'checked' | 'historyObservedAt'>) {
  const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const historyObservedAt = timestamp(state.historyObservedAt) ?? (state.status === 'ok' ? timestamp(state.checked) : null);
  if (!Array.isArray(state.history) || state.history.some(message => !message || typeof message.id !== 'string' || !message.id))
    return { codeMessageCount: null, historyObservedAt: null };
  if (!state.history.length && !historyObservedAt) return { codeMessageCount: null, historyObservedAt: null };
  const ids = new Set(state.history.filter(message => typeof message.code === 'string' && /^\d{6}$/.test(message.code)).map(message => message.id));
  return { codeMessageCount: ids.size, historyObservedAt };
}
export function mailRetryAfterSeconds(value: string | null, now: number) {
  const numeric = value?.trim() && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const seconds = Number.isFinite(numeric) ? numeric : value && Number.isFinite(Date.parse(value)) ? Math.ceil((Date.parse(value) - now) / 1000) : 60;
  return Math.min(86400, Math.max(30, Math.ceil(seconds)));
}
export function parseMailImport(text: string): Credentials[] {
  const seen = new Set<string>();
  const rows = text.split(/\r?\n/).filter(s => s.trim()).map(line => {
    // Pipe-delimited Microsoft credentials take precedence: passwords and
    // tokens may contain the provider separator. Split provider lines only at
    // their first email/URL boundary; base64url signatures may also contain it.
    const separator = line.indexOf("----");
    if (!line.includes("|") && separator >= 0) {
      const address = line.slice(0, separator).trim();
      if (!validEmail(address)) fail("import_invalid", 400);
      const email = address.toLowerCase();
      if (seen.has(email)) fail("import_duplicate", 400);
      let mixotpUrl: string; try { mixotpUrl = validateMixotpUrl(line.slice(separator + 4).trim()); } catch { return fail("import_invalid", 400); }
      seen.add(email);
      return { id: crypto.randomUUID().replaceAll("-", ""), email, source: "mixotp" as const, mixotpUrl };
    }
    const fields = line.split("|").map(s => s.trim());
    if (fields.length !== 4 && fields.length !== 5) fail("import_invalid", 400);
    const [email, , refresh, client, recovery] = fields;
    if (!validEmail(email) || (fields.length === 5 && !validEmail(recovery)) || refresh.length < 80 || refresh.length > 8192 || !/^[a-f0-9-]{36}$/i.test(client)) fail("import_invalid", 400);
    const normalized = email.toLowerCase(); if (seen.has(normalized)) fail("import_duplicate", 400); seen.add(normalized);
    return { id: crypto.randomUUID().replaceAll("-", ""), email: normalized, refresh, client, importFields: line.split("|") };
  });
  if (!rows.length) fail("import_invalid", 400);
  return rows;
}
function textBody(value: unknown) {
  if (typeof value !== "string") return "";
  // Display uses React text nodes; never render message HTML. For code matching,
  // omit script/style tags and strip markup rather than executing it.
  return value.slice(0, 200000).replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}
export function cloudMailCode(sender: string, subject: string, text: string) {
  if (!/^[^@]+@(instagram\.com|mail\.instagram\.com|facebookmail\.com)$/i.test(sender)) return null;
  const joined = subject + " " + text; if (!/instagram/i.test(joined)) return null;
  const codes = new Set<string>();
  for (const m of joined.matchAll(/(?<![\w\d])\d{6}(?![\w\d])/g)) if (/code|c[oó]digo|security|seguran[çc]a|confirmation|confirma[çc][aã]o|verification|verifica[çc][aã]o/i.test(joined.slice(Math.max(0, m.index - 90), m.index + 96))) codes.add(m[0]);
  return codes.size === 1 ? [...codes][0] : null;
}
export function createCloudMail(bucket: R2Bucket, codec: Codec, fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init), now = Date.now, root = MAIL_ROOT) {
  async function read<T>(key: string) {
    const object = await bucket.get(root + key); if (!object) return null;
    const packed = await object.json<Packed>();
    return { value: JSON.parse(await codec.decrypt(packed.ciphertext, packed.iv)) as T, etag: object.etag };
  }
  async function write(key: string, value: unknown, etag?: string) {
    const packed = await codec.encrypt(JSON.stringify(value));
    const r = await bucket.put(root + key, JSON.stringify(packed), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
    if (!r) return fail("mail_busy"); return r.etag;
  }
  const path = (id: string) => { if (!validId(id)) fail("mail_invalid", 400); return `accounts/${id}.json`; };
  async function catalog() { return (await read<Catalog>("catalog.json"))?.value ?? { version: 1, accounts: [] }; }
  async function graphCatalog() {
    const rows = (await catalog()).accounts, result: typeof rows = [];
    for (const row of rows) { const record = await read<RecordState>(path(row.id)); if (record && record.value.source !== "mixotp") result.push(row); }
    return result;
  }
  async function registered(id: string) { if (!(await catalog()).accounts.some(a => a.id === id)) fail("mail_not_found", 404); return path(id); }
  const publicAccount = (id: string, email: string, s: RecordState) => ({ id, email, status: s.lockUntil > now() ? "reading" : s.status, checked: s.checked, messages: s.history.length, ...storedMailHistoryStats(s), source: s.source ?? "microsoft_graph", capabilities: { read: true, graphExport: s.source !== "mixotp", botBridge: s.source !== "mixotp" }, ...(s.diagnostic ? { diagnostic: s.diagnostic } : {}) });
  async function details(id: string) {
    const r = await read<RecordState>(await registered(id)); if (!r) return fail("mail_not_found", 404);
    return { account: publicAccount(id, r.value.email, r.value), messages: sortMailEvents(r.value.history.map(metadata), r.value.source) };
  }
  async function jsonFetch(url: string, init: RequestInit = {}) {
    // Workers supports manual/follow, not redirect:error. Never follow a redirect
    // with Microsoft credentials; reject its response explicitly instead.
    const r = await fetcher(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (r.status >= 300 && r.status < 400) { await r.body?.cancel(); fail("redirect_blocked", 502); }
    if (!r.ok) {
      if (r.status === 429 || r.status === 503) throw new MailError("throttle", 429, mailRetryAfterSeconds(r.headers.get("retry-after"), now()));
      if (url.startsWith("https://login.microsoftonline.com/")) {
        let code = ""; try { const body = await r.text(); if (body.length < 64000) code = String(JSON.parse(body).error ?? ""); } catch { /* sanitized below */ }
        fail(["invalid_client","unauthorized_client"].includes(code) ? "client" : ["invalid_scope","consent_required"].includes(code) ? "permission" : "auth", 502);
      }
      fail(r.status === 401 ? "auth" : r.status === 403 ? "permission" : "service", 502);
    }
    const bytes = new Uint8Array(await r.arrayBuffer()); if (bytes.byteLength > 8 * 1024 * 1024) fail("response_size", 502);
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail("service", 502); }
  }
  return {
    async importAccounts(rows: Credentials[], cached: Record<string, MailMessage[]> = {}) {
      if (!Array.isArray(rows) || !rows.length) fail("import_invalid", 400);
      const ids = new Set<string>(), emails = new Set<string>();
      for (const a of rows) {
        if (a.source === "mixotp") { try { validateMixotpUrl(a.mixotpUrl); } catch { fail("import_invalid",400); } if (a.refresh !== undefined || a.client !== undefined || a.importFields !== undefined) fail("import_invalid",400); }
        else if (a.source !== undefined && a.source !== "microsoft_graph") fail("import_invalid",400);
        if (!validId(a.id) || !validEmail(a.email) || (a.source !== "mixotp" && (typeof a.refresh !== "string" || a.refresh.length < 80 || a.refresh.length > 8192 || typeof a.client !== "string" || !/^[a-f0-9-]{36}$/i.test(a.client))) || ids.has(a.id) || emails.has(a.email.toLowerCase())) fail("import_invalid", 400);
        ids.add(a.id); emails.add(a.email.toLowerCase());
      }
      for (let n = 0; n < 8; n++) {
        const old = await read<Catalog>("catalog.json"), index = old?.value ?? { version: 1 as const, accounts: [] };
        let imported = 0;
        for (const a of rows) {
          const email = a.email.toLowerCase(), same = index.accounts.find(b => b.email === email);
          if (same) continue; // Never replace a rotated token by a stale import.
          // A deleted/frozen ID cannot be resurrected by an old migration file.
          // Re-importing the address intentionally creates a new inventory ID.
          if (await read(`deletions/${a.id}.json`)) fail("mail_deleting");
          if (index.accounts.some(b => b.id === a.id && b.email !== email)) fail("import_identity");
          const prior = await read<RecordState>(path(a.id));
          if (prior && prior.value.email !== email) fail("import_identity");
          if (!prior) {
            const history = cached[a.id] ?? [];
            if (!Array.isArray(history) || history.length > 2000) fail("import_history");
            try { await write(path(a.id), { ...a, email, version: 1, status: "ready", checked: null, cooldown: 0, lockUntil: 0, lock: null, history, recent: [] }); }
            catch (e) { const raced = await read<RecordState>(path(a.id)); if (!raced || raced.value.email !== email) throw e; }
          }
          index.accounts.push({ id: a.id, email }); imported++;
        }
        try { await write("catalog.json", index, old?.etag); return { imported, existing: rows.length - imported, total: index.accounts.length }; } catch (e) { if (!(e instanceof MailError) || e.code !== "mail_busy") throw e; }
      }
      return fail("mail_busy");
    },
    async inventory(graphOnly = false) { return graphOnly ? graphCatalog() : (await catalog()).accounts; },
    async exportRows(options: { mode: "all" | "selected"; accountIds?: string[]; filter: MailExportFilter; includeHistory?: boolean }) {
      const index = await read<Catalog>("catalog.json");
      const all = index?.value.accounts ?? [];
      const byId = new Map(all.map(row => [row.id, row]));
      const ids = options.mode === "all" ? all.map(row => row.id) : options.accountIds!;
      if (!ids.length) fail("export_empty", 409);
      if (new Set(ids).size !== ids.length || ids.some(id => !validId(id) || !byId.has(id))) fail("export_selection", 409);
      const rows: (MailExportRow | null)[] = Array(ids.length).fill(null);
      const versions: { key: string; etag: string }[] = [];
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (next < ids.length) {
          const position = next++, id = ids[position], key = path(id);
          const record = await read<RecordState>(key), expected = byId.get(id)!;
          if (!record || record.value.id !== id || record.value.email !== expected.email) fail("export_selection", 409);
          const state = record!.value;
          if (state.source === "mixotp") fail("export_source_unsupported", 409);
          if (state.deletion || state.lockUntil > now()) fail("mail_busy", 409);
          if (typeof state.refresh !== "string" || state.refresh.length < 80 || state.refresh.length > 8192 || /[|\r\n\0]/.test(state.refresh)
            || typeof state.client !== "string" || !/^[a-f0-9-]{36}$/i.test(state.client)) fail("export_selection", 409);
          versions.push({ key, etag: record!.etag });
          if (matchesMailExportFilter(storedMailHistoryStats(state).codeMessageCount, options.filter)) {
            const row: MailExportRow = { id, email: state.email, refresh: state.refresh!, client: state.client! };
            if (options.includeHistory) {
              if (!Array.isArray(state.history)) fail("export_history", 409);
              const messages = new Map<string, MailPackageMessage>();
              const nullableText = (value: unknown): string | null => value === null || value === undefined ? null : typeof value === "string" ? value : fail("export_history", 409);
              for (const message of state.history) {
                if (!message || typeof message.id !== "string" || !message.id) fail("export_history", 409);
                const receivedAt = nullableText(message.receivedAt);
                if (receivedAt && !Number.isFinite(Date.parse(receivedAt))) fail("export_history", 409);
                const item: MailPackageMessage = { id: message.id, receivedAt: receivedAt ? new Date(receivedAt).toISOString() : null,
                  sender: nullableText(message.sender), subject: nullableText(message.subject), folder: nullableText(message.folder), code: nullableText(message.code) };
                const previous = messages.get(item.id);
                // Retain known code evidence when duplicates also contain a null code,
                // matching storedMailHistoryStats' distinct coded-message IDs.
                if (!previous || /^\d{6}$/.test(item.code ?? "") || !/^\d{6}$/.test(previous.code ?? "")) messages.set(item.id, item);
              }
              const stats = storedMailHistoryStats(state);
              row.history = { scope: "stored_history", observedAt: stats.historyObservedAt, codeMessageCount: stats.codeMessageCount, messages: [...messages.values()] };
            } else if (hasCompleteMailImport({ ...state, client: state.client! })) row.importFields = [...state.importFields!];
            rows[position] = row;
          }
        }
      }));
      // Fail the entire export if refresh/import/deletion changed during assembly.
      next = 0;
      await Promise.all(Array.from({ length: Math.min(4, versions.length) }, async () => {
        while (next < versions.length) { const version = versions[next++]; if ((await bucket.head(root + version.key))?.etag !== version.etag) fail("mail_busy", 409); }
      }));
      if ((await bucket.head(root + "catalog.json"))?.etag !== index?.etag) fail("mail_busy", 409);
      const result = rows.filter((row): row is MailExportRow => row !== null);
      if (!result.length) fail("export_empty", 409);
      return result;
    },
    async storedHistoryStats(graphOnly = false) {
      const index = graphOnly ? await graphCatalog() : (await catalog()).accounts;
      const accounts: { id: string; email: string; codeMessageCount: number | null; historyObservedAt: string | null }[] = Array(index.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, index.length) }, async () => {
        while (next < index.length) {
          const position = next++, account = index[position];
          let stats: { codeMessageCount: number | null; historyObservedAt: string | null } = { codeMessageCount: null, historyObservedAt: null };
          try {
            const record = await read<RecordState>(path(account.id));
            if (record && record.value.id === account.id && record.value.email === account.email) stats = storedMailHistoryStats(record.value);
          } catch { /* One unreadable record is unknown; never trigger a live read. */ }
          accounts[position] = { id: account.id, email: account.email, ...stats };
        }
      }));
      return { version: 1 as const, scope: 'stored_history' as const, accounts };
    },
    async state() {
      const index = (await catalog()).accounts;
      const accounts: (ReturnType<typeof publicAccount> | null)[] = Array(index.length).fill(null);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, index.length) }, async () => {
        while (next < index.length) {
          const position = next++, a = index[position], record = await read<RecordState>(path(a.id));
          if (record) accounts[position] = publicAccount(a.id, a.email, record.value);
        }
      }));
      return { accounts: accounts.filter(a => a !== null), independent: true };
    },
    details,
    async messages(id: string) { return (await details(id)).messages; },
    async snapshot(id: string, graphOnly = false) {
      const key = await registered(id), original = await read<RecordState>(key); if (!original) fail("mail_not_found", 404);
      const s = original!.value;
      if (graphOnly && s.source === "mixotp") fail("source_unsupported", 409);
      if (s.deletion) fail("mail_deleting");
      if (s.lockUntil > now()) throw new MailError("mail_busy", 409, Math.max(1, Math.ceil((s.lockUntil - now()) / 1000)));
      if (s.cooldown > now()) throw new MailError("throttle", 429, Math.max(1, Math.ceil((s.cooldown - now()) / 1000)));
      // Preserve a known legacy success before checked can change on failure.
      const observed = storedMailHistoryStats(s).historyObservedAt;
      if (observed) s.historyObservedAt = observed;
      const token = crypto.randomUUID(); s.lock = token; s.lockUntil = now() + 120000;
      let etag = await write(key, s, original!.etag);
      let stage = "oauth";
      try {
        if (s.source === "mixotp") {
          stage = "provider";
          let result;
          try { result = await readMixotpCode(s.mixotpUrl!, fetcher); } catch (error) { if (error instanceof MixotpReadError) throw new MailError(error.kind, error.kind === "throttle" ? 429 : 502, error.wait); throw error; }
          const messages: MailMessage[] = [];
          if (!result.pending) {
            // Order identity, not transport requestId or observation time, makes
            // repeated observations idempotent. No unknown receipt time invented.
            const order = new URL(validateMixotpUrl(s.mixotpUrl)).searchParams.get("orderItemId");
            const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["mixotp", order, result.code])));
            const id = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
            const message: MailMessage = { id, receivedAt: "", observedAt: new Date(now()).toISOString(), sender: "MixOTP", subject: "Código do pedido", folder: "provider", code: result.code };
            const prior = s.history.find(item => item.id === id);
            if (!prior) { if (s.history.length >= 20000) fail("history_capacity"); s.history.push(metadata(message)); }
            messages.push(prior ?? message);
          }
          s.status = result.pending ? "waiting" : "ok"; s.checked = new Date(now()).toISOString();
          if (!result.pending) s.historyObservedAt = s.checked;
          s.cooldown = now() + 1000; s.lock = null; s.lockUntil = 0; delete s.diagnostic;
          await write(key, s, etag);
          return { email: s.email, observedAt: now(), complete: false, messages };
        }
        if (typeof s.client !== "string" || typeof s.refresh !== "string") fail("auth", 502);
        if (!s.access || (s.expires ?? 0) < now() + 120000) {
          const oauth = await jsonFetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: s.client!, refresh_token: s.refresh!, grant_type: "refresh_token", scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access" }).toString() });
          if (typeof oauth.access_token !== "string" || !/\bmail\.read(?:write)?\b/i.test(oauth.scope ?? "")) fail("permission", 502);
          s.access = oauth.access_token; s.expires = now() + Math.max(0, Number(oauth.expires_in) || 0) * 1000;
          if (typeof oauth.refresh_token === "string") s.refresh = oauth.refresh_token;
          etag = await write(key, s, etag); // Persist rotation BEFORE any mailbox read.
        }
        stage = "identity";
        const headers = { Authorization: `Bearer ${s.access}`, Prefer: 'outlook.body-content-type="text"' };
        const me = await jsonFetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers });
        if (![me.mail, me.userPrincipalName].some(v => typeof v === "string" && v.toLowerCase() === s.email)) fail("identity", 502);
        const messages: MailMessage[] = [];
        for (const folder of ["inbox", "junkemail"]) {
          stage = folder;
          const query = new URLSearchParams({ "$top": "30", "$select": "id,subject,from,receivedDateTime,body", "$orderby": "receivedDateTime desc" });
          const data = await jsonFetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?${query}`, { headers });
          if (!Array.isArray(data.value)) fail("service", 502);
          for (const m of data.value) {
            if (typeof m.id !== "string" || !m.id || typeof m.receivedDateTime !== "string" || !Number.isFinite(Date.parse(m.receivedDateTime))) fail("service", 502);
            const sender = String(m.from?.emailAddress?.address ?? "").slice(0, 300), subject = String(m.subject ?? "").slice(0, 1000), text = textBody(m.body?.content);
            messages.push({ id: m.id, receivedAt: m.receivedDateTime, sender, subject, text, folder, code: cloudMailCode(sender, subject, text) });
          }
        }
        // Append metadata/codes permanently. A new read never replaces history.
        stage = "history";
        const history = new Map(s.history.map(m => [m.id, m]));
        for (const m of messages) if (!history.has(m.id)) history.set(m.id, metadata(m));
        if (history.size > 20000) fail("history_capacity"); // Stop; never silently trim.
        s.history = [...history.values()]; s.recent = [];
        s.status = "ok"; s.checked = new Date(now()).toISOString(); s.historyObservedAt = s.checked; s.cooldown = 0; s.lock = null; s.lockUntil = 0; delete s.diagnostic;
        await write(key, s, etag);
        return { email: s.email, observedAt: now(), complete: true, messages: messages.map(m => ({ id:m.id, receivedAt:m.receivedAt, sender:m.sender, subject:m.subject, text:m.text ?? "" })) };
      } catch (e) {
        // Only release the exact lease we acquired. A CAS failure must not
        // overwrite a newer token, history, or a different request's lock.
        const current = await read<RecordState>(key);
        if (current?.etag === etag && current.value.lock === token) {
          const failure = e instanceof MailError ? e.code : "network";
          s.status = failure; s.checked = new Date(now()).toISOString(); s.lock = null; s.lockUntil = 0;
          s.diagnostic = { stage, kind: e instanceof MailError ? e.code : e instanceof Error && ["TypeError","TimeoutError","AbortError","RangeError"].includes(e.name) ? e.name : "Error" };
          if (failure === "auth") { delete s.access; delete s.expires; }
          if (failure === "throttle") s.cooldown = now() + ((e as { wait?: number }).wait ?? 60) * 1000;
          await write(key, s, etag);
        }
        throw e instanceof MailError ? e : new MailError("network", 502);
      }
    },
  };
}
