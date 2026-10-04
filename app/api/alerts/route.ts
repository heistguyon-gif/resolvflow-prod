import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts, campaigns, metaConnections, scheduledPosts } from "../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../lib/auth";

type Alert = { id: string; type: string; severity: "critical" | "warning" | "info"; title: string; description: string; accountId?: string; campaignId?: string; createdAt: string };

export async function GET(request: Request) {
  try {
    const ownerUserId = await requireOwnerId(request, "viewer"); const db = getDb(); const now = Date.now(); const sevenDays = now + 7 * 86_400_000;
    const [accountRows, connectionRows, postRows, campaignRows] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.ownerUserId, ownerUserId)),
      db.select().from(metaConnections).where(eq(metaConnections.ownerUserId, ownerUserId)),
      db.select().from(scheduledPosts).where(and(eq(scheduledPosts.ownerUserId, ownerUserId), or(inArray(scheduledPosts.status, ["failed", "blocked"]), and(eq(scheduledPosts.status, "published"), isNotNull(scheduledPosts.lastError))))).orderBy(desc(scheduledPosts.updatedAt)).limit(100),
      db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.ownerUserId, ownerUserId)),
    ]);
    const campaignsById = new Map(campaignRows.map((item) => [item.id, item.name])); const accountsById = new Map(accountRows.map((item) => [item.id, item.username]));
    const alerts: Alert[] = [];
    for (const connection of connectionRows) {
      const expiry = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
      if (connection.status !== "connected") {
        const infraBudget = /too many subrequests|subrequest limit/i.test(connection.lastError || "");
        alerts.push({
          id: `connection-${connection.id}`,
          type: "connection",
          severity: infraBudget ? "warning" : "critical",
          title: infraBudget ? `Sincronização incompleta em @${connection.username}` : `Reconectar @${connection.username}`,
          description: infraBudget ? "A Meta continua autorizada. A sincronização vai continuar em lotes no próximo ciclo." : (connection.lastError || "A conexão com a Meta precisa de atenção."),
          createdAt: connection.updatedAt,
        });
      }
      else if (expiry && expiry <= sevenDays) alerts.push({ id: `token-${connection.id}`, type: "token", severity: expiry <= now ? "critical" : "warning", title: expiry <= now ? `Token vencido de @${connection.username}` : `Token de @${connection.username} vence em breve`, description: expiry <= now ? "Reconecte a conta antes de publicar novamente." : `Validade até ${new Date(expiry).toLocaleDateString("pt-BR")}.`, createdAt: connection.updatedAt });
      const usage = connection.publishingLimitUsed / Math.max(1, connection.publishingLimitTotal);
      if (usage >= .8) alerts.push({ id: `quota-${connection.id}`, type: "quota", severity: usage >= 1 ? "critical" : "warning", title: `Limite da Meta em @${connection.username}`, description: `${connection.publishingLimitUsed} de ${connection.publishingLimitTotal} publicações usadas na janela atual.`, createdAt: connection.updatedAt });
    }
    for (const account of accountRows) {
      if (account.healthStatus.toLowerCase().includes("restr")) alerts.push({ id: `health-${account.id}`, type: "restriction", severity: "critical", title: `Restrição em @${account.username}`, description: account.lastError || "A Meta marcou esta conta para revisão.", accountId: account.id, createdAt: account.updatedAt });
      else if (account.healthStatus.toLowerCase().includes("limite")) alerts.push({ id: `quota-account-${account.id}`, type: "quota", severity: "critical", title: `Limite de vídeos em @${account.username}`, description: account.lastError || "A conta atingiu o limite de publicações da Meta na janela atual.", accountId: account.id, createdAt: account.updatedAt });
      else if (account.lastError) alerts.push({ id: `account-${account.id}`, type: "account", severity: "warning", title: `Atenção em @${account.username}`, description: account.lastError, accountId: account.id, createdAt: account.updatedAt });
    }
    for (const post of postRows) {
      const captionProblem = post.status === "published";
      alerts.push({ id: `post-${post.id}`, type: "publication", severity: captionProblem || post.status === "failed" ? "critical" : "warning", title: captionProblem ? `Legenda não confirmada em ${campaignsById.get(post.campaignId) || "campanha"}` : `${post.status === "failed" ? "Falha" : "Bloqueio"} em ${campaignsById.get(post.campaignId) || "campanha"}`, description: `${accountsById.get(post.accountId) ? `@${accountsById.get(post.accountId)} · ` : ""}${post.lastError || "Revise a publicação na fila."}`, accountId: post.accountId, campaignId: post.campaignId, createdAt: post.updatedAt });
    }
    alerts.sort((a, b) => (a.severity === b.severity ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : ({ critical: 0, warning: 1, info: 2 }[a.severity] - { critical: 0, warning: 1, info: 2 }[b.severity])));
    return Response.json({ alerts });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os alertas." }, { status: 500 });
  }
}
