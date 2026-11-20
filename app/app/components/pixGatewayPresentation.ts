// Public DTO only. No server runtime or credential type enters the client bundle.
export type PixProvider = "leztypay" | "bravopay" | "blackfy"; // blackfy: env-configured ("existente") only
export type GatewayDTO = {
  id: string; label: string; provider: PixProvider; version: number;
  origin: "managed" | "legacy"; status: "configured" | "archived" | "incomplete";
  active: boolean; activeVersion: number | null; hasApiKey: boolean; hasWebhookSecret: boolean;
  canDelete?: boolean;
  verification: "not_checked"; createdAt: string | null; updatedAt: string | null; webhookUrl: string | null;
};
export type GatewayStateDTO = {
  revision: string; paused?: boolean; active: { configId: string; version: number } | null;
  gateways: GatewayDTO[]; providers: { id: PixProvider; label: string; documentationUrl: string }[]; canManage: true;
};
export type GatewayCommand = { requestId: string; expectedRevision: string } & (
  | { action: "create"; label: string; provider: PixProvider; apiKey?: string; reuseLegacyKey?: true; webhookSecret: string }
  | { action: "revise"; configId: string; label: string; apiKey?: string; webhookSecret?: string }
  | { action: "activate"; configId: string; version: number }
  | { action: "archive"; configId: string }
  | { action: "delete"; configId: string; confirmed: true }
  | { action: "deactivate"; configId: string; version: number; confirmed: true }
);

export const isPixAdmin = (email?: string) => email?.trim().toLowerCase() === "lucasbgn.affiliate@gmail.com";
const provider = (value: unknown): value is PixProvider => value === "leztypay" || value === "bravopay" || value === "blackfy";
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const version = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function publicWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["resolvflow.online", "top.resolvflow.online"].includes(url.host) || url.username || url.password || url.hash || !["/api/otp/pix/webhook", "/api/otp/pix/blackfy/webhook"].includes(url.pathname)) return null;
    if (url.pathname === "/api/otp/pix/blackfy/webhook" && url.search) return null;
    if ([...url.searchParams.keys()].some(key => !["configId", "version"].includes(key))) return null;
    return value;
  } catch { return null; }
}

export function gatewayState(value: unknown): GatewayStateDTO {
  if (!record(value) || value.canManage !== true || typeof value.revision !== "string" || !/^\d+$/.test(value.revision) || !Array.isArray(value.gateways) || !Array.isArray(value.providers)) throw new Error("invalid_response");
  const active = value.active;
  if (active !== null && (!record(active) || typeof active.configId !== "string" || !version(active.version))) throw new Error("invalid_response");
  const gateways = value.gateways.map((row: unknown): GatewayDTO => {
    if (!record(row) || typeof row.id !== "string" || typeof row.label !== "string" || !provider(row.provider) || !version(row.version) || !["managed", "legacy"].includes(String(row.origin)) || !["configured", "archived", "incomplete"].includes(String(row.status)) || typeof row.active !== "boolean" || (row.activeVersion !== null && !version(row.activeVersion)) || typeof row.hasApiKey !== "boolean" || typeof row.hasWebhookSecret !== "boolean" || row.verification !== "not_checked") throw new Error("invalid_response");
    // Whitelist fields: even an accidental extra server field never becomes client state.
    return { canDelete: row.canDelete === true, id: row.id, label: row.label, provider: row.provider, version: row.version, origin: row.origin as GatewayDTO["origin"], status: row.status as GatewayDTO["status"], active: row.active, activeVersion: row.activeVersion as number | null, hasApiKey: row.hasApiKey, hasWebhookSecret: row.hasWebhookSecret, verification: "not_checked", createdAt: typeof row.createdAt === "string" ? row.createdAt : null, updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null, webhookUrl: publicWebhookUrl(row.webhookUrl) };
  });
  const providers = value.providers.map((row: unknown) => {
    if (!record(row) || !provider(row.id) || typeof row.label !== "string") throw new Error("invalid_response");
    return { id: row.id, label: row.label, documentationUrl: "" }; // External navigation is not needed in this form.
  });
  return { paused: value.paused === true, revision: value.revision, active: active === null ? null : { configId: active.configId as string, version: active.version as number }, gateways, providers, canManage: true };
}

export function gatewayError(code: unknown): string {
  const errors: Record<string, string> = {
    invalid_input: "Revise os campos informados.", body_limit: "Os dados enviados excedem o tamanho permitido.",
    revision_conflict: "A configuração mudou em outra sessão. Atualize a lista e revise sua escolha.",
    request_conflict: "Esta alteração tem uma confirmação conflitante. Atualize a lista antes de continuar.",
    incomplete_config: "Complete as credenciais antes de ativar.", active_config: "O gateway ativo não pode ser arquivado.",
    config_not_found: "A configuração não está disponível. Atualize a lista.", capacity: "O limite de configurações ou revisões foi atingido.",
    config_has_history: "Esta configuração deve ser arquivada para preservar o histórico.",
    active_changed: "A seleção mudou. Atualize a lista e confira.",
    legacy_incomplete: "A configuração existente precisa de chave e segredo webhook.",
    legacy_unavailable: "A chave existente não está disponível para reaproveitamento.",
    legacy_credential_incompatible: "A chave existente não é compatível com esse provedor. Cadastre uma nova credencial.",
  };
  return typeof code === "string" && Object.hasOwn(errors, code) ? errors[code] : "Não foi possível confirmar a alteração. Confira a mesma solicitação antes de continuar.";
}
