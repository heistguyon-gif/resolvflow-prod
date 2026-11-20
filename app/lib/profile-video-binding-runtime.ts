import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, metaConnections } from "../db/schema";
import { ProfileBindingError } from "./profile-video-binding";

export async function requireReadyProfileAccount(owner: string, accountId: string) {
  const [account] = await getDb().select({ id: accounts.id, lifecycle: accounts.lifecycle, instagramAccountId: accounts.instagramAccountId }).from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, owner), isNull(accounts.archivedAt))).limit(1);
  if (!account || account.lifecycle === "caida" || !account.instagramAccountId) throw new ProfileBindingError("O perfil não está disponível neste workspace. Confira a conexão antes de continuar.");
  const [connection] = await getDb().select({ id: metaConnections.id }).from(metaConnections)
    .where(and(eq(metaConnections.ownerUserId, owner), eq(metaConnections.instagramUserId, account.instagramAccountId), eq(metaConnections.status, "connected"))).limit(1);
  if (!connection) throw new ProfileBindingError("O perfil deixou de estar conectado. Reconecte antes de continuar.");
}
