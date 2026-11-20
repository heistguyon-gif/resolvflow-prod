import { and, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, metaConnections } from "../db/schema";

export class AccountConnectionConflict extends Error {}

type ConnectedAccountInput = {
  ownerUserId: string;
  instagramAccountId: string;
  username: string;
  displayName: string;
  source: string;
  followersCount?: number;
  followsCount?: number;
  mediaCount?: number;
};

export async function restoreConnectedAccount(input: ConnectedAccountInput) {
  const db = getDb();
  const now = new Date().toISOString();
  const values = {
    instagramAccountId: input.instagramAccountId,
    username: input.username,
    displayName: input.displayName,
    healthStatus: "Saudável",
    connectionStatus: "Conectada",
    source: input.source,
    ...(input.followersCount !== undefined ? { followersCount: input.followersCount } : {}),
    ...(input.followsCount !== undefined ? { followsCount: input.followsCount } : {}),
    ...(input.mediaCount !== undefined ? { mediaCount: input.mediaCount } : {}),
    lastError: null,
    updatedAt: now,
  };
  const [sameInstagramAccount] = await db.select({ id: accounts.id, archivedAt: accounts.archivedAt }).from(accounts).where(and(eq(accounts.ownerUserId, input.ownerUserId), eq(accounts.instagramAccountId, input.instagramAccountId))).limit(1);
  if (sameInstagramAccount) {
    if (sameInstagramAccount.archivedAt) throw new AccountConnectionConflict("Conta arquivada. Restaure-a em Contas > Arquivadas antes de reconectar. O histórico será preservado.");
    const [updated] = await db.update(accounts).set({ ...values, source: input.source }).where(and(eq(accounts.ownerUserId, input.ownerUserId), eq(accounts.id, sameInstagramAccount.id), isNull(accounts.archivedAt))).returning({ id: accounts.id });
    if (!updated) throw new AccountConnectionConflict("A conta foi arquivada durante a conexão. Restaure-a explicitamente antes de reconectar.");
    return sameInstagramAccount.id;
  }
  const id = crypto.randomUUID();
  const [connectedAccount] = await db.insert(accounts).values({ id, ownerUserId: input.ownerUserId, ...values }).onConflictDoUpdate({
    target: [accounts.ownerUserId, accounts.username],
    set: { ...values, source: input.source },
    setWhere: and(isNull(accounts.archivedAt), sql`(${accounts.instagramAccountId} is null or ${accounts.instagramAccountId} = ${input.instagramAccountId})`),
  }).returning({ id: accounts.id });
  if (!connectedAccount) throw new AccountConnectionConflict("Conta arquivada ou identidade divergente. Confira o cadastro e restaure explicitamente antes de reconectar.");
  return connectedAccount.id;
}

/** Gate both initial INSERT and conflict UPDATE, serialized with archiveAccounts. */
export async function saveActiveMetaConnection(input: typeof metaConnections.$inferInsert) {
  const db = getDb();
  const active = sql`exists(select 1 from accounts a where a.owner_user_id=${input.ownerUserId} and a.instagram_account_id=${input.instagramUserId} and a.archived_at is null)`;
  const columns = getTableColumns(metaConnections);
  const values = Object.entries(columns).map(([key, column]) => {
    const value = input[key as keyof typeof input];
    return value !== undefined ? sql`${value}` : column.default !== undefined ? sql`${column.default}` : sql`null`;
  });
  const { id, ...updates } = input;
  void id;
  const [saved] = await db.insert(metaConnections).select(sql`select ${sql.join(values, sql`, `)} where ${active}`)
    .onConflictDoUpdate({ target: [metaConnections.ownerUserId, metaConnections.instagramUserId], set: { ...updates, updatedAt: new Date().toISOString() }, setWhere: active })
    .returning({ id: metaConnections.id });
  if (!saved) throw new AccountConnectionConflict("A conta foi arquivada durante a conexão. Restaure-a explicitamente antes de reconectar.");
  return saved.id;
}
