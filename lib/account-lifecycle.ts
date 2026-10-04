import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { accounts } from "../db/schema";

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
    archivedAt: null,
    source: input.source,
    followersCount: input.followersCount ?? 0,
    followsCount: input.followsCount ?? 0,
    mediaCount: input.mediaCount ?? 0,
    lastError: null,
    updatedAt: now,
  };
  const [sameInstagramAccount] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.ownerUserId, input.ownerUserId), eq(accounts.instagramAccountId, input.instagramAccountId))).limit(1);
  if (sameInstagramAccount) {
    await db.update(accounts).set(values).where(and(eq(accounts.ownerUserId, input.ownerUserId), eq(accounts.id, sameInstagramAccount.id)));
    return sameInstagramAccount.id;
  }
  const id = crypto.randomUUID();
  const [connectedAccount] = await db.insert(accounts).values({ id, ownerUserId: input.ownerUserId, ...values }).onConflictDoUpdate({
    target: [accounts.ownerUserId, accounts.username],
    set: values,
  }).returning({ id: accounts.id });
  return connectedAccount?.id || id;
}
