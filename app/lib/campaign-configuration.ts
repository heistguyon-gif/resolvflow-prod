/** Persisted preparation only. Saving this never creates or resumes queue entries. */
export const CAMPAIGN_CONFIGURATION_FIELDS = ["distributionMode", "mediaOrder", "intervalMinutes", "repeatCount", "respectDailyLimit", "timezone", "stopAt"] as const;
export type CampaignConfiguration = {
  distributionMode: "all_accounts" | "distribute"; mediaOrder: "sequential" | "random";
  intervalMinutes: number; repeatCount: number; respectDailyLimit: boolean;
  timezone: string; stopAt: string | null;
};
export class CampaignConfigurationError extends Error {}

export function parseCampaignConfiguration(payload: Record<string, unknown>): Partial<CampaignConfiguration> {
  const result: Partial<CampaignConfiguration> = {};
  for (const key of CAMPAIGN_CONFIGURATION_FIELDS) {
    const value = payload[key];
    if (value === undefined) continue;
    if (key === "distributionMode") {
      if (value !== "all_accounts" && value !== "distribute") throw new CampaignConfigurationError("Distribuição inválida.");
      result.distributionMode = value;
    } else if (key === "mediaOrder") {
      if (value !== "sequential" && value !== "random") throw new CampaignConfigurationError("Ordem de mídia inválida.");
      result.mediaOrder = value;
    } else if (key === "intervalMinutes" || key === "repeatCount") {
      const min = key === "intervalMinutes" ? 5 : 1; const max = key === "intervalMinutes" ? 1440 : 10;
      if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new CampaignConfigurationError(`${key} deve ser inteiro entre ${min} e ${max}.`);
      result[key] = value;
    } else if (key === "respectDailyLimit") {
      if (typeof value !== "boolean") throw new CampaignConfigurationError("Informe respectDailyLimit como boolean.");
      result.respectDailyLimit = value;
    } else if (key === "timezone") {
      if (typeof value !== "string" || !value.trim() || value.trim().length > 100) throw new CampaignConfigurationError("Fuso horário inválido.");
      const timezone = value.trim();
      try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0); }
      catch { throw new CampaignConfigurationError("Fuso horário inválido."); }
      result.timezone = timezone;
    } else if (key === "stopAt") {
      if (value === null) { result.stopAt = null; continue; }
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new CampaignConfigurationError("Informe stopAt em ISO com fuso explícito, ou null.");
      const [year, month, day] = value.slice(0, 10).split("-").map(Number);
      const date = new Date(value);
      if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || !Number.isFinite(date.getTime())) throw new CampaignConfigurationError("Data final inválida.");
      result.stopAt = date.toISOString();
    }
  }
  return result;
}
