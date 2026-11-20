export const DISPLAY_METRICS = ["connected", "published", "queue", "views", "reach", "followers", "alerts", "success"] as const;
export type DisplayMetric = typeof DISPLAY_METRICS[number];
export type DashboardDisplay = Partial<Record<DisplayMetric, { value?: number; note?: string }>>;

export const DISPLAY_SECTIONS = {
  ranking: { label: "Ranking", fields: { name: ["Nome", "text"], posts: ["Publicações", "number"], accountCount: ["Contas", "number"] } },
  reportTotals: { label: "Relatórios · totais", fields: { views30d: ["Visualizações", "number"], reach30d: ["Alcance", "number"], followers: ["Seguidores", "number"], accounts: ["Contas integradas", "number"], published: ["Publicadas", "number"], failed: ["Falhas", "number"], successRate: ["Taxa de sucesso (%)", "percent"] } },
  reportAccounts: { label: "Relatórios · contas", fields: { username: ["Usuário", "text"], model: ["Modelo", "text"], player: ["Player", "text"], groupName: ["Grupo", "text"], niche: ["Nicho", "text"], views30d: ["Visualizações", "number"], reach30d: ["Alcance", "number"], followersCount: ["Seguidores", "number"], published: ["Publicadas", "number"], failed: ["Falhas", "number"], successRate: ["Taxa de sucesso (%)", "percent"] } },
  reportMedia: { label: "Relatórios · publicações", fields: { campaignName: ["Campanha", "text"], username: ["Usuário", "text"], mediaType: ["Tipo de mídia", "text"], views: ["Visualizações", "number"], reach: ["Alcance", "number"], publishedAt: ["Data de publicação", "date"] } },
} as const;
export type DisplaySection = keyof typeof DISPLAY_SECTIONS;
export type DashboardDetails = Partial<Record<DisplaySection, Record<string, Record<string, string | number>>>>;
const hasControlCharacters = (value: string) => Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function parseDashboardDetails(input: unknown): DashboardDetails {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Dados de edição inválidos.");
  const result: DashboardDetails = {};
  let rows = 0;
  for (const [section, entries] of Object.entries(input)) {
    if (!Object.hasOwn(DISPLAY_SECTIONS, section) || !entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Seção inválida.");
    const fields = DISPLAY_SECTIONS[section as DisplaySection].fields as Record<string, readonly [string, string]>;
    const validated: Record<string, Record<string, string | number>> = {};
    for (const [id, values] of Object.entries(entries)) {
      if (++rows > 2000 || !id || id.length > 200 || ["__proto__", "constructor", "prototype"].includes(id) || (section === "reportTotals" && id !== "total") || !values || typeof values !== "object" || Array.isArray(values)) throw new Error("Registro inválido.");
      const row: Record<string, string | number> = {};
      for (const [field, value] of Object.entries(values)) {
        if (!Object.hasOwn(fields, field)) throw new Error("Campo inválido.");
        const [label, kind] = fields[field];
        if (kind === "number" || kind === "percent") {
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (kind === "percent" ? value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001 : !Number.isSafeInteger(value) || value > 1_000_000_000_000)) throw new Error(`Confira o valor de ${label}.`);
        } else if (typeof value !== "string" || value.length > 160 || hasControlCharacters(value) || (kind === "date" && !Number.isFinite(Date.parse(value)))) throw new Error(`Confira o campo ${label}.`);
        row[field] = value as string | number;
      }
      if (Object.keys(row).length) validated[id] = row;
    }
    if (Object.keys(validated).length) result[section as DisplaySection] = validated;
  }
  return result;
}

export function displayRows<T extends { id: string }>(rows: T[], overrides: DashboardDetails[DisplaySection]): T[] {
  if (!overrides || !Object.keys(overrides).length) return rows;
  return rows.map(row => ({ ...row, ...(overrides && Object.hasOwn(overrides, row.id) ? overrides[row.id] : {}) }));
}

export function displayReport<T extends { totals: object; perAccount: { id: string }[]; perMedia: { id: string }[] }>(report: T | null, details: DashboardDetails): T | null {
  if (!Object.keys(details).length) return report;
  return report ? { ...report, totals: { ...report.totals, ...details.reportTotals?.total }, perAccount: displayRows(report.perAccount, details.reportAccounts), perMedia: displayRows(report.perMedia, details.reportMedia) } : null;
}

export function parseDashboardDisplay(input: unknown): DashboardDisplay {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Informe os indicadores.");
  const result: DashboardDisplay = {};
  for (const [key, item] of Object.entries(input)) {
    if (!DISPLAY_METRICS.includes(key as DisplayMetric) || !item || typeof item !== "object" || Array.isArray(item)) throw new Error("Indicador inválido.");
    const value = item as Record<string, unknown>;
    if (Object.keys(value).some(k => k !== "value" && k !== "note")) throw new Error("Campo inválido.");
    if (value.value !== undefined && (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || (key === "success" ? value.value > 100 || Math.abs(value.value * 100 - Math.round(value.value * 100)) > 0.000001 : !Number.isSafeInteger(value.value) || value.value > 1_000_000_000_000))) throw new Error(key === "success" ? "A taxa deve estar entre 0 e 100, com até duas casas decimais." : "Use números inteiros de 0 a 1 trilhão.");
    if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 160 || hasControlCharacters(value.note))) throw new Error("A legenda deve ter até 160 caracteres.");
    if (value.value !== undefined || value.note !== undefined) result[key as DisplayMetric] = { ...(value.value !== undefined ? { value: value.value as number } : {}), ...(value.note !== undefined ? { note: value.note as string } : {}) };
  }
  return result;
}

export function dashboardDisplayView(url: URL) {
  const scope = url.searchParams.get("scope") || "workspace";
  const period = url.searchParams.get("period") || "30d";
  const day = url.searchParams.get("day") || "";
  if (!["workspace", "platform"].includes(scope) || !["today", "yesterday", "7d", "30d", "custom", "all"].includes(period)) throw new Error("Visão inválida.");
  if (period === "custom" && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) throw new Error("Dia inválido.");
  return `${scope}/${period}${period === "custom" ? `/${day}` : ""}`;
}

export const dashboardDisplayKey = (account: string, workspace: string, view: string) => `dashboard-display/${encodeURIComponent(account)}/${encodeURIComponent(workspace)}/${view}.json`;
