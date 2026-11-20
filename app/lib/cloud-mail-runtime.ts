import { getMediaBucket } from "./media-storage";
import { decryptToken, encryptToken } from "./token-crypto";
import { createCloudMail, MAIL_ROOT, mailRootForLogin, MailError } from "./cloud-mail";
import { readLimitedBody } from "./request-body";
import { createMailOrganization } from "./cloud-mail-organization";
import { createMailDeletion } from "./cloud-mail-deletion";
export const cloudMail = (login = "lucasbgn.affiliate@gmail.com") => createCloudMail(getMediaBucket(), { encrypt: encryptToken, decrypt: decryptToken }, undefined, undefined, mailRootForLogin(login));
export const cloudMailOrganization = (login: string) => createMailOrganization(getMediaBucket(), { encrypt: encryptToken, decrypt: decryptToken }, () => cloudMail(login).inventory(), undefined, mailRootForLogin(login));
// No trusted bot deletion barrier exists yet. Fail closed; never accept a
// browser-supplied claim that reservations are clear.
export const cloudMailDeletion = (login: string) => createMailDeletion(getMediaBucket(), { encrypt: encryptToken, decrypt: decryptToken }, undefined, undefined, mailRootForLogin(login));
export function mailResponse(data: unknown, status = 200, headers: Record<string, string> = {}) { return Response.json(data, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...headers } }); }
const errors: Record<string,string> = { provider_protocol: "Resposta do fornecedor ainda incompatível. Nenhum código foi confirmado.", export_source_unsupported: "A seleção contém caixas MixOTP, incompatíveis com exportação de credenciais Microsoft/Graph. Nenhum arquivo parcial foi gerado.", source_unsupported: "Origem incompatível com esta integração.", mail_busy: "Esta caixa está sendo consultada. Aguarde e tente novamente.", throttle: "Limite temporário do provedor. Aguarde antes de consultar novamente.", auth: "A autorização desta caixa precisa ser renovada.", permission: "Esta caixa não tem a permissão de leitura necessária.", identity: "A autorização retornou outra caixa. A consulta foi interrompida.", import_invalid: "Arquivo inválido. Use quatro ou cinco campos separados por |: e-mail, senha, refresh token, client ID e, opcionalmente, e-mail de recuperação. Para MixOTP: e-mail----URL assinada do fornecedor.", import_duplicate: "O arquivo contém e-mails duplicados.", history_capacity: "O histórico atingiu o limite de armazenamento. Nenhum registro foi apagado.", mail_not_found: "Caixa não encontrada." };
const managementErrors: Record<string,string> = { organization_invalid:"Seleção ou solicitação inválida.", organization_conflict:"Esta solicitação já foi usada com outra seleção. Atualize a lista.", organization_capacity:"O registro de organização atingiu o limite. Seu histórico foi preservado.", organization_forbidden:"Recurso indisponível para este login.", deletion_confirmation:"Digite o endereço exato para confirmar a exclusão.", deletion_guard_required:"A exclusão definitiva exige confirmação dos vínculos com o bot. Use Arquivar enquanto essa verificação não estiver disponível.", mail_deleting:"Esta caixa tem uma exclusão pendente. Confira o resultado antes de tentar novamente." };
export function mailErrorResponse(error: unknown) {
  const retryAfterSeconds = error instanceof MailError && ['throttle', 'mail_busy'].includes(error.code) ? (typeof error.wait === 'number' && Number.isFinite(error.wait) ? Math.max(1, Math.min(86400, Math.ceil(error.wait))) : error.code === 'mail_busy' ? 120 : 60) : null;
  return mailResponse({ error: error instanceof MailError ? errors[error.code] || managementErrors[error.code] || "Não foi possível concluir esta operação. Tente novamente." : "Não foi possível concluir esta operação. Tente novamente.", code: error instanceof MailError ? error.code : "unavailable", ...(retryAfterSeconds === null ? {} : { retryAfterSeconds }) }, error instanceof MailError ? error.status : 503, retryAfterSeconds === null ? {} : { 'retry-after': String(retryAfterSeconds) });
}
export async function mailJson(request: Request, limit = 2_000_000) { const bytes = await readLimitedBody(request, limit); try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MailError("import_invalid", 400); } }
export async function registerMailBridge(hash: unknown) {
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new MailError("invalid", 400);
  const key = MAIL_ROOT + "bridge.json", bucket = getMediaBucket(), old = await bucket.get(key);
  if (old) { const state = await old.json<{hash:string}>(); if (state.hash !== hash) throw new MailError("bridge_exists"); return; }
  if (!await bucket.put(key, JSON.stringify({hash,createdAt:new Date().toISOString()}), {onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json",cacheControl:"no-store"}})) throw new MailError("mail_busy");
}
export async function handleCloudMailBridge(request: Request) {
  try {
    if (request.method !== "POST" || request.headers.has("origin") || request.headers.has("sec-fetch-site")) return mailResponse({error:"Unauthorized"},403);
    const bearer = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!bearer) return mailResponse({error:"Unauthorized"},401);
    const obj = await getMediaBucket().get(MAIL_ROOT+"bridge.json"); if (!obj) return mailResponse({error:"Unauthorized"},401);
    const expected = (await obj.json<{hash:string}>()).hash;
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer)))].map(b=>b.toString(16).padStart(2,"0")).join("");
    let diff=hash.length^expected.length;for(let i=0;i<64;i++)diff|=hash.charCodeAt(i)^expected.charCodeAt(i);
    if(diff)return mailResponse({error:"Unauthorized"},401);
    const body=await mailJson(request,1024), store=cloudMail();
    if(!body || typeof body!=="object" || Object.keys(body).some(k=>!["action","accountId"].includes(k)))throw new MailError("invalid",400);
    if(body.action==="health")return mailResponse({service:"resolvbot-hotmail-bridge",version:1});
    if(body.action==="inventory")return mailResponse({accounts:await store.inventory(true)});
    if(body.action==="storedHistoryStats") {
      if (Object.keys(body).some(key => key !== 'action')) throw new MailError('invalid',400);
      return mailResponse(await store.storedHistoryStats(true));
    }
    if(body.action==="snapshot"&&typeof body.accountId==="string")return mailResponse(await store.snapshot(body.accountId, true));
    throw new MailError("invalid",400);
  }catch(e){return mailErrorResponse(e);}
}
