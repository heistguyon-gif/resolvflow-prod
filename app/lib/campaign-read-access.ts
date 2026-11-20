import { and, eq, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { workspaceMembers } from "../db/schema";
import { AuthenticationError, AuthorizationError } from "./auth";

/** Campaign polling uses the current membership rules without activating or creating memberships. */
export async function requireReadOnlyOwnerId(request: Request): Promise<string> {
  let accountUserId = request.headers.get("oai-authenticated-user-id");
  let email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!accountUserId || !email) {
    const hostname = new URL(request.url).hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new AuthenticationError("Entre na resolv. para continuar.");
    }
    accountUserId = "local-preview";
    email = "local@nexoflow.dev";
  }

  const members = await getDb().select({
    workspaceOwnerUserId: workspaceMembers.workspaceOwnerUserId,
    role: workspaceMembers.role,
  }).from(workspaceMembers).where(and(
    or(eq(workspaceMembers.accountUserId, accountUserId), eq(workspaceMembers.email, email)),
    ne(workspaceMembers.status, "revoked"),
  )).limit(20);
  const personalOwnerId = `nexoflow:${email}`;
  const usable = members.filter(({ workspaceOwnerUserId: id }) =>
    id === accountUserId || id === personalOwnerId || (
      id !== "nexoflow:operation_2" && id !== "nexoflow:operation_3"
      && !id.endsWith(":mk1") && !id.endsWith(":mk2")
    ));
  const member = usable.find(item => item.workspaceOwnerUserId === accountUserId)
    || usable.find(item => item.workspaceOwnerUserId === personalOwnerId)
    || usable.find(item => item.role === "owner")
    || usable[0];
  if (!member || !["owner", "editor", "viewer"].includes(member.role)) {
    throw new AuthorizationError("Este login ainda não possui acesso a um workspace.");
  }
  return member.workspaceOwnerUserId;
}
