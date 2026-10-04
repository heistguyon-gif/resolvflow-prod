import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { campaigns, workspaceMembers, workspaces } from "../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/audit";
import { copyCampaignAsTemplate } from "../../../../lib/campaign-library";

function ownerLabel(email: string | null, displayName: string | null, workspaceName: string | null) {
  return email || displayName || workspaceName || "Outra conta";
}

export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformAdmin(request);
    const db = getDb();
    const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
    const rows = await db.select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      mediaType: campaigns.mediaType,
      mediaCount: campaigns.mediaCount,
      ownerUserId: campaigns.ownerUserId,
      createdAt: campaigns.createdAt,
    }).from(campaigns).where(and(
      ne(campaigns.ownerUserId, ctx.workspaceOwnerUserId),
      sql`${campaigns.mediaCount} > 0`,
    )).orderBy(sql`case when ${campaigns.status} = 'template' then 0 else 1 end`, desc(campaigns.createdAt)).limit(300);
    const ownerIds = [...new Set(rows.map((row) => row.ownerUserId))];
    const [members, spaces] = await Promise.all([
      ownerIds.length ? db.select({
        workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId,
        email: workspaceMembers.email,
        displayName: workspaceMembers.displayName,
        role: workspaceMembers.role,
      }).from(workspaceMembers).where(inArray(workspaceMembers.workspaceOwnerUserId, ownerIds)) : Promise.resolve([]),
      ownerIds.length ? db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(inArray(workspaces.id, ownerIds)) : Promise.resolve([]),
    ]);
    const spaceName = new Map(spaces.map((space) => [space.id, space.name]));
    const items = rows.flatMap((row) => {
      const member = members.find((item) => item.workspaceOwnerUserId === row.ownerUserId && item.role === "owner")
        || members.find((item) => item.workspaceOwnerUserId === row.ownerUserId);
      const label = ownerLabel(member?.email || null, member?.displayName || null, spaceName.get(row.ownerUserId) || null);
      if (query && !`${row.name} ${label} ${row.status}`.toLowerCase().includes(query)) return [];
      return [{
        id: row.id,
        name: row.name,
        status: row.status,
        mediaType: row.mediaType,
        mediaCount: row.mediaCount,
        ownerLabel: label,
        createdAt: row.createdAt,
      }];
    });
    return Response.json({ items });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível listar os templates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin(request);
    const payload = await request.json() as { sourceCampaignId?: string };
    const sourceCampaignId = payload.sourceCampaignId?.trim() || "";
    if (!sourceCampaignId) return Response.json({ error: "Escolha a campanha que vai virar template." }, { status: 400 });
    const db = getDb();
    const [source] = await db.select({ ownerUserId: campaigns.ownerUserId }).from(campaigns).where(eq(campaigns.id, sourceCampaignId)).limit(1);
    const members = source ? await db.select({
      email: workspaceMembers.email,
      displayName: workspaceMembers.displayName,
      role: workspaceMembers.role,
    }).from(workspaceMembers).where(eq(workspaceMembers.workspaceOwnerUserId, source.ownerUserId)) : [];
    const member = members.find((item) => item.role === "owner") || members[0];
    const [space] = source ? await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, source.ownerUserId)).limit(1) : [];
    const copied = await copyCampaignAsTemplate(sourceCampaignId, ctx.workspaceOwnerUserId, ownerLabel(member?.email || null, member?.displayName || null, space?.name || null));
    if ("error" in copied) return Response.json({ error: copied.error }, { status: copied.status });
    await recordAuditEvent(request, {
      ownerUserId: ctx.workspaceOwnerUserId,
      action: "campaign.import_template",
      entityType: "campaign",
      entityId: copied.template.id,
      summary: `Template “${copied.template.name}” copiado para a conta admin.`,
      metadata: { sourceCampaignId, sourceOwnerUserId: copied.sourceOwnerUserId, media: copied.media },
    });
    return Response.json({ template: { id: copied.template.id, name: copied.template.name } }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível trazer o template." }, { status: 500 });
  }
}
