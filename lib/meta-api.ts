import { facebookMetaConfig, metaConfig } from "./runtime-env";

type MetaErrorBody = {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string; fbtrace_id?: string };
  // Instagram Login's token endpoint returns OAuth failures at the top level,
  // unlike Graph API endpoints which nest them under `error`.
  error_message?: string;
  error_type?: string;
  code?: number;
};
type InstagramProfile = { id: string; user_id?: string; username: string; account_type?: string; profile_picture_url?: string; followers_count?: number; follows_count?: number; media_count?: number };

export class MetaApiError extends Error {
  code?: number;
  subcode?: number;
  status?: number;
  fbtraceId?: string;
  host?: string;
  endpoint?: string;
  constructor(message: string, code?: number, extra?: { subcode?: number; status?: number; fbtraceId?: string; host?: string; endpoint?: string }) {
    super(message);
    this.code = code;
    this.subcode = extra?.subcode;
    this.status = extra?.status;
    this.fbtraceId = extra?.fbtraceId;
    this.host = extra?.host;
    this.endpoint = extra?.endpoint;
  }
}

export type MetaCallContext = {
  operationId?: string;
  metaAppKey?: string;
  redirectUri?: string;
  stage?: string;
};

function logMetaCall(event: string, context: MetaCallContext | undefined, extra: Record<string, unknown>) {
  console.log(JSON.stringify({
    source: "nexoflow-meta",
    event,
    operation_id: context?.operationId || null,
    meta_app_key: context?.metaAppKey || null,
    redirect_uri: context?.redirectUri || null,
    stage: context?.stage || extra.stage || null,
    host: extra.host || null,
    endpoint: extra.endpoint || null,
    status: extra.status ?? null,
    error_code: extra.error_code ?? null,
    error_subcode: extra.error_subcode ?? null,
    fbtrace_id: extra.fbtrace_id || null,
  }));
}

function requestTarget(raw: string) {
  try {
    const url = new URL(raw);
    return { host: url.host, endpoint: url.pathname };
  } catch {
    return { host: "", endpoint: raw.split("?")[0] || raw };
  }
}

function stageError(stage: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "A Meta não concluiu esta etapa.";
  const code = error instanceof MetaApiError ? error.code : undefined;
  throw new MetaApiError(`${stage}: ${message}`, code);
}

async function readMetaPayload(response: Response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<") || /^error code:\s*\d+/i.test(trimmed)) {
    const code = trimmed.match(/error code:\s*(\d+)/i)?.[1];
    throw new MetaApiError(code ? `A Meta/Cloudflare não respondeu (erro ${code}). A fila tenta de novo.` : `A Meta respondeu com status ${response.status}.`, response.status);
  }
  try {
    return JSON.parse(trimmed) as MetaErrorBody;
  } catch {
    throw new MetaApiError(`A Meta respondeu com status ${response.status}.`, response.status);
  }
}

let queueAbortSignal: AbortSignal | undefined;

export function setQueueAbortSignal(signal?: AbortSignal) {
  queueAbortSignal = signal;
}

export function isQueueAborted() {
  return Boolean(queueAbortSignal?.aborted);
}

function mergedAbortSignal(extra?: AbortSignal | null) {
  const signals: AbortSignal[] = [];
  try {
    signals.push(AbortSignal.timeout(10_000));
  } catch {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10_000);
    signals.push(controller.signal);
  }
  if (extra && !extra.aborted) signals.push(extra);
  if (queueAbortSignal && !queueAbortSignal.aborted) signals.push(queueAbortSignal);
  if (signals.length === 1) return signals[0];
  try {
    return AbortSignal.any(signals);
  } catch {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    return controller.signal;
  }
}

async function metaFetch(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: mergedAbortSignal(init?.signal) });
  } catch (error) {
    const target = requestTarget(url);
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new MetaApiError("A Meta não respondeu a tempo. A fila tenta de novo.", 504, { status: 504, host: target.host, endpoint: target.endpoint });
    }
    throw error;
  }
}

