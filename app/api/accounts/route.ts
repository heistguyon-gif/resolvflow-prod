import { and, desc, eq, gte, inArray, isNotNull, isNull, like, ne, or, sql, type InferInsertModel } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, metaConnections, publicationAttempts, scheduledPosts } from "../../../db/schema";
import { authErrorResponse, isPlatformAdminEmail, requireOwnerId, requireWorkspaceContext } from "../../../lib/auth";
import { recordAuditEvent } from "../../../lib/audit";
import { deriveConnectedHealth } from "../../../lib/account-health";
import { liveQueueByAccount, reconcileFinishedCampaigns } from "../../../lib/queue-reconcile";
import { encryptToken } from "../../../lib/token-crypto";

async function encryptSecret(value: string) {
  if (value.length > 200) throw new Error("A senha deve ter no máximo 200 caracteres.");
  return encryptToken(value);
}

function requiresMetaReconnect(message: string | null | undefined) {
  return /log in to www\.instagram\.com|access token|token.*expir|oauth|checkpoint|renovad|session.*invalid/i.test(message || "");
}

async function deleteInChunks<T>(ids: T[], chunkSize: number, remove: (chunk: T[]) => Promise<unknown>) {
  for (let index = 0; index < ids.length; index += chunkSize) await remove(ids.slice(index, index + chunkSize));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "";
    const archived = url.searchParams.get("archived")?.trim() ?? "active";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 500, 1), 500);
    const context = await requireWorkspaceContext(request, "viewer");
    const owner = context.workspaceOwnerUserId;
    const platformScope = url.searchParams.get("scope") === "platform" && isPlatformAdminEmail(context.email);
    if (!platformScope) void reconcileFinishedCampaigns(owner).catch(() => 0);
    const filters = platformScope ? [] : [eq(accounts.ownerUserId, owner)];
    if (archived === "only") filters.push(isNotNull(accounts.archivedAt));
    else if (archived !== "include") filters.push(isNull(accounts.archivedAt));
    if (status && status !== "Todas") filters.push(eq(accounts.healthStatus, status));
    const searchFilter = search ? or(like(accounts.username, `%${search}%`), like(accounts.player, `%${search}%`), like(accounts.model, `%${search}%`)) : undefined;
    if (searchFilter) filters.push(searchFilter);
    const rows = await getDb().select().from(accounts).where(and(...filters)).orderBy(desc(accounts.createdAt)).limit(limit);
    const wantStats = url.searchParams.get("stats") === "1";
    const [connectionRows, statsRows, liveQueue] = await Promise.all([
      getDb().select({ ownerUserId: metaConnections.ownerUserId, instagramUserId: metaConnections.instagramUserId, publishingLimitUsed: metaConnections.publishingLimitUsed, publishingLimitTotal: metaConnections.publishingLimitTotal, lastSyncAt: metaConnections.lastSyncAt, status: metaConnections.status, tokenExpiresAt: metaConnections.tokenExpiresAt, lastError: metaConnections.lastError, metaAppKey: metaConnections.metaAppKey, metaAppId: metaConnections.metaAppId }).from(metaConnections).where(platformScope ? ne(metaConnections.status, "archived") : and(eq(metaConnections.ownerUserId, owner), ne(metaConnections.status, "archived"))),
      wantStats ? getDb().select({
        accountId: scheduledPosts.accountId,
        published: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'published' then 1 else 0 end), 0)`,
        failed: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'failed' then 1 else 0 end), 0)`,
        blocked: sql<number>`coalesce(sum(case when ${scheduledPosts.status} = 'blocked' then 1 else 0 end), 0)`,
      }).from(scheduledPosts).where(platformScope ? gte(scheduledPosts.scheduledFor, new Date(Date.now() - 30 * 86_400_000).toISOString()) : and(eq(scheduledPosts.ownerUserId, owner), gte(scheduledPosts.scheduledFor, new Date(Date.now() - 30 * 86_400_000).toISOString()))).groupBy(scheduledPosts.accountId) : Promise.resolve([]),
      liveQueueByAccount(platformScope ? undefined : owner),
    ]);
    const connectionByIg = new Map(connectionRows.map((item) => [`${item.ownerUserId}:${item.instagramUserId}`, item]));
    const statsByAccount = new Map(statsRows.map((item) => [item.accountId, item]));
    const accountsPayload = rows.map((row) => {
      const connection = row.instagramAccountId ? connectionByIg.get(`${row.ownerUserId}:${row.instagramAccountId}`) : undefined;
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
        queueCount: liveQueue.get(String(row.id)) || 0,
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
    const nowMs = Date.now();
    const connectedRows = connectionRows.filter((item) => item.status === "connected");
    const errorRows = connectionRows.filter((item) => item.status === "error");
    const freshRows = connectedRows.filter((item) => item.lastSyncAt && nowMs - new Date(item.lastSyncAt).getTime() <= 60 * 60_000);
    const successfulSyncs = connectedRows.map((item) => item.lastSyncAt).filter((value): value is string => Boolean(value)).sort();
    return Response.json({
      accounts: accountsPayload,
      canViewRecovery: context.role === "owner" && !platformScope,
      scope: platformScope ? "platform" : "workspace",
      syncSummary: {
        totalProfiles: rows.length,
        connected: connectedRows.length,
        fresh: freshRows.length,
        errors: errorRows.length,
        reconnectRequired: errorRows.filter((item) => requiresMetaReconnect(item.lastError)).length,
        retryableErrors: errorRows.filter((item) => !requiresMetaReconnect(item.lastError)).length,
        withoutMetaConnection: Math.max(0, rows.length - connectionRows.length),
        oldestSuccessfulSyncAt: successfulSyncs[0] ?? null,
        latestSuccessfulSyncAt: successfulSyncs.at(-1) ?? null,
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    const message = error instanceof Error ? error.message : "Não foi possível carregar as contas.";
    return Response.json({ error: message }, { status: 500 });
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
      const ids = [...new Set(payload.ids ?? [])].filter(Boolean).slice(0, 200);
      if (!ids.length) return Response.json({ error: "Selecione pelo menos uma conta." }, { status: 400 });
      const db = getDb();
      const rows = await db.select({ id: accounts.id, username: accounts.username, instagramAccountId: accounts.instagramAccountId }).from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, ids)));
      if (!rows.length) return Response.json({ error: "Nenhuma conta encontrada." }, { status: 404 });
      const accountIds = rows.map((row) => row.id);
      const now = new Date().toISOString();
      if (payload.action === "archive") {
        const [publishing] = await db.select({ total: sql<number>`count(*)` }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), inArray(scheduledPosts.accountId, accountIds), eq(scheduledPosts.status, "processing")));
        if (Number(publishing?.total) > 0) return Response.json({ error: "Há uma publicação em processamento para esta conta. Aguarde o ciclo terminar e tente arquivar novamente." }, { status: 409 });
        await db.update(scheduledPosts).set({ status: "paused", lastError: "Conta arquivada; publicação preservada e pausada.", lockedAt: null, lockToken: null, updatedAt: now }).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), inArray(scheduledPosts.accountId, accountIds), inArray(scheduledPosts.status, ["pending", "retry", "container_created"])));
        const instagramIds = rows.map((row) => row.instagramAccountId).filter((value): value is string => Boolean(value));
        if (instagramIds.length) await db.update(metaConnections).set({ status: "archived", lastError: "Conta arquivada pelo workspace.", updatedAt: now }).where(and(eq(metaConnections.ownerUserId, ownerUserId), inArray(metaConnections.instagramUserId, instagramIds)));
        const updated = await db.update(accounts).set({ archivedAt: now, connectionStatus: "Desconectada", queueCount: 0, updatedAt: now }).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, accountIds), isNull(accounts.archivedAt))).returning({ id: accounts.id, username: accounts.username });
        await recordAuditEvent(request, { ownerUserId, action: "accounts.archive", entityType: "account", summary: `${updated.length} perfil(is) arquivado(s), com histórico preservado.`, metadata: { count: updated.length, usernames: updated.map((row) => row.username).join(",") } });
        return Response.json({ archived: updated.length, usernames: updated.map((row) => row.username) });
      }
      const updated = await db.update(accounts).set({ archivedAt: null, lifecycle: "ativa", connectionStatus: "Desconectada", lastError: "Reconecte a conta à Meta para voltar a publicar.", updatedAt: now }).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, accountIds), isNotNull(accounts.archivedAt))).returning({ id: accounts.id, username: accounts.username });
      await recordAuditEvent(request, { ownerUserId, action: "accounts.restore", entityType: "account", summary: `${updated.length} perfil(is) restaurado(s), mantendo todo o histórico.`, metadata: { count: updated.length, usernames: updated.map((row) => row.username).join(",") } });
      return Response.json({ restored: updated.length, usernames: updated.map((row) => row.username) });
    }
    const includesRecoveryData = [payload.loginEmail, payload.recoveryEmail, payload.phoneNumber, payload.twoFactorMethod, payload.emailTwoFactor, payload.vaultReference, payload.loginPassword, payload.emailPassword].some((value) => value !== undefined) || payload.clearLoginPassword === true || payload.clearEmailPassword === true;
    const ownerUserId = includesRecoveryData ? (await requireWorkspaceContext(request, "owner")).workspaceOwnerUserId : await requireOwnerId(request);
    const ids = [...new Set(payload.ids ?? [])].filter(Boolean).slice(0, 500);
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
    const updated = await getDb().update(accounts).set(values).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, ids))).returning({ id: accounts.id });
    await recordAuditEvent(request, { ownerUserId, action: "accounts.update", entityType: "account", summary: `${updated.length} conta(s) organizada(s).`, metadata: { count: updated.length, fields: Object.keys(values).filter((key) => key !== "updatedAt").join(",") } });
    return Response.json({ updated: updated.length });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível organizar as contas." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "owner");
    const ownerUserId = context.workspaceOwnerUserId;
    const payload = await request.json() as { ids?: string[]; confirmation?: string };
    if (payload.confirmation !== "EXCLUIR") return Response.json({ error: "Confirme a exclusão digitando a ação exigida." }, { status: 400 });
    const ids = [...new Set(payload.ids ?? [])].filter(Boolean).slice(0, 50);
    if (!ids.length) return Response.json({ error: "Selecione pelo menos uma conta." }, { status: 400 });
    const db = getDb();
    const rows = await db.select({ id: accounts.id, username: accounts.username, instagramAccountId: accounts.instagramAccountId }).from(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, ids)));
    if (!rows.length) return Response.json({ error: "Nenhuma conta encontrada para excluir." }, { status: 404 });
    const accountIds = rows.map((row) => row.id);
    const postRows = await db.select({ id: scheduledPosts.id }).from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), inArray(scheduledPosts.accountId, accountIds)));
    const postIds = postRows.map((row) => row.id);
    if (postIds.length) {
      await deleteInChunks(postIds, 80, (chunk) => db.delete(publicationAttempts).where(inArray(publicationAttempts.scheduledPostId, chunk)));
      await deleteInChunks(accountIds, 50, (chunk) => db.delete(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), inArray(scheduledPosts.accountId, chunk))));
    }
    const instagramIds = rows.map((row) => row.instagramAccountId).filter((value): value is string => Boolean(value));
    if (instagramIds.length) {
      await db.delete(metaConnections).where(and(eq(metaConnections.ownerUserId, ownerUserId), inArray(metaConnections.instagramUserId, instagramIds)));
    }
    const removed = await db.delete(accounts).where(and(eq(accounts.ownerUserId, ownerUserId), inArray(accounts.id, accountIds))).returning({ id: accounts.id, username: accounts.username });
    await recordAuditEvent(request, { ownerUserId, action: "accounts.delete", entityType: "account", summary: `${removed.length} perfil(is) removido(s) da resolv..`, metadata: { count: removed.length, usernames: removed.map((row) => row.username).join(",") } });
    return Response.json({ deleted: removed.length, cancelledPosts: postIds.length, usernames: removed.map((row) => row.username) });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a conta." }, { status: 500 });
  }
}
