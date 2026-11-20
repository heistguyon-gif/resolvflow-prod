type Member = { workspaceOwnerUserId: string; accountUserId: string; email: string; role: string; active: boolean };

// A workspace can have many members. Its label must identify its owner, never
// whichever member happened to appear last in the user directory.
export function storyWorkspaceSources<T extends Member>(targets: T[], principal: string) {
  const groups = new Map<string, T[]>();
  for (const target of targets) groups.set(target.workspaceOwnerUserId, [...(groups.get(target.workspaceOwnerUserId) || []), target]);
  const sources = [...groups.entries()].map(([owner, members]) => members.find(member =>
    member.accountUserId === owner || `nexoflow:${member.email.trim().toLowerCase()}` === owner)
    || members.find(member => member.role === "owner" && member.active)
    || members.find(member => member.role === "owner") || members[0]);
  return sources.sort((a, b) => Number(b.workspaceOwnerUserId === principal) - Number(a.workspaceOwnerUserId === principal));
}
