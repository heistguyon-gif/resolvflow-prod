export function isMetaRestrictionError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code = error && typeof error === "object" && "code" in error ? Number((error as { code?: number }).code) : Number.NaN;
  if (code === 4 || code === 17 || code === 32) return false;
  if (code === 368 || code === 190) return true;
  if (/too many actions|user request limit|application request limit|rate limit|try again later/.test(message)) return false;
  return /restrict|temporarily blocked|action blocked|spam|checkpoint|community standards|conta (foi )?bloqueada|publica[cç][oõ]es foram bloqueadas|not allowed to perform this action|error validating access token|cannot access the app|log in to www\.instagram\.com|session has expired|user access is not active/.test(message);
}

export function isMetaQuotaError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return /limite de publica[cç][oõ]es|content publishing limit|quota_usage|publishing limit/.test(message);
}

export function deriveConnectedHealth(input: { quotaUsed: number; quotaTotal: number; restriction?: boolean; lastError?: string | null }) {
  if (input.restriction || isMetaRestrictionError(input.lastError)) return { healthStatus: "Restrita", lastError: input.lastError || "A Meta bloqueou ou restringiu ações desta conta." };
  const total = Math.max(1, input.quotaTotal || 100);
  const used = Math.max(0, input.quotaUsed || 0);
  if (used >= total) return { healthStatus: "Limite atingido", lastError: `Limite de publicações da Meta atingido (${used} de ${total}).` };
  const keepError = input.lastError && !isMetaQuotaError(input.lastError) ? input.lastError : null;
  return { healthStatus: "Saudável", lastError: keepError };
}
