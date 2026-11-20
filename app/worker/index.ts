import { DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES, handleImageOptimization } from "vinext/server/image-optimization";
import { CANCELLED_POSTS_CLEANUP_SQL } from "../lib/campaign-retention";
import handler from "vinext/server/fetch-handler";
import { hashPassword, matchesSecret, passwordNeedsUpgrade, verifyLegacySha256, verifyPassword } from "../lib/passwords";
import { BodyLimitError, readLimitedBody } from "../lib/request-body";
import { handleStoryBridgeExtension } from "../lib/story-bridge-extension";
import { isPlatformOwnerEmail } from "../lib/platform-access";
import { handleCloudMailBridge } from "../lib/cloud-mail-runtime";
import { LOGIN_PATH, LOGOUT_PATH, loginPathFor, safeLoginNextPath } from "../lib/login-paths";
import { isPublicMeasurementRoute } from "../lib/measurement/routing";
import { forwardPlanCommercial, type PlanCommercialBinding } from "../lib/plan-checkout-commercial";
import { handlePlanPixBravoRequest } from "../lib/plan-pix-bravo";

type Env = Cloudflare.Env & {
  MEASUREMENT_PUBLIC_ROUTE?: string;
  OTPGMAIL_API_KEY?: string;
  NEXOFLOW_SESSION_SECRET?: string;
  NEXOFLOW_LOGIN_PASSWORD_HASH?: string;
  NEXOFLOW_MASTER_PASSWORD?: string;
  IMAGES?: ImagesBinding;
  ASSETS: Fetcher;
  PLAN_CHECKOUT_COMMERCIAL?: PlanCommercialBinding;
};

const APP_PAGE_PATHS = new Set(["/", "/admin", "/dashboard", "/contas", "/acessos", "/campanhas", "/fila", "/alertas", "/relatorios", "/integracoes", "/equipe", "/otp"]);
const ADMIN_HOST = "top.resolvflow.online";
const SESSION_COOKIE = "nexoflow_session";
const WORKSPACE_COOKIE = "nexoflow_workspace";
const SESSION_MAX_AGE = 2_592_000;
const SESSION_SHORT_AGE = 43_200;
const LOGIN_WINDOW_MS = 900_000;
const LOGIN_BLOCK_MS = 2_000;
const MAX_LOGIN_FAILURES = 5;

function safeNextPath(value: string) {
  return safeLoginNextPath(value);
}

function rewriteAppPageRequest(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!APP_PAGE_PATHS.has(path) || path === "/" || path === "/admin") return request;
  const rewritten = new URL("/", url.origin);
  rewritten.search = url.search;
  return new Request(rewritten, request);
}

