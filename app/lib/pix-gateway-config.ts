export type PixProvider = "leztypay" | "bravopay";
// BlackFy is env-configured only (BLACKFY_API_KEY + BLACKFY_WEBHOOK_SECRET): it is
// listed and selectable as an existing ("legacy-*") gateway but cannot be created
// as a managed R2 config, so the managed adapters stay Lezty/BravoPay-only.
export type LegacyPixProvider = PixProvider | "blackfy";
export const legacyPixProviderLabel = (provider: LegacyPixProvider) => provider === "leztypay" ? "Lezty Pay" : provider === "blackfy" ? "BlackFy" : "BravoPay";
const LEGACY_WEBHOOK_URL: Record<LegacyPixProvider, string> = {
  leztypay: "https://resolvflow.online/api/otp/pix/webhook",
  bravopay: "https://resolvflow.online/api/otp/pix/webhook",
  blackfy: "https://resolvflow.online/api/otp/pix/blackfy/webhook",
};
export type PixGatewayRef = { configId: string; version: number };
export function pixCheckoutCapabilities(active: {legacy:true;ref:PixGatewayRef}|{legacy:false}|null,direct:boolean){
  const pixEnabled=Boolean(active)&&!direct;
  return {pixEnabled,pixRequiresDocument:pixEnabled&&Boolean(active&&(!active.legacy||active.ref.configId==="legacy-leztypay"||active.ref.configId==="legacy-blackfy"))};
}
export type PixGatewayVersion = { version: number; apiKey: string; webhookSecret: string; createdAt: string };
export type PixGatewayConfig = { id: string; label: string; provider: PixProvider; archived: boolean; everActivated?: boolean; versions: PixGatewayVersion[]; createdAt: string; updatedAt: string };
export type LegacyPixAvailability = { provider: LegacyPixProvider; hasApiKey: boolean; hasWebhookSecret: boolean };
export class PixGatewayError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
type Packed = { ciphertext: string; iv: string };
type Codec = { encrypt(text: string): Promise<Packed>; decrypt(ciphertext: string, iv: string): Promise<string> };
type Command = { action: string; requestId: string; expectedRevision: string; label?: string; provider?: PixProvider; apiKey?: string; reuseLegacyKey?: boolean; webhookSecret?: string; configId?: string; version?: number; confirmed?: boolean };
type Audit = { requestId: string; actor: string; action: string; configId: string; version: number };
type Registry = { version: 1; revision: number; paused?: boolean; active: PixGatewayRef | null; configs: PixGatewayConfig[]; receipts: { id: string; actor: string; hash: string; audit: Audit }[] };
const KEY = "pix-gateways/v1/registry.json";
export const PIX_PROVIDERS = [
  { id: "leztypay" as const, label: "Lezty Pay", documentationUrl: "https://docs.leztypay.com/" },
  { id: "bravopay" as const, label: "BravoPay", documentationUrl: "https://bravopay.club/docs" },
];
export const pixGatewayNamespace = (ref: PixGatewayRef) => `pixcfg:${ref.configId}:${ref.version}`;
export function parsePixGatewayNamespace(value: string): PixGatewayRef | null {
  const match = /^pixcfg:([a-f0-9-]{36}):([1-9]\d{0,5})$/.exec(value);
  return match ? { configId: match[1], version: Number(match[2]) } : null;
}
const same = (a: PixGatewayRef | null, b: PixGatewayRef) => a?.configId === b.configId && a.version === b.version;
const legacyId = (provider: LegacyPixProvider) => `legacy-${provider}`;
function secret(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 8192 || /[\r\n\0]/.test(value)) throw new PixGatewayError("invalid_input", 400);
  return value.trim();
}
async function digest(value: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, "0")).join(""); }

