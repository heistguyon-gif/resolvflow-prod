import { authErrorResponse, requireWorkspaceContext } from "../../../lib/auth";
import { debitWallet, formatBrl, GMAIL_WALLET_CENTS, getInstacasterApiKey, getStoredInstacasterApiKey, getWallet, getWorkspaceInstacasterApiKey, getWorkspaceSupplierApi, isOtpCostOwnerEmail, isOtpSelfSupplyEmail, listWorkspaceSupplierApiSecrets, otpSalePriceCents, refundWallet, workspaceUsesOtpSupplierBalance } from "../../../lib/otp-billing";
import { appendInboxCode, customerInbox, getOwnedInboxOrder, getOwnedInboxOrderById, listInbox, listOpenInbox, upsertInboxOrder } from "../../../lib/otp-inbox";
import { fetchCodesByOrigin, mapWithConcurrency, otpProviderFetch, requestOrdersForApi } from "../../../lib/otp-provider";
import { settleCancelledGmail } from "../../../lib/otp-cancel-settlement";
import { recordAuditEvent } from "../../../lib/audit";
import { runtimeEnv } from "../../../lib/runtime-env";
import { cancelOtpGmailOrder, isOtpGmailOrderId, isOtpGmailStockFailure, otpGmailCode, otpGmailKey, requestOtpGmailOrder } from "../../../lib/otpgmail-fallback";
import { reliableOtpEnabled, otpOrderStore, coordinatedOtpFetch } from "../../../lib/otp-reliable-runtime";
import { continueOtpPurchase } from "../../../lib/otp-order-service";
import { otpHash } from "../../../lib/otp-provider-coordinator";
import { resolveOtpPrimaryProvider } from "../../../lib/otp-provider-policy-runtime";
import { durableOtpStore } from "../../../lib/otp-durable-runtime";
import { PurchaseError } from "../../../lib/otp-durable-purchase";
import { canUseGmailCentral } from "../../../lib/gmail-pilot-runtime";

const MAX_OTP_BATCH = 13;
const PROVIDER_CONCURRENCY = 4;
const CODE_CONCURRENCY = 5;

function withoutApiOrigin<T extends { supplierApiId?: string | null; supplierApiName?: string; price?: string }>(record: T) {
  const publicRecord = { ...record };
  delete publicRecord.supplierApiId;
  delete publicRecord.supplierApiName;
  delete publicRecord.price;
  return publicRecord;
}

function providerError(status: number, payload: unknown, privileged: boolean) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
  const detail = record.detail;
  const detailRecord = detail && typeof detail === "object" ? detail as Record<string, unknown> : null;
  const detailError = detailRecord?.error && typeof detailRecord.error === "object" ? detailRecord.error as Record<string, unknown> : null;
  const code = String(nested?.code || detailError?.code || record.code || "").toLowerCase();
  const raw = String(nested?.message || detailError?.message || (typeof detail === "string" ? detail : "") || record.message || "").trim();
  let message = "Não foi possível concluir o pedido.";
  let state = "error";
  if (status === 409 && (code.includes("out_of_stock") || /stock|estoque/i.test(`${code} ${raw}`))) {
    message = "Sem estoque no fornecedor agora.";
    state = "out_of_stock";
  } else if (status === 409 || code.includes("code_unavailable")) {
    message = "Este e-mail já fechou.";
    state = "closed";
  } else if (status === 429) {
    message = "Limite temporário da API. Tente novamente em instantes.";
    state = "rate_limited";
  } else if (status === 401) {
    message = privileged ? "Chave da API inválida." : "Serviço de e-mail indisponível.";
    state = "invalid_key";
  } else if (status === 402 || code.includes("insufficient")) {
    message = privileged ? "Saldo insuficiente nesta API." : "Serviço de e-mail indisponível.";
    state = "insufficient_balance";
  } else if (status === 403) {
    message = privileged ? "A API recusou a operação." : "Serviço de e-mail indisponível.";
    state = "forbidden";
  }
  return { message, state, code: code || undefined, status: status >= 400 && status < 500 && status !== 401 ? status : 502 };
}

function storedCodes(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || "[]") as Array<{ code?: string }>;
    return Array.isArray(parsed) ? parsed.flatMap((item) => item?.code ? [String(item.code)] : []) : [];
  } catch {
    return [];
  }
}