async function metaJson<T>(url: string, init?: RequestInit, context?: MetaCallContext): Promise<T> {
  const target = requestTarget(url);
  const response = await metaFetch(url, init);
  const payload = await readMetaPayload(response) as T & MetaErrorBody;
  const fbtraceId = payload.error && "fbtrace_id" in (payload.error as object)
    ? String((payload.error as { fbtrace_id?: string }).fbtrace_id || "")
    : response.headers.get("x-fb-trace-id") || response.headers.get("x-fb-request-id") || "";
  const errorCode = payload.error?.code ?? payload.code;
  const errorSubcode = payload.error?.error_subcode;
  if (context) {
    logMetaCall("meta.request", context, {
      host: target.host,
      endpoint: target.endpoint,
      status: response.status,
      error_code: errorCode,
      error_subcode: errorSubcode,
      fbtrace_id: fbtraceId,
    });
  }
  if (!response.ok || payload.error || payload.error_message) {
    throw new MetaApiError(
      payload.error?.message || payload.error_message || `A Meta respondeu com status ${response.status}.`,
      errorCode,
      { subcode: errorSubcode, status: response.status, fbtraceId, host: target.host, endpoint: target.endpoint },
    );
  }
  return payload;
}

async function metaJsonWithTrace<T>(url: string, init?: RequestInit) {
  const response = await metaFetch(url, init);
  const payload = await readMetaPayload(response) as T & MetaErrorBody;
  if (!response.ok || payload.error || payload.error_message) {
    throw new MetaApiError(
      payload.error?.message || payload.error_message || `A Meta respondeu com status ${response.status}.`,
      payload.error?.code ?? payload.code,
    );
  }
  return {
    data: payload as T,
    apiVersion: response.headers.get("instagram-api-version") || response.headers.get("facebook-api-version"),
    requestId: response.headers.get("x-fb-request-id") || response.headers.get("x-fb-trace-id"),
  };
}

export type MetaApiMode = "instagram" | "facebook";

export function connectionApiMode(scopes: string): MetaApiMode {
  return scopes.split(",").map((scope) => scope.trim()).includes("instagram_content_publish") ? "facebook" : "instagram";
}

function graphUrl(path: string, mode: MetaApiMode = "instagram", versionOverride?: string | null) {
  const { graphVersion } = metaConfig();
  const version = versionOverride || graphVersion;
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Configure uma versão válida da API Graph da Meta.");
  const host = mode === "facebook" ? "graph.facebook.com" : "graph.instagram.com";
  return `https://${host}/${version}/${path.replace(/^\//, "")}`;
}

export function facebookAuthorizationUrl(state: string, redirectUri: string) {
  const { appId, graphVersion } = facebookMetaConfig();
  if (!appId) throw new Error("O aplicativo principal do Facebook ainda não foi configurado.");
  const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeFacebookAuthorizationCode(code: string, redirectUri: string) {
  const { appId, appSecret } = facebookMetaConfig();
  const shortUrl = new URL(graphUrl("oauth/access_token", "facebook"));
  shortUrl.searchParams.set("client_id", appId); shortUrl.searchParams.set("client_secret", appSecret);
  shortUrl.searchParams.set("redirect_uri", redirectUri); shortUrl.searchParams.set("code", code);
  const short = await metaJson<{ access_token: string; expires_in?: number }>(shortUrl.toString());
  const longUrl = new URL(graphUrl("oauth/access_token", "facebook"));
  longUrl.searchParams.set("grant_type", "fb_exchange_token"); longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret); longUrl.searchParams.set("fb_exchange_token", short.access_token);
  try {
    const long = await metaJson<{ access_token: string; expires_in?: number }>(longUrl.toString());
    return { accessToken: long.access_token, expiresIn: long.expires_in ?? 5_184_000 };
  } catch {
    return { accessToken: short.access_token, expiresIn: short.expires_in ?? 3_600 };
  }
}

