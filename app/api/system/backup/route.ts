import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, auditEvents, campaignMedia, campaigns, importRuns, metaConnections, scheduledPosts, workspaceMembers } from "../../../../db/schema";
import { recordAuditEvent } from "../../../../lib/audit";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const ownerUserId = context.workspaceOwnerUserId;
    const db = getDb();
    const [accountRows, campaignRows, mediaRows, postRows, connectionRows, memberRows, importRows, auditRows] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.ownerUserId, ownerUserId)).limit(10_000),
      db.select().from(campaigns).where(eq(campaigns.ownerUserId, ownerUserId)).orderBy(desc(campaigns.createdAt)).limit(5_000),
      db.select().from(campaignMedia).where(eq(campaignMedia.ownerUserId, ownerUserId)).limit(20_000),
      db.select().from(scheduledPosts).where(eq(scheduledPosts.ownerUserId, ownerUserId)).orderBy(desc(scheduledPosts.createdAt)).limit(20_000),
      db.select({ id: metaConnections.id, instagramUserId: metaConnections.instagramUserId, username: metaConnections.username, accountType: metaConnections.accountType, scopes: metaConnections.scopes, status: metaConnections.status, publishingLimitUsed: metaConnections.publishingLimitUsed, publishingLimitTotal: metaConnections.publishingLimitTotal, tokenExpiresAt: metaConnections.tokenExpiresAt, lastSyncAt: metaConnections.lastSyncAt, lastError: metaConnections.lastError, metaAppKey: metaConnections.metaAppKey, metaAppId: metaConnections.metaAppId, createdAt: metaConnections.createdAt, updatedAt: metaConnections.updatedAt }).from(metaConnections).where(eq(metaConnections.ownerUserId, ownerUserId)),
      db.select({ id: workspaceMembers.id, email: workspaceMembers.email, displayName: workspaceMembers.displayName, role: workspaceMembers.role, status: workspaceMembers.status, createdAt: workspaceMembers.createdAt, updatedAt: workspaceMembers.updatedAt }).from(workspaceMembers).where(eq(workspaceMembers.workspaceOwnerUserId, ownerUserId)),
      db.select().from(importRuns).where(eq(importRuns.ownerUserId, ownerUserId)).orderBy(desc(importRuns.createdAt)).limit(5_000),
      db.select({ id: auditEvents.id, actorEmail: auditEvents.actorEmail, action: auditEvents.action, entityType: auditEvents.entityType, entityId: auditEvents.entityId, summary: auditEvents.summary, createdAt: auditEvents.createdAt }).from(auditEvents).where(eq(auditEvents.ownerUserId, ownerUserId)).orderBy(desc(auditEvents.createdAt)).limit(5_000),
    ]);
    const generatedAt = new Date().toISOString();
    const snapshot = {
      format: "nexoflow-operational-backup",
      version: 1,
      generatedAt,
      security: "Tokens, chaves secretas, hashes de senha, senhas do Instagram e códigos 2FA não fazem parte deste arquivo.",
      counts: { accounts: accountRows.length, campaigns: campaignRows.length, media: mediaRows.length, scheduledPosts: postRows.length, connections: connectionRows.length, members: memberRows.length, imports: importRows.length, auditEvents: auditRows.length },
      limits: { scheduledPosts: 20_000, media: 20_000, auditEvents: 5_000 },
      // Sensitive fields are intentionally removed from every exported account.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      accounts: accountRows.map(({ loginPasswordCiphertext: _cipher, loginPasswordIv: _iv, emailPasswordCiphertext: _emailCipher, emailPasswordIv: _emailIv, emailTwoFactor: _emailTwoFactor, ...row }) => row),
      campaigns: campaignRows,
      campaignMedia: mediaRows,
      scheduledPosts: postRows,
      metaConnections: connectionRows,
      workspaceMembers: memberRows,
      importRuns: importRows,
      auditEvents: auditRows,
    };
    await recordAuditEvent(request, { ownerUserId, action: "backup.download", entityType: "workspace", summary: "Backup operacional seguro exportado.", metadata: snapshot.counts });
    const stamp = generatedAt.slice(0, 10);
    return new Response(JSON.stringify(snapshot, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="nexoflow-backup-${stamp}.json"`, "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o backup operacional." }, { status: 500 });
  }
}
