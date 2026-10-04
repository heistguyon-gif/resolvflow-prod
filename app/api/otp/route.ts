import { authErrorResponse, isPlatformAdminEmail, requireWorkspaceContext } from "../../../lib/auth";
import { debitWallet, formatBrl, getInstacasterApiKey, getStoredInstacasterApiKey, getWallet, getWorkspaceInstacasterApiKey, getWorkspaceSupplierApi, isOtpSelfSupplyEmail, listWorkspaceSupplierApiSecrets, otpSalePriceCents, refundWallet, workspaceUsesOtpSupplierBalance } from "../../../lib/otp-billing";
import { appendInboxCode, customerInbox, getOwnedInboxOrder, getOwnedInboxOrderById, listInbox, listOpenInbox, upsertInboxOrder } from "../../../lib/otp-inbox";
import { fetchCodesByOrigin, mapWithConcurrency, otpProviderFetch, requestOrdersForApi } from "../../../lib/otp-provider";
import { recordAuditEvent } from "../../../lib/audit";
import { runtimeEnv } from "../../../lib/runtime-env";

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

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const admin = isPlatformAdminEmail(ctx.email);
    const selfSupply = isOtpSelfSupplyEmail(ctx.email);
    const canManageApis = admin || selfSupply;
    const direct = await workspaceUsesOtpSupplierBalance(ctx.workspaceOwnerUserId, ctx.email);
    const payload = await request.json() as { action?: string; product?: string; orderId?: string; inboxId?: string; supplierApiId?: string | null; apiId?: string | null; allApis?: boolean; priorityMode?: number; quantity?: number };
    const action = payload.action;

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
      const originKey = await orderOriginApiKey({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, supplierApiId: owned.supplierApiId, createdAt: owned.createdAt });
      if (!originKey) return Response.json({ error: canManageApis ? "A API de origem deste Gmail não está disponível." : "Este Gmail não está disponível para consulta." }, { status: 409 });
      const { response, data } = await otpProviderFetch(originKey, `/v1/orders/${orderId}/code`, "GET");
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
      const open = await listOpenInbox(ctx.accountUserId, filterApiId);
      const lookups = await fetchCodesByOrigin({
        orders: open,
        concurrency: CODE_CONCURRENCY,
        resolveApiKey: async (supplierApiId, order) => orderOriginApiKey({
          workspaceOwnerUserId: ctx.workspaceOwnerUserId,
          supplierApiId,
          createdAt: order.savedAt,
        }),
        fetchCode: async (apiKey, orderId) => otpProviderFetch(apiKey, `/v1/orders/${orderId}/code`, "GET"),
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
        return { order_id: order.order_id, email: order.email, supplierApiId: order.supplierApiId, supplierApiName: order.supplierApiName, status: record.status || "pending", closed: false };
      }));
      const inbox = await listInbox(ctx.accountUserId, filterApiId);
      if (!canManageApis) {
        return Response.json({
          results: results.map(withoutApiOrigin),
          inbox: customerInbox(inbox),
        });
      }
      return Response.json({ results, inbox });
    }

    if (action !== "order") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const product = String(payload.product || "ig_gmail_otp").trim();
    if (!/^[a-z0-9_-]{3,64}$/.test(product)) return Response.json({ error: "Produto inválido." }, { status: 400 });
    if (!admin && product !== "ig_gmail_otp") return Response.json({ error: "Produto indisponível." }, { status: 400 });
    const priorityMode = payload.priorityMode === 1 || payload.priorityMode === 2 ? payload.priorityMode : 0;
    const quantity = Math.min(MAX_OTP_BATCH, Math.max(1, Math.round(Number(payload.quantity) || 1)));

    if (direct && !canManageApis) {
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

    if (direct) {
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

    const apiKey = await getWorkspaceInstacasterApiKey(ctx.workspaceOwnerUserId, ctx.email);
    if (!apiKey) return Response.json({ error: "Serviço de e-mail indisponível." }, { status: 400 });
    const unitCents = await otpSalePriceCents(priorityMode);
    const totalCents = unitCents * quantity;
    const wallet = await getWallet(ctx.workspaceOwnerUserId);
    if (wallet.balanceCents < totalCents) return Response.json({ error: `Saldo insuficiente para ${quantity} Gmail(s). Precisa ${formatBrl(totalCents)}.` }, { status: 402 });
    await debitWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: totalCents, summary: quantity > 1 ? `Pedido ${quantity} Gmails · ${formatBrl(totalCents)}` : `Pedido Gmail · ${formatBrl(totalCents)}` });
    let result;
    try {
      result = await requestOrdersForApi({ apiKey, product, priorityMode, quantity, onOrder: async (record) => upsertInboxOrder({ accountUserId: ctx.accountUserId, workspaceOwnerUserId: ctx.workspaceOwnerUserId, supplierApiId: null, orderId: String(record.order_id || ""), email: String(record.email || ""), product: String(record.product || product), status: String(record.status || "active"), price: String(record.price || "") }) });
    } catch (error) {
      await refundWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: totalCents, summary: "Falha no pedido · crédito devolvido" });
      throw error;
    }
    if (!result.orders.length) {
      await refundWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: totalCents, summary: "Falha no pedido · crédito devolvido" });
      return publicError(result.lastFailure?.status || 409, result.lastFailure?.data, false);
    }
    const charged = result.orders.length * unitCents;
    const unused = quantity - result.orders.length;
    if (unused > 0) await refundWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents: unused * unitCents, summary: `Estoque acabou · ${unused} Gmail(s) devolvidos` });
    await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.order", entityType: "otp_order", entityId: String(result.orders[0]?.order_id || ""), summary: `${result.orders.length} Gmail(s) por ${formatBrl(charged)}`, metadata: { billed: "wallet", chargedCents: charged, priorityMode, quantity: result.orders.length, requested: quantity } });
    const first = result.orders[0];
    return Response.json({ order_id: first?.order_id, email: first?.email, status: first?.status, orders: result.orders.map((order) => ({ order_id: order.order_id, email: order.email, status: order.status })), ordered: result.orders.length, requested: quantity, billed: "wallet", charged_cents: charged, charged_label: formatBrl(charged), partial: result.partial });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir o pedido." }, { status: 502 });
  }
}
