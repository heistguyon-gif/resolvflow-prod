import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { appUsers, workspaceMembers, workspaces } from "../db/schema";
import { addTemplate, fail, readState, publicTemplate, templateFields, uuid } from "./story-bridge";
import { readStoryAccess } from "./story-access";

export async function storyAdminTargets() {
  return getDb().selectDistinct({ accountUserId: appUsers.id, email: appUsers.email, name: appUsers.displayName,
    workspaceOwnerUserId: workspaces.id, workspaceName: workspaces.name, role: workspaceMembers.role,
    active: sql<boolean>`${appUsers.status}='active' and ${workspaceMembers.status}='active' and ${workspaces.status}='active'` })
    .from(workspaceMembers).innerJoin(appUsers, or(eq(workspaceMembers.accountUserId, appUsers.id),
      and(isNull(workspaceMembers.accountUserId), sql`lower(${workspaceMembers.email})=lower(${appUsers.email})`)))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceOwnerUserId))
    .orderBy(asc(appUsers.displayName), asc(workspaces.name));
}
export async function storyAdminOptions(bucket: R2Bucket) {
  const targets = await storyAdminTargets();
  const owners = [...new Set(targets.map(item => item.workspaceOwnerUserId))];
  const policies = new Map<string, Awaited<ReturnType<typeof readStoryAccess>>>();
  // Bounded concurrency for large user directories.
  for (let offset = 0; offset < owners.length; offset += 8) {
    await Promise.all(owners.slice(offset, offset + 8).map(async owner => policies.set(owner, await readStoryAccess(bucket, owner))));
  }
  return targets.map(target => ({ ...target, active: Boolean(target.active),
    enabled: policies.get(target.workspaceOwnerUserId)?.grants.some(grant => grant.accountUserId === target.accountUserId && grant.enabled) ?? false }));
}
export async function validateStoryAdminTarget(accountUserId: string, owner: string, active = true) {
  const target = (await storyAdminTargets()).find(item => item.accountUserId === accountUserId && item.workspaceOwnerUserId === owner);
  if (!target || (active && !target.active)) fail("target_unavailable", "Usuário ou workspace indisponível.", 409);
  return target;
}
export async function storyLibrary(bucket: R2Bucket, owner: string) {
  if (!(await storyAdminTargets()).some(item => item.workspaceOwnerUserId === owner)) fail("not_found", "Workspace não encontrado.", 404);
  return (await readState(bucket, owner)).templates.map(template => ({ ...publicTemplate(template),
    imageUrl: `/api/admin/stories/image?workspace=${encodeURIComponent(owner)}&template=${template.id}` }));
}
export async function copyStoryTemplate(bucket: R2Bucket, sourceOwner: string, templateId: string, targetOwner: string, requestId: string) {
  uuid(templateId); uuid(requestId);
  if (sourceOwner === targetOwner) fail("same_workspace", "Escolha outro workspace para receber o template.");
  const source = (await readState(bucket, sourceOwner)).templates.find(template => template.id === templateId);
  if (!source) fail("not_found", "Template não encontrado.", 404);
  // The idempotency receipt is part of the destination's CAS state. Retrying an
  // uncertain copy never allocates another template or shares a private image key.
  const image = await bucket.get(source.imageKey);
  if (!image) fail("not_found", "Imagem do template não encontrada.", 404);
  const bytes = new Uint8Array(await new Response(image.body).arrayBuffer());
  return addTemplate(bucket, targetOwner, templateFields(source), bytes, { id: requestId, sourceOwner, sourceTemplateId: templateId });
}