export async function getFacebookInstagramAccounts(userAccessToken: string) {
  type PageRecord = { id: string; name?: string; access_token?: string; instagram_business_account?: { id: string } };
  const accounts: Array<{ profile: InstagramProfile; pageAccessToken: string; pageId: string; pageName: string }> = [];
  const candidates: Array<{ instagramUserId: string; pageAccessToken: string; pageId: string; pageName: string }> = [];
  let pagesFound = 0;
  let next: string | null = (() => {
    const url = new URL(graphUrl("me/accounts", "facebook"));
    // The Pages edge generally returns only the linked Instagram object ID.
    // Read profile fields in a second request using the Page access token.
    url.searchParams.set("fields", "id,name,access_token,instagram_business_account");
    url.searchParams.set("limit", "100"); url.searchParams.set("access_token", userAccessToken);
    return url.toString();
  })();
  for (let page = 0; next && page < 10; page += 1) {
    const result: { data?: PageRecord[]; paging?: { next?: string } } = await metaJson(next);
    for (const item of result.data ?? []) {
      pagesFound += 1;
      if (item.access_token && item.instagram_business_account?.id) candidates.push({ instagramUserId: item.instagram_business_account.id, pageAccessToken: item.access_token, pageId: item.id, pageName: item.name || item.id });
    }
    next = result.paging?.next || null;
  }
  for (let index = 0; index < candidates.length; index += 8) {
    const batch = candidates.slice(index, index + 8);
    const resolved = await Promise.all(batch.map(async (candidate) => {
      try {
        const profile = await getInstagramProfile(candidate.instagramUserId, candidate.pageAccessToken, "facebook");
        if (!profile.username) return null;
        return { profile, pageAccessToken: candidate.pageAccessToken, pageId: candidate.pageId, pageName: candidate.pageName };
      } catch {
        return null;
      }
    }));
    accounts.push(...resolved.filter((item): item is NonNullable<typeof item> => Boolean(item)));
  }
  return { accounts, pagesFound, linkedInstagramIds: candidates.length };
}

export function instagramAuthorizationUrl(state: string, redirectUri: string, app = metaConfig()) {
  const { appId } = app;
  if (!appId) throw new Error("O ID do aplicativo Meta ainda não foi configurado.");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string, redirectUri: string, app = metaConfig(), context?: MetaCallContext) {
  const { appId, appSecret, graphVersion } = app;
  const shortBody = new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code });
  let shortToken: { access_token: string; user_id: string; permissions?: string[]; expires_in?: number };
  try {
    shortToken = await metaJson("https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: shortBody }, { ...context, stage: "token_exchange" });
  } catch (error) {
    stageError("Troca do código de autorização", error);
  }

  const exchange = new URL(`https://graph.instagram.com/${graphVersion || metaConfig().graphVersion}/access_token`);
  exchange.searchParams.set("grant_type", "ig_exchange_token");
  exchange.searchParams.set("client_secret", appSecret);
  exchange.searchParams.set("access_token", shortToken.access_token);
  try {
    const longToken = await metaJson<{ access_token: string; token_type?: string; expires_in?: number }>(exchange.toString(), undefined, { ...context, stage: "long_lived_token" });
    return { userId: String(shortToken.user_id), accessToken: longToken.access_token, expiresIn: longToken.expires_in ?? 5_184_000, scopes: shortToken.permissions ?? [], exchangeWarning: null };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("unsupported request - method type")) {
      return {
        userId: String(shortToken.user_id),
        accessToken: shortToken.access_token,
        expiresIn: shortToken.expires_in ?? 3_600,
        scopes: shortToken.permissions ?? [],
        exchangeWarning: "A Meta autorizou a conta, mas não estendeu automaticamente a validade do token. Reconecte antes do vencimento.",
      };
    }
    stageError("Geração do token de longa duração", error);
  }
}

function asCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function normalizeInstagramMe(payload: unknown): InstagramProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const row = Array.isArray(root.data) ? (root.data[0] as Record<string, unknown> | undefined) : root;
  if (!row || typeof row !== "object") return null;
  const id = String(row.user_id || row.id || "").trim();
  const username = String(row.username || "").replace(/^@/, "").trim();
  if (!id && !username) return null;
  return {
    id: id || username,
    user_id: id || username,
    username: username || id,
    account_type: row.account_type ? String(row.account_type) : undefined,
    profile_picture_url: row.profile_picture_url ? String(row.profile_picture_url) : undefined,
    followers_count: asCount(row.followers_count),
    follows_count: asCount(row.follows_count),
    media_count: asCount(row.media_count),
  };
}