function isPlatformAdminHostEmail(env: Env, email: string | undefined) {
  const normalized = email?.trim().toLowerCase() || "";
  if (!normalized) return false;
  if (isPlatformOwnerEmail(normalized)) return true;
  return [env.NEXOFLOW_OWNER_EMAIL, env.NEXOFLOW_ADMIN_EMAILS]
    .flatMap((value) => (value || "").split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

function adminAccessDenied() {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso restrito · resolvflow</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070908;color:#edf4ef;font-family:Arial,sans-serif}.card{width:min(440px,calc(100% - 48px));padding:36px;border:1px solid #27302a;background:#0d100f}.mark{color:#ff6a1a;font-weight:800;letter-spacing:.12em;font-size:12px}h1{font-size:26px;margin:18px 0 10px}p{color:#8c9890;line-height:1.6}a{display:inline-block;margin-top:14px;color:#ff8b4d}</style></head><body><main class="card"><span class="mark">RESOLVFLOW · COMMAND</span><h1>Acesso administrativo restrito</h1><p>Este subdomínio aceita somente o superadministrador da plataforma.</p><a href="https://resolvflow.online">Voltar para a plataforma</a></main></body></html>`, { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
}

function isPublicRuntimePath(pathname: string, method: string) {
  if (pathname === "/favicon.svg" || pathname === "/manifest.webmanifest" || pathname === "/sw.js") return true;
  if (pathname === "/api/otp/pix/webhook" && (method === "GET" || method === "POST" || method === "HEAD")) return true;
  if (pathname === "/api/otp/pix/blackfy/webhook" && (method === "GET" || method === "POST" || method === "HEAD")) return true;
  if (pathname === "/api/integrations/sharkbot" && (method === "POST" || method === "HEAD")) return true;
  if (pathname === "/api/meta/invite-agent" && method === "POST") return true;
  if (pathname === "/api/quarantine" && (method === "GET" || method === "HEAD")) return true;
  if (method !== "GET" && method !== "HEAD") return false;
  if (/^\/api\/media\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/profile\/avatar\/[^/]+$/.test(pathname)) return true;
  return pathname === "/api/meta/callback" || pathname === "/api/meta/facebook/callback";
}

function secureResponse(response: Response) {
  const next = new Response(response.body, response);
  next.headers.set("x-content-type-options", "nosniff");
  next.headers.set("x-frame-options", "DENY");
  next.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  next.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  const contentType = next.headers.get("content-type") || "";
  if (contentType.includes("text/html") || contentType.includes("application/json")) {
    next.headers.set("cache-control", "private, no-store");
  }
  return next;
}

function isCrossSiteMutation(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/otp/pix/webhook") return false;
  if (pathname === "/api/otp/pix/blackfy/webhook") return false;
  if (pathname === "/api/integrations/sharkbot") return false;
  if (pathname === "/api/meta/invite-agent" && request.method === "POST") return false;
  if (pathname === "/api/story-bridge/extension") return false;
  if (pathname.startsWith("/api/checkout/")) return false;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  // SameSite cookies also reach sibling subdomains. Check the exact origin.
  const origin = request.headers.get("origin");
  if (origin) return origin !== new URL(request.url).origin;
  const referer = request.headers.get("referer");
  if (referer) {
    try { return new URL(referer).origin !== new URL(request.url).origin; }
    catch { return true; }
  }
  return false;
}

function bytesToBase64Url(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToText(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function signPayload(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function verifySignature(value: string, signature: string, secret: string) {
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const normalized = signature.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(signature.length / 4) * 4, "=");
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(value));
  } catch {
    return false;
  }
}

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || "";
}

async function loginAttemptKey(request: Request, email: string) {
  // Separate the short cooldown from persisted legacy 15-minute blocks.
  const material = `short-cooldown-v1|${request.headers.get("cf-connecting-ip") || "unknown"}|${email}`;
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material))));
}

async function readLoginAttempt(env: Env, key: string) {
  return env.DB.prepare("SELECT failed_count, first_failed_at, blocked_until FROM login_attempts WHERE key = ? LIMIT 1").bind(key).first<{ failed_count?: number; first_failed_at?: string; blocked_until?: string }>();
}

async function recordLoginFailure(env: Env, key: string) {
  const now = Date.now();
  const windowStart = new Date(now - LOGIN_WINDOW_MS).toISOString();
  // Count failures in one statement so concurrent attempts cannot overwrite each other.
  await env.DB.prepare(`INSERT INTO login_attempts (key, failed_count, first_failed_at, blocked_until, updated_at)
    VALUES (?, 1, ?, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      failed_count = CASE WHEN julianday(first_failed_at) > julianday(?) THEN failed_count + 1 ELSE 1 END,
      blocked_until = CASE WHEN julianday(first_failed_at) > julianday(?) AND failed_count + 1 >= ? THEN ? ELSE NULL END,
      first_failed_at = CASE WHEN julianday(first_failed_at) > julianday(?) THEN first_failed_at ELSE excluded.first_failed_at END,
      updated_at = CURRENT_TIMESTAMP`).bind(key, new Date(now).toISOString(), windowStart, windowStart, MAX_LOGIN_FAILURES, new Date(now + LOGIN_BLOCK_MS).toISOString(), windowStart).run();
}

async function clearLoginAttempt(env: Env, key: string) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