function publicError(status: number, payload: unknown, privileged: boolean) {
  const error = providerError(status, payload, privileged);
  return Response.json({ error: error.message, code: privileged ? error.code : undefined, state: error.state }, { status: error.status });
}

async function directApiKey(workspaceOwnerUserId: string, email: string, apiId?: string | null, requireEnabled = false) {
  if (apiId) return getWorkspaceSupplierApi(workspaceOwnerUserId, apiId, { requireEnabled });
  const key = await getWorkspaceInstacasterApiKey(workspaceOwnerUserId, email);
  return key ? { id: null, name: "API principal", key, enabled: true, isPrimary: true } : null;
}

async function orderOriginApiKey(input: {
  workspaceOwnerUserId: string;
  supplierApiId?: string | null;
  createdAt?: string | null;
}) {
  if (input.supplierApiId) {
    const origin = await getWorkspaceSupplierApi(input.workspaceOwnerUserId, input.supplierApiId, { requireEnabled: false });
    if (origin?.key) return origin.key;
  }
  const cutoverAt = Date.parse(runtimeEnv().OTP_GLOBAL_API_CUTOVER_AT || "");
  const createdAt = Date.parse(input.createdAt || "");
  if (Number.isFinite(cutoverAt) && Number.isFinite(createdAt) && createdAt < cutoverAt) {
    const previous = await getStoredInstacasterApiKey();
    if (previous) return previous;
  }
  return getInstacasterApiKey();
}

async function instacasterCode(key:string,id:string,fetchImpl:typeof fetch,recover=true) {
  const result=await otpProviderFetch(key,`/v1/orders/${id}/code`,"GET",undefined,fetchImpl);
  if (!recover || !reliableOtpEnabled() || !result.response.ok || (result.data as {status?:string})?.status !== "pending") return result;
  // The supplier consumes /code once. History recovers a code if persistence was interrupted.
  try {
    const history=await otpProviderFetch(key,`/v1/orders/${id}`,"GET",undefined,fetchImpl);
    const record=history.data as {codes?:Array<{code?:string}>;last_code?:string}|null;
    const code=record?.codes?.[0]?.code || record?.last_code;
    if (history.response.ok && code) return {response:history.response,data:{status:"ready",code}};
  } catch { /* The original pending result remains valid. */ }
  return result;
}