async function readInstagramMe(accessToken: string, fields: string, graphVersion: string, context?: MetaCallContext) {
  const version = graphVersion || metaConfig().graphVersion;
  const urls: string[] = [];
  if (/^v\d+\.\d+$/.test(version)) urls.push(`https://graph.instagram.com/${version}/me`);
  urls.push("https://graph.instagram.com/me");
  let lastError: unknown;
  for (const base of urls) {
    const url = new URL(base);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);
    try {
      const payload = await metaJson<unknown>(url.toString(), undefined, { ...context, stage: `instagram_me:${fields}` });
      const profile = normalizeInstagramMe(payload);
      if (profile) return profile;
      lastError = new MetaApiError("A Meta devolveu o perfil sem id ou username.", 100, { host: "graph.instagram.com", endpoint: "/me" });
    } catch (error) {
      lastError = error;
    }
    try {
      const urlBearer = new URL(base);
      urlBearer.searchParams.set("fields", fields);
      const payload = await metaJson<unknown>(urlBearer.toString(), { headers: { authorization: `Bearer ${accessToken}` } }, { ...context, stage: `instagram_me_bearer:${fields}` });
      const profile = normalizeInstagramMe(payload);
      if (profile) return profile;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível ler o perfil no Instagram.");
}

async function enrichInstagramProfile(profile: InstagramProfile, accessToken: string, graphVersion: string, context?: MetaCallContext) {
  if (typeof profile.followers_count === "number") return profile;
  const merge = (extra: { followers_count?: number; follows_count?: number; media_count?: number }) => ({
    ...profile,
    followers_count: extra.followers_count ?? profile.followers_count,
    follows_count: extra.follows_count ?? profile.follows_count,
    media_count: extra.media_count ?? profile.media_count,
  });
  try {
    return merge(await readInstagramMe(accessToken, "id,username,followers_count,follows_count,media_count", graphVersion, context));
  } catch { /* tenta o id profissional em seguida */ }
  const userId = profile.user_id || profile.id;
  if (!userId) return profile;
  try {
    const version = graphVersion || metaConfig().graphVersion;
    const url = new URL(`https://graph.instagram.com/${version}/${userId}`);
    url.searchParams.set("fields", "followers_count,follows_count,media_count");
    url.searchParams.set("access_token", accessToken);
    const extra = await metaJson<Record<string, unknown>>(url.toString(), undefined, { ...context, stage: "instagram_counts" });
    return merge({
      followers_count: asCount(extra.followers_count),
      follows_count: asCount(extra.follows_count),
      media_count: asCount(extra.media_count),
    });
  } catch {
    return profile;
  }
}

export function describeInstagramProfileError(error: unknown, appId?: string) {
  const message = error instanceof Error ? error.message.replace(/^Leitura do perfil profissional:\s*/i, "") : "A Meta não concluiu esta etapa.";
  const code = error instanceof MetaApiError ? error.code : undefined;
  if (code === 100 || /unsupported request/i.test(message)) {
    return `A Meta autorizou a conta, mas o token ainda não lê o perfil. No app ${appId || "Meta"}, em Funções, adicione este Instagram como Instagram Tester e conecte de novo.`;
  }
  return `Leitura do perfil profissional: ${message}`.slice(0, 180);
}

export async function getInstagramProfile(instagramUserId: string, accessToken: string, mode: MetaApiMode = "instagram", context?: MetaCallContext) {
  if (mode === "facebook") {
    let lastError: unknown;
    let profile: InstagramProfile | undefined;
    for (const fields of ["id,username,account_type,profile_picture_url,followers_count,follows_count,media_count", "id,username,account_type,profile_picture_url,followers_count", "id,username,account_type,profile_picture_url", "id,username"]) {
      const detailUrl = new URL(graphUrl(instagramUserId, "facebook"));
      detailUrl.searchParams.set("fields", fields);
      try {
        profile = await metaJson<InstagramProfile>(detailUrl.toString(), { headers: { authorization: `Bearer ${accessToken}` } });
        if (typeof profile.followers_count !== "number") profile = { ...profile, followers_count: asCount(profile.followers_count), follows_count: asCount(profile.follows_count), media_count: asCount(profile.media_count) };
        if (typeof profile.followers_count === "number") return profile;
      } catch (error) {
        lastError = error;
      }
    }
    if (profile) return profile;
    throw lastError instanceof Error ? lastError : new Error("Não foi possível ler o perfil profissional vinculado à Página.");
  }

  const graphVersion = metaConfig(context?.metaAppKey).graphVersion;
  const fieldSets = ["id,username,account_type,followers_count,follows_count,media_count", "id,username,account_type", "id,username", "user_id,username,account_type", "user_id,username"];
  let lastError: unknown;
  for (const fields of fieldSets) {
    try {
      const profile = await readInstagramMe(accessToken, fields, graphVersion, context);
      return await enrichInstagramProfile(profile, accessToken, graphVersion, context);
    } catch (error) {
      lastError = error;
    }
  }
  if (context) {
    const error = lastError instanceof MetaApiError ? lastError : undefined;
    logMetaCall("instagram.profile.failed", context, {
      host: error?.host || "graph.instagram.com",
      endpoint: error?.endpoint || "/me",
      status: error?.status,
      error_code: error?.code,
      error_subcode: error?.subcode,
      fbtrace_id: error?.fbtraceId,
    });
  }
  throw lastError instanceof Error ? lastError : new Error("Não foi possível ler o perfil profissional.");
}

export async function getPublishingLimit(instagramUserId: string, accessToken: string, mode: MetaApiMode = "instagram") {
  const url = new URL(graphUrl(`${instagramUserId}/content_publishing_limit`, mode));
  url.searchParams.set("fields", "quota_usage,config");
  return metaJson<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number; quota_duration?: number } }> }>(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } });
}

