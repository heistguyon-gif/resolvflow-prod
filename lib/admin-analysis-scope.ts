import { and, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import { appUsers, workspaceMembers } from "../db/schema";

export async function resolveAdminAnalysisScope(userId: string | null) {
  if (!userId) return { subject: null, ownerIds: null };
  if (userId.length > 200) return null;
  const db = getDb();
  const [user] = await db.select({ id: appUsers.id, displayName: appUsers.displayName, email: appUsers.email })
    .from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  if (!user) return null;
  const members = await db.select({ ownerUserId: workspaceMembers.workspaceOwnerUserId })
    .from(workspaceMembers).where(and(eq(workspaceMembers.status, "active"),
      or(eq(workspaceMembers.accountUserId, user.id), eq(workspaceMembers.email, user.email))));
  return { subject: user, ownerIds: [...new Set(members.map(member => member.ownerUserId))] };
}
