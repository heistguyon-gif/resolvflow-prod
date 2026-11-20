import { isOtpGmailPrimaryEmail } from "./otp-primary-provider";

export type OtpPrimaryProvider = "instacaster" | "otpgmail";
export type ProviderOverride = { accountUserId: string; provider: OtpPrimaryProvider; legacy: boolean };
export type ProviderPolicy = { schemaVersion: 1; globalProvider: OtpPrimaryProvider; overrides: ProviderOverride[] };
export type PolicySnapshot = { policy: ProviderPolicy | null; version: string | null };
export type PolicyPatch = { version: string | null; globalProvider?: OtpPrimaryProvider; clearOverrides?: true; accountUserIds?: string[]; provider?: OtpPrimaryProvider | "global" };
export const OTP_POLICY_KEY = "otp-provider-policy/platform/v1.json";
export const OTP_POLICY_LIMITS = { batch: 100, overrides: 10000, bytes: 1024 * 1024, requestBytes: 16384 };

export class OtpPolicyError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
function invalid(): never { throw new OtpPolicyError("invalid_input", "Configuração de fornecedor inválida."); }
export function policyUnavailable(): never { throw new OtpPolicyError("policy_unavailable", "A configuração de fornecedor está indisponível. Tente novamente.", 503); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) invalid();
}
function provider(value: unknown): OtpPrimaryProvider {
  if (value !== "instacaster" && value !== "otpgmail") return invalid();
  return value;
}
export function accountIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > OTP_POLICY_LIMITS.batch) return invalid();
  // Account IDs are opaque: legacy accounts need not have UUID IDs.
  if (value.some(id => typeof id !== "string" || !id.trim() || id.length > 128 || [...id].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)) || new Set(value).size !== value.length) return invalid();
  return value;
}
export function parsePolicyPatch(input: unknown): PolicyPatch {
  const body = record(input);
  onlyKeys(body, ["version", "globalProvider", "clearOverrides", "accountUserIds", "provider"]);
  if (body.version !== null && (typeof body.version !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.version))) invalid();
  const patch: PolicyPatch = { version: body.version as string | null };
  if (Object.hasOwn(body, "globalProvider")) patch.globalProvider = provider(body.globalProvider);
  if (Object.hasOwn(body, "clearOverrides")) {
    if (body.clearOverrides !== true) invalid();
    patch.clearOverrides = true;
  }
  if (Object.hasOwn(body, "accountUserIds") || Object.hasOwn(body, "provider")) {
    patch.accountUserIds = accountIds(body.accountUserIds);
    patch.provider = body.provider === "global" ? "global" : provider(body.provider);
    if (patch.clearOverrides) invalid();
  }
  if (!patch.globalProvider && !patch.clearOverrides && !patch.accountUserIds) invalid();
  return patch;
}
function validatePolicy(input: unknown): ProviderPolicy {
  const body = record(input);
  onlyKeys(body, ["schemaVersion", "globalProvider", "overrides"]);
  if (body.schemaVersion !== 1 || !Array.isArray(body.overrides) || body.overrides.length > OTP_POLICY_LIMITS.overrides) invalid();
  const seen = new Set<string>();
  const overrides = body.overrides.map(value => {
    const row = record(value); onlyKeys(row, ["accountUserId", "provider", "legacy"]);
    const [accountUserId] = accountIds([row.accountUserId]);
    if (seen.has(accountUserId) || typeof row.legacy !== "boolean") invalid();
    seen.add(accountUserId);
    return { accountUserId, provider: provider(row.provider), legacy: row.legacy };
  });
  return { schemaVersion: 1, globalProvider: provider(body.globalProvider), overrides };
}
export function legacyPolicy(users: Array<{ id: string; email: string }>): ProviderPolicy {
  return { schemaVersion: 1, globalProvider: "otpgmail", overrides: users.filter(user => isOtpGmailPrimaryEmail(user.email)).map(user => ({ accountUserId: user.id, provider: "otpgmail", legacy: true })) };
}
export function effectiveProvider(policy: ProviderPolicy | null, accountUserId: string, email?: string | null) {
  if (!policy) return { provider: "otpgmail" as const, source: isOtpGmailPrimaryEmail(email) ? "legacy" as const : "global" as const };
  const override = policy.overrides.find(row => row.accountUserId === accountUserId);
  return { provider: override?.provider ?? policy.globalProvider, source: override ? override.legacy ? "legacy" as const : "override" as const : "global" as const };
}
export async function readProviderPolicy(bucket: R2Bucket): Promise<PolicySnapshot> {
  try {
    const object = await bucket.get(OTP_POLICY_KEY);
    if (!object) return { policy: null, version: null };
    if (object.size > OTP_POLICY_LIMITS.bytes || !object.etag) return policyUnavailable();
    const text = await object.text();
    if (new TextEncoder().encode(text).length > OTP_POLICY_LIMITS.bytes) return policyUnavailable();
    return { policy: validatePolicy(JSON.parse(text)), version: object.etag };
  } catch { return policyUnavailable(); }
}
export async function writeProviderPolicy(bucket: R2Bucket, patch: PolicyPatch, legacyUsers: Array<{ id: string; email: string }>) {
  const snapshot = await readProviderPolicy(bucket);
  const conflict = () => new OtpPolicyError("version_conflict", "A configuração mudou em outra sessão. Atualize antes de salvar novamente.", 409);
  if (snapshot.version !== patch.version) throw conflict();
  const policy = snapshot.policy ?? legacyPolicy(legacyUsers);
  if (patch.globalProvider) policy.globalProvider = patch.globalProvider;
  if (patch.clearOverrides) policy.overrides = [];
  if (patch.accountUserIds) {
    const selected = new Set(patch.accountUserIds);
    policy.overrides = policy.overrides.filter(row => !selected.has(row.accountUserId));
    if (patch.provider !== "global") policy.overrides.push(...patch.accountUserIds.map(accountUserId => ({ accountUserId, provider: patch.provider as OtpPrimaryProvider, legacy: false })));
  }
  const body = JSON.stringify(policy);
  if (policy.overrides.length > OTP_POLICY_LIMITS.overrides || new TextEncoder().encode(body).length > OTP_POLICY_LIMITS.bytes) throw new OtpPolicyError("policy_limit", "O limite de exceções foi atingido.", 409);
  let written: R2Object | null;
  try {
    written = await bucket.put(OTP_POLICY_KEY, body, { onlyIf: snapshot.version ? { etagMatches: snapshot.version } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
  } catch { return policyUnavailable(); }
  if (!written) throw conflict();
  return { policy, version: written.etag };
}
