import { env } from "cloudflare:workers";
import { authErrorResponse, requirePlatformOwner } from "../../../../../lib/auth";
import { getMediaBucket } from "../../../../../lib/media-storage";
import { runtimeEnv } from "../../../../../lib/runtime-env";
import { BodyLimitError, readLimitedBody } from "../../../../../lib/request-body";
import { getCrmExchange } from "../../../../../lib/crm-exchange";
import { CRM_LIMITS, CrmError, crmKeys, crmPeriod, crmRecord, crmTotals, crmUserId, patchCrm, readCrm } from "../../../../../lib/owner-crm";
import { readCrmMetrics } from "../../../../../lib/owner-crm-metrics";

const headers = { "cache-control": "private, no-store" };
function errorResponse(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) { const next = new Headers(auth.headers); next.set("cache-control", headers["cache-control"]); return new Response(auth.body, { status: auth.status, headers: next }); }
  if (error instanceof CrmError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  if (error instanceof BodyLimitError) return Response.json({ error: "O CRM excedeu o limite de envio." }, { status: 413, headers });
  return Response.json({ error: "Não foi possível acessar o CRM. Tente novamente." }, { status: 503, headers });
}
async function existingUser(userId: string) {
  const db = env.DB;
  if (!db) throw new Error("Banco indisponível.");
  if (!await db.prepare("SELECT id FROM app_users WHERE id = ? LIMIT 1").bind(userId).first()) throw new CrmError("Usuário não encontrado.", 404, "user_not_found");
  return db;
}

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const params = new URL(request.url).searchParams;
    const userId = crmUserId(params.get("userId"));
    const period = crmPeriod(params.get("from"), params.get("to"));
    const db = await existingUser(userId);
    const crm = await readCrm(getMediaBucket(), userId);
    const exchange = await getCrmExchange().catch(() => null);
    const metrics = await readCrmMetrics(db, userId, period, runtimeEnv().OTP_RELIABLE_ORDERS_ENABLED === "1", crm.gmailCostUsd, exchange);
    return Response.json({ userId, crm, totals: crmTotals(crm), period, exchange, metrics }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await requirePlatformOwner(request);
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new CrmError("Origem não permitida.", 403, "invalid_origin");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new CrmError("Envie JSON.", 415);
    let raw: unknown;
    const bytes = await readLimitedBody(request, CRM_LIMITS.bodyBytes);
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new CrmError("JSON inválido."); }
    const payload = crmRecord(raw);
    crmKeys(payload, ["userId", "revision", "fields"]);
    const userId = crmUserId(payload.userId);
    await existingUser(userId);
    const crm = await patchCrm(getMediaBucket(), userId, { revision: payload.revision, fields: payload.fields });
    return Response.json({ userId, crm, totals: crmTotals(crm) }, { headers });
  } catch (error) { return errorResponse(error); }
}
