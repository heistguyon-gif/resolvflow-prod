import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, scheduledPosts } from "../../../../db/schema";
import { authErrorResponse } from "../../../../lib/auth";
import { requireReadOnlyOwnerId } from "../../../../lib/campaign-read-access";
import { CAMPAIGN_READ_HEADERS } from "../../../../lib/campaign-management";

export async function GET(request: Request) {
  try {
    const ownerUserId = await requireReadOnlyOwnerId(request);
    const params = new URL(request.url).searchParams;
    if (["scope", "ownerUserId", "workspaceId"].some(key => params.has(key))) {
      return Response.json({ error: "Escopo inválido." }, { status: 400, headers: CAMPAIGN_READ_HEADERS });
    }
    const [rows, queueRows] = await Promise.all([
      getDb().select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.ownerUserId, ownerUserId), isNull(accounts.archivedAt)))
        .orderBy(desc(accounts.createdAt), desc(accounts.id)),
      getDb().select({ accountId: scheduledPosts.accountId, total: sql<number>`count(*)` })
        .from(scheduledPosts).where(and(
          eq(scheduledPosts.ownerUserId, ownerUserId),
          inArray(scheduledPosts.status, ["pending", "retry", "container_created", "processing", "paused"]),
          sql`not exists(select 1 from campaigns c where c.id=${scheduledPosts.campaignId} and c.owner_user_id=${scheduledPosts.ownerUserId} and c.status in ('archived','cancelled'))`,
        )).groupBy(scheduledPosts.accountId),
    ]);
    const counts = new Map<string, number>();
    for (const row of queueRows) {
      if (typeof row.total !== "number" || !Number.isSafeInteger(row.total) || row.total < 0 || counts.has(String(row.accountId))) throw new Error("Invalid queue aggregate");
      counts.set(String(row.accountId), row.total);
    }
    return Response.json({
      fetchedAt: new Date().toISOString(),
      complete: true,
      total: rows.length,
      accounts: rows.map(row => ({ id: row.id, queueCount: counts.get(String(row.id)) ?? 0 })),
    }, { headers: CAMPAIGN_READ_HEADERS });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      authResponse.headers.set("cache-control", CAMPAIGN_READ_HEADERS["cache-control"]);
      return authResponse;
    }
    return Response.json({ error: "Não foi possível consultar as filas dos perfis." }, { status: 500, headers: CAMPAIGN_READ_HEADERS });
  }
}
