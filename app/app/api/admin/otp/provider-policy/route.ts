import { inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appUsers } from "../../../../../db/schema";
import { authErrorResponse, requirePlatformOwner } from "../../../../../lib/auth";
import { getMediaBucket } from "../../../../../lib/media-storage";
import { isOtpSelfSupplyEmail } from "../../../../../lib/otp-billing";
import { OTPGMAIL_PRIMARY_EMAILS } from "../../../../../lib/otp-primary-provider";
import { accountIds, effectiveProvider, legacyPolicy, OtpPolicyError, OTP_POLICY_LIMITS, parsePolicyPatch, readProviderPolicy, writeProviderPolicy } from "../../../../../lib/otp-provider-policy";
import { BodyLimitError, readLimitedBody } from "../../../../../lib/request-body";

const headers = { "cache-control": "private, no-store" };
function failure(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) { auth.headers.set("cache-control", headers["cache-control"]); return auth; }
  if (error instanceof BodyLimitError) return Response.json({ error: "O lote ultrapassou o limite permitido.", code: "body_limit" }, { status: 413, headers });
  if (error instanceof OtpPolicyError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  return Response.json({ error: "Não foi possível acessar a configuração de fornecedor.", code: "policy_unavailable" }, { status: 503, headers });
}
async function legacyUsers() {
  return getDb().select({ id: appUsers.id, email: appUsers.email }).from(appUsers).where(inArray(sql`lower(trim(${appUsers.email}))`, [...OTPGMAIL_PRIMARY_EMAILS]));
}
async function existingUsers(ids: string[]) {
  const users = await getDb().select({ id: appUsers.id, email: appUsers.email }).from(appUsers).where(inArray(appUsers.id, ids));
  if (users.length !== ids.length) throw new OtpPolicyError("users_not_found", "Um ou mais usuários não existem. Atualize a lista.");
  return users;
}
export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "accountUserIds") || params.getAll("accountUserIds").length > 1) throw new OtpPolicyError("invalid_input", "Consulta inválida.");
    let ids: string[] = [];
    if (params.has("accountUserIds")) {
      let value: unknown;
      try { value = JSON.parse(params.get("accountUserIds")!); }
      catch { throw new OtpPolicyError("invalid_input", "Consulta inválida."); }
      ids = accountIds(value);
    }
    const snapshot = await readProviderPolicy(getMediaBucket());
    const policy = snapshot.policy ?? legacyPolicy(await legacyUsers());
    const users = ids.length ? await existingUsers(ids) : [];
    return Response.json({ ...policy, version: snapshot.version, configured: snapshot.policy !== null,
      users: users.map(user => ({ accountUserId: user.id, ...effectiveProvider(policy, user.id, user.email), selfSupply: isOtpSelfSupplyEmail(user.email) })) }, { headers });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    await requirePlatformOwner(request);
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new OtpPolicyError("invalid_origin", "Origem não permitida.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new OtpPolicyError("unsupported_media_type", "Envie JSON.", 415);
    let input: unknown;
    const bytes = await readLimitedBody(request, OTP_POLICY_LIMITS.requestBytes);
    try { input = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new OtpPolicyError("invalid_json", "Envie uma configuração JSON válida."); }
    const patch = parsePolicyPatch(input);
    if (patch.accountUserIds) await existingUsers(patch.accountUserIds);
    const snapshot = await writeProviderPolicy(getMediaBucket(), patch, await legacyUsers());
    return Response.json({ ...snapshot.policy, version: snapshot.version, configured: true }, { headers });
  } catch (error) { return failure(error); }
}