type InsightMetric = { name: string; values?: Array<{ value?: number }>; total_value?: { value?: number } };

function insightMetricValue(metric?: InsightMetric) {
  if (!metric) return null;
  if (typeof metric.total_value?.value === "number") return metric.total_value.value;
  const values = metric.values ?? [];
  if (!values.length) return null;
  return values.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
}

export async function getAccountInsights(instagramUserId: string, accessToken: string, mode: MetaApiMode = "instagram") {
  const since = String(Math.floor((Date.now() - 29 * 86_400_000) / 1000));
  const until = String(Math.floor(Date.now() / 1000));
  const headers = { headers: { authorization: `Bearer ${accessToken}` } };
  const read = async (metric: string, extras: Record<string, string> = {}) => {
    const url = new URL(graphUrl(`${instagramUserId}/insights`, mode));
    url.searchParams.set("metric", metric);
    for (const [key, value] of Object.entries(extras)) url.searchParams.set(key, value);
    const result = await metaJson<{ data?: InsightMetric[] }>(url.toString(), headers);
    return result.data ?? [];
  };
  let views30d = 0;
  let reach30d = 0;
  let viewsAvailable = false;
  let reachAvailable = false;
  try {
    const data = await read("views,reach", { period: "day", metric_type: "total_value", since, until });
    const views = insightMetricValue(data.find((item) => item.name === "views"));
    const reach = insightMetricValue(data.find((item) => item.name === "reach"));
    if (typeof views === "number") { views30d = views; viewsAvailable = true; }
    if (typeof reach === "number") { reach30d = reach; reachAvailable = true; }
  } catch {
    try {
      const data = await read("views,reach", { period: "day", since, until });
      const views = insightMetricValue(data.find((item) => item.name === "views"));
      const reach = insightMetricValue(data.find((item) => item.name === "reach"));
      if (typeof views === "number") { views30d = views; viewsAvailable = true; }
      if (typeof reach === "number") { reach30d = reach; reachAvailable = true; }
    } catch {
      /* métrica da conta é apoio; o que vale no painel é o insight de cada vídeo */
    }
  }
  let profileViews30d = 0;
  let newFollowers30d = 0;
  let profileViewsAvailable = false;
  let newFollowersAvailable = false;
  try {
    const data = await read("follower_count,profile_views", { period: "day", since, until }).catch(() => read("follower_count", { period: "day", since, until }));
    const newFollowers = insightMetricValue(data.find((item) => item.name === "follower_count"));
    const profileViews = insightMetricValue(data.find((item) => item.name === "profile_views"));
    if (typeof newFollowers === "number") { newFollowers30d = newFollowers; newFollowersAvailable = true; }
    if (typeof profileViews === "number") { profileViews30d = profileViews; profileViewsAvailable = true; }
  } catch {
    /* opcional */
  }
  if (!viewsAvailable && !reachAvailable) throw new Error("A Meta não disponibilizou as métricas desta conta.");
  return { views30d, reach30d, viewsAvailable, reachAvailable, profileViews30d, profileViewsAvailable, newFollowers30d, newFollowersAvailable };
}