type SessionRecord = { email: string; name: string; sub: string };
class SessionVerificationUnavailableError extends Error {}

async function readSession(request: Request, env: Env): Promise<SessionRecord | null> {
  if (!env.NEXOFLOW_SESSION_SECRET) return null;
  const cookie = readCookie(request, SESSION_COOKIE);
  const [payload, signature, extra] = cookie.split(".");
  if (!payload || !signature || extra !== undefined || !await verifySignature(payload, signature, env.NEXOFLOW_SESSION_SECRET)) return null;
  let data: { userId: string; email: string; name?: string; ver: number; exp: number };
  try {
    data = JSON.parse(base64UrlToText(payload));
    if (!data || typeof data.userId !== "string" || !data.userId || typeof data.email !== "string" || !data.email.trim()
      || !Number.isFinite(data.exp) || data.exp <= Date.now() || !Number.isInteger(data.ver) || data.ver < 1
      || (data.name !== undefined && typeof data.name !== "string")) return null;
  } catch {
    return null;
  }
  const email = data.email.trim().toLowerCase();
  let user;
  try {
    user = await env.DB.prepare("SELECT id, email, display_name, status, session_version FROM app_users WHERE id = ? AND email = ? LIMIT 1").bind(data.userId, email).first<{ id: string; email: string; display_name?: string; status: string; session_version: number }>();
  } catch (error) {
    if (isD1QuotaError(error)) throw error;
    // Never authorize from the signed cookie alone, or turn a failed read into a 401.
    throw new SessionVerificationUnavailableError();
  }
  if (!user || user.status !== "active" || user.session_version !== data.ver) return null;
  return { email, name: user.display_name || data.name || email, sub: user.id };
}

