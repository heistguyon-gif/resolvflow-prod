import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appUsers, workspaceMembers, workspaces } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import {
  adjustWalletBalance,
  createWorkspaceSupplierApi,
  deleteWorkspaceSupplierApi,
  formatBrl,
  getWallet,
  getWorkspaceSupplierApi,
  listWorkspaceSupplierApiSecrets,
  recentLedger,
  setWorkspaceOtpBillingMode,
  setWorkspaceSupplierApiEnabled,
  workspaceUsesOtpSupplierBalance,
} from "../../../../lib/otp-billing";
import { closeOpenInboxBySupplierApi, countOpenInboxBySupplierApi } from "../../../../lib/otp-inbox";
import { mapWithConcurrency, otpProviderFetch } from "../../../../lib/otp-provider";

const BALANCE_CONCURRENCY = 4;

type Target = {
  accountUserId: string;
  workspaceOwnerUserId: string;
  email: string;
  displayName: string;
  workspaceName: string;
};

async function resolveTarget(accountUserId: string, workspaceOwnerUserId: string): Promise<Target | null> {
  if (!accountUserId || !workspaceOwnerUserId) return null;
  const db = getDb();
  const [user] = await db.select({
    id: appUsers.id,
    email: appUsers.email,
    displayName: appUsers.displayName,
  }).from(appUsers).where(eq(appUsers.id, accountUserId)).limit(1);
  if (!user) return null;
  const [membership] = await db.select({
    workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId,
    workspaceName: workspaces.name,
  }).from(workspaceMembers)
    .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId))
    .where(and(
      eq(workspaceMembers.workspaceOwnerUserId, workspaceOwnerUserId),
      eq(workspaceMembers.accountUserId, accountUserId),
    )).limit(1);
  if (!membership) return null;
  return {
    accountUserId: user.id,
    workspaceOwnerUserId,
    email: user.email,
    displayName: user.displayName,
    workspaceName: membership.workspaceName || "Operação",
  };
}

async function buildPayload(target: Target) {
  const [wallet, apis, openCounts, ledger, supplierMode] = await Promise.all([
    getWallet(target.workspaceOwnerUserId),
    listWorkspaceSupplierApiSecrets(target.workspaceOwnerUserId, target.email),
    countOpenInboxBySupplierApi(target.accountUserId),
    recentLedger(target.workspaceOwnerUserId, 12),
    workspaceUsesOtpSupplierBalance(target.workspaceOwnerUserId, target.email),
  ]);
  const apiCards = await mapWithConcurrency(apis, BALANCE_CONCURRENCY, async (api) => {
    const base = { id: api.id, name: api.name, enabled: api.enabled, isPrimary: api.isPrimary, openOrders: openCounts.get(api.id) || 0 };
    if (!api.enabled) return { ...base, state: "disabled" };
    if (!api.key) return { ...base, state: "invalid_key", error: "Chave indisponível" };
    try {
      const { response, data } = await otpProviderFetch(api.key, "/v1/balance", "GET");
      const record = data && typeof data === "object" ? data as { balance?: string | number; currency?: string } : {};
      if (!response.ok) return {
        ...base,
        state: response.status === 401 ? "invalid_key" : response.status === 402 ? "insufficient_balance" : "error",
        error: response.status === 401 ? "Chave inválida" : response.status === 402 ? "Saldo insuficiente" : "Falha ao consultar",
      };
      return { ...base, state: "ready", balance: String(record.balance ?? "0"), currency: String(record.currency || "USD") };
    } catch {
      return { ...base, state: "unavailable", error: "API indisponível" };
    }
  });
  return {
    target,
    mode: supplierMode ? "supplier" : "platform",
    explicitMode: wallet.billingMode,
    balanceCents: wallet.balanceCents,
    balanceLabel: formatBrl(wallet.balanceCents),
    openOrders: [...openCounts.values()].reduce((total, quantity) => total + quantity, 0),
    apis: apiCards,
    ledger: ledger.map((item) => ({
      id: item.id,
      type: item.type,
      summary: item.summary,
      amountCents: item.amountCents,
      amountLabel: `${item.amountCents > 0 ? "+" : ""}${formatBrl(item.amountCents)}`,
      balanceAfterLabel: formatBrl(item.balanceAfterCents),
      at: item.createdAt,
    })),
  };
}

