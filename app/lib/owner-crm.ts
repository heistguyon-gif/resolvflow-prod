/** Private commercial notes. Never writes to the wallet or accounting ledger. */
export const CRM_LIMITS = { payments: 200, moneyCents: 100_000_000, costUsd: 1000, bodyBytes: 256 * 1024 };
export type CrmPayment = { id: string; amountCents: number; date: string; note: string };
export type CrmFields = {
  modality: string;
  accessAmountCents: number | null;
  operationPercent: number | null;
  gmailCostUsd: number;
  payments: CrmPayment[];
  notes: string;
};
export type CrmDocument = CrmFields & { version: 1; revision: number; updatedAt: string | null };
export class CrmError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "invalid_input") {
    super(message); this.status = status; this.code = code;
  }
}
function invalid(message = "Dados do CRM inválidos."): never { throw new CrmError(message); }
export function crmRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function crmKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) invalid("Campo do CRM desconhecido.");
}
export function crmUserId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128 || [...value].some(char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159))) invalid("Usuário inválido.");
  try { encodeURIComponent(value); } catch { invalid("Usuário inválido."); }
  return value;
}
function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string" || value.length > max || [...value].some(char => {
    const n = char.charCodeAt(0);
    return (n < 32 && !(multiline && [9, 10, 13].includes(n))) || (n >= 127 && n <= 159);
  })) invalid("Texto inválido ou acima do limite.");
  return value.trim();
}
function integer(value: unknown, max: number, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) invalid("Quantia ou revisão inválida.");
  return value;
}
function decimal(value: unknown, max: number, places: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || Number(value.toFixed(places)) !== value) invalid("Valor decimal inválido.");
  return value;
}
export function crmDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "2100-12-31" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid("Data inválida (AAAA-MM-DD, entre 2000 e 2100).");
  return value;
}
export function crmPeriod(from: unknown, to: unknown) {
  const instant = (value: unknown, end: boolean) => {
    if (typeof value !== "string") return invalid("Período obrigatório.");
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${crmDate(value)}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return invalid("Período inválido; use datas ou instantes UTC.");
    crmDate(value.slice(0, 10));
    if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) return invalid("Período inválido.");
    return new Date(value).toISOString();
  };
  const period = { from: instant(from, false), to: instant(to, true) };
  if (period.from > period.to) invalid("O início deve anteceder o fim do período.");
  return period;
}
export function crmFields(value: unknown): CrmFields {
  const data = crmRecord(value);
  crmKeys(data, ["modality", "accessAmountCents", "operationPercent", "gmailCostUsd", "payments", "notes"]);
  if (!Array.isArray(data.payments) || data.payments.length > CRM_LIMITS.payments) invalid("Limite de 200 pagamentos por usuário.");
  const ids = new Set<string>();
  const payments = data.payments.map(raw => {
    const payment = crmRecord(raw);
    crmKeys(payment, ["id", "amountCents", "date", "note"]);
    if (typeof payment.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payment.id)) invalid("Identificador de pagamento inválido.");
    const id = payment.id.toLowerCase();
    if (ids.has(id)) invalid("Pagamento duplicado.");
    ids.add(id);
    return { id, amountCents: integer(payment.amountCents, CRM_LIMITS.moneyCents, 1), date: crmDate(payment.date), note: text(payment.note, 500, true) };
  });
  return {
    modality: text(data.modality, 200),
    accessAmountCents: data.accessAmountCents === null ? null : integer(data.accessAmountCents, CRM_LIMITS.moneyCents),
    operationPercent: data.operationPercent === null ? null : decimal(data.operationPercent, 100, 2),
    gmailCostUsd: decimal(data.gmailCostUsd, CRM_LIMITS.costUsd, 4), payments, notes: text(data.notes, 10000, true),
  };
}
export function emptyCrm(): CrmDocument {
  return { version: 1, revision: 0, updatedAt: null, modality: "", accessAmountCents: null, operationPercent: null, gmailCostUsd: 0.15, payments: [], notes: "" };
}
export function crmTotals(fields: CrmFields) {
  const receivedCents = fields.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { receivedCents, pendingCents: fields.accessAmountCents === null ? null : Math.max(0, fields.accessAmountCents - receivedCents), excessCents: fields.accessAmountCents === null ? null : Math.max(0, receivedCents - fields.accessAmountCents) };
}
export const crmKey = (userId: string) => `owner-crm/users/${encodeURIComponent(crmUserId(userId))}/state.json`;
async function readObject(bucket: R2Bucket, userId: string) {
  const object = await bucket.get(crmKey(userId));
  if (!object) return { object, crm: emptyCrm() };
  try {
    if (object.size > CRM_LIMITS.bodyBytes) throw new Error();
    const data = crmRecord(await object.json());
    crmKeys(data, ["version", "revision", "updatedAt", "modality", "accessAmountCents", "operationPercent", "gmailCostUsd", "payments", "notes"]);
    if (data.version !== 1 || typeof data.updatedAt !== "string" || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error();
    const { version: _version, revision, updatedAt, ...fields } = data;
    void _version;
    const crm: CrmDocument = { ...crmFields(fields), version: 1, revision: integer(revision, Number.MAX_SAFE_INTEGER - 1, 1), updatedAt };
    return { object, crm };
  } catch { throw new CrmError("Registro do CRM indisponível. Nenhum dado foi sobrescrito.", 503, "storage_invalid"); }
}
export async function readCrm(bucket: R2Bucket, userId: string) { return (await readObject(bucket, userId)).crm; }
/** A full editable snapshot plus revision: stale writers never merge or retry silently. */
export async function patchCrm(bucket: R2Bucket, userId: string, input: unknown): Promise<CrmDocument> {
  const payload = crmRecord(input);
  crmKeys(payload, ["revision", "fields"]);
  const revision = integer(payload.revision, Number.MAX_SAFE_INTEGER - 2);
  const fields = crmFields(payload.fields);
  const { object, crm } = await readObject(bucket, userId);
  const conflict = () => new CrmError("O CRM mudou em outra sessão. Recarregue os dados antes de salvar.", 409, "revision_conflict");
  if (crm.revision !== revision) throw conflict();
  const next: CrmDocument = { ...fields, version: 1, revision: revision + 1, updatedAt: new Date().toISOString() };
  const body = JSON.stringify(next);
  if (new TextEncoder().encode(body).length > CRM_LIMITS.bodyBytes) throw new CrmError("O CRM ultrapassou o limite de armazenamento.", 413);
  const result = await bucket.put(crmKey(userId), body, {
    onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
  });
  if (!result) throw conflict();
  return next;
}
