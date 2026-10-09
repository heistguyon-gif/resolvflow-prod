import { DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES, handleImageOptimization } from "vinext/server/image-optimization";
import handler from "vinext/server/fetch-handler";
import { hashPassword, passwordNeedsUpgrade, verifyLegacySha256, verifyPassword } from "../lib/passwords";

type Env = Cloudflare.Env;

const APP_PAGE_PATHS = new Set(["/", "/admin", "/dashboard", "/contas", "/acessos", "/campanhas", "/fila", "/alertas", "/relatorios", "/integracoes", "/equipe", "/otp"]);
const ADMIN_HOST = "top.resolvflow.online";
const SESSION_COOKIE = "nexoflow_session";
const WORKSPACE_COOKIE = "nexoflow_workspace";
const SESSION_MAX_AGE = 2_592_000;
const SESSION_SHORT_AGE = 43_200;
const LOGIN_WINDOW_MS = 900_000;
const LOGIN_BLOCK_MS = 900_000;
const MAX_LOGIN_FAILURES = 5;

function safeNextPath(value: string) {
  try {
    const path = decodeURIComponent(String(value || "/")).split("?")[0].replace(/\/+$/, "") || "/";
    return APP_PAGE_PATHS.has(path) ? path : "/";
  } catch {
    return "/";
  }
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
  if (next.headers.get("content-type")?.includes("text/html")) next.headers.set("cache-control", "private, no-store");
  return next;
}

function isCrossSiteMutation(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/otp/pix/webhook") return false;
  if (pathname === "/api/integrations/sharkbot") return false;
  if (pathname === "/api/meta/invite-agent" && request.method === "POST") return false;
  return !["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("sec-fetch-site") === "cross-site";
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
  const material = `${request.headers.get("cf-connecting-ip") || "unknown"}|${email}`;
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material))));
}

async function readLoginAttempt(env: Env, key: string) {
  return env.DB.prepare("SELECT failed_count, first_failed_at, blocked_until FROM login_attempts WHERE key = ? LIMIT 1").bind(key).first<{ failed_count?: number; first_failed_at?: string; blocked_until?: string }>();
}

async function recordLoginFailure(env: Env, key: string) {
  const now = Date.now();
  const current = await readLoginAttempt(env, key);
  const firstFailedAt = current?.first_failed_at ? Date.parse(current.first_failed_at) : Number.NaN;
  const inWindow = Number.isFinite(firstFailedAt) && now - firstFailedAt < LOGIN_WINDOW_MS;
  const failedCount = inWindow ? (current?.failed_count || 0) + 1 : 1;
  const first = inWindow ? current?.first_failed_at : new Date(now).toISOString();
  const blockedUntil = failedCount >= MAX_LOGIN_FAILURES ? new Date(now + LOGIN_BLOCK_MS).toISOString() : null;
  await env.DB.prepare("INSERT INTO login_attempts (key, failed_count, first_failed_at, blocked_until, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET failed_count = excluded.failed_count, first_failed_at = excluded.first_failed_at, blocked_until = excluded.blocked_until, updated_at = CURRENT_TIMESTAMP").bind(key, failedCount, first, blockedUntil).run();
}

async function clearLoginAttempt(env: Env, key: string) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

type SessionRecord = { email: string; name: string; sub: string; mustChangePassword: boolean };
const sessionMemo = new Map<string, { exp: number; session: SessionRecord }>();