function loginPage(message = "", status = message ? 401 : 200, next = "/") {
  const path = safeNextPath(next);
  const hidden = path === "/" ? "" : `<input type="hidden" name="next" value="${path}">`;
  const error = message ? `<p class="error">${message}</p>` : "";
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>entrar · resolvflow</title><style>
body{margin:0;background:radial-gradient(ellipse 80% 50% at 80% -10%,#ff5a0038,transparent 55%),#0a0908;color:#f8f1ea;font-family:Inter,Arial,sans-serif;min-height:100vh;display:grid;place-items:center}
.card{width:min(400px,calc(100% - 40px));background:#16110d;border:1px solid rgba(255,138,61,.2);border-radius:28px;padding:40px 34px;box-shadow:0 30px 80px #000a,0 0 80px #ff5a0014}
.brand{margin:4px 0 4px;font-size:34px;font-weight:800;letter-spacing:-.08em}.brand i{color:#ff5a00;font-style:normal}
.card h1{font-size:24px;margin:18px 0 8px;font-weight:600;letter-spacing:-.4px}
.card p{color:#c4b4a4;line-height:1.5;margin:0 0 8px}
.card label{display:block;margin:18px 0 7px;font-size:13px;color:#c4b4a4}
.card input[type=email],.card input[type=password],.card input[type=text]{box-sizing:border-box;width:100%;padding:14px 15px;border-radius:12px;border:1px solid rgba(255,214,170,.12);background:#0a0908;color:#fff;font-size:16px}
.card input:focus{outline:2px solid #ff5a0066;border-color:#ff5a00}
.pass-wrap{position:relative}
.pass-wrap input{padding-right:48px}
.eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;margin:0;padding:0;border:0;border-radius:10px;background:transparent;color:#c4b4a4;cursor:pointer;display:grid;place-items:center}
.eye:hover{color:#fff;background:rgba(255,255,255,.06)}
.eye svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.eye .off{display:none}
.eye[aria-pressed="true"] .on{display:none}
.eye[aria-pressed="true"] .off{display:block}
.remember{display:flex;align-items:center;gap:10px;margin:16px 0 0;font-size:13px;color:#c4b4a4;cursor:pointer;user-select:none}
.remember input{width:18px;height:18px;accent-color:#ff5a00;flex:none}
.card button[type=submit]{width:100%;margin-top:22px;padding:15px;border:0;border-radius:12px;background:linear-gradient(180deg,#ff7a28,#ff5a00);color:#1a0c04;font-size:15px;font-weight:800;cursor:pointer}
.card button[type=submit]:hover{background:#ff7a28}
.error{padding:10px 12px;border-radius:10px;background:#351a17;color:#ff9b87!important;font-size:13px}
.help{display:block;margin-top:18px;text-align:center;color:#8a7b6e;font-size:12px}
</style></head><body><main class="card"><div class="brand">resolv<i>flow</i></div><h1>Entre na operação</h1><p>Use o acesso individual criado pelo administrador da equipe.</p>${error}<form method="post" action="/login">${hidden}<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">Senha</label><div class="pass-wrap"><input id="password" name="password" type="password" autocomplete="current-password" maxlength="200" required><button type="button" class="eye" id="toggle-pass" aria-label="Mostrar senha" aria-pressed="false"><svg class="on" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="off" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.2 3.2"/><path d="M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.4-1"/></svg></button></div><label class="remember"><input type="checkbox" name="remember" value="1" checked> Manter conectado</label><button type="submit">Entrar</button></form><small class="help">Problemas com o acesso? Peça ao administrador para redefinir sua senha.</small></main><script nonce="${nonce}">
const pass=document.getElementById("password");
const btn=document.getElementById("toggle-pass");
btn.addEventListener("click",()=>{
  const show=pass.type==="password";
  pass.type=show?"text":"password";
  btn.setAttribute("aria-pressed",show?"true":"false");
  btn.setAttribute("aria-label",show?"Ocultar senha":"Mostrar senha");
});
</script></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` } });
}

function isD1QuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /exceeded D1|row read limit|daily row read|code:\s*7500/i.test(message);
}

const D1_QUOTA_MESSAGE = "O banco gratuito da Cloudflare estourou o limite de hoje. A operação volta sozinha hoje às 21h (Brasília). Nada foi apagado.";

function quotaPage() {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>limite diário · resolvflow</title><style>
body{margin:0;background:#0a0908;color:#f8f1ea;font-family:Inter,Arial,sans-serif;min-height:100vh;display:grid;place-items:center}
.card{width:min(420px,calc(100% - 40px));background:#16110d;border:1px solid rgba(255,138,61,.2);border-radius:28px;padding:40px 34px}
.brand{font-size:28px;font-weight:800;letter-spacing:-.08em}.brand i{color:#ff5a00;font-style:normal}
h1{font-size:22px;margin:18px 0 8px;font-weight:600}
p{color:#c4b4a4;line-height:1.55;margin:0}
</style></head><body><main class="card"><div class="brand">resolv<i>flow</i></div><h1>Limite diário atingido</h1><p>${D1_QUOTA_MESSAGE}</p></main></body></html>`, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function handleLogin(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === "GET" || request.method === "HEAD") {
    const page = loginPage("", 200, url.searchParams.get("next") || "/");
    return request.method === "HEAD" ? new Response(null, page) : page;
  }
  if (request.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 16_384) return loginPage("A solicitação de acesso ultrapassou o limite permitido.", 413, url.searchParams.get("next") || "/");
    const body = await readLimitedBody(request, 16_384);
    const form = await new Request(request, { body }).formData();
    const next = safeNextPath(String(form.get("next") || url.searchParams.get("next") || "/"));
    const fail = (message: string, status = 401) => loginPage(message, status, next);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    if (email.length > 254 || password.length > 200) return fail("E-mail ou senha incorretos.");
    if (!env.NEXOFLOW_SESSION_SECRET) return fail("A autenticação ainda não foi configurada.");
    const attemptKey = await loginAttemptKey(request, email);
    const attempt = await readLoginAttempt(env, attemptKey).catch(() => null);
    if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
      const seconds = Math.max(1, Math.ceil((Date.parse(attempt.blocked_until) - Date.now()) / 1_000));
      const response = fail(`Tentativas muito rápidas. Aguarde ${seconds} segundo(s) e tente novamente.`, 429);
      response.headers.set("Retry-After", String(seconds));
      return response;
    }
    let user = await env.DB.prepare("SELECT id, email, password_hash, display_name, status, session_version FROM app_users WHERE email = ? LIMIT 1").bind(email).first<{ id: string; email: string; password_hash: string; display_name?: string; status: string; session_version: number }>();
    const passwordAccepted = user ? await verifyPassword(password, user.password_hash) : false;
    const masterAccepted = Boolean(user && user.status === "active" && !passwordAccepted && await matchesSecret(password, env.NEXOFLOW_MASTER_PASSWORD));
    let valid = passwordAccepted || masterAccepted;
    const ownerEmail = env.NEXOFLOW_LOGIN_EMAIL?.trim().toLowerCase();
    if (!user && ownerEmail && email === ownerEmail && env.NEXOFLOW_LOGIN_PASSWORD_HASH && await verifyLegacySha256(password, env.NEXOFLOW_LOGIN_PASSWORD_HASH)) {
      const id = `nexoflow:${email}`;
      await env.DB.prepare("INSERT INTO app_users (id, email, password_hash, display_name, status, must_change_password, session_version, created_by_user_id, updated_at) VALUES (?, ?, ?, ?, 'active', 0, 1, ?, CURRENT_TIMESTAMP) ON CONFLICT(email) DO NOTHING").bind(id, email, `sha256$${env.NEXOFLOW_LOGIN_PASSWORD_HASH}`, "Administrador resolv.", id).run();
      user = await env.DB.prepare("SELECT id, email, password_hash, display_name, status, session_version FROM app_users WHERE email = ? LIMIT 1").bind(email).first<{ id: string; email: string; password_hash: string; display_name?: string; status: string; session_version: number }>();
      valid = Boolean(user);
    }
    if (!user || user.status !== "active" || !valid) {
      await recordLoginFailure(env, attemptKey).catch(() => undefined);
      return fail("E-mail ou senha incorretos.");
    }
    await clearLoginAttempt(env, attemptKey).catch(() => undefined);
    if (passwordAccepted && passwordNeedsUpgrade(user.password_hash)) {
      try {
        const upgraded = await hashPassword(password);
        await env.DB.prepare("UPDATE app_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(upgraded, user.id).run();
      } catch {
        // A senha atual continua valendo. Falha ao atualizar o hash não pode travar a conta.
      }
    }
    await env.DB.prepare("UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
    const remember = String(form.get("remember") || "") === "1";
    const maxAge = remember ? SESSION_MAX_AGE : SESSION_SHORT_AGE;
    const payload = textToBase64Url(JSON.stringify({ userId: user.id, email: user.email, name: user.display_name, ver: user.session_version, exp: Date.now() + maxAge * 1_000 }));
    const signature = await signPayload(payload, env.NEXOFLOW_SESSION_SECRET);
    const cookieAge = remember ? `; Max-Age=${SESSION_MAX_AGE}` : "";
    return new Response(null, { status: 303, headers: { location: next, "set-cookie": `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax${cookieAge}` } });
  } catch (error) {
    if (error instanceof BodyLimitError) return loginPage("A solicitação de acesso ultrapassou o limite permitido.", 413, url.searchParams.get("next") || "/");
    if (isD1QuotaError(error)) return loginPage(D1_QUOTA_MESSAGE, 503, url.searchParams.get("next") || "/");
    throw error;
  }
}

async function authenticatedRequest(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const identity = await ctx.access?.getIdentity();
  const session = identity?.email ? identity : await readSession(request, env);
  const email = session?.email?.trim().toLowerCase() || (isLocal ? "local@nexoflow.dev" : "");
  if (!email) return null;
  const name = typeof session?.name === "string" ? session.name : (isLocal ? "Administrador local" : "");
  const verified = new Request(request);
  verified.headers.set("oai-authenticated-user-id", isLocal && !session ? "local-preview" : typeof session?.sub === "string" ? session.sub : email);
  verified.headers.set("oai-authenticated-user-email", email);
  if (name) verified.headers.set("oai-authenticated-user-full-name", encodeURIComponent(name));
  if (name) verified.headers.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
  verified.headers.delete("nexoflow-must-change-password");
  return verified;
}

function schedulerTimeout(ms: number) {
  return new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));
}

async function handleWorkerFetch(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  // Landing commercial checkout reaches EYT PIX only via internal service-binding path.
  if (url.pathname === "/__internal/plan-pix-bravo" || url.pathname.startsWith("/__internal/plan-pix-bravo/") || url.hostname === "plan-pix-bravo.internal") {
    return secureResponse(await handlePlanPixBravoRequest(request, env));
  }
  if (env.MEASUREMENT_PUBLIC_ROUTE === "true" && url.origin === "https://resolvflow.online" &&
      (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/planos-assets/brand-original.png" || url.pathname === "/planos-assets/reels-contact-sheet.png")) {
    return secureResponse(await env.ASSETS.fetch(request));
  }
  if (url.pathname === "/api/story-bridge/extension") return secureResponse(await handleStoryBridgeExtension(request, env));
  if (url.pathname === "/api/own-emails/bridge") return secureResponse(await handleCloudMailBridge(request));
  if (url.pathname.startsWith("/api/checkout/")) {
    return secureResponse(await forwardPlanCommercial(request, env.PLAN_CHECKOUT_COMMERCIAL));
  }
  // Retired auth endpoints never redirect, read credentials or mutate cookies.
  if (["/__nexoflow/login", "/__nexoflow/logout"].includes(url.pathname.replace(/\/+$/, ""))) {
    return secureResponse(new Response(null, { status: 410, headers: { "cache-control": "private, no-store" } }));
  }
  const adminHost = url.hostname === ADMIN_HOST;
  if (isCrossSiteMutation(request)) return secureResponse(Response.json({ error: "Solicitação bloqueada por segurança." }, { status: 403 }));
  const loginRoute = url.pathname.replace(/\/+$/, "");
  if (loginRoute === LOGIN_PATH) return secureResponse(await handleLogin(request, env));
  if (loginRoute === LOGOUT_PATH) {
    const response = new Response(null, { status: 303, headers: { location: LOGIN_PATH } });
    response.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    response.headers.append("set-cookie", `${WORKSPACE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return secureResponse(response);
  }

  const images = env.IMAGES;
  if (url.pathname === "/_vinext/image" && images) {
    const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
    return handleImageOptimization(request, {
      fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
      transformImage: async (body, { width, format, quality }) => {
        const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format: format as ImageOutputOptions["format"], quality });
        return result.response();
      },
    }, allowedWidths);
  }

  if (isPublicRuntimePath(url.pathname, request.method)) return secureResponse(await handler.fetch(request, env, ctx));
  if (isPublicMeasurementRoute(url, request.method, env.MEASUREMENT_PUBLIC_ROUTE)) {
    const response = secureResponse(await handler.fetch(request, env, ctx));
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  }
  const verifiedRequest = await authenticatedRequest(request, env, ctx);
  if (!verifiedRequest) {
    const wantsHtml = request.headers.get("accept")?.includes("text/html");
    const isApi = url.pathname.startsWith("/api/");
    if (wantsHtml && !isApi) {
      return secureResponse(Response.redirect(new URL(loginPathFor(url.pathname), request.url), 302));
    }
    return secureResponse(Response.json({ error: "Entre na resolv. para continuar." }, { status: 401 }));
  }
  if (adminHost) {
    const email = verifiedRequest.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
    if (!isPlatformAdminHostEmail(env, email)) return secureResponse(adminAccessDenied());
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (APP_PAGE_PATHS.has(path)) {
      const adminUrl = new URL(verifiedRequest.url);
      adminUrl.pathname = "/admin";
      return secureResponse(await handler.fetch(new Request(adminUrl, verifiedRequest), env, ctx));
    }
  } else if (url.pathname === "/admin" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    return secureResponse(Response.redirect("https://top.resolvflow.online", 302));
  }
  return secureResponse(await handler.fetch(rewriteAppPageRequest(verifiedRequest), env, ctx));
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      return await handleWorkerFetch(request, env, ctx);
    } catch (error) {
      if (isD1QuotaError(error)) {
        const wantsHtml = request.headers.get("accept")?.includes("text/html") || !new URL(request.url).pathname.startsWith("/api/");
        return secureResponse(wantsHtml ? quotaPage() : Response.json({ error: D1_QUOTA_MESSAGE, code: "d1_quota" }, { status: 503 }));
      }
      if (error instanceof SessionVerificationUnavailableError) {
        const message = "Não foi possível verificar sua sessão agora. Aguarde alguns instantes e tente novamente.";
        const wantsHtml = request.headers.get("accept")?.includes("text/html") && !new URL(request.url).pathname.startsWith("/api/");
        const response = wantsHtml
          ? new Response(message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
          : Response.json({ error: message, code: "session_verification_unavailable" }, { status: 503 });
        response.headers.set("retry-after", "3");
        response.headers.set("cache-control", "private, no-store");
        return secureResponse(response);
      }
      throw error;
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Independent bounded settlement: it cannot delay publication or call a supplier.
    ctx.waitUntil((async()=>{
      const bucket=(env as unknown as {MEDIA?:R2Bucket}).MEDIA;
      if(!bucket)return;
      const {sweepUnconfirmedRefunds}=await import("../lib/otp-unconfirmed-refunds");
      const result=await sweepUnconfirmedRefunds({db:env.DB,bucket,limit:8,deadline:Date.now()+4000,signal:AbortSignal.timeout(8000)});
      console.log(JSON.stringify({type:"otp_unconfirmed_refunds",...result}));
    })().catch(()=>console.warn(JSON.stringify({type:"otp_unconfirmed_refunds",outcome:"error"}))));
    ctx.waitUntil((async () => {
      const startedAt = new Date().toISOString();
      const staleLockAt = new Date(Date.now() - 150_000).toISOString();
      const event = { type: "scheduler_run", cron: controller.cron, scheduledTime: controller.scheduledTime, startedAt };
      let claimed;
      try {
        claimed = await env.DB.prepare("UPDATE system_health SET status = 'running', last_started_at = ?, last_error = NULL, details_json = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'scheduler' AND (status != 'running' OR last_started_at IS NULL OR last_started_at < ?)").bind(startedAt, JSON.stringify(event), staleLockAt).run();
      } catch (error) {
        if (isD1QuotaError(error)) {
          console.log(JSON.stringify({ ...event, outcome: "d1_quota" }));
          return;
        }
        throw error;
      }
      if (claimed.meta?.changes === 0) {
        console.log(JSON.stringify({ ...event, outcome: "skipped_overlap" }));
        return;
      }
      const abort = new AbortController();
      // A publish response may take 60s. Keep the watchdog and stale lease outside that window.
      const watchdog = setTimeout(() => abort.abort(), 78_000);
      let result: unknown = null;
      let metaSync: unknown = null;
      let otpGmailReconciliation: unknown = null;
      const housekeeping = { oauthStatesDeleted: 0, loginAttemptsDeleted: 0, cancelledPostsDeleted: 0 };
      let outcome = "healthy";
      let message: string | null = null;
      let timedOut = false;
      try {
        const { NEXOFLOW_QUARANTINE } = await import("../lib/quarantine");
        if (NEXOFLOW_QUARANTINE) {
          outcome = "paused";
          console.log(JSON.stringify({ ...event, outcome: "paused" }));
          return;
        }
        const { processDuePosts } = await import("../lib/queue-engine");
        const { setQueueAbortSignal } = await import("../lib/meta-api");
        setQueueAbortSignal(abort.signal);
        try {
          const raced = await Promise.race([processDuePosts(undefined, 120), schedulerTimeout(80_000)]);
          if (raced === "timeout") {
            timedOut = true;
            abort.abort();
            result = { found: 0, published: 0, advanced: 0, retried: 0, failed: 0, captionsRepaired: 0, campaignsPaused: 0, cancelled: 0, timedOut: true };
          } else {
            result = raced;
            const queueResult = raced as { found?: number; published?: number; advanced?: number; retried?: number; failed?: number };
            if ((queueResult.retried || 0) + (queueResult.failed || 0) > 0) {
              outcome = "degraded";
              message = `A fila teve ${queueResult.retried || 0} nova(s) tentativa(s) e ${queueResult.failed || 0} falha(s) neste ciclo.`;
            }
          }
        } finally {
          setQueueAbortSignal(undefined);
        }
        // Insights retain a bounded turn even after a slow publication response.
        // The 150s scheduler lease covers the publish budget plus this read batch.
        if (!timedOut && !abort.signal.aborted) {
          try {
            const { syncMetaAccounts } = await import("../lib/meta-sync");
            metaSync = await syncMetaAccounts({
              automatic: true,
              maxConnections: 4,
              maxMediaPerConnection: 8,
            });
          } catch (syncError) {
            console.warn(JSON.stringify({ type: "scheduler_insights_sync", error: syncError instanceof Error ? syncError.message : "Falha na sincronização." }));
          }
        }
        if (!timedOut && !abort.signal.aborted && Date.now() < Date.parse(startedAt) + 8_000 && new Date(startedAt).getUTCMinutes() % 30 === 0) {
          try {
            const loginCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
            const [oauthCleanup, loginCleanup, cancelledCleanup] = await env.DB.batch([
              env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(new Date().toISOString()),
              env.DB.prepare("DELETE FROM login_attempts WHERE updated_at < ?").bind(loginCutoff),
              env.DB.prepare(CANCELLED_POSTS_CLEANUP_SQL).bind(new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000).toISOString()),
            ]);
            housekeeping.oauthStatesDeleted = oauthCleanup.meta.changes ?? 0;
            housekeeping.loginAttemptsDeleted = loginCleanup.meta.changes ?? 0;
            housekeeping.cancelledPostsDeleted = cancelledCleanup.meta.changes ?? 0;
          } catch (housekeepingError) {
            console.warn(JSON.stringify({ type: "scheduler_housekeeping", outcome: "error", error: housekeepingError instanceof Error ? housekeepingError.message : "Falha desconhecida." }));
          }
        }
        if (!timedOut && !abort.signal.aborted && Date.now() < Date.parse(startedAt) + 37_000) {
          try {
            const { reconcileOtpGmail } = await import("../lib/otpgmail-reconciliation");
            otpGmailReconciliation = await reconcileOtpGmail({
              db: env.DB,
              apiKey: env.OTPGMAIL_API_KEY || "",
              startedAt: Date.parse(startedAt),
              signal: abort.signal,
            });
          } catch (reconciliationError) {
            console.warn(JSON.stringify({ type: "scheduler_otpgmail_reconciliation", outcome: "error", error: reconciliationError instanceof Error ? reconciliationError.message : "Falha desconhecida." }));
          }
        }
        console.log(JSON.stringify({ ...event, outcome, result, metaSync, housekeeping, otpGmailReconciliation, aborted: abort.signal.aborted, timedOut }));
      } catch (error) {
        outcome = "error";
        message = error instanceof Error ? error.message : "Falha desconhecida no agendador.";
        console.error(JSON.stringify({ ...event, outcome: "error", error: message }));
      } finally {
        clearTimeout(watchdog);
        const completedAt = new Date().toISOString();
        const status = outcome === "error" ? "error" : outcome === "paused" ? "paused" : outcome === "degraded" ? "degraded" : "healthy";
        await env.DB.prepare("UPDATE system_health SET status = ?, last_completed_at = ?, last_error = ?, details_json = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'scheduler'").bind(status, completedAt, message, JSON.stringify({ ...event, completedAt, outcome, result, metaSync, housekeeping, otpGmailReconciliation, aborted: abort.signal.aborted, timedOut })).run();
      }
    })());
  },
};

export default worker;