export async function getMediaInsights(mediaId: string, accessToken: string, mode: MetaApiMode = "instagram") {
  const pick = (metrics: InsightMetric[] | undefined, name: string) => insightMetricValue(metrics?.find((item) => item.name === name));
  const loadMetrics = async (metricList: string) => {
    const url = new URL(graphUrl(`${mediaId}/insights`, mode));
    url.searchParams.set("metric", metricList);
    try {
      const result = await metaJson<{ data?: InsightMetric[] }>(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } });
      return result.data ?? [];
    } catch {
      return [] as InsightMetric[];
    }
  };

  const primary = await loadMetrics("views,reach");
  let views = pick(primary, "views");
  let reach = pick(primary, "reach");
  let plays: number | null = null;
  let totalViews: number | null = null;
  if (views == null && reach == null) {
    const fallback = await loadMetrics("plays,total_views,ig_reels_aggregated_all_plays_count");
    plays = pick(fallback, "plays") ?? pick(fallback, "ig_reels_aggregated_all_plays_count");
    totalViews = pick(fallback, "total_views");
  }
  const bestViews = Math.max(views ?? 0, plays ?? 0, totalViews ?? 0);
  if (views == null && plays == null && totalViews == null && reach == null) {
    throw new Error("A Meta ainda não disponibilizou insights para esta publicação.");
  }
  return {
    views: bestViews,
    reach: reach ?? 0,
    source: views != null ? "views" : plays != null ? "plays" : totalViews != null ? "total_views" : "unavailable",
  };
}

function isUnsupportedMethod(error: unknown) {
  return /unsupported request - method type/i.test(error instanceof Error ? error.message : String(error));
}

