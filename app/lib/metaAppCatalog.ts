import { parseAdminInstant } from "./adminDateTime.ts";

type CatalogApp = { id: string; label: string; appId: string; status: string; createdAt: string; createdSequence: number };

export function filterAndSortMetaApps<T extends CatalogApp>(apps: T[], search: string, status: string): T[] {
  const needle = search.trim().toLocaleLowerCase("pt-BR");
  return apps.filter((app) => (status === "all" || app.status === status)
    && `${app.label} ${app.appId}`.toLocaleLowerCase("pt-BR").includes(needle))
    .sort((a, b) => (parseAdminInstant(b.createdAt)?.getTime() || 0) - (parseAdminInstant(a.createdAt)?.getTime() || 0)
      || b.createdSequence - a.createdSequence);
}
