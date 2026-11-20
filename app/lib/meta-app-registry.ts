// Pure helpers for user-registered Meta apps (no DB / env access, unit-tested directly).

/** Scopes requested by instagramAuthorizationUrl (Instagram API with Instagram Login). */
export const META_INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
] as const;

export const META_APP_PUBLIC_ORIGIN = "https://resolvflow.online";
export const META_OAUTH_CALLBACK_PATH = "/api/meta/callback";
export const META_WEBHOOK_PREFIX = "/api/meta/webhook/";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMetaWebhookPath(pathname: string) {
  return pathname.startsWith(META_WEBHOOK_PREFIX) && UUID.test(pathname.slice(META_WEBHOOK_PREFIX.length));
}

export function metaWebhookRecordId(pathname: string) {
  return isMetaWebhookPath(pathname) ? pathname.slice(META_WEBHOOK_PREFIX.length).toLowerCase() : null;
}

export type MetaAppInput = { label: string; appId: string; appSecret: string };
export type MetaAppValidation = { ok: true; value: MetaAppInput } | { ok: false; error: string };

export function validateMetaAppInput(raw: unknown): MetaAppValidation {
  const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const label = String(body.label ?? "").replace(/\s+/g, " ").trim();
  const appId = String(body.appId ?? "").trim();
  const appSecret = String(body.appSecret ?? "").trim();
  if (label.length < 2 || label.length > 60) return { ok: false, error: "Informe um nome de exibição entre 2 e 60 caracteres." };
  if (!/^\d{6,25}$/.test(appId)) return { ok: false, error: "O ID do app deve conter somente números (copie o ID do app do Instagram no painel da Meta)." };
  if (!/^[A-Za-z0-9]{16,128}$/.test(appSecret)) return { ok: false, error: "A chave secreta do app parece inválida. Copie a chave secreta do app do Instagram no painel da Meta." };
  return { ok: true, value: { label, appId, appSecret } };
}

export function generateVerifyToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "rfv_" + [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ConnectionHealthRow = { status: string; tokenExpiresAt: string | null };
export type ConnectionHealth = { total: number; active: number; down: number };

/**
 * Profile health per registered app, derived from meta_connections:
 * - archived rows (profile removed from the panel) are not counted;
 * - "ativo": status = "connected" and the token is not expired (or has no expiry);
 * - "caído": status = "error" (Meta rejected the token/permission on the last sync or
 *   publication) OR status = "connected" with token_expires_at already in the past, OR any
 *   other non-archived status. A fallen profile must be reconnected through the app.
 */
export function connectionHealth(rows: ConnectionHealthRow[], now = Date.now()): ConnectionHealth {
  let active = 0;
  let down = 0;
  for (const row of rows) {
    if (row.status === "archived") continue;
    const expires = row.tokenExpiresAt ? Date.parse(row.tokenExpiresAt) : NaN;
    const expired = Number.isFinite(expires) && expires <= now;
    if (row.status === "connected" && !expired) active += 1;
    else down += 1;
  }
  return { total: active + down, active, down };
}

export type MetaAppSetup = {
  redirectUri: string;
  webhookUrl: string;
  verifyToken: string | null;
  scopes: readonly string[];
};

export function metaAppSetup(recordId: string, verifyToken: string | null, origin = META_APP_PUBLIC_ORIGIN): MetaAppSetup {
  return {
    redirectUri: origin + META_OAUTH_CALLBACK_PATH,
    webhookUrl: origin + META_WEBHOOK_PREFIX + recordId,
    verifyToken,
    scopes: META_INSTAGRAM_SCOPES,
  };
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

/** Meta signs webhook POSTs with X-Hub-Signature-256: sha256=<hmac(app secret, raw body)>. */
export async function verifyMetaWebhookSignature(appSecret: string, rawBody: string, header: string | null) {
  const value = String(header || "").trim().toLowerCase();
  if (!appSecret || !/^sha256=[a-f0-9]{64}$/.test(value)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  return constantTimeEqual(value.slice("sha256=".length), expected);
}

export function verifyTokensMatch(expected: string, received: string | null) {
  return Boolean(expected) && constantTimeEqual(expected, String(received || ""));
}
