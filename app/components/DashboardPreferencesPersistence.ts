"use client";

type Preferences = { widgets: string[]; hidden: string[]; cards: string[]; strip: string[] };

const widgetLabels = new Map([
  ["Indicadores principais", "metrics"],
  ["Faixa de números", "strip"],
  ["Saúde das contas", "health"],
  ["Ranking de hoje", "focus"],
  ["Perfis monitorados", "accounts"],
]);

const defaults: Preferences = {
  widgets: ["metrics", "strip", "health", "accounts"],
  hidden: [],
  cards: ["connected", "published", "queue", "views"],
  strip: ["reach", "followers", "alerts", "success"],
};

function waitFor<T extends Element>(selector: string, timeoutMs = 2_000): Promise<T | null> {
  const current = document.querySelector<T>(selector);
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
    const observer = new MutationObserver(() => {
      const found = document.querySelector<T>(selector);
      if (!found) return;
      window.clearTimeout(timeout); observer.disconnect(); resolve(found);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function widgetId(row: Element) {
  const label = row.querySelector(":scope > span:not(.dash-widget-move)")?.textContent?.trim() || "";
  return widgetLabels.get(label) || "";
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  if (select.value === value || ![...select.options].some((option) => option.value === value)) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function readModal(modal: Element): Preferences {
  const rows = [...modal.querySelectorAll(".dash-widget-list > li")];
  const widgets = rows.map(widgetId).filter(Boolean);
  const hidden = rows.filter((row) => row.classList.contains("is-hidden")).map(widgetId).filter(Boolean);
  const sections = [...modal.querySelectorAll(".dash-customize-section")];
  const cards = [...(sections.find((section) => section.querySelector("strong")?.textContent?.trim() === "Indicadores principais")?.querySelectorAll("select") || [])].map((select) => (select as HTMLSelectElement).value);
  const strip = [...(sections.find((section) => section.querySelector("strong")?.textContent?.trim() === "Faixa de números")?.querySelectorAll("select") || [])].map((select) => (select as HTMLSelectElement).value);
  return { widgets: widgets.length ? widgets : defaults.widgets, hidden, cards: cards.length ? cards : defaults.cards, strip: strip.length ? strip : defaults.strip };
}

async function applyPreferences(preferences: Preferences) {
  const trigger = await waitFor<HTMLButtonElement>(".dash-customize-button", 8_000);
  if (!trigger) return;
  document.documentElement.classList.add("dashboard-preferences-hydrating");
  trigger.click();
  const modal = await waitFor<HTMLElement>(".dash-customize-modal");
  if (!modal) { document.documentElement.classList.remove("dashboard-preferences-hydrating"); return; }
  const desiredWidgets = [...new Set([...preferences.widgets, ...defaults.widgets.filter((id) => !preferences.widgets.includes(id))])];
  for (let targetIndex = 0; targetIndex < desiredWidgets.length; targetIndex += 1) {
    for (let guard = 0; guard < 8; guard += 1) {
      const rows = [...modal.querySelectorAll(".dash-widget-list > li")];
      const currentIndex = rows.findIndex((row) => widgetId(row) === desiredWidgets[targetIndex]);
      if (currentIndex < 0 || currentIndex === targetIndex) break;
      const buttons = rows[currentIndex].querySelectorAll<HTMLButtonElement>(".dash-widget-move button");
      (currentIndex > targetIndex ? buttons[0] : buttons[1])?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  for (const row of modal.querySelectorAll(".dash-widget-list > li")) {
    const id = widgetId(row);
    const shouldHide = preferences.hidden.includes(id);
    if (row.classList.contains("is-hidden") !== shouldHide) row.querySelector<HTMLButtonElement>(".dash-widget-toggle")?.click();
  }
  const sections = [...modal.querySelectorAll(".dash-customize-section")];
  const cardSelects = sections.find((section) => section.querySelector("strong")?.textContent?.trim() === "Indicadores principais")?.querySelectorAll<HTMLSelectElement>("select") || [];
  const stripSelects = sections.find((section) => section.querySelector("strong")?.textContent?.trim() === "Faixa de números")?.querySelectorAll<HTMLSelectElement>("select") || [];
  cardSelects.forEach((select, index) => setSelectValue(select, preferences.cards[index] || defaults.cards[index]));
  stripSelects.forEach((select, index) => setSelectValue(select, preferences.strip[index] || defaults.strip[index]));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  modal.querySelector<HTMLButtonElement>(".modal-actions .primary-button")?.click();
  document.documentElement.classList.remove("dashboard-preferences-hydrating");
}

export function installDashboardPreferencesPersistence() {
  if (typeof document === "undefined") return;
  const scope = globalThis as typeof globalThis & { __resolvflowDashboardPreferences?: boolean };
  if (scope.__resolvflowDashboardPreferences) return;
  scope.__resolvflowDashboardPreferences = true;
  let hydrating = true;
  let saveTimer = 0;
  void fetch("/api/dashboard-preferences", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => response.ok ? response.json() : null)
    .then(async (payload) => {
      if (!payload) return;
      let preferences = payload.preferences as Preferences;
      if (!payload.exists) {
        try {
          const legacy = JSON.parse(localStorage.getItem("resolvflow.dashboard.v2") || "null");
          if (legacy && typeof legacy === "object") preferences = legacy;
        } catch { /* configuração antiga inválida: usa o padrão do servidor */ }
        await fetch("/api/dashboard-preferences", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences }) });
      }
      await applyPreferences(preferences);
    })
    .finally(() => { hydrating = false; });
  const scheduleSave = (preferences: Preferences) => {
    if (hydrating) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void fetch("/api/dashboard-preferences", { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences }) });
    }, 120);
  };
  const saveAfterReactUpdate = (modal: Element) => {
    window.setTimeout(() => {
      if (modal.isConnected) scheduleSave(readModal(modal));
    }, 0);
  };
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const modal = target?.closest?.(".dash-customize-modal");
    if (!modal) return;
    if (target.closest(".modal-actions .primary-button")) scheduleSave(readModal(modal));
    else saveAfterReactUpdate(modal);
  }, true);
  document.addEventListener("change", (event) => {
    const modal = (event.target as Element | null)?.closest?.(".dash-customize-modal");
    if (modal) saveAfterReactUpdate(modal);
  }, true);
}
