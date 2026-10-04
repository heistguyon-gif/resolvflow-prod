import { authErrorResponse, isPlatformAdminEmail, requireWorkspaceContext } from "../../../../lib/auth";
import {
  createWorkspaceSupplierApi,
  creditWallet,
  deleteWorkspaceSupplierApi,
  formatBrl,
  getMercadoPagoToken,
  getOtpSettingsRow,
  getWallet,
  getWorkspaceInstacasterApiKey,
  getWorkspaceSupplierApi,
  isOtpSelfSupplyEmail,
  listWorkspaceSupplierApiSecrets,
  publicOtpPrices,
  recentLedger,
  renameWorkspaceSupplierApi,
  saveWorkspaceSupplierKey,
  setWorkspaceSupplierApiEnabled,
  workspaceUsesOtpSupplierBalance,
} from "../../../../lib/otp-billing";
import { closeOpenInboxBySupplierApi, countOpenInboxBySupplierApi } from "../../../../lib/otp-inbox";
import { mapWithConcurrency, otpProviderFetch } from "../../../../lib/otp-provider";
import { recordAuditEvent } from "../../../../lib/audit";
import { runtimeEnv } from "../../../../lib/runtime-env";

const BALANCE_CONCURRENCY = 4;

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "viewer");
    const admin = isPlatformAdminEmail(ctx.email);
    const selfSupply = isOtpSelfSupplyEmail(ctx.email);
    const canManageApis = admin || selfSupply;
    const direct = await workspaceUsesOtpSupplierBalance(ctx.workspaceOwnerUserId, ctx.email);
    const [wallet, settings, mpToken, walletSupplierKey] = await Promise.all([
      getWallet(ctx.workspaceOwnerUserId),
      getOtpSettingsRow(),
      getMercadoPagoToken(),
      direct ? Promise.resolve("") : getWorkspaceInstacasterApiKey(ctx.workspaceOwnerUserId, ctx.email),
    ]);
    const prices = publicOtpPrices(settings);
    const payload: Record<string, unknown> = {
      configured: Boolean(walletSupplierKey),
      pixEnabled: Boolean(mpToken) && !direct,
      pixRequiresDocument: Boolean(runtimeEnv().LEZTYPAY_API_KEY?.trim()) && !direct,
      isPlatformAdmin: admin,
      isSelfSupply: selfSupply,
      canManageApis,
      usesSupplier: direct,
      hasOwnApiKey: false,
      ...prices,
      balanceCents: wallet.balanceCents,
      balanceLabel: formatBrl(wallet.balanceCents),
      gmailsLeft: prices.priceCents ? Math.floor(wallet.balanceCents / prices.priceCents) : 0,
    };
    if (direct) {
      const [apis, openCounts] = await Promise.all([
        listWorkspaceSupplierApiSecrets(ctx.workspaceOwnerUserId, ctx.email),
        countOpenInboxBySupplierApi(ctx.accountUserId),
      ]);
      const apiCards = await mapWithConcurrency(apis, BALANCE_CONCURRENCY, async (api, index) => {
        if (!canManageApis) {
          return { id: api.id, name: `Serviço ${index + 1}`, enabled: api.enabled, isPrimary: false, openOrders: openCounts.get(api.id) || 0, state: api.enabled ? "ready" : "disabled" };
        }
        if (!api.enabled) {
          return { id: api.id, name: api.name, enabled: false, isPrimary: api.isPrimary, openOrders: openCounts.get(api.id) || 0, state: "disabled" };
        }
        try {
          const { response, data } = await otpProviderFetch(api.key, "/v1/balance", "GET");
          const record = data && typeof data === "object" ? data as { balance?: string | number; currency?: string } : {};
          if (!response.ok) {
            return { id: api.id, name: api.name, enabled: api.enabled, isPrimary: api.isPrimary, openOrders: openCounts.get(api.id) || 0, state: response.status === 401 ? "invalid_key" : response.status === 402 ? "insufficient_balance" : "error", error: response.status === 401 ? "Chave inválida" : response.status === 402 ? "Saldo insuficiente" : "Falha ao consultar" };
          }
          return { id: api.id, name: api.name, enabled: api.enabled, isPrimary: api.isPrimary, openOrders: openCounts.get(api.id) || 0, state: api.enabled ? "ready" : "disabled", balance: String(record.balance ?? "0"), currency: String(record.currency || "USD") };
        } catch {
          return { id: api.id, name: api.name, enabled: api.enabled, isPrimary: api.isPrimary, openOrders: openCounts.get(api.id) || 0, state: "unavailable", error: "API indisponível" };
        }
      });
      payload.apis = apiCards;
      payload.configured = apiCards.length > 0;
      payload.hasOwnApiKey = selfSupply ? apiCards.length > 0 : false;
      const primary = apiCards.find((api) => api.isPrimary) || apiCards[0];
      if (primary && "balance" in primary) {
        payload.supplierBalance = primary.balance;
        payload.supplierCurrency = primary.currency;
      }
      payload.ledger = (await recentLedger(ctx.workspaceOwnerUserId, 8)).map((item) => ({ id: item.id, type: item.type, summary: item.summary, amountLabel: formatBrl(item.amountCents), at: item.createdAt }));
    }
    return Response.json(payload);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível ler o saldo." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const payload = await request.json() as { action?: string; amountCents?: number; supplierKey?: string; name?: string; apiId?: string; enabled?: boolean; closeOpenOrders?: boolean };
    const direct = await workspaceUsesOtpSupplierBalance(ctx.workspaceOwnerUserId, ctx.email);
    if (["save_key", "add_api", "rename_api", "set_enabled", "close_api_orders", "delete_api", "reveal_api"].includes(String(payload.action))) {
      if (!direct) return Response.json({ error: "Sem permissão." }, { status: 403 });
      if (!isPlatformAdminEmail(ctx.email) && !isOtpSelfSupplyEmail(ctx.email)) return Response.json({ error: "Somente o administrador pode gerenciar as APIs deste workspace." }, { status: 403 });
      if (payload.action === "reveal_api") {
        if (!isPlatformAdminEmail(ctx.email)) return Response.json({ error: "Somente o superadmin pode visualizar chaves." }, { status: 403 });
        const api = await getWorkspaceSupplierApi(ctx.workspaceOwnerUserId, String(payload.apiId || ""));
        if (!api) return Response.json({ error: "API não encontrada ou chave indisponível." }, { status: 404 });
        await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "admin.otp_api_reveal", entityType: "otp_supplier_api", entityId: api.id, summary: `Chave da API “${api.name}” consultada pelo superadmin` });
        return Response.json({ apiId: api.id, name: api.name, supplierKey: api.key }, { headers: { "cache-control": "private, no-store" } });
      } else if (payload.action === "save_key") {
        const key = String(payload.supplierKey || "").trim();
        if (!key) return Response.json({ error: "Cole a chave da sua API." }, { status: 400 });
        await saveWorkspaceSupplierKey(ctx.workspaceOwnerUserId, key);
        await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.self_key", entityType: "otp_supplier_api", entityId: ctx.workspaceOwnerUserId, summary: "API principal de Gmail atualizada" });
      } else if (payload.action === "add_api") {
        const created = await createWorkspaceSupplierApi(ctx.workspaceOwnerUserId, String(payload.name || ""), String(payload.supplierKey || ""));
        await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.api_create", entityType: "otp_supplier_api", entityId: created.id, summary: `API de Gmail adicionada: ${created.name}` });
      } else if (payload.action === "rename_api") {
        await renameWorkspaceSupplierApi(ctx.workspaceOwnerUserId, String(payload.apiId || ""), String(payload.name || ""));
        await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.api_rename", entityType: "otp_supplier_api", entityId: String(payload.apiId || ""), summary: "API de Gmail renomeada" });
      } else if (payload.action === "set_enabled") {
        await setWorkspaceSupplierApiEnabled(ctx.workspaceOwnerUserId, String(payload.apiId || ""), Boolean(payload.enabled));
        await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.api_toggle", entityType: "otp_supplier_api", entityId: String(payload.apiId || ""), summary: payload.enabled ? "API de Gmail habilitada" : "API de Gmail pausada" });
      } else if (payload.action === "close_api_orders") {
        const closedOrders = await closeOpenInboxBySupplierApi(ctx.workspaceOwnerUserId, String(payload.apiId || ""));
        await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.api_close_orders", entityType: "otp_supplier_api", entityId: String(payload.apiId || ""), summary: `${closedOrders} pedido(s) de Gmail encerrado(s)` });
      } else {
        const deleted = await deleteWorkspaceSupplierApi(ctx.workspaceOwnerUserId, String(payload.apiId || ""), { closeOpenOrders: Boolean(payload.closeOpenOrders) });
        await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.api_delete", entityType: "otp_supplier_api", entityId: deleted.id, summary: `API de Gmail excluída: ${deleted.name}; ${deleted.closedOrders} pedido(s) encerrado(s)` });
      }
      return GET(request);
    }
    if (payload.action !== "credit") return Response.json({ error: "Ação inválida." }, { status: 400 });
    if (!isPlatformAdminEmail(ctx.email)) return Response.json({ error: "Sem permissão." }, { status: 403 });
    const amountCents = Math.round(Number(payload.amountCents) || 0);
    if (amountCents < 100 || amountCents > 500_000) return Response.json({ error: "Valor de crédito inválido." }, { status: 400 });
    const wallet = await creditWallet({ workspaceOwnerUserId: ctx.workspaceOwnerUserId, actorUserId: ctx.accountUserId, amountCents, type: "credit_manual", summary: `Crédito manual ${formatBrl(amountCents)}` });
    await recordAuditEvent(request, { ownerUserId: ctx.workspaceOwnerUserId, action: "otp.credit", entityType: "otp_wallet", entityId: ctx.workspaceOwnerUserId, summary: `Crédito manual de ${formatBrl(amountCents)}` });
    return Response.json({ balanceCents: wallet.balanceCents, balanceLabel: formatBrl(wallet.balanceCents) });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar as APIs." }, { status: 502 });
  }
}