async function postInstagramMedia(igUserId: string, accessToken: string, payload: Record<string, string>, version?: string | null) {
  const endpoint = graphUrl(`${igUserId}/media`, "instagram", version);
  const form = new URLSearchParams(payload);
  const formUrl = new URL(endpoint);
  if (payload.caption) formUrl.searchParams.set("caption", payload.caption);
  const queryUrl = new URL(endpoint);
  for (const [key, value] of Object.entries(payload)) queryUrl.searchParams.set(key, value);
  const attempts: Array<{ transport: "form" | "json" | "query"; url: string; init: RequestInit }> = [
    { transport: "form", url: formUrl.toString(), init: { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/x-www-form-urlencoded" }, body: form } },
    { transport: "json", url: endpoint, init: { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(payload) } },
    { transport: "query", url: queryUrl.toString(), init: { method: "POST", headers: { authorization: `Bearer ${accessToken}` } } },
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    if (isQueueAborted()) break;
    try {
      const result = await metaJsonWithTrace<{ id: string }>(attempt.url, attempt.init);
      return { id: result.data.id, apiVersion: result.apiVersion, requestId: result.requestId, transport: attempt.transport, igUserId };
    } catch (error) {
      lastError = error;
      if (attempt.transport === "form" || attempt.transport === "json") continue;
      if (!isUnsupportedMethod(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new MetaApiError("Unsupported request - method type: post", 100);
}

async function instagramPublishIds(storedId: string, accessToken: string, version?: string | null) {
  const ids = [storedId];
  try {
    const url = new URL(graphUrl("me", "instagram", version));
    url.searchParams.set("fields", "id,user_id,username");
    url.searchParams.set("access_token", accessToken);
    const me = await metaJson<{ id?: string; user_id?: string }>(url.toString());
    for (const value of [me.user_id, me.id]) {
      const id = String(value || "").trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
  } catch {
    /* usa o id gravado na conexão */
  }
  return ids;
}

export async function createMediaContainer(input: { instagramUserId: string; accessToken: string; mediaType: string; mediaUrl: string; mediaContentType?: string | null; caption: string; shareToFeed?: boolean; coverUrl?: string | null; apiMode?: MetaApiMode; graphVersionOverride?: string | null }) {
  const payload: Record<string, string> = {};
  if (input.caption && input.mediaType !== "STORIES") payload.caption = input.caption;
  const isStoryImage = input.mediaType === "STORIES" && input.mediaContentType === "image/jpeg";
  if (input.mediaType === "IMAGE" || isStoryImage) payload.image_url = input.mediaUrl;
  else payload.video_url = input.mediaUrl;
  if (input.mediaType !== "IMAGE") {
    payload.media_type = input.mediaType;
    if (input.mediaType === "REELS") {
      payload.share_to_feed = String(Boolean(input.shareToFeed));
      if (input.coverUrl) payload.cover_url = input.coverUrl;
    }
  }
  if (input.apiMode === "facebook") {
    const url = new URL(graphUrl(`${input.instagramUserId}/media`, "facebook", input.graphVersionOverride));
    for (const [key, value] of Object.entries(payload)) url.searchParams.set(key, value);
    url.searchParams.set("access_token", input.accessToken);
    const result = await metaJsonWithTrace<{ id: string }>(url.toString(), { method: "POST" });
    return { id: result.data.id, apiVersion: result.apiVersion, requestId: result.requestId, transport: "query" as const };
  }
  const versions = [...new Set([input.graphVersionOverride || metaConfig().graphVersion, "v23.0"])];
  let lastError: unknown;
  const ids = await instagramPublishIds(input.instagramUserId, input.accessToken, versions[0]);
  for (const version of versions) {
    for (const igUserId of ids) {
      if (isQueueAborted()) break;
      try {
        return await postInstagramMedia(igUserId, input.accessToken, payload, version);
      } catch (error) {
        lastError = error;
        if (!isUnsupportedMethod(error)) throw error;
      }
    }
  }
  throw new MetaApiError(
    "A Meta recusou o envio desta conta. Reconecte o Instagram em Integrações. Contas novas costumam bloquear depois de alguns Reels no mesmo dia.",
    lastError instanceof MetaApiError ? lastError.code : 100,
  );
}

export async function getContainerStatus(containerId: string, accessToken: string, mode: MetaApiMode = "instagram", graphVersionOverride?: string | null) {
  const url = new URL(graphUrl(containerId, mode, graphVersionOverride)); url.searchParams.set("fields", "status_code,status"); url.searchParams.set("access_token", accessToken);
  return metaJson<{ status_code: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED"; status?: string }>(url.toString());
}

export async function publishContainer(instagramUserId: string, containerId: string, accessToken: string, mode: MetaApiMode = "instagram", graphVersionOverride?: string | null) {
  const body = new URLSearchParams({ creation_id: containerId, access_token: accessToken });
  const result = await metaJsonWithTrace<{ id: string }>(graphUrl(`${instagramUserId}/media_publish`, mode, graphVersionOverride), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  return { ...result.data, apiVersion: result.apiVersion, requestId: result.requestId };
}

export async function getPublishedMedia(mediaId: string, accessToken: string, mode: MetaApiMode = "instagram", graphVersionOverride?: string | null) {
  const url = new URL(graphUrl(mediaId, mode, graphVersionOverride));
  url.searchParams.set("fields", "id,caption,media_type,permalink");
  url.searchParams.set("access_token", accessToken);
  return metaJson<{ id: string; caption?: string; media_type?: string; permalink?: string }>(url.toString());
}

export async function deletePublishedMedia(mediaId: string, accessToken: string, mode: MetaApiMode = "instagram", graphVersionOverride?: string | null) {
  const url = new URL(graphUrl(mediaId, mode, graphVersionOverride));
  url.searchParams.set("access_token", accessToken);
  const result = await metaJsonWithTrace<{ success?: boolean }>(url.toString(), { method: "DELETE" });
  return result.data?.success === true;
}
