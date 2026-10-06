export const ADMIN_PAGE_SIZE = 20;

// Accounts without a canonical Instagram ID remain disconnected until reconciled.
// Keep this expression shared with the SQLite fixture test and the admin queries.
export const ADMIN_CONNECTED_PROFILE_EXISTS_SQL = `exists (
  select 1 from meta_connections mc
  where mc.owner_user_id = accounts.owner_user_id
    and mc.instagram_user_id = accounts.instagram_account_id
    and mc.status = 'connected'
)`;

export const ADMIN_CONNECTED_PROFILE_COUNT_SQL = `count(distinct case
  when accounts.archived_at is null and ${ADMIN_CONNECTED_PROFILE_EXISTS_SQL}
  then accounts.instagram_account_id end)`;

export const ADMIN_CONNECTED_PROFILE_GLOBAL_COUNT_SQL = `count(distinct case
  when accounts.archived_at is null and ${ADMIN_CONNECTED_PROFILE_EXISTS_SQL}
  then accounts.owner_user_id || char(31) || accounts.instagram_account_id end)`;

export function adminPage(value: string | null) {
  return Math.min(10000, Math.max(1, Number.parseInt(value || "1", 10) || 1));
}

export function adminPeriod(fromValue: string | null, toValue: string | null, now = new Date()) {
  const from = new Date(fromValue || new Date(now.getTime() - 30 * 86400000).toISOString());
  const to = new Date(toValue || now.toISOString());
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}
