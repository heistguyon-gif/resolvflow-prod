import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { campaignMedia } from "../../../../db/schema";
import { recordAuditEvent } from "../../../../lib/audit";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { getMediaBucket } from "../../../../lib/media-storage";

const ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_OBJECTS_PER_SCAN = 5_000;

type OwnedObject = { key: string; size: number; uploaded: Date };

async function listOwnedObjects(ownerUserId: string) {
  const bucket = getMediaBucket();
  const objects: OwnedObject[] = [];
  let cursor: string | undefined;
  let truncated = false;
  do {
    const page = await bucket.list({ prefix: "campaign-media/", limit: Math.min(1_000, MAX_OBJECTS_PER_SCAN - objects.length), cursor, include: ["customMetadata"] });
    for (const object of page.objects) {
      if (object.customMetadata?.ownerUserId === ownerUserId) objects.push({ key: object.key, size: object.size, uploaded: object.uploaded });
      if (objects.length >= MAX_OBJECTS_PER_SCAN) break;
    }
    cursor = page.truncated ? page.cursor : undefined;
    truncated = Boolean(page.truncated && objects.length >= MAX_OBJECTS_PER_SCAN);
  } while (cursor && objects.length < MAX_OBJECTS_PER_SCAN);
  return { objects, truncated };
}

async function inventory(ownerUserId: string) {
  const references = await getDb().select({ objectKey: campaignMedia.objectKey }).from(campaignMedia).where(eq(campaignMedia.ownerUserId, ownerUserId)).limit(MAX_OBJECTS_PER_SCAN);
  const referencedKeys = new Set(references.map((item) => item.objectKey));
  const { objects, truncated } = await listOwnedObjects(ownerUserId);
  const cutoff = Date.now() - ORPHAN_RETENTION_MS;
  const orphans = objects.filter((object) => !referencedKeys.has(object.key) && object.uploaded.getTime() < cutoff);
  return {
    scanned: objects.length,
    referenced: objects.filter((object) => referencedKeys.has(object.key)).length,
    orphaned: orphans.length,
    orphanedBytes: orphans.reduce((sum, object) => sum + object.size, 0),
    totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
    retainedHours: ORPHAN_RETENTION_MS / 3_600_000,
    truncated,
    orphanKeys: orphans.map((object) => object.key),
  };
}

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const result = await inventory(context.workspaceOwnerUserId);
    return Response.json({ ...result, orphanKeys: undefined, canCleanup: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível analisar o armazenamento." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const payload = await request.json().catch(() => ({})) as { confirmation?: string };
    if (payload.confirmation !== "REMOVER_ORFAOS") return Response.json({ error: "Confirme explicitamente a limpeza dos arquivos órfãos." }, { status: 400 });
    const result = await inventory(context.workspaceOwnerUserId);
    for (let index = 0; index < result.orphanKeys.length; index += 100) await getMediaBucket().delete(result.orphanKeys.slice(index, index + 100));
    await recordAuditEvent(request, {
      ownerUserId: context.workspaceOwnerUserId,
      action: "storage.cleanup",
      entityType: "storage",
      summary: `${result.orphaned} arquivo(s) órfão(s) removido(s) do armazenamento.`,
      metadata: { objects: result.orphaned, bytes: result.orphanedBytes, retainedHours: result.retainedHours },
    });
    return Response.json({ removed: result.orphaned, removedBytes: result.orphanedBytes });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível limpar o armazenamento." }, { status: 500 });
  }
}
