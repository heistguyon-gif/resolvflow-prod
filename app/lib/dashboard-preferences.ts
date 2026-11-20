export const DASHBOARD_WIDGET_IDS = ["metrics", "strip", "health", "focus", "accounts"] as const;
export const DASHBOARD_METRIC_IDS = ["connected", "published", "queue", "views", "reach", "followers", "alerts", "success"] as const;

export type DashboardPreferences = {
  widgets: string[];
  hidden: string[];
  cards: string[];
  strip: string[];
};

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  widgets: ["metrics", "strip", "health", "accounts"],
  hidden: [],
  cards: ["connected", "published", "queue", "views"],
  strip: ["reach", "followers", "alerts", "success"],
};

function uniqueAllowed(value: unknown, allowed: readonly string[]) {
  if (!Array.isArray(value)) return [];
  const allowedSet = new Set(allowed);
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowedSet.has(item)))];
}

export function normalizeDashboardPreferences(value: unknown): DashboardPreferences {
  const input = value && typeof value === "object" ? value as Partial<DashboardPreferences> : {};
  const widgets = uniqueAllowed(input.widgets, DASHBOARD_WIDGET_IDS);
  const hidden = uniqueAllowed(input.hidden, DASHBOARD_WIDGET_IDS);
  const cards = uniqueAllowed(input.cards, DASHBOARD_METRIC_IDS);
  const strip = uniqueAllowed(input.strip, DASHBOARD_METRIC_IDS).filter((id) => !cards.includes(id));

  for (const id of DASHBOARD_METRIC_IDS) {
    if (!cards.includes(id) && !strip.includes(id)) strip.push(id);
  }

  return {
    widgets: widgets.length ? widgets : [...DEFAULT_DASHBOARD_PREFERENCES.widgets],
    hidden,
    cards: cards.length ? cards : [...DEFAULT_DASHBOARD_PREFERENCES.cards],
    strip,
  };
}
