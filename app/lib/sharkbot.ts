type JsonRecord = Record<string, unknown>;

export type SharkBotTarget = { ownerUserId: string; accountUserId: string };

export async function resolveSharkBotTarget(input: {
  configuredOwnerEmail?: string | null;
  configuredWorkspaceOwnerId?: string | null;
  targetEmail: string;
  findTarget: (email: string, workspaceOwnerId: string | null) => Promise<SharkBotTarget | null>;
}) {
  const targetEmail = input.targetEmail.trim().toLowerCase();
  if (!targetEmail || input.configuredOwnerEmail?.trim().toLowerCase() !== targetEmail) {
    throw new Error("O destino da SharkBot requer configuração para o administrador correto.");
  }
  const workspaceOwnerId = input.configuredWorkspaceOwnerId?.trim() || null;
  const target = await input.findTarget(targetEmail, workspaceOwnerId);
  if (!target || (workspaceOwnerId && target.ownerUserId !== workspaceOwnerId)) {
    throw new Error("O destino configurado da SharkBot não pertence ao administrador esperado.");
  }
  return target;
}

export type NormalizedSharkBotEvent = {
  eventType: "new_lead" | "payment_created" | "payment_approved" | "unknown";
  externalEventId: string | null;
  paymentId: string | null;
  status: string | null;
  amountCents: number;
  currency: string;
  payerName: string | null;
  productName: string | null;
  botName: string | null;
  flowName: string | null;
  gateway: string | null;
  occurredAt: string;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function isoDate(...values: unknown[]) {
  for (const candidate of values) {
    const value = typeof candidate === "number" && Number.isFinite(candidate)
      ? candidate < 10_000_000_000 ? candidate * 1000 : candidate
      : firstString(candidate);
    if (value != null) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function normalizeEventType(value: string | null): NormalizedSharkBotEvent["eventType"] {
  const key = (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if ((key.includes("payment") || key.includes("pagamento")) && (key.includes("approved") || key.includes("paid") || key.includes("aprovado") || key.includes("confirmado"))) return "payment_approved";
  if ((key.includes("payment") || key.includes("pagamento")) && (key.includes("created") || key.includes("criado") || key.includes("pending"))) return "payment_created";
  if (key === "user_joined" || key === "joined" || key === "lead") return "new_lead";
  if (key.includes("lead") && (key.includes("new") || key.includes("novo") || key.includes("created") || key.includes("start"))) return "new_lead";
  return "unknown";
}

function personName(person: JsonRecord) {
  return firstString(
    person.name,
    [firstString(person.first_name, person.firstName), firstString(person.last_name, person.lastName)].filter(Boolean).join(" "),
  );
}

function amountInCents(payment: JsonRecord, data: JsonRecord, payload: JsonRecord) {
  const explicitCents = [payment.amountCents, payment.amount_cents, data.amountCents, data.amount_cents, payload.amountCents, payload.amount_cents]
    .map(Number).find(Number.isFinite);
  if (explicitCents != null) return Math.max(0, Math.round(explicitCents));
  const decimal = [payment.amount, payment.value, data.amount, data.value, payload.amount, payload.value]
    .map(Number).find(Number.isFinite);
  return decimal == null ? 0 : Math.max(0, Math.round(decimal * 100));
}

export function normalizeSharkBotEvent(payload: JsonRecord): NormalizedSharkBotEvent {
  const event = record(payload.event);
  const data = record(payload.data);
  const payment = record(data.payment || payload.payment || data.transaction || payload.transaction || data);
  const lead = record(payment.customer || data.customer || payload.customer || payment.lead || payment.leadId || data.lead || payload.lead);
  const plan = record(payment.plan || data.plan || payload.plan || payment.product || data.product);
  const bot = record(payment.bot || payment.botId || data.bot || payload.bot);
  const flow = record(payment.flow || payment.flowId || data.flow || payload.flow);
  const gateway = record(payment.gateway || data.gateway || payload.gateway);
  const eventName = firstString(typeof payload.event === "string" ? payload.event : null, event.name, event.type, payload.eventType, payload.event_type, payload.type, payload.name);
  return {
    eventType: normalizeEventType(eventName),
    externalEventId: firstString(event.id, data.eventId, data.event_id, payload.eventId, payload.event_id, payload.id),
    paymentId: firstString(payment.id, payment._id, payment.paymentId, payment.payment_id, payment.externalId, payment.external_id, data.paymentId, data.payment_id, gateway.externalId, gateway.external_id),
    status: firstString(payment.status, data.status, payload.status),
    amountCents: amountInCents(payment, data, payload),
    currency: (firstString(payment.currency, data.currency, payload.currency) || "BRL").toUpperCase(),
    payerName: firstString(payment.payerName, payment.payer_name, payment.customerName, payment.customer_name, personName(lead), data.payerName, data.payer_name, payload.payerName, payload.payer_name),
    productName: firstString(plan.name, plan.title, payment.productName, payment.product_name, data.productName, data.product_name, payload.productName, payload.product_name),
    botName: firstString(bot.name, bot.username, payment.botName, payment.bot_name, data.botName, data.bot_name),
    flowName: firstString(flow.name, payment.flowName, payment.flow_name, data.flowName, data.flow_name),
    gateway: firstString(gateway.provider, gateway.name, payment.gateway, payment.gatewayName, payment.gateway_name, data.gateway, data.gatewayName, data.gateway_name),
    occurredAt: isoDate(event.occurredAt, event.createdAt, payment.paidAt, payment.paid_at, record(payment.timestamps).paidAt, payment.createdAt, payment.created_at, data.joined_at, data.occurred_at, payload.timestamp, payload.createdAt, payload.created_at),
  };
}

function hexBytes(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function base64Bytes(value: string) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function verifySharkBotSignature(rawBody: string, signatureHeader: string, secret: string) {
  const supplied = signatureHeader.trim().replace(/^sha256=/i, "");
  const signature = hexBytes(supplied) || base64Bytes(supplied);
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(rawBody));
}

export async function verifySharkBotSignatureWithSecrets(rawBody: string, signatureHeader: string, secrets: Array<string | null | undefined>) {
  const configuredSecrets = [...new Set(secrets.map((secret) => secret?.trim()).filter((secret): secret is string => Boolean(secret)))];
  if (!configuredSecrets.length) return false;
  const results = await Promise.all(configuredSecrets.map((secret) => verifySharkBotSignature(rawBody, signatureHeader, secret)));
  return results.some(Boolean);
}

export async function matchingSharkBotSecretIndex(rawBody: string, signatureHeader: string, secrets: Array<string | null | undefined>) {
  const results = await Promise.all(secrets.map((secret) => {
    const configured = secret?.trim();
    return configured ? verifySharkBotSignature(rawBody, signatureHeader, configured) : Promise.resolve(false);
  }));
  return results.findIndex(Boolean);
}

export async function sharkBotEventKey(rawBody: string, normalized: NormalizedSharkBotEvent) {
  if (normalized.externalEventId) return `event:${normalized.externalEventId}`;
  if (normalized.paymentId && normalized.eventType !== "unknown") return `${normalized.eventType}:${normalized.paymentId}`;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody)));
  return `body:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
