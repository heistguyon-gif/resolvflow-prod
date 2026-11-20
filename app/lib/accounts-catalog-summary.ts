import { sql } from "drizzle-orm";

// Drizzle's single-table selection rewrites interpolated Column objects without
// their table name, even inside nested raw SQL. Identifiers retain qualification.
// This expression is used only with the unaliased outer accounts table.
export function withoutMetaConnectionCount() {
  return sql<number>`coalesce(sum(case when ${sql.identifier("accounts")}.${sql.identifier("archived_at")} is not null or not exists(
    select 1 from meta_connections mc
    where mc.owner_user_id=${sql.identifier("accounts")}.${sql.identifier("owner_user_id")}
      and mc.instagram_user_id=${sql.identifier("accounts")}.${sql.identifier("instagram_account_id")}
      and mc.status <> 'archived'
  ) then 1 else 0 end), 0)`;
}
