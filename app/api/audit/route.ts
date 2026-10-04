import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents } from "../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../lib/auth";

export async function GET(request: Request) {
  try {
    const ownerUserId = (await requirePlatformAdmin(request)).workspaceOwnerUserId;
    const events = await getDb().select({
      id: auditEvents.id,
      actorEmail: auditEvents.actorEmail,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      summary: auditEvents.summary,
      createdAt: auditEvents.createdAt,
    }).from(auditEvents).where(eq(auditEvents.ownerUserId, ownerUserId)).orderBy(desc(auditEvents.createdAt)).limit(100);
    return Response.json({ events });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o histórico operacional." }, { status: 500 });
  }
}
