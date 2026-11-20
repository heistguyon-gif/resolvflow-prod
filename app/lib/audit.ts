import { getDb } from "../db";
import { auditEvents } from "../db/schema";

type AuditEventInput = {
  ownerUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
};

/** Records non-sensitive operational facts. Never pass passwords, tokens, captions or recovery codes. */
export async function recordAuditEvent(request: Request, input: AuditEventInput) {
  const actorUserId = request.headers.get("oai-authenticated-user-id") || "system";
  const actorEmail = request.headers.get("oai-authenticated-user-email") || "system@nexoflow";
  await getDb().insert(auditEvents).values({
    id: crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    actorUserId,
    actorEmail,
    action: input.action.slice(0, 80),
    entityType: input.entityType.slice(0, 80),
    entityId: input.entityId?.slice(0, 180) || null,
    summary: input.summary.slice(0, 500),
    metadataJson: input.metadata ? JSON.stringify(input.metadata).slice(0, 2_000) : null,
  });
}
