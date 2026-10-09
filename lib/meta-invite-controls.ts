import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { metaConnectionModes, metaInvitePlatformSettings } from "../db/schema";

export type MetaConnectionMode = "standard" | "bot";

export async function isBotInviteEnabled() {
  const [row] = await getDb().select({ enabled: metaInvitePlatformSettings.enabled })
    .from(metaInvitePlatformSettings).where(eq(metaInvitePlatformSettings.key, "bot_invite")).limit(1);
  return row?.enabled === true;
}

export async function connectionModeFor(accountUserId: string, workspaceOwnerUserId: string): Promise<MetaConnectionMode> {
  const [row] = await getDb().select({ mode: metaConnectionModes.mode }).from(metaConnectionModes)
    .where(and(eq(metaConnectionModes.accountUserId, accountUserId),
      eq(metaConnectionModes.workspaceOwnerUserId, workspaceOwnerUserId))).limit(1);
  return row?.mode === "bot" ? "bot" : "standard";
}