async function targetFromRequest(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const accountUserId = String(body?.accountUserId || url.searchParams.get("accountUserId") || "");
  const workspaceOwnerUserId = String(body?.workspaceOwnerUserId || url.searchParams.get("workspaceOwnerUserId") || "");
  return resolveTarget(accountUserId, workspaceOwnerUserId);
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const target = await targetFromRequest(request);
    if (!target) return Response.json({ error: "Usuário ou workspace não encontrado." }, { status: 404 });
    return Response.json(await buildPayload(target), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o Gmail OTP deste usuário." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const target = await targetFromRequest(request, body);
    if (!target) return Response.json({ error: "Usuário ou workspace não encontrado." }, { status: 404 });
    const action = String(body.action || "");

    if (action === "set_mode") {
      const mode = body.mode === "supplier" ? "supplier" : body.mode === "platform" ? "platform" : null;
      if (!mode) return Response.json({ error: "Modo inválido." }, { status: 400 });
      if (mode === "platform") {
        const openCounts = await countOpenInboxBySupplierApi(target.accountUserId);
        const supplierOpen = [...openCounts.entries()].reduce((total, [apiId, quantity]) => total + (apiId === "legacy" ? 0 : quantity), 0);
        if (supplierOpen > 0) return Response.json({ error: "Encerre os e-mails abertos das APIs próprias antes de mudar para Carteira e PIX." }, { status: 409 });
      }
      await setWorkspaceOtpBillingMode(target.workspaceOwnerUserId, mode);
      await recordAuditEvent(request, { ownerUserId: target.workspaceOwnerUserId, action: "admin.otp_mode", entityType: "otp_wallet", entityId: target.workspaceOwnerUserId, summary: `Gmail OTP de ${target.email}: ${mode === "supplier" ? "APIs próprias" : "Carteira e PIX"}` });
    } else if (action === "adjust_balance") {
      const amountCents = Math.round(Number(body.amountCents) || 0);
      const result = await adjustWalletBalance({ workspaceOwnerUserId: target.workspaceOwnerUserId, actorUserId: admin.accountUserId, amountCents, summary: `Ajuste administrativo ${formatBrl(amountCents)} para ${target.email}` });
      await recordAuditEvent(request, { ownerUserId: target.workspaceOwnerUserId, action: amountCents > 0 ? "admin.otp_credit" : "admin.otp_debit", entityType: "otp_wallet", entityId: target.workspaceOwnerUserId, summary: `Saldo Gmail OTP ajustado em ${formatBrl(amountCents)}; novo saldo ${formatBrl(result.balanceCents)}` });
    } else if (action === "add_api") {
      const created = await createWorkspaceSupplierApi(target.workspaceOwnerUserId, String(body.name || ""), String(body.supplierKey || ""));
      await recordAuditEvent(request, { ownerUserId: target.workspaceOwnerUserId, action: "admin.otp_api_create", entityType: "otp_supplier_api", entityId: created.id, summary: `API de Gmail adicionada para ${target.email}: ${created.name}` });
    } else if (action === "set_enabled") {
      await setWorkspaceSupplierApiEnabled(target.workspaceOwnerUserId, String(body.apiId || ""), Boolean(body.enabled));
      await recordAuditEvent(request, { ownerUserId: target.workspaceOwnerUserId, action: "admin.otp_api_toggle", entityType: "otp_supplier_api", entityId: String(body.apiId || ""), summary: `${body.enabled ? "API habilitada" : "API pausada"} para ${target.email}` });
    } else if (action === "close_api_orders") {
      const apiId = String(body.apiId || "");
      if (!await getWorkspaceSupplierApi(target.workspaceOwnerUserId, apiId)) return Response.json({ error: "API não encontrada." }, { status: 404 });
      const closed = await closeOpenInboxBySupplierApi(target.workspaceOwnerUserId, apiId);
      await recordAuditEvent(request, { ownerUserId: target.workspaceOwnerUserId, action: "admin.otp_api_close_orders", entityType: "otp_supplier_api", entityId: apiId, summary: `${closed} pedido(s) de Gmail encerrado(s) para ${target.email}` });
    } else if (action === "delete_api") {
      const deleted = await deleteWorkspaceSupplierApi(target.workspaceOwnerUserId, String(body.apiId || ""), { closeOpenOrders: Boolean(body.closeOpenOrders) });
      await recordAuditEvent(request, { ownerUserId: target.workspaceOwnerUserId, action: "admin.otp_api_delete", entityType: "otp_supplier_api", entityId: deleted.id, summary: `API de Gmail excluída de ${target.email}: ${deleted.name}; ${deleted.closedOrders} pedido(s) encerrado(s)` });
    } else if (action === "reveal_api") {
      const api = await getWorkspaceSupplierApi(target.workspaceOwnerUserId, String(body.apiId || ""));
      if (!api) return Response.json({ error: "API não encontrada ou chave indisponível." }, { status: 404 });
      await recordAuditEvent(request, { ownerUserId: target.workspaceOwnerUserId, action: "admin.otp_api_reveal", entityType: "otp_supplier_api", entityId: api.id, summary: `Chave da API “${api.name}” consultada pelo superadmin para ${target.email}` });
      return Response.json({ apiId: api.id, name: api.name, supplierKey: api.key }, { headers: { "cache-control": "private, no-store" } });
    } else {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    return Response.json(await buildPayload(target), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o Gmail OTP deste usuário.";
    return Response.json({ error: message }, { status: /não encontrada|abertos|negativo|inválido/i.test(message) ? 400 : 500 });
  }
}