async function readSession(request: Request, env: Env) {
  if (!env.NEXOFLOW_SESSION_SECRET) return null;
  const cookie = readCookie(request, SESSION_COOKIE);
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || !await verifySignature(payload, signature, env.NEXOFLOW_SESSION_SECRET)) return null;
  const memo = sessionMemo.get(cookie);
  if (memo && memo.exp > Date.now()) return memo.session;
  try {
    const data = JSON.parse(base64UrlToText(payload)) as { userId?: string; email?: string; name?: string; ver?: number; exp?: number };
    if (!data.userId || !data.email || !data.exp || data.exp < Date.now()) return null;
    const email = data.email.trim().toLowerCase();
    const user = await env.DB.prepare("SELECT id, email, display_name, status, session_version, must_change_password FROM app_users WHERE id = ? AND email = ? LIMIT 1").bind(data.userId, email).first<{ id: string; email: string; display_name?: string; status: string; session_version: number; must_change_password?: number }>();
    if (!user || user.status !== "active" || user.session_version !== data.ver) return null;
    const session = { email, name: user.display_name || data.name || email, sub: user.id, mustChangePassword: Boolean(user.must_change_password) };
    if (sessionMemo.size > 200) sessionMemo.clear();
    sessionMemo.set(cookie, { exp: Date.now() + 600_000, session });
    return session;
  } catch {
    return null;
  }
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
</style></head><body><main class="card"><div class="brand">resolv<i>flow</i></div><h1>Entre na operação</h1><p>Use o acesso individual criado pelo administrador da equipe.</p>${error}<form method="post" action="/__nexoflow/login">${hidden}<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">Senha</label><div class="pass-wrap"><input id="password" name="password" type="password" autocomplete="current-password" maxlength="200" required><button type="button" class="eye" id="toggle-pass" aria-label="Mostrar senha" aria-pressed="false"><svg class="on" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="off" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.2 3.2"/><path d="M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.4-1"/></svg></button></div><label class="remember"><input type="checkbox" name="remember" value="1" checked> Manter conectado</label><button type="submit">Entrar</button></form><small class="help">Problemas com o acesso? Peça ao administrador para redefinir sua senha.</small></main><script nonce="${nonce}">
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
  if (request.method === "GET") return loginPage("", 200, url.searchParams.get("next") || "/");
  if (request.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 16_384) return loginPage("A solicitação de acesso ultrapassou o limite permitido.", 413, url.searchParams.get("next") || "/");
    const form = await request.formData();
    const next = safeNextPath(String(form.get("next") || url.searchParams.get("next") || "/"));
    const fail = (message: string, status = 401) => loginPage(message, status, next);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    if (email.length > 254 || password.length > 200) return fail("E-mail ou senha incorretos.");
    if (!env.NEXOFLOW_SESSION_SECRET) return fail("A autenticação ainda não foi configurada.");
    const attemptKey = await loginAttemptKey(request, email);
    const attempt = await readLoginAttempt(env, attemptKey).catch(() => null);
    if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) return fail("Muitas tentativas. Aguarde 15 minutos e tente novamente.", 429);
    let user = await env.DB.prepare("SELECT id, email, password_hash, display_name, status, session_version FROM app_users WHERE email = ? LIMIT 1").bind(email).first<{ id: string; email: string; password_hash: string; display_name?: string; status: string; session_version: number }>();
    let valid = user ? await verifyPassword(password, user.password_hash) : false;
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
    if (passwordNeedsUpgrade(user.password_hash)) {
      try {
        const upgraded = await hashPassword(password);
        await env.DB.prepare("UPDATE app_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(upgraded, user.id).run();
      } catch {
        await env.DB.prepare("UPDATE app_users SET must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
      }
    }
    await env.DB.prepare("UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
    const remember = String(form.get("remember") || "") === "1";
    const maxAge = remember ? SESSION_MAX_AGE : SESSION_SHORT_AGE;
    const payload = textToBase64Url(JSON.stringify({ userId: user.id, email, name: user.display_name, ver: user.session_version, exp: Date.now() + maxAge * 1_000 }));
    const signature = await signPayload(payload, env.NEXOFLOW_SESSION_SECRET);
    const cookieAge = remember ? `; Max-Age=${SESSION_MAX_AGE}` : "";
    return new Response(null, { status: 303, headers: { location: next, "set-cookie": `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax${cookieAge}` } });
  } catch (error) {
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
  const name = session?.name || (isLocal ? "Administrador local" : "");
  const verified = new Request(request);
  verified.headers.set("oai-authenticated-user-id", isLocal && !session ? "local-preview" : session?.sub || email);
  verified.headers.set("oai-authenticated-user-email", email);
  if (name) verified.headers.set("oai-authenticated-user-full-name", encodeURIComponent(name));
  if (name) verified.headers.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
  if (session && "mustChangePassword" in session && session.mustChangePassword) verified.headers.set("nexoflow-must-change-password", "true");
  return verified;
}

function schedulerTimeout(ms: number) {
  return new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));
}