export async function POST(request: Request) {
  let platformWallet=true;
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const selfSupply = isOtpSelfSupplyEmail(ctx.email);
    platformWallet=!selfSupply;
    const canManageApis = false;
    const direct = await workspaceUsesOtpSupplierBalance(ctx.workspaceOwnerUserId, ctx.email);
    const ownerCost = isOtpCostOwnerEmail(ctx.email);
    platformWallet=!selfSupply&&(!direct||ownerCost);
    const payload = await request.json() as { sourceMode?: "automatic"|"supplier_1"|"supplier_2"; action?: string; codeOffset?: number; requestId?: string; operationId?: string; product?: string; orderId?: string; inboxId?: string; supplierApiId?: string | null; apiId?: string | null; allApis?: boolean; priorityMode?: number; quantity?: number };
    const action = payload.action;
    if (action === "resume" && (selfSupply || direct && !ownerCost)) return Response.json({error:"Retomada indisponível para este pedido."},{status:400});

    if (action === "products" || action === "balance") {
      if (!canManageApis) return Response.json({ error: "Sem permissão." }, { status: 403 });
      if (action === "balance" && !direct) return Response.json({ error: "Sem permissão." }, { status: 403 });
      if (action === "balance" && !canManageApis) return Response.json({ error: "Sem permissão." }, { status: 403 });
      const selected = direct ? await directApiKey(ctx.workspaceOwnerUserId, ctx.email, payload.apiId, true) : { key: await getWorkspaceInstacasterApiKey(ctx.workspaceOwnerUserId, ctx.email) };
      if (!selected?.key) return Response.json({ error: direct ? "API não encontrada ou desativada." : "Serviço de e-mail indisponível." }, { status: 400 });
      const { response, data } = await otpProviderFetch(selected.key, action === "products" ? "/v1/products" : "/v1/balance", "GET");
      if (!response.ok) return publicError(response.status, data, canManageApis);
      return Response.json(data);
    }

    if (action === "code") {
      const orderId = String(payload.orderId || "").trim();
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) return Response.json({ error: "Pedido inválido." }, { status: 400 });
      const owned = payload.inboxId
        ? await getOwnedInboxOrderById(ctx.accountUserId, String(payload.inboxId))
        : canManageApis ? await getOwnedInboxOrder(ctx.accountUserId, orderId, payload.supplierApiId) : null;
      if (!owned) return Response.json({ error: "Este Gmail não pertence a esta conta." }, { status: 404 });
      if (owned.orderId !== orderId || owned.closed || owned.hiddenAt) return Response.json({ error: "Este Gmail não está em acompanhamento." }, { status: 409 });
      const gmailFallback = !owned.supplierApiId && isOtpGmailOrderId(orderId);
      const originKey = gmailFallback ? otpGmailKey() : await orderOriginApiKey({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, supplierApiId: owned.supplierApiId, createdAt: owned.createdAt });
      if (!originKey) return Response.json({ error: canManageApis ? "A API de origem deste Gmail não está disponível." : "Este Gmail não está disponível para consulta." }, { status: 409 });
      const fetchCode = selfSupply ? fetch : await coordinatedOtpFetch(gmailFallback ? "otpgmail" : "instacaster",originKey);
      const { response, data } = gmailFallback ? await otpGmailCode(originKey, orderId,fetchCode) : await instacasterCode(originKey,orderId,fetchCode,!selfSupply);
      if (!response.ok) {
        return publicError(response.status, data, canManageApis);
      }
      const record = data && typeof data === "object" ? data as { status?: string; code?: string } : {};
      if (record.status === "ready" && record.code) await appendInboxCode(ctx.accountUserId, orderId, String(record.code), owned.supplierApiId);
      return Response.json(canManageApis
        ? { ...record, supplierApiId: owned.supplierApiId }
        : { status: record.status || "pending", code: record.code || null });
    }

    if (action === "codes") {
      const filterApiId = canManageApis && payload.apiId && payload.apiId !== "all" ? payload.apiId : null;
      const codeOffset=Math.max(0,Math.min(100000,Math.floor(Number(payload.codeOffset)||0)));
      const open = await listOpenInbox(ctx.accountUserId, filterApiId,codeOffset);
      const lookups = await fetchCodesByOrigin({
        orders: open,
        concurrency: CODE_CONCURRENCY,
        resolveApiKey: async (supplierApiId, order) => !supplierApiId && isOtpGmailOrderId(order.order_id) ? otpGmailKey() : orderOriginApiKey({
          workspaceOwnerUserId: ctx.workspaceOwnerUserId,
          supplierApiId,
          createdAt: order.savedAt,
        }),
        fetchCode: async (apiKey, orderId, order) => {
          const gmail = !order.supplierApiId && isOtpGmailOrderId(orderId);
          const fetchCode = selfSupply ? fetch : await coordinatedOtpFetch(gmail ? "otpgmail" : "instacaster",apiKey);
          return gmail ? otpGmailCode(apiKey,orderId,fetchCode) : instacasterCode(apiKey,orderId,fetchCode,!selfSupply);
        },
      });
      const results = await Promise.all(lookups.map(async ({ order, apiKeyFound, response, data, error }) => {
        if (!apiKeyFound) return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, closed: false, status: "api_unavailable" };
        if (error || !response) return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, status: "unavailable", closed: false, error: "API indisponível nesta consulta." };
        const record = data && typeof data === "object" ? data as { status?: string; code?: string } : {};
        if (!response.ok) {
          const failure = providerError(response.status, data, canManageApis);
          return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, closed: false, status: failure.state, error: failure.message };
        }
        if (record.status === "ready" && record.code) {
          await appendInboxCode(ctx.accountUserId, order.order_id, String(record.code), order.supplierApiId);
          return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, status: "ready", code: String(record.code), closed: false };
        }
        const gmail = !order.supplierApiId && isOtpGmailOrderId(order.order_id);
        const saved = Array.isArray(order.codes) ? order.codes : [];
        if (gmail && record.status === "closed" && !record.code && saved.length === 0) {
          try {
            const refundedCents = await settleCancelledGmail(request, {
              ownerCost, accountUserId: ctx.accountUserId, workspaceOwnerUserId: ctx.workspaceOwnerUserId,
              orderId: order.order_id, email: order.email,
            });
            return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, status: "cancelled", closed: true, refundedCents };
          } catch {
            return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, status: "pending", closed: false, error: "A devolução deste Gmail falhou. A próxima consulta tenta de novo." };
          }
        }
        return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, status: record.status || "pending", closed: false };
      }));
      const inbox = await listInbox(ctx.accountUserId, filterApiId);
      if (!canManageApis) {
        return Response.json({
          nextCodeOffset:open.length===25 ? codeOffset+25 : 0,
          results: results.map(withoutApiOrigin),
          inbox: customerInbox(inbox),
        });
      }
      return Response.json({ results, inbox });
    }

    if (action === "cancel") {
      const orderId = String(payload.orderId || "").trim();
      const inboxId = String(payload.inboxId || "").trim();
      if (!inboxId || !isOtpGmailOrderId(orderId) || !/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) return Response.json({ error: "Pedido inválido." }, { status: 400 });
      const owned = await getOwnedInboxOrderById(ctx.accountUserId, inboxId);
      if (!owned || owned.orderId !== orderId) return Response.json({ error: "Este Gmail não pertence a esta conta." }, { status: 404 });
      if (owned.supplierApiId) return Response.json({ error: "Este Gmail não pode ser cancelado por aqui." }, { status: 409 });
      if (owned.closed || owned.hiddenAt) return Response.json({ error: "Este Gmail já foi encerrado." }, { status: 409 });
      if (storedCodes(owned.codesJson).length) return Response.json({ error: "Este Gmail já recebeu código." }, { status: 409 });
      const key = otpGmailKey();
      if (!key) return Response.json({ error: "Serviço de e-mail indisponível." }, { status: 409 });
      const fetchCode = selfSupply ? fetch : await coordinatedOtpFetch("otpgmail", key);
      const cancelled = await cancelOtpGmailOrder(key, orderId, fetchCode);
      if (cancelled.outcome === "has_code") {
        await appendInboxCode(ctx.accountUserId, orderId, cancelled.code, null);
        return Response.json({ error: "O código chegou. Nada foi devolvido.", code: cancelled.code }, { status: 409 });
      }
      let supplierCancelled = cancelled.outcome === "cancelled";
      if (cancelled.outcome === "rejected" && (cancelled.errorCode === "ORDER_NOT_CANCELLABLE" || cancelled.errorCode === "NOT_FOUND")) {
        const lookup = await otpGmailCode(key, orderId, fetchCode);
        const record = lookup.data && typeof lookup.data === "object" ? lookup.data as { status?: string; code?: string } : {};
        if (lookup.response.ok && record.status === "ready" && record.code) {
          await appendInboxCode(ctx.accountUserId, orderId, String(record.code), null);
          return Response.json({ error: "O código chegou. Nada foi devolvido.", code: String(record.code) }, { status: 409 });
        }
        supplierCancelled = Boolean(lookup.response.ok && record.status === "closed" && !record.code);
      }
      if (!supplierCancelled) return Response.json({ error: "O fornecedor não aceitou o cancelamento." }, { status: 409 });
      const refundedCents = await settleCancelledGmail(request, {
        ownerCost, accountUserId: ctx.accountUserId, workspaceOwnerUserId: ctx.workspaceOwnerUserId, orderId, email: owned.email,
      });
      return Response.json({ cancelled: true, closed: true, refundedCents, order_id: orderId, email: owned.email });
    }

    if (action !== "order" && action !== "resume") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const product = String(payload.product || "ig_gmail_otp").trim();
    if (!/^[a-z0-9_-]{3,64}$/.test(product)) return Response.json({ error: "Produto inválido." }, { status: 400 });
    if (product !== "ig_gmail_otp") return Response.json({ error: "Produto indisponível." }, { status: 400 });
    const priorityMode = 0;
    const quantity = Math.min(MAX_OTP_BATCH, Math.max(1, Math.round(Number(payload.quantity) || 1)));

    // All platform purchases share OTPGmail -> InstaCaster, with durable identity.
    // Existing inbox rows continue to use their own supplier in code/cancel above.
    if (!selfSupply && (!direct || ownerCost)) {
      const store=durableOtpStore(ctx);
      const instaKey=await getInstacasterApiKey();
      const gmailKey=otpGmailKey();
      if(action==="order"&&!instaKey&&!gmailKey)return Response.json({error:"Serviço de e-mail indisponível."},{status:400});
      if(!ownerCost)await getWallet(ctx.workspaceOwnerUserId);
      const gmailPilot=await canUseGmailCentral(ctx);
      if(payload.sourceMode!==undefined&&(!gmailPilot||!["automatic","supplier_1","supplier_2"].includes(payload.sourceMode)))return Response.json({error:"Opção de compra indisponível."},{status:400});
      const sourceMode=payload.sourceMode??"automatic";
      const id=action==="resume"?String(payload.operationId||""):await store.create(String(payload.requestId||""),quantity,ownerCost?0:GMAIL_WALLET_CENTS,()=>sourceMode==="supplier_1"?Promise.resolve("otpgmail"):sourceMode==="supplier_2"?Promise.resolve("instacaster"):resolveOtpPrimaryProvider({accountUserId:ctx.accountUserId,email:ctx.email,selfSupply}),sourceMode);
      if(action==="order") {
        const accepted=await store.accept(id);
        return Response.json(accepted,{status:accepted?.pending?202:200,headers:{"cache-control":"private, no-store"}});
      }
      const deadline=Date.now()+75000;
      const boundedPurchase:typeof fetch=(url,init)=>fetch(url,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(Math.max(1,Math.min(65000,deadline-Date.now()-2000)))])});
      const providers:Parameters<typeof store.advance>[1]={
        tryAllPriorities:gmailPilot,
        key:provider=>provider==="otpgmail"?gmailKey:instaKey,
        stockFailure:isOtpGmailStockFailure,
        buy:async(provider,warehouse,idempotencyKey,priorityMode=0)=>{
          if(provider==="otpgmail")return requestOtpGmailOrder(gmailKey,warehouse,boundedPurchase,idempotencyKey);
          const response=await otpProviderFetch(instaKey,"/v1/orders","POST",JSON.stringify({product:"ig_gmail_otp",priority_mode:priorityMode}),boundedPurchase);
          const data=response.data as {order_id?:string;email?:string;status?:string;price?:string}|null;
          return response.response.ok&&typeof data?.order_id==="string"&&typeof data.email==="string"
            ? {order:{order_id:data.order_id,email:data.email,status:data.status,price:data.price},failure:null}
            : {order:null,failure:{status:response.response.status,data:response.data}};
        },
      };
      const result=await store.advanceFallbacks(id,providers,deadline);
      return Response.json(result,{status:result.pending?202:200,headers:{"cache-control":"private, no-store"}});
    }

    if (direct && !canManageApis && !ownerCost) {
      const available = (await listWorkspaceSupplierApiSecrets(ctx.workspaceOwnerUserId, ctx.email, { enabledOnly: true })).filter((api) => api.key);
      if (!available.length) return Response.json({ error: "Serviço de e-mail indisponível." }, { status: 400 });
      const unitCents = await otpSalePriceCents(priorityMode);
      const totalCents = unitCents * quantity;
      const wallet = await getWallet(ctx.workspaceOwnerUserId);
      if (wallet.balanceCents < totalCents) return Response.json({ error: `Saldo insuficiente para ${quantity} Gmail(s). Precisa ${formatBrl(totalCents)}.` }, { status: 402 });
      await debitWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: totalCents, summary: quantity > 1 ? `Pedido ${quantity} Gmails · ${formatBrl(totalCents)}` : `Pedido Gmail · ${formatBrl(totalCents)}` });

      const orders: Array<Record<string, unknown>> = [];
      let lastFailure: { status: number; data: unknown } | null = null;
      for (const api of available) {
        const remaining = quantity - orders.length;
        if (remaining <= 0) break;
        try {
          const result = await requestOrdersForApi({
            apiKey: api.key,
            product,
            priorityMode,
            quantity: remaining,
            onOrder: async (record) => upsertInboxOrder({
              accountUserId: ctx.accountUserId,
              workspaceOwnerUserId: ctx.workspaceOwnerUserId,
              supplierApiId: api.id,
              orderId: String(record.order_id || ""),
              email: String(record.email || ""),
              product: String(record.product || product),
              status: String(record.status || "active"),
              price: String(record.price || ""),
            }),
          });
          if (result.lastFailure) lastFailure = result.lastFailure;
          orders.push(...result.orders.map((item) => ({
            order_id: String(item.order_id || ""),
            email: String(item.email || ""),
            product: String(item.product || product),
            status: String(item.status || "active"),
            price: String(item.price || ""),
            supplierApiId: api.id,
            supplierApiName: "Serviço Gmail",
          })));
        } catch {
          lastFailure = { status: 502, data: {} };
        }
      }

      const unused = quantity - orders.length;
      if (unused > 0) await refundWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: unused * unitCents, summary: `Pedido parcial · ${unused} Gmail(s) devolvidos` });
      if (!orders.length) return publicError(lastFailure?.status || 409, lastFailure?.data || {}, false);
      const charged = orders.length * unitCents;
      await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.order", entityType: "otp_order", entityId: String(orders[0]?.order_id || ""), summary: `${orders.length} Gmail(s) por ${formatBrl(charged)}`, metadata: { billed: "wallet", chargedCents: charged, priorityMode, quantity: orders.length, requested: quantity } });
      const publicOrders = orders.map(withoutApiOrigin);
      return Response.json({
        apiResults: [{ apiId: "service", apiName: "Solicitação", state: unused ? "partial" : "success", message: unused ? `${orders.length} de ${quantity} pedido(s) criado(s).` : `${orders.length} pedido(s) criado(s).`, requested: quantity, ordered: orders.length }],
        orders: publicOrders,
        ordered: orders.length,
        requested: quantity,
        billed: "wallet",
        charged_cents: charged,
        charged_label: formatBrl(charged),
        partial: unused > 0,
      });
    }

    if (direct && !ownerCost) {
      const available = (await listWorkspaceSupplierApiSecrets(ctx.workspaceOwnerUserId, ctx.email, { enabledOnly: true })).filter((api) => api.key);
      const targets = !canManageApis || payload.allApis || payload.apiId === "all" ? available : available.filter((api) => api.id === payload.apiId || !payload.apiId && api.isPrimary).slice(0, 1);
      if (!targets.length) return Response.json({ error: "Selecione uma API habilitada." }, { status: 400 });
      const apiResults = await mapWithConcurrency(targets, PROVIDER_CONCURRENCY, async (api) => {
        try {
          const result = await requestOrdersForApi({
            apiKey: api.key,
            product,
            priorityMode,
            quantity,
            onOrder: async (record) => upsertInboxOrder({
              accountUserId: ctx.accountUserId,
              workspaceOwnerUserId: ctx.workspaceOwnerUserId,
              supplierApiId: api.id,
              orderId: String(record.order_id || ""),
              email: String(record.email || ""),
              product: String(record.product || product),
              status: String(record.status || "active"),
              price: String(record.price || ""),
            }),
          });
          const failure = result.lastFailure ? providerError(result.lastFailure.status, result.lastFailure.data, true) : null;
          return { apiId: api.id, apiName: api.name, state: result.orders.length ? result.partial ? "partial" : "success" : failure?.state || "error", message: result.orders.length ? `${result.orders.length} de ${quantity} pedido(s) criado(s).` : failure?.message || "Nenhum pedido criado.", requested: quantity, ordered: result.orders.length, orders: result.orders.map((item) => ({ order_id: String(item.order_id || ""), email: String(item.email || ""), product: String(item.product || product), status: String(item.status || "active"), price: String(item.price || ""), supplierApiId: api.id, supplierApiName: api.name })) };
        } catch {
          return { apiId: api.id, apiName: api.name, state: "unavailable", message: "API indisponível.", requested: quantity, ordered: 0, orders: [] as Array<Record<string, unknown>> };
        }
      });
      const orders = apiResults.flatMap((item) => item.orders);
      await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.order", entityType: "otp_order", entityId: String(orders[0]?.order_id || ""), summary: `${orders.length} Gmail(s) em ${apiResults.length} API(s) próprias`, metadata: { billed: "supplier", priorityMode, selfSupply, quantity: orders.length, requestedPerApi: quantity, apiCount: apiResults.length } });
      const publicApiResults = canManageApis ? apiResults : apiResults.map((item) => ({ ...item, apiName: "Serviço Gmail", orders: item.orders.map((order) => ({ ...order, supplierApiName: "Serviço Gmail" })) }));
      const publicOrders = canManageApis ? orders : orders.map((order) => ({ ...order, supplierApiName: "Serviço Gmail" }));
      return Response.json({ apiResults: publicApiResults, orders: publicOrders, ordered: orders.length, requested: quantity * targets.length, billed: "supplier", partial: apiResults.some((item) => item.state !== "success") });
    }

    const ownerApis = ownerCost ? (await listWorkspaceSupplierApiSecrets(ctx.workspaceOwnerUserId, ctx.email, { enabledOnly: true })).filter((api) => api.key) : [];
    const ownerApi = ownerApis.find((api) => api.isPrimary) || ownerApis[0] || null;
    const apiKey = ownerApi?.key || (ownerCost ? await getInstacasterApiKey() : await getWorkspaceInstacasterApiKey(ctx.workspaceOwnerUserId, ctx.email));
    // Replays/resumes use persisted item providers, even if policy storage is unavailable.
    const reliable = reliableOtpEnabled() && !selfSupply && (!direct || ownerCost);
    const replayId = reliable && action === "order" && /^[a-f0-9-]{36}$/i.test(String(payload.requestId || ""))
      ? await otpHash(`${ctx.accountUserId}:${payload.requestId}`) : null;
    const replay = replayId ? await otpOrderStore().get(replayId, ctx.accountUserId) : null;
    const gmailPrimary = action === "order" && !replay && await resolveOtpPrimaryProvider({ accountUserId: ctx.accountUserId, email: ctx.email, selfSupply }) === "otpgmail";
    const primaryGmailKey = gmailPrimary ? otpGmailKey() : "";
    if (action === "order" && !replay && (gmailPrimary ? !primaryGmailKey : !apiKey)) return Response.json({ error: "Serviço de e-mail indisponível." }, { status: 400 });
    const unitCents = ownerCost ? 0 : product === "ig_gmail_otp" ? GMAIL_WALLET_CENTS : await otpSalePriceCents(priorityMode);
    const totalCents = unitCents * quantity;
    if (reliableOtpEnabled() && !selfSupply && (!direct || ownerCost)) {
      const store = otpOrderStore();
      let operationId = String(payload.operationId || "");
      if (action === "resume") {
        const owned=/^[a-f0-9]{64}$/.test(operationId) ? await store.get(operationId,ctx.accountUserId) : null;
        if(!owned||owned.workspace_owner_user_id!==ctx.workspaceOwnerUserId)return Response.json({error:"Pedido não encontrado neste workspace."},{status:404});
      } else {
        const requestId = String(payload.requestId || "");
        if (!/^[a-f0-9-]{36}$/i.test(requestId)) return Response.json({error:"Atualize a página antes de solicitar um Gmail."},{status:400});
        operationId = await otpHash(`${ctx.accountUserId}:${requestId}`);
        if (!ownerCost) await getWallet(ctx.workspaceOwnerUserId);
        try {
          await store.create({id:operationId,requestId,accountUserId:ctx.accountUserId,workspaceOwnerUserId:ctx.workspaceOwnerUserId,quantity,unitCents,provider:gmailPrimary ? "otpgmail" : "instacaster",supplierApiId:gmailPrimary ? null : ownerApi?.id || null});
        } catch (error) {
          if (String(error).includes("otp_insufficient_balance")) return Response.json({error:`Saldo insuficiente para ${quantity} Gmail(s). Precisa ${formatBrl(totalCents)}.`},{status:402});
          throw error;
        }
      }
      const result = await continueOtpPurchase(store,operationId,ctx.accountUserId,{
        primaryKey:apiKey,fallbackKey:primaryGmailKey || otpGmailKey(),stockFailure:isOtpGmailStockFailure,
        primary:async key=>otpProviderFetch(key,"/v1/orders","POST",JSON.stringify({product,priority_mode:priorityMode}),await coordinatedOtpFetch("instacaster",key)),
        fallback:async (key,warehouse,idempotency)=>requestOtpGmailOrder(key,warehouse,await coordinatedOtpFetch("otpgmail",key),idempotency),
      });
      return Response.json(result,{status:result?.pending ? 202 : 200,headers:{"cache-control":"no-store"}});
    }
    if (!ownerCost) {
      const wallet = await getWallet(ctx.workspaceOwnerUserId);
      if (wallet.balanceCents < totalCents) return Response.json({ error: `Saldo insuficiente para ${quantity} Gmail(s). Precisa ${formatBrl(totalCents)}.` }, { status: 402 });
      await debitWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: totalCents, summary: quantity > 1 ? `Pedido ${quantity} Gmails · ${formatBrl(totalCents)}` : `Pedido Gmail · ${formatBrl(totalCents)}` });
    }
    let result: Awaited<ReturnType<typeof requestOrdersForApi>> = { orders: [], lastFailure: null, partial: true };
    const savedOrders: Array<Record<string, unknown>> = [];
    try {
      if (!gmailPrimary) result = await requestOrdersForApi({ apiKey, product, priorityMode, quantity, onOrder: async (record) => {
        await upsertInboxOrder({ accountUserId: ctx.accountUserId, workspaceOwnerUserId: ctx.workspaceOwnerUserId, supplierApiId: ownerApi?.id || null, orderId: String(record.order_id || ""), email: String(record.email || ""), product: String(record.product || product), status: String(record.status || "active"), price: String(record.price || "") });
        savedOrders.push(record);
      } });
    } catch (error) {
      if (!savedOrders.length) {
        if (!ownerCost) await refundWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: totalCents, summary: "Falha no pedido · crédito devolvido" });
        throw error;
      }
      result = { orders: savedOrders, lastFailure: { status: 502, data: {} }, partial: true };
    }
    const orders = [...result.orders];
    let lastFailure = result.lastFailure;
    if (!selfSupply && product === "ig_gmail_otp" && orders.length < quantity && (gmailPrimary || lastFailure && isOtpGmailStockFailure(lastFailure.status, lastFailure.data))) {
      const fallbackKey = primaryGmailKey || otpGmailKey();
      if (fallbackKey) {
        for (let index = orders.length; index < quantity; index += 1) {
          try {
            let attempt = await requestOtpGmailOrder(fallbackKey, 2);
            if (attempt.failure && isOtpGmailStockFailure(attempt.failure.status, attempt.failure.data)) attempt = await requestOtpGmailOrder(fallbackKey, 99);
            if (!attempt.order) {
              lastFailure = attempt.failure && isOtpGmailStockFailure(attempt.failure.status, attempt.failure.data)
                ? { status: 409, data: { error: { code: "out_of_stock" } } }
                : attempt.failure;
              break;
            }
            const record = attempt.order;
            await upsertInboxOrder({ accountUserId: ctx.accountUserId, workspaceOwnerUserId: ctx.workspaceOwnerUserId, supplierApiId: null, orderId: record.order_id, email: record.email, product, status: record.status, price: "" });
            orders.push(record);
          } catch {
            lastFailure = { status: 502, data: {} };
            break;
          }
        }
      }
    }
    if (!orders.length) {
      if (!ownerCost) await refundWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: totalCents, summary: "Falha no pedido · crédito devolvido" });
      return publicError(lastFailure?.status || 409, lastFailure?.data, false);
    }
    const charged = orders.length * unitCents;
    const unused = quantity - orders.length;
    if (unused > 0 && !ownerCost) await refundWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: unused * unitCents, summary: `Estoque acabou · ${unused} Gmail(s) devolvidos` });
    await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.order", entityType: "otp_order", entityId: String(orders[0]?.order_id || ""), summary: ownerCost ? `${orders.length} Gmail(s) ao custo do fornecedor` : `${orders.length} Gmail(s) por ${formatBrl(charged)}`, metadata: { billed: ownerCost ? "supplier" : "wallet", chargedCents: charged, priorityMode, quantity: orders.length, requested: quantity } });
    const first = orders[0];
    return Response.json({ order_id: first?.order_id, email: first?.email, status: first?.status, orders: orders.map((order) => ({ order_id: order.order_id, email: order.email, status: order.status })), ordered: orders.length, requested: quantity, billed: ownerCost ? "supplier" : "wallet", charged_cents: charged, charged_label: ownerCost ? "Custo do fornecedor" : formatBrl(charged), partial: unused > 0 });
  } catch (error) {
    if(error instanceof PurchaseError)return Response.json({error:error.message},{status:error.status});
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: platformWallet ? "Não foi possível concluir a solicitação. Confira o mesmo pedido antes de tentar novamente." : error instanceof Error ? error.message : "Não foi possível concluir o pedido." }, { status: 502 });
  }
}
