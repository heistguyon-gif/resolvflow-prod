export type AuthorizedConnectionApp = { key: string; label: string };
export type ConnectionApps = {
  status: "loading" | "ready" | "error";
  apps: AuthorizedConnectionApp[];
  botApps: AuthorizedConnectionApp[];
  error: string;
};

export function pendingConnectionApps(): ConnectionApps {
  return { status: "loading", apps: [], botApps: [], error: "" };
}

function readApps(value: unknown): AuthorizedConnectionApp[] {
  if (!Array.isArray(value)) throw new Error("Não foi possível validar os apps autorizados. Tente novamente.");
  const keys = new Set<string>();
  return value.map(item => {
    if (!item || typeof item.key !== "string" || !item.key.trim() || typeof item.label !== "string" || !item.label.trim() || keys.has(item.key)) {
      throw new Error("Não foi possível validar os apps autorizados. Tente novamente.");
    }
    keys.add(item.key);
    return { key: item.key, label: item.label };
  });
}

/** Names/keys are supplied by the server, including legitimate legacy MK apps. */
export function resolvedConnectionApps(data: { apps?: unknown; botApps?: unknown }): ConnectionApps {
  return { status: "ready", apps: readApps(data.apps), botApps: readApps(data.botApps ?? []), error: "" };
}

export function failedConnectionApps(error: unknown): ConnectionApps {
  return { status: "error", apps: [], botApps: [], error: error instanceof Error ? error.message : "Não foi possível carregar os apps autorizados." };
}

export function authorizedAppKey(apps: AuthorizedConnectionApp[], selected: string): string {
  return apps.some(app => app.key === selected) ? selected : apps[0]?.key || "";
}
