import { AuthorizationError, isPlatformOwnerEmail, isWorkspaceActorActive, type WorkspaceContext } from "./auth";
import { getMediaBucket } from "./media-storage";
import { hasStoryGrant } from "./story-access";
import { MASTER_STORY_OWNER, readState, storyBindingKey, type Authority } from "./story-bridge";

export async function canUseStories(context: WorkspaceContext) {
  return isPlatformOwnerEmail(context.email) || hasStoryGrant(getMediaBucket(), context.workspaceOwnerUserId, context.accountUserId);
}
export async function requireStoriesAccess(context: WorkspaceContext) {
  if (!await canUseStories(context)) throw new AuthorizationError("Stories e destaques não foram habilitados para este usuário neste workspace.");
}
export async function canUseStoryCredential(bucket: R2Bucket, owner: string, accountUserId?: string) {
  // Existing owner packages remain valid. New packages are bound to their issuer.
  if (!accountUserId) return owner === "nexoflow:lucasbgn.affiliate@gmail.com";
  if (!await isWorkspaceActorActive(accountUserId, owner)) return false;
  return hasStoryGrant(bucket, owner, accountUserId);
}

export async function storyClaimPermission(bucket: R2Bucket, auth: Authority, browserId: unknown) {
  if (auth.owner !== MASTER_STORY_OWNER) return { allowed: true, bindingKey: "" };
  const browser = (await readState(bucket, MASTER_STORY_OWNER)).browsers.find(b => b.id === browserId);
  const delegation = browser?.delegation;
  const privilegedPackage = auth.platformOwner === true || !auth.accountUserId;
  return { allowed: !delegation || privilegedPackage && await canUseStoryCredential(bucket, delegation.owner, delegation.accountUserId), bindingKey: storyBindingKey(browser) };
}
