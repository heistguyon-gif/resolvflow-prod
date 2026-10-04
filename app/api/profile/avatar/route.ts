import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appUsers } from "../../../../db/schema";
import { recordAuditEvent } from "../../../../lib/audit";
import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { getMediaBucket, profileAvatarKey } from "../../../../lib/media-storage";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const url = new URL(request.url);
    const fileName = (url.searchParams.get("name") || "avatar").slice(0, 180);
    const contentType = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const sizeBytes = Number(request.headers.get("content-length") || request.headers.get("x-file-size") || 0);
    if (!request.body || !AVATAR_TYPES.has(contentType)) {
      return Response.json({ error: "Use uma imagem JPG, PNG ou WEBP." }, { status: 415 });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_AVATAR_BYTES) {
      return Response.json({ error: "A foto de perfil precisa ter até 5 MB." }, { status: 400 });
    }
    const db = getDb();
    const [user] = await db.select({ id: appUsers.id, avatarMediaId: appUsers.avatarMediaId }).from(appUsers).where(eq(appUsers.id, context.accountUserId)).limit(1);
    if (!user) return Response.json({ error: "Seu usuário ainda não está cadastrado no login próprio da resolv." }, { status: 409 });
    const id = crypto.randomUUID();
    const bucket = getMediaBucket();
    await bucket.put(profileAvatarKey(id), request.body, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { ownerUserId: context.accountUserId, fileName: encodeURIComponent(fileName), sizeBytes: String(sizeBytes), purpose: "avatar" },
    });
    await db.update(appUsers).set({ avatarMediaId: id, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, context.accountUserId));
    if (user.avatarMediaId && user.avatarMediaId !== id) {
      try { await bucket.delete(profileAvatarKey(user.avatarMediaId)); } catch { /* keep the new photo even if the old file cannot be removed */ }
    }
    await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "profile.avatar_update", entityType: "team_member", entityId: context.accountUserId, summary: "Foto de perfil atualizada." });
    return Response.json({ id, url: `/api/profile/avatar/${id}` }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a foto." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const db = getDb();
    const [user] = await db.select({ avatarMediaId: appUsers.avatarMediaId }).from(appUsers).where(eq(appUsers.id, context.accountUserId)).limit(1);
    if (!user) return Response.json({ error: "Seu usuário ainda não está cadastrado no login próprio da resolv." }, { status: 409 });
    if (user.avatarMediaId) {
      try { await getMediaBucket().delete(profileAvatarKey(user.avatarMediaId)); } catch { /* ignore missing object */ }
    }
    await db.update(appUsers).set({ avatarMediaId: null, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, context.accountUserId));
    await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: "profile.avatar_remove", entityType: "team_member", entityId: context.accountUserId, summary: "Foto de perfil removida." });
    return Response.json({ removed: true });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível remover a foto." }, { status: 500 });
  }
}
