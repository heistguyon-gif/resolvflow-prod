type OauthState = {
  initiatedByUserId?: string | null;
  ownerUserId: string;
  metaAppKey: string;
};

export function canUseUnattributedOauthState(metaAppKey: string, workspaceManaged: boolean) {
  return !metaAppKey.startsWith("workspace:") && !workspaceManaged;
}

export async function authorizeMetaOauthState<T extends { configured: boolean }>(
  state: OauthState,
  dependencies: {
    isWorkspaceManaged: (workspaceOwnerUserId: string) => Promise<boolean>;
    resolveForActor: (accountUserId: string, workspaceOwnerUserId: string, metaAppKey: string) => Promise<T | null>;
    resolveStored: (metaAppKey: string) => Promise<T | null>;
  },
): Promise<T | null> {
  if (state.initiatedByUserId) {
    const allowed = await dependencies.resolveForActor(
      state.initiatedByUserId, state.ownerUserId, state.metaAppKey,
    );
    if (!allowed?.configured) return null;
  } else {
    const managed = await dependencies.isWorkspaceManaged(state.ownerUserId);
    if (!canUseUnattributedOauthState(state.metaAppKey, managed)) return null;
  }
  const app = await dependencies.resolveStored(state.metaAppKey);
  return app?.configured ? app : null;
}
