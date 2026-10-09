type DirectoryUser = { id: string; email: string };
type DirectoryMember = { accountUserId: string | null; email: string };

export function belongsToDirectoryUser(member: DirectoryMember, user: DirectoryUser) {
  return member.accountUserId === user.id ||
    (member.accountUserId === null && member.email.toLowerCase() === user.email.toLowerCase());
}
