export const dashboardTabs = ["dashboard", "accounts", "vault", "campaigns", "queue", "alerts", "reports", "integrations", "team", "otp", "sms"] as const;
export type DashboardTab = typeof dashboardTabs[number];
export type TabPermissions = { admin: boolean | null; vault: boolean | null; sms: boolean | null };
export type TabEntry = { pathname: string; tab: string };
export type TabSession = {
  enabled: boolean; email: unknown; workspaceId: unknown; tab: string; navigationVersion: number;
  entry: TabEntry | null; permissions: TabPermissions;
};
type TabStorage = Pick<Storage, "getItem" | "setItem">;
export function isDashboardTab(value: unknown): value is DashboardTab {
  return typeof value === "string" && dashboardTabs.some(tab => tab === value);
}
export function dashboardTabStorageKey(email: unknown, workspaceId: unknown): string | null {
  if (typeof email !== "string" || !email.trim() || typeof workspaceId !== "string" || !workspaceId.trim()) return null;
  return `resolvflow:dashboard-tab:v1:${encodeURIComponent(email.trim().toLowerCase())}:${encodeURIComponent(workspaceId.trim())}`;
}
function permission(tab: DashboardTab, permissions: TabPermissions): boolean | null {
  if (tab === "team" || tab === "integrations") return permissions.admin;
  if (tab === "vault") return permissions.vault;
  if (tab === "sms") return permissions.sms;
  return true;
}

// Called only after commit. Reading always precedes writing, including context changes.
export function createDashboardTabController(storage: () => TabStorage) {
  let binding: { key: string; candidate: DashboardTab; navigationVersion: number; active: boolean; written: string | null; requested: DashboardTab | null } | null = null;
  let hasBound = false;
  let ready = false;
  const listeners = new Set<() => void>();
  const setReady = (value: boolean) => {
    if (ready === value) return;
    ready = value;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => ready,
    update(session: TabSession): { restore?: DashboardTab } {
      const key = dashboardTabStorageKey(session.email, session.workspaceId);
      if (!session.enabled) { setReady(true); return {}; }
      if (!key || !session.entry) { setReady(false); return {}; }
      if (binding?.key !== key) {
        const navigatedBeforeBootstrap = !hasBound && session.navigationVersion > 0;
        const pathname = session.entry.pathname.replace(/\/+$/, "") || "/";
        let stored: unknown;
        try { stored = storage().getItem(key); } catch { /* storage is optional */ }
        const candidate = navigatedBeforeBootstrap && isDashboardTab(session.tab) ? session.tab
          : !hasBound && pathname !== "/" && pathname !== "/dashboard" ? (isDashboardTab(session.entry.tab) ? session.entry.tab : "dashboard")
          : isDashboardTab(stored) ? stored : "dashboard";
        binding = { key, candidate, navigationVersion: session.navigationVersion, active: false, written: null, requested: null };
        hasBound = true;
      } else if (binding.navigationVersion !== session.navigationVersion || binding.active) {
        binding.navigationVersion = session.navigationVersion;
        binding.candidate = isDashboardTab(session.tab) ? session.tab : "dashboard";
        binding.requested = null;
      }
      const restoreOnce = (tab: DashboardTab) => {
        setReady(false);
        if (binding!.requested === tab) return {};
        binding!.requested = tab;
        return { restore: tab };
      };
      const allowed = permission(binding.candidate, session.permissions);
      if (allowed === null) {
        binding.active = false;
        setReady(false);
        // Do not expose a restricted explicit path while its permission is loading.
        return permission(isDashboardTab(session.tab) ? session.tab : "dashboard", session.permissions) !== true && session.tab !== "dashboard" ? restoreOnce("dashboard") : {};
      }
      if (!allowed) binding.candidate = "dashboard";
      if (session.tab !== binding.candidate) {
        binding.active = false;
        return restoreOnce(binding.candidate);
      }
      binding.active = true;
      binding.requested = null;
      if (binding.written !== binding.candidate) {
        try { storage().setItem(binding.key, binding.candidate); } catch { /* privacy mode/quota must not break navigation */ }
        binding.written = binding.candidate;
      }
      setReady(true);
      return {};
    },
  };
}
