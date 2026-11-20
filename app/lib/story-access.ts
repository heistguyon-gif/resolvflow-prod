// Workspace-scoped grants. R2 CAS keeps concurrent admin changes independent of
// publication state; revocation does not delete templates, browsers or receipts.
export type StoryGrant = { accountUserId: string; enabled: boolean; updatedAt: string };
export type StoryAccessPolicy = { version: 1; grants: StoryGrant[] };
export const storyAccessKey = (owner: string) => `story-bridge/access/${encodeURIComponent(owner)}.json`;
export async function readStoryAccess(bucket: R2Bucket, owner: string): Promise<StoryAccessPolicy> {
  const object = await bucket.get(storyAccessKey(owner));
  return object ? await object.json<StoryAccessPolicy>() : { version: 1, grants: [] };
}
export async function hasStoryGrant(bucket: R2Bucket, owner: string, accountUserId: string) {
  return (await readStoryAccess(bucket, owner)).grants.some(grant => grant.accountUserId === accountUserId && grant.enabled === true);
}
export async function setStoryGrant(bucket: R2Bucket, owner: string, accountUserId: string, enabled: boolean) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const object = await bucket.get(storyAccessKey(owner));
    const state: StoryAccessPolicy = object ? await object.json<StoryAccessPolicy>() : { version: 1, grants: [] };
    const grant = { accountUserId, enabled, updatedAt: new Date().toISOString() };
    state.grants = [...state.grants.filter(item => item.accountUserId !== accountUserId), grant];
    if (state.grants.length > 2000) throw new Error("Limite de permissões deste workspace atingido.");
    const written = await bucket.put(storyAccessKey(owner), JSON.stringify(state), {
      onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    });
    if (written) return grant;
  }
  throw new Error("A configuração está ocupada. Tente novamente.");
}
