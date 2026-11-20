import { withoutMetaConnectionCount } from "../../../lib/accounts-catalog-summary";
import { readCatalogGroup, catalogFailureDiagnostic } from "../../../lib/accounts-catalog-reads";
import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lt, ne, or, sql, type InferInsertModel } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, metaConnections, scheduledPosts } from "../../../db/schema";
import { authErrorResponse, isPlatformAdminEmail, requireOwnerId, requireWorkspaceContext } from "../../../lib/auth";
import { recordAuditEvent } from "../../../lib/audit";
import { deriveConnectedHealth } from "../../../lib/account-health";
import { LIVE_QUEUE_STATUSES } from "../../../lib/queue-reconcile";
import { archiveAccounts } from "../../../lib/account-archive";
import { encryptToken } from "../../../lib/token-crypto";
import { AccountsInputError, accountBatchIds, accountCursorScope, accountPageSize, decodeAccountCursor, encodeAccountCursor } from "../../../lib/accounts-pagination";

async function encryptSecret(value: string) {
  if (value.length > 200) throw new Error("A senha deve ter no máximo 200 caracteres.");
  return encryptToken(value);
}

function requiresMetaReconnect(message: string | null | undefined) {
  return /log in to www\.instagram\.com|access token|token.*expir|oauth|checkpoint|renovad|session.*invalid/i.test(message || "");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "";
    const archived = url.searchParams.get("archived")?.trim() ?? "active";
    const limit = accountPageSize(url.searchParams.get("limit"));
    const context = await requireWorkspaceContext(request, "viewer");
    const owner = context.workspaceOwnerUserId;
    const platformScope = url.searchParams.get("scope") === "platform" && isPlatformAdminEmail(context.email);
    const filters = platformScope ? [] : [eq(accounts.ownerUserId, owner)];
    if (archived === "only") filters.push(isNotNull(accounts.archivedAt));
    else if (archived !== "include") filters.push(isNull(accounts.archivedAt));
    if (status && status !== "Todas") filters.push(eq(accounts.healthStatus, status));
    const searchFilter = search ? or(like(accounts.username, `%${search}%`), like(accounts.player, `%${search}%`), like(accounts.model, `%${search}%`)) : undefined;
    if (searchFilter) filters.push(searchFilter);
    const cursorScope = await accountCursorScope([owner, platformScope, search, status, archived]);
    const cursor = decodeAccountCursor(url.searchParams.get("cursor"), cursorScope);
    const pageFilter = cursor ? or(lt(accounts.createdAt, cursor.createdAt), and(eq(accounts.createdAt, cursor.createdAt), lt(accounts.id, cursor.id))) : undefined;
    const db = getDb();
    const [pageRows, counts] = await readCatalogGroup(["catalog.page", "catalog.count"], [
      () => db.select().from(accounts).where(and(...filters, pageFilter)).orderBy(desc(accounts.createdAt), desc(accounts.id)).limit(limit + 1),
      () => db.select({ total: sql<number>`count(*)`, withoutMetaConnection: withoutMetaConnectionCount() }).from(accounts).where(and(...filters)),
    ]);
    const hasMore = pageRows.length > limit;
    const rows = pageRows.slice(0, limit);
    const total = Number(counts[0]?.total ?? 0);
    const wantStats = url.searchParams.get("stats") === "1";
    // SQL subqueries keep page enrichment bounded without a 500-value IN binding.
    const pageAccounts = db.select({ id: accounts.id, ownerUserId: accounts.ownerUserId, instagramAccountId: accounts.instagramAccountId }).from(accounts).where(and(...filters, pageFilter)).orderBy(desc(accounts.createdAt), desc(accounts.id)).limit(limit).as("account_page");
    const pageIds = db.select({ id: pageAccounts.id }).from(pageAccounts);
    const connectionScope = platformScope ? ne(metaConnections.status, "archived") : and(eq(metaConnections.ownerUserId, owner), ne(metaConnections.status, "archived"));
    const nowMs = Date.now();
    const [connectionRows, statsRows, queueRows, summaryRows, errorRows] = await readCatalogGroup(["catalog.connections", "catalog.stats", "catalog.queue", "catalog.summary", "catalog.errors"], [
      () => db.selectDistinct({ ownerUserId: metaConnections.ownerUserId, instagramUserId: metaConnections.instagramUserId, publishingLimitUsed: metaConnections.publishingLimitUsed, publishingLimitTotal: metaConnections.publishingLimitTotal, lastSyncAt: metaConnections.lastSyncAt, status: metaConnections.status, tokenExpiresAt: metaConnections.tokenExpiresAt, lastError: metaConnections.lastError, metaAppKey: metaConnections.metaAppKey, metaAppId: metaConnections.metaAppId }).from(metaConnections).innerJoin(pageAccounts, and(eq(pageAccounts.ownerUserId, metaConnections.ownerUserId), eq(pageAccounts.instagramAccountId, metaConnections.instagramUserId))).where(connectionScope),
      () => wantStats ? getDb().select({
        accountId: scheduledPosts.accountId,
        published: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'published' then 1 else 0 end), 0)`,
        failed: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'failed' then 1 else 0 end), 0)`,
        blocked: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'blocked' then 1 else 0 end), 0)`,
      }).from(scheduledPosts).where(and(inArray(scheduledPosts.accountId, pageIds), platformScope ? undefined : eq(scheduledPosts.ownerUserId, owner), gte(scheduledPosts.scheduledFor, new Date(nowMs - 30 * 86_400_000).toISOString()))).groupBy(scheduledPosts.accountId) : Promise.resolve([]),
      () => db.select({ accountId: scheduledPosts.accountId, total: sql<number>`count(*)` }).from(scheduledPosts).where(and(
        platformScope ? undefined : eq(scheduledPosts.ownerUserId, owner), inArray(scheduledPosts.accountId, pageIds), inArray(scheduledPosts.status, [...LIVE_QUEUE_STATUSES]),
        sql`exists(select 1 from accounts a where a.id=${scheduledPosts.accountId} and a.owner_user_id=${scheduledPosts.ownerUserId} and a.archived_at is null)`,
        sql`exists(select 1 from campaigns c where c.id=${scheduledPosts.campaignId} and c.owner_user_id=${scheduledPosts.ownerUserId} and c.status not in ('archived','cancelled'))`,
      )).groupBy(scheduledPosts.accountId),
      () => db.select({
        connected: sql<number>`coalesce(sum(case when ${metaConnections.status}='connected' then 1 else 0 end),0)`,
        fresh: sql<number>`coalesce(sum(case when ${metaConnections.status}='connected' and (julianday(${new Date(nowMs).toISOString()})-julianday(${metaConnections.lastSyncAt}))*86400000 <= 3600000 then 1 else 0 end),0)`,
        oldest: sql<string | null>`min(case when ${metaConnections.status}='connected' then ${metaConnections.lastSyncAt} end)`,
        latest: sql<string | null>`max(case when ${metaConnections.status}='connected' then ${metaConnections.lastSyncAt} end)`,
      }).from(metaConnections).where(connectionScope),
      () => db.select({ lastError: metaConnections.lastError }).from(metaConnections).where(and(connectionScope, eq(metaConnections.status, "error"))),
    ]);
    const liveQueue = new Map(queueRows.map((row) => [String(row.accountId), Number(row.total) || 0]));
    const connectionByIg = new Map(connectionRows.map((item) => [`${item.ownerUserId}:${item.instagramUserId}`, item]));
    const statsByAccount = new Map(statsRows.map((item) => [item.accountId, item]));
    const accountsPayload = rows.map((row) => {
      const connection = !row.archivedAt && row.instagramAccountId ? connectionByIg.get(`${row.ownerUserId}:${row.instagramAccountId}`) : undefined;
      const stats = statsByAccount.get(row.id);
      const published30d = Number(stats?.published) || 0;
      const failed30d = Number(stats?.failed) || 0;
      const blocked30d = Number(stats?.blocked) || 0;
      const quotaUsed = connection?.publishingLimitUsed ?? 0;
      const quotaTotal = connection?.publishingLimitTotal ?? 100;
      const liveHealth = row.healthStatus === "Suspensa"
        ? row.healthStatus
        : !connection
          ? row.healthStatus
          : deriveConnectedHealth({
          quotaUsed,
          quotaTotal,
          restriction: row.healthStatus === "Restrita" || connection?.status === "error",
          lastError: connection?.lastError || row.lastError,
        }).healthStatus;
      const { loginPasswordCiphertext, loginPasswordIv, emailPasswordCiphertext, emailPasswordIv, ...safeRow } = row;
      const publicRow = {
        ...safeRow,
        connectionStatus: connection ? (connection.status === "connected" ? "Conectada" : "Desconectada") : safeRow.connectionStatus,
        queueCount: row.archivedAt ? 0 : liveQueue.get(String(row.id)) || 0,
        hasLoginPassword: Boolean(loginPasswordCiphertext && loginPasswordIv),
        hasEmailPassword: Boolean(emailPasswordCiphertext && emailPasswordIv),
        healthStatus: liveHealth,
        quotaUsed,
        quotaTotal,
        lastSyncAt: connection?.lastSyncAt ?? null,
        lastError: connection?.lastError || row.lastError,
        connectionApiStatus: connection?.status ?? null,
        tokenExpiresAt: connection?.tokenExpiresAt ?? null,
        metaAppKey: connection?.metaAppKey ?? null,
        metaAppId: connection?.metaAppId ?? null,
        published30d,
        failed30d,
        blocked30d,
        successRate: published30d + failed30d ? Math.round((published30d / (published30d + failed30d)) * 100) : 0,
      };
      return context.role === "owner" && !platformScope ? publicRow : { ...publicRow, loginEmail: null, recoveryEmail: null, phoneNumber: null, twoFactorMethod: null, emailTwoFactor: null, vaultReference: null, hasLoginPassword: false, hasEmailPassword: false };
    });
    return Response.json({
      accounts: accountsPayload,
      pagination: { nextCursor: hasMore ? encodeAccountCursor(rows[rows.length - 1], cursorScope) : null, hasMore, pageSize: limit, total },
      canViewRecovery: context.role === "owner" && !platformScope,
      scope: platformScope ? "platform" : "workspace",
      syncSummary: {
        totalProfiles: total,
        connected: Number(summaryRows[0]?.connected ?? 0),
        fresh: Number(summaryRows[0]?.fresh ?? 0),
        errors: errorRows.length,
        reconnectRequired: errorRows.filter((item) => requiresMetaReconnect(item.lastError)).length,
        retryableErrors: errorRows.filter((item) => !requiresMetaReconnect(item.lastError)).length,
        withoutMetaConnection: Number(counts[0]?.withoutMetaConnection ?? 0),
        oldestSuccessfulSyncAt: summaryRows[0]?.oldest ?? null,
        latestSuccessfulSyncAt: summaryRows[0]?.latest ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AccountsInputError) return Response.json({ error: error.message }, { status: 400 });
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    const diagnosticId = crypto.randomUUID();
    console.error(JSON.stringify({ event: "accounts.catalog.failure", diagnosticId, ...catalogFailureDiagnostic(error) }));
    return Response.json({ error: "Não foi possível carregar as contas. Tente novamente.", code: "accounts_catalog_unavailable", diagnosticId }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "owner");
    const ownerUserId = context.workspaceOwnerUserId;
    const payload = await request.json() as { username?: string; usernames?: string[]; displayName?: string; model?: string; player?: string; groupName?: string; niche?: string; notes?: string; loginEmail?: string; recoveryEmail?: string; phoneNumber?: string; twoFactorMethod?: string; emailTwoFactor?: string; vaultReference?: string; loginPassword?: string; emailPassword?: string; lifecycle?: string };
    const db = getDb();
    if (Array.isArray(payload.usernames)) {
      const requested = [...new Set(payload.usernames.map((value) => String(value || "").replace(/^@/, "").trim().toLowerCase()).filter(Boolean))].slice(0, 200);
      if (!requested.length) return Response.json({ error: "Cole pelo menos um @ válido." }, { status: 400 });
      const valid = requested.filter((username) => /^[a-z0-9._]{1,30}$/.test(username));
      const invalid = requested.length - valid.length;
      if (!valid.length) return Response.json({ error: "Nenhum @ válido. Use só letras, números, ponto e underline." }, { status: 400 });
      const existing = await db.select({ username: accounts.username }).from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.username, valid)));
      const existingSet = new Set(existing.map((row) => row.username));
      const toCreate = valid.filter((username) => !existingSet.has(username));
      const now = new Date().toISOString();
      const model = payload.model?.trim().slice(0, 120) || "Sem modelo";
      const player = payload.player?.trim().slice(0, 120) || "Sem player";
      const groupName = payload.groupName?.trim().slice(0, 120) || null;
      const niche = payload.niche?.trim().slice(0, 120) || null;
      const created: Array<{ id: string; username: string }> = [];
      for (let index = 0; index < toCreate.length; index += 20) {
        const chunk = toCreate.slice(index, index + 20);
        const rows = await db.insert(accounts).values(chunk.map((username) => ({
          id: crypto.randomUUID(),
          ownerUserId,
          username,
          model,
          player,
          groupName,
          niche,
          healthStatus: "Desconhecida",
          connectionStatus: "Não verificada",
          source: "manual",
          createdAt: now,
          updatedAt: now,
        }))).returning({ id: accounts.id, username: accounts.username });
        created.push(...rows);
      }
      await recordAuditEvent(request, { ownerUserId, action: "accounts.create_bulk", entityType: "account", summary: `${created.length} conta(s) cadastrada(s) em lote no cofre.`, metadata: { created: created.length, skipped: existingSet.size, invalid, usernames: created.map((row) => row.username).join(",") } });
      return Response.json({ created: created.length, skipped: existingSet.size, invalid, accounts: created }, { status: created.length ? 201 : 200 });
    }
    const username = (payload.username || "").replace(/^@/, "").trim().toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(username)) return Response.json({ error: "Informe um @ válido, sem espaços (até 30 caracteres)." }, { status: 400 });
    const [existing] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), eq(accounts.username, username))).limit(1);
    if (existing) return Response.json({ error: `Já existe uma conta @${username} nesta operação.` }, { status: 409 });
    if (typeof payload.twoFactorMethod === "string" && payload.twoFactorMethod.trim() && !["Aplicativo autenticador", "SMS", "E-mail", "Chave física", "Não configurado"].includes(payload.twoFactorMethod.trim())) {
      return Response.json({ error: "Método de 2FA inválido." }, { status: 400 });
    }
    if (typeof payload.loginPassword === "string" && payload.loginPassword.length > 200) return Response.json({ error: "A senha do Instagram deve ter no máximo 200 caracteres." }, { status: 400 });
    if (typeof payload.emailPassword === "string" && payload.emailPassword.length > 200) return Response.json({ error: "A senha do e-mail deve ter no máximo 200 caracteres." }, { status: 400 });
    if (typeof payload.lifecycle === "string" && payload.lifecycle.trim() && !["ativa", "aquecendo", "caida"].includes(payload.lifecycle.trim())) {
      return Response.json({ error: "Situação inválida." }, { status: 400 });
    }
    const secret = typeof payload.loginPassword === "string" && payload.loginPassword.trim() ? await encryptSecret(payload.loginPassword) : null;
    const emailSecret = typeof payload.emailPassword === "string" && payload.emailPassword.trim() ? await encryptSecret(payload.emailPassword) : null;
    const now = new Date().toISOString();
    const [created] = await db.insert(accounts).values({
      id: crypto.randomUUID(),
      ownerUserId,
      username,
      displayName: payload.displayName?.trim().slice(0, 120) || null,
      model: payload.model?.trim().slice(0, 120) || "Sem modelo",
      player: payload.player?.trim().slice(0, 120) || "Sem player",
      groupName: payload.groupName?.trim().slice(0, 120) || null,
      niche: payload.niche?.trim().slice(0, 120) || null,
      notes: payload.notes?.trim().slice(0, 2_000) || null,
      loginEmail: payload.loginEmail?.trim().slice(0, 254) || null,
      recoveryEmail: payload.recoveryEmail?.trim().slice(0, 254) || null,
      phoneNumber: payload.phoneNumber?.trim().slice(0, 50) || null,
      twoFactorMethod: payload.twoFactorMethod?.trim() || null,
      emailTwoFactor: payload.emailTwoFactor?.trim().slice(0, 500) || null,
      vaultReference: payload.vaultReference?.trim().slice(0, 500) || null,
      loginPasswordCiphertext: secret?.ciphertext ?? null,
      loginPasswordIv: secret?.iv ?? null,
      emailPasswordCiphertext: emailSecret?.ciphertext ?? null,
      emailPasswordIv: emailSecret?.iv ?? null,
      lifecycle: payload.lifecycle?.trim() || "ativa",
      healthStatus: "Desconhecida",
      connectionStatus: "Não verificada",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    }).returning({ id: accounts.id, username: accounts.username });
    await recordAuditEvent(request, { ownerUserId, action: "accounts.create", entityType: "account", entityId: created.id, summary: `Conta @${created.username} cadastrada no cofre, ainda sem conexão Meta.` });
    return Response.json({ account: created }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : "Não foi possível cadastrar a conta.";
    if (/unique/i.test(message)) return Response.json({ error: "Já existe uma conta com este @." }, { status: 409 });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { action?: string; ids?: string[]; model?: string; player?: string; groupName?: string; niche?: string; priority?: string; notes?: string; loginEmail?: string; recoveryEmail?: string; phoneNumber?: string; twoFactorMethod?: string; emailTwoFactor?: string; vaultReference?: string; loginPassword?: string; emailPassword?: string; clearLoginPassword?: boolean; clearEmailPassword?: boolean; lifecycle?: string };
    if (payload.action === "archive" || payload.action === "restore") {
      const context = await requireWorkspaceContext(request, "owner");
      const ownerUserId = context.workspaceOwnerUserId;
      const ids = accountBatchIds(payload.ids, 200);
      if (!ids.length) return Response.json({ error: "Selecione pelo menos uma conta." }, { status: 400 });
      const db = getDb();
      const rows: Array<{ id: string; username: string; instagramAccountId: string | null }> = [];
      for (let offset = 0; offset < ids.length; offset += 40) rows.push(...await db.select({ id: accounts.id, username: accounts.username, instagramAccountId: accounts.instagramAccountId }).from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, ids.slice(offset, offset + 40)))));
      if (!rows.length) return Response.json({ error: "Nenhuma conta encontrada." }, { status: 404 });
      const accountIds = rows.map((row) => row.id);
      const now = new Date().toISOString();
      if (payload.action === "archive") {
        const result = await archiveAccounts(ownerUserId, accountIds);
        const warnings: string[] = [];
        if (result.inFlightPosts) warnings.push("Envios já iniciados podem concluir; seus recibos serão preservados.");
        if (result.protectedPosts) warnings.push("Resultados confirmados ou incertos foram preservados, sem repetir envios.");
        try { await recordAuditEvent(request, { ownerUserId, action: "accounts.archive", entityType: "account", summary: `${result.archived} perfil(is) arquivado(s), com histórico preservado.` }); }
        catch { warnings.push("Arquivamento salvo; auditoria indisponível."); }
        return Response.json({ ...result, warnings });
      }
      const restores = [];
      for (let offset = 0; offset < accountIds.length; offset += 40) restores.push(db.update(accounts).set({ archivedAt: null, connectionStatus: "Desconectada", lastError: "Reconecte a conta à Meta para voltar a publicar.", updatedAt: now }).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, accountIds.slice(offset, offset + 40)), isNotNull(accounts.archivedAt))).returning({ id: accounts.id, username: accounts.username }));
      const updated = (await db.batch(restores as [typeof restores[number], ...typeof restores])).flat();
      await recordAuditEvent(request, { ownerUserId, action: "accounts.restore", entityType: "account", summary: `${updated.length} perfil(is) restaurado(s), mantendo todo o histórico.`, metadata: { count: updated.length, usernames: updated.map((row) => row.username).join(",") } });
      return Response.json({ restored: updated.length, usernames: updated.map((row) => row.username) });
    }
    const includesRecoveryData = [payload.loginEmail, payload.recoveryEmail, payload.phoneNumber, payload.twoFactorMethod, payload.emailTwoFactor, payload.vaultReference, payload.loginPassword, payload.emailPassword].some((value) => value !== undefined) || payload.clearLoginPassword === true || payload.clearEmailPassword === true;
    const ownerUserId = includesRecoveryData ? (await requireWorkspaceContext(request, "owner")).workspaceOwnerUserId : await requireOwnerId(request);
    const ids = accountBatchIds(payload.ids, 500);
    if (!ids.length) return Response.json({ error: "Selecione pelo menos uma conta." }, { status: 400 });
    const values: Partial<InferInsertModel<typeof accounts>> = { updatedAt: new Date().toISOString() };
    if (typeof payload.model === "string") values.model = payload.model.trim().slice(0, 120) || "Sem modelo";
    if (typeof payload.player === "string") values.player = payload.player.trim().slice(0, 120) || "Sem player";
    if (typeof payload.groupName === "string") values.groupName = payload.groupName.trim().slice(0, 120) || null;
    if (typeof payload.niche === "string") values.niche = payload.niche.trim().slice(0, 120) || null;
    if (typeof payload.notes === "string") values.notes = payload.notes.trim().slice(0, 2_000) || null;
    if (typeof payload.loginEmail === "string") values.loginEmail = payload.loginEmail.trim().slice(0, 254) || null;
    if (typeof payload.recoveryEmail === "string") values.recoveryEmail = payload.recoveryEmail.trim().slice(0, 254) || null;
    if (typeof payload.phoneNumber === "string") values.phoneNumber = payload.phoneNumber.trim().slice(0, 50) || null;
    if (typeof payload.vaultReference === "string") values.vaultReference = payload.vaultReference.trim().slice(0, 500) || null;
    if (typeof payload.emailTwoFactor === "string") values.emailTwoFactor = payload.emailTwoFactor.trim().slice(0, 500) || null;
    if (typeof payload.lifecycle === "string") {
      const lifecycle = payload.lifecycle.trim() || "ativa";
      if (!["ativa", "aquecendo", "caida"].includes(lifecycle)) return Response.json({ error: "Situação inválida." }, { status: 400 });
      values.lifecycle = lifecycle;
    }
    if (typeof payload.twoFactorMethod === "string") {
      const twoFactorMethod = payload.twoFactorMethod.trim();
      if (twoFactorMethod && !["Aplicativo autenticador", "SMS", "E-mail", "Chave física", "Não configurado"].includes(twoFactorMethod)) return Response.json({ error: "Método de 2FA inválido." }, { status: 400 });
      values.twoFactorMethod = twoFactorMethod || null;
    }
    if (typeof payload.priority === "string" && payload.priority.trim()) {
      if (!["Alta", "Média", "Normal"].includes(payload.priority.trim())) return Response.json({ error: "Prioridade inválida." }, { status: 400 });
      values.priority = payload.priority.trim();
    }
    if (payload.clearLoginPassword) {
      values.loginPasswordCiphertext = null;
      values.loginPasswordIv = null;
    } else if (typeof payload.loginPassword === "string" && payload.loginPassword.trim()) {
      if (payload.loginPassword.length > 200) return Response.json({ error: "A senha do Instagram deve ter no máximo 200 caracteres." }, { status: 400 });
      const secret = await encryptSecret(payload.loginPassword);
      values.loginPasswordCiphertext = secret.ciphertext;
      values.loginPasswordIv = secret.iv;
    }
    if (payload.clearEmailPassword) {
      values.emailPasswordCiphertext = null;
      values.emailPasswordIv = null;
    } else if (typeof payload.emailPassword === "string" && payload.emailPassword.trim()) {
      if (payload.emailPassword.length > 200) return Response.json({ error: "A senha do e-mail deve ter no máximo 200 caracteres." }, { status: 400 });
      const secret = await encryptSecret(payload.emailPassword);
      values.emailPasswordCiphertext = secret.ciphertext;
      values.emailPasswordIv = secret.iv;
    }
    if (Object.keys(values).length === 1) return Response.json({ error: "Informe pelo menos um campo para atualizar." }, { status: 400 });
    // D1 batch is transactional; bounded bind counts avoid a partial metadata update.
    const db = getDb();
    const updates = [];
    for (let offset = 0; offset < ids.length; offset += 40) updates.push(db.update(accounts).set(values).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, ids.slice(offset, offset + 40)))).returning({ id: accounts.id }));
    const updated = (await db.batch(updates as [typeof updates[number], ...typeof updates])).flat();
    await recordAuditEvent(request, { ownerUserId, action: "accounts.update", entityType: "account", summary: `${updated.length} conta(s) organizada(s).`, metadata: { count: updated.length, fields: Object.keys(values).filter((key) => key !== "updatedAt").join(",") } });
    return Response.json({ updated: updated.length });
  } catch (error) {
    if (error instanceof AccountsInputError) return Response.json({ error: error.message }, { status: 400 });
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível organizar as contas." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "owner");
    void context;
    const payload = await request.json() as { ids?: string[]; confirmation?: string };
    if (payload.confirmation !== "EXCLUIR") return Response.json({ error: "Confirme a exclusão digitando a ação exigida." }, { status: 400 });
    const ids = accountBatchIds(payload.ids, 50);
    if (!ids.length) return Response.json({ error: "Selecione pelo menos uma conta." }, { status: 400 });
    // DELETE is kept for existing clients; it now performs the same safe archive.
    const response = await PATCH(new Request(request.url, { method: "PATCH", headers: request.headers, body: JSON.stringify({ action: "archive", ids }) }));
    const result = await response.json() as { archived?: number };
    return Response.json({ ...result, deleted: result.archived ?? 0 }, { status: response.status });
  } catch (error) {
    if (error instanceof AccountsInputError) return Response.json({ error: error.message }, { status: 400 });
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a conta." }, { status: 500 });
  }
}
