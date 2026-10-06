export function chooseAssignedMetaApp<T extends { id: string; status: string }>(
  apps: T[], requestedKey?: string | null,
): T | null {
  if (requestedKey) {
    if (!requestedKey.startsWith("workspace:")) return null;
    return apps.find((app) => `workspace:${app.id}` === requestedKey) || null;
  }
  return apps.find((app) => app.status === "active") || null;
}

export function canUseLegacyMetaApp(hasManagedPolicy: boolean, hasDedicatedWorkspaceApp: boolean) {
  return !hasManagedPolicy && !hasDedicatedWorkspaceApp;
}
