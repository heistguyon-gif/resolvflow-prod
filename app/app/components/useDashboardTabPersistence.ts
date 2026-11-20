"use client";
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createDashboardTabController, type DashboardTab, type TabEntry, type TabPermissions } from "../lib/dashboardTabPersistence";

export function useDashboardTabPersistence({ enabled, email, workspaceId, tab, navigationVersion, entry, permissions, onRestore, onRestoreRead }: {
  enabled: boolean; email: unknown; workspaceId: unknown; tab: string;
  navigationVersion: RefObject<number>; entry: RefObject<TabEntry | null>; permissions: TabPermissions;
  onRestore: (tab: DashboardTab) => void; onRestoreRead: (tab: DashboardTab) => void;
}) {
  const [controller] = useState(() => createDashboardTabController(() => window.sessionStorage));
  const ready = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => false);
  const callbacks = useRef({ onRestore, onRestoreRead });
  useLayoutEffect(() => { callbacks.current = { onRestore, onRestoreRead }; }, [onRestore, onRestoreRead]);
  useLayoutEffect(() => {
    const decision = controller.update({ enabled, email, workspaceId, tab, navigationVersion: navigationVersion.current, entry: entry.current, permissions: { admin: permissions.admin, vault: permissions.vault, sms: permissions.sms } });
    if (decision.restore) {
      callbacks.current.onRestore(decision.restore);
      callbacks.current.onRestoreRead(decision.restore);
    }
  }, [controller, enabled, email, workspaceId, tab, navigationVersion, entry, permissions.admin, permissions.vault, permissions.sms]);
  return ready;
}
