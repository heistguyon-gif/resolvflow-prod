import type { WorkspaceContext } from "./auth";
import { isFeatureEnabled } from "./feature-rollouts";
import { getMediaBucket } from "./media-storage";
import { readGmailPilotAccess } from "./gmail-pilot-access";
export async function canUseGmailCentral(context: Pick<WorkspaceContext, "email" | "accountUserId" | "workspaceOwnerUserId">) {
  if (isFeatureEnabled("gmailCentral", context.email)) return true;
  return (await readGmailPilotAccess(getMediaBucket(), context.workspaceOwnerUserId, context.accountUserId)).enabled;
}