export function createPixGatewayRegistry(bucket: R2Bucket, codec: Codec, audit: (value: Audit) => Promise<void>, legacy: () => Promise<LegacyPixAvailability[]>, now = Date.now, legacyKey?: (provider: PixProvider) => Promise<string>, hasPayments?: (id: string) => Promise<boolean>) {
  async function read() {
    const object = await bucket.get(KEY);
    if (!object) return { value: { version: 1, revision: 0, active: null, configs: [], receipts: [] } as Registry, etag: undefined };
    const packed = await object.json<Packed>();
    const value = JSON.parse(await codec.decrypt(packed.ciphertext, packed.iv)) as Registry;
    if (value.version !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.configs) || !Array.isArray(value.receipts)) throw new PixGatewayError("storage_unavailable", 503);
    return { value, etag: object.etag };
  }
  function selected(value: Registry, available: LegacyPixAvailability[]) {
    if (value.paused) return null;
    // An explicit admin selection (activate) always wins and is reversible in the UI.
    if (value.active) return value.active;
    // Default when nothing was selected: BlackFy (only with key AND webhook secret,
    // because its webhook is always signature-checked), then Lezty, then BravoPay.
    const initial = available.find(row => row.provider === "blackfy" && row.hasApiKey && row.hasWebhookSecret)
      ?? available.find(row => row.provider === "leztypay" && row.hasApiKey) ?? available.find(row => row.provider === "bravopay" && row.hasApiKey);
    return initial ? { configId: legacyId(initial.provider), version: 1 } : null;
  }
  async function dto(value: Registry) {
    const available = await legacy(), active = selected(value, available);
    return {
      revision: String(value.revision), active, paused: value.paused === true, canManage: true, providers: PIX_PROVIDERS,
      gateways: [
        ...available.map(row => ({ id: legacyId(row.provider), label: `${legacyPixProviderLabel(row.provider)} existente`, provider: row.provider, version: 1,
          active: same(active, { configId: legacyId(row.provider), version: 1 }), activeVersion: active?.configId === legacyId(row.provider) ? active.version : null,
          origin: "legacy" as const, status: row.hasApiKey && row.hasWebhookSecret ? "configured" : "incomplete", hasApiKey: row.hasApiKey, hasWebhookSecret: row.hasWebhookSecret,
          verification: "not_checked" as const, createdAt: null, updatedAt: null, webhookUrl: LEGACY_WEBHOOK_URL[row.provider] })),
        ...value.configs.map(config => {
          const version = config.versions.at(-1)!;
          return { id: config.id, label: config.label, provider: config.provider, version: version.version, origin: "managed" as const,
            active: active?.configId === config.id, activeVersion: active?.configId === config.id ? active.version : null,
            canDelete: config.everActivated === false && active?.configId !== config.id,
            status: config.archived ? "archived" : "configured", hasApiKey: Boolean(version.apiKey), hasWebhookSecret: Boolean(version.webhookSecret), verification: "not_checked" as const,
            createdAt: config.createdAt, updatedAt: config.updatedAt,
            webhookUrl: `https://resolvflow.online/api/otp/pix/webhook?configId=${config.id}&version=${version.version}` };
        }),
      ],
    };
  }
  async function resolve(ref: PixGatewayRef) {
    const value = (await read()).value;
    const config = value.configs.find(row => row.id === ref.configId), version = config?.versions.find(row => row.version === ref.version);
    if (!config || !version) throw new PixGatewayError("config_not_found", 404);
    // Historical versions are readable for reconciliation, even when archived.
    return { provider: config.provider, ...version, ref, namespace: pixGatewayNamespace(ref) };
  }
  return {
    async state() { return dto((await read()).value); }, resolve,
    async active() {
      const value = (await read()).value, ref = selected(value, await legacy());
      if (ref?.configId.startsWith("legacy-")) {
        if (value.active) {
          const row = (await legacy()).find(item => legacyId(item.provider) === ref.configId);
          if (!row?.hasApiKey || !row.hasWebhookSecret) throw new PixGatewayError("gateway_unavailable",503);
        }
        return { legacy: true as const, ref };
      }
      return ref ? { legacy: false as const, ...(await resolve(ref)) } : null;
    },
    async command(input: unknown, actor: string) {
      if (actor.trim().toLowerCase() !== "lucasbgn.affiliate@gmail.com") throw new PixGatewayError("forbidden", 403);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new PixGatewayError("invalid_input", 400);
      const c = input as Command;
      if (!/^[a-f0-9-]{36}$/i.test(c.requestId ?? "") || typeof c.expectedRevision !== "string" || !/^\d+$/.test(c.expectedRevision)) throw new PixGatewayError("invalid_input", 400);
      const allowed: Record<string, string[]> = { create: ["label", "provider", "apiKey", "webhookSecret", "reuseLegacyKey"], revise: ["configId", "label", "apiKey", "webhookSecret"], activate: ["configId", "version"], archive: ["configId"], deactivate: ["configId", "version", "confirmed"], delete: ["configId", "confirmed"] };
      if (typeof c.action!=="string"||!Object.hasOwn(allowed,c.action) || Object.keys(c).some(key => !["action", "requestId", "expectedRevision", ...allowed[c.action]].includes(key))) throw new PixGatewayError("invalid_input", 400);
      // Canonical key order makes a same-command replay independent of JSON field order.
      const hash = await digest(JSON.stringify(Object.fromEntries(Object.entries(c).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));
      const snapshot = await read(), value = snapshot.value;
      const replay = value.receipts.find(row => row.id === c.requestId);
      if (replay) {
        if (replay.hash !== hash || replay.actor !== actor) throw new PixGatewayError("request_conflict");
        await audit(replay.audit); return { state: await dto(value) };
      }
      if (String(value.revision) !== c.expectedRevision) throw new PixGatewayError("revision_conflict");
      if (value.receipts.length >= 1000 || (["create", "revise"].includes(c.action) && value.configs.reduce((n, row) => n + row.versions.length, 0) >= 200)) throw new PixGatewayError("capacity");
      const stamp = new Date(now()).toISOString();
      let auditConfigId = c.configId;
      let config = value.configs.find(row => row.id === c.configId), version = config?.versions.at(-1)?.version ?? 1;
      if (c.action === "create" || c.action === "revise") {
        if (typeof c.label !== "string" || !c.label.trim() || c.label.length > 80 || /[\r\n\0]/.test(c.label)) throw new PixGatewayError("invalid_input", 400);
        if (c.action === "create") {
          if (!PIX_PROVIDERS.some(row => row.id === c.provider)) throw new PixGatewayError("invalid_input", 400);
          config = { id: crypto.randomUUID(), label: c.label.trim(), provider: c.provider!, versions: [], archived: false, everActivated: false, createdAt: stamp, updatedAt: stamp };
          value.configs.push(config);
        } else if (!config || config.archived) throw new PixGatewayError("config_not_found", 404);
        const previous = config!.versions.at(-1);
        if (c.reuseLegacyKey !== undefined && c.reuseLegacyKey !== true || c.reuseLegacyKey && c.apiKey !== undefined) throw new PixGatewayError("invalid_input",400);
        let apiKey=c.apiKey;
        if (c.reuseLegacyKey) {
          if (!legacyKey) throw new PixGatewayError("legacy_unavailable");
          apiKey=await legacyKey(config!.provider);
          // The historical storage field also had a Mercado Pago name. Never
          // interpret an unrelated token as Bravo just because that field exists.
          if(!apiKey.startsWith(config!.provider==="bravopay"?"bp_live_":"sk_live_"))throw new PixGatewayError("legacy_credential_incompatible",409);
        }
        version = (previous?.version ?? 0) + 1;
        config!.versions.push({ version, apiKey: apiKey === undefined && previous ? previous.apiKey : secret(apiKey), webhookSecret: c.webhookSecret === undefined && previous ? previous.webhookSecret : secret(c.webhookSecret), createdAt: stamp });
        config!.label = c.label.trim(); config!.updatedAt = stamp;
      } else if (c.action === "activate") {
        value.paused = false;
        if (!Number.isSafeInteger(c.version) || c.version! < 1) throw new PixGatewayError("invalid_input", 400);
        if ((c.configId === "legacy-leztypay" || c.configId === "legacy-blackfy") && c.version === 1) {
          const row = (await legacy()).find(item => legacyId(item.provider) === c.configId);
          if (!row?.hasApiKey || !row.hasWebhookSecret) throw new PixGatewayError("legacy_incomplete");
          value.active = { configId: c.configId, version: 1 };
        } else {
          if (!config || config.archived || !config.versions.some(row => row.version === c.version)) throw new PixGatewayError("config_not_found", 404);
          // Same CAS as selection: no checkout can observe an active config eligible for erasure.
          config.everActivated = true;
          value.active = { configId: config.id, version: c.version! }; version = c.version!;
        }
      } else if (c.action === "deactivate") {
        if (c.confirmed !== true) throw new PixGatewayError("confirmation_required",400);
        const active = selected(value, await legacy());
        if (!active || active.configId !== c.configId || active.version !== c.version) throw new PixGatewayError("active_changed");
        value.active = null;
        value.paused = true;
        version = active.version;
      } else if (c.action === "delete") {
        if (c.confirmed !== true) throw new PixGatewayError("confirmation_required",400);
        if (!config) throw new PixGatewayError("config_not_found",404);
        if (selected(value, await legacy())?.configId === config.id) throw new PixGatewayError("active_config");
        // Old configs lack positive provenance. Previously selected configs may have an in-flight intent before D1 insertion.
        if (config.everActivated !== false || !hasPayments || await hasPayments(config.id)) throw new PixGatewayError("config_has_history");
        value.configs = value.configs.filter(row => row.id !== config!.id);
      } else {
        if (!config) throw new PixGatewayError("config_not_found", 404);
        if (selected(value, await legacy())?.configId === config.id) throw new PixGatewayError("active_config");
        config.archived = true; config.updatedAt = stamp;
      }
      auditConfigId = config?.id ?? auditConfigId;
      if (!auditConfigId) throw new PixGatewayError("invalid_input",400);
      const entry = { requestId: c.requestId, actor, action: c.action, configId: auditConfigId, version };
      value.revision++; value.receipts.push({ id: c.requestId, actor, hash, audit: entry });
      const packed = await codec.encrypt(JSON.stringify(value));
      const saved = await bucket.put(KEY, JSON.stringify(packed), { onlyIf: snapshot.etag ? { etagMatches: snapshot.etag } : { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
      if (!saved) throw new PixGatewayError("revision_conflict");
      // Durable receipt repairs an interrupted audit on the SAME command replay.
      await audit(entry);
      return { state: await dto(value) };
    },
  };
}
