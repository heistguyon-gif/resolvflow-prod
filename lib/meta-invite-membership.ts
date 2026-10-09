export function automaticResubmitAction(status: string | undefined) {
  if (!status) return "insert" as const;
  if (status === "pending" || status === "processing") return "keep" as const;
  return "reopen" as const;
}

// O vínculo legado ainda não tem account_user_id; só o e-mail da conta consultada
// pode identificá-lo, e apenas dentro do workspace ativo solicitado.
export const ACTIVE_INVITE_MEMBER_SQL = `SELECT members.id FROM workspace_members members
  JOIN app_users users ON users.id = ?
  WHERE members.workspace_owner_user_id = ? AND members.status = 'active'
    AND (members.account_user_id = users.id
      OR (members.account_user_id IS NULL AND lower(members.email) = lower(users.email)))
  LIMIT 1`;
