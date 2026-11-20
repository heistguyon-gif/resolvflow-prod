export type FeatureRollout = { mode: "off" | "all" } | { mode: "pilot"; emails: readonly string[] };

// Server-owned configuration. Change a feature's mode here after validation.
const featureRollouts: Readonly<Record<string, FeatureRollout>> = {
  profileVideoTemplate: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com", "wendelmarques167@gmail.com", "south.negociosdigitais@gmail.com"] },
  gmailCentral: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com"] },
  profileSetup: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com"] },
  dashboardDisplayEditor: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com"] },
  readabilityVisual: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com"] },
  accountsVisual: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com"] },
  queuePausedReview: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com"] },
  adminWalletHistory: { mode: "pilot", emails: ["lucasbgn.affiliate@gmail.com"] },
  campaignListVisual: { mode: "all" },
  dashboardTabPersistence: { mode: "all" },
};

const featureLabels: Record<string, string> = {
  profileVideoTemplate: "Template de perfil nos vídeos",
  gmailCentral: "Nova Central de Gmail", profileSetup: "Bio e foto de perfil",
  dashboardDisplayEditor: "Personalização dos indicadores", readabilityVisual: "Leitura e aparência",
  accountsVisual: "Nova lista de contas", queuePausedReview: "Revisão da fila pausada",
  adminWalletHistory: "Histórico de saldo no TOP", campaignListVisual: "Lista de campanhas",
  dashboardTabPersistence: "Lembrar a aba do painel",
};
export function featureInventory(email: unknown) {
  return Object.entries(featureRollouts).map(([id, rollout]) => ({ id, label: featureLabels[id] || id,
    scope: rollout.mode, enabled: isRolloutEnabled(rollout, email), configurable: id === "gmailCentral" }));
}

export function isRolloutEnabled(rollout: FeatureRollout | undefined, email: unknown): boolean {
  if (typeof email !== "string" || !email.trim()) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (rollout?.mode === "all") return true;
  if (rollout?.mode !== "pilot") return false;
  return rollout.emails.some(pilotEmail => pilotEmail.trim().toLowerCase() === normalizedEmail);
}

export function isFeatureEnabled(feature: string, email: unknown): boolean {
  const rollout = Object.prototype.hasOwnProperty.call(featureRollouts, feature) ? featureRollouts[feature] : undefined;
  return isRolloutEnabled(rollout, email);
}