async function handleWorkerFetch(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const adminHost = url.hostname === ADMIN_HOST;
  if (url.pathname === "/__nexoflow/login") return secureResponse(await handleLogin(request, env));
  if (url.pathname === "/__nexoflow/logout") {
    const response = new Response(null, { status: 303, headers: { location: "/__nexoflow/login" } });
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
        const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
        return result.response();
      },
    }, allowedWidths);
  }

  if (isPublicRuntimePath(url.pathname, request.method)) return handler.fetch(request, env, ctx);
  if (isCrossSiteMutation(request)) return secureResponse(Response.json({ error: "Solicitação bloqueada por segurança." }, { status: 403 }));
  const verifiedRequest = await authenticatedRequest(request, env, ctx);
  if (!verifiedRequest) {
    const wantsHtml = request.headers.get("accept")?.includes("text/html");
    const isApi = url.pathname.startsWith("/api/");
    if (wantsHtml && !isApi) {
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const next = APP_PAGE_PATHS.has(path) && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
      return secureResponse(Response.redirect(new URL(`/__nexoflow/login${next}`, request.url), 302));
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
      throw error;
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      const startedAt = new Date().toISOString();
      const staleLockAt = new Date(Date.now() - 90_000).toISOString();
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
      const watchdog = setTimeout(() => abort.abort(), 42_000);
      let result: unknown = null;
      let metaSync: unknown = null;
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
          const raced = await Promise.race([processDuePosts(undefined, 120), schedulerTimeout(43_000)]);
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
        if (!timedOut && !abort.signal.aborted && Date.now() < Date.parse(startedAt) + 28_000) {
          try {
            const { syncMetaAccounts } = await import("../lib/meta-sync");
            const found = result && typeof result === "object" ? Number((result as { found?: number }).found) || 0 : 0;
            metaSync = await syncMetaAccounts({
              automatic: true,
              maxConnections: found ? 1 : 2,
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
              env.DB.prepare("DELETE FROM scheduled_posts WHERE id IN (SELECT id FROM scheduled_posts WHERE status = 'cancelled' AND updated_at < ? LIMIT 400)").bind(new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000).toISOString()),
            ]);
            housekeeping.oauthStatesDeleted = oauthCleanup.meta.changes ?? 0;
            housekeeping.loginAttemptsDeleted = loginCleanup.meta.changes ?? 0;
            housekeeping.cancelledPostsDeleted = cancelledCleanup.meta.changes ?? 0;
          } catch (housekeepingError) {
            console.warn(JSON.stringify({ type: "scheduler_housekeeping", outcome: "error", error: housekeepingError instanceof Error ? housekeepingError.message : "Falha desconhecida." }));
          }
        }
        console.log(JSON.stringify({ ...event, outcome, result, metaSync, housekeeping, aborted: abort.signal.aborted, timedOut }));
      } catch (error) {
        outcome = "error";
        message = error instanceof Error ? error.message : "Falha desconhecida no agendador.";
        console.error(JSON.stringify({ ...event, outcome: "error", error: message }));
      } finally {
        clearTimeout(watchdog);
        const completedAt = new Date().toISOString();
        const status = outcome === "error" ? "error" : outcome === "paused" ? "paused" : outcome === "degraded" ? "degraded" : "healthy";
        await env.DB.prepare("UPDATE system_health SET status = ?, last_completed_at = ?, last_error = ?, details_json = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'scheduler'").bind(status, completedAt, message, JSON.stringify({ ...event, completedAt, outcome, result, metaSync, housekeeping, aborted: abort.signal.aborted, timedOut })).run();
      }
    })());
  },
};

export default worker;
