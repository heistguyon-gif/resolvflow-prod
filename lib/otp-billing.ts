import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { otpInbox, otpLedger, otpPayments, otpPixWebhookEvents, otpSettings, otpSupplierApis, otpWallets } from "../db/schema";
import { runtimeEnv } from "./runtime-env";
import { decryptToken, encryptToken } from "./token-crypto";
import { backfillLegacyInboxOrigin } from "./otp-inbox-record";
import { closeOpenInboxBySupplierApi } from "./otp-inbox";
import { resolveOtpSupplierMode } from "./otp-mode";
import { createLeztyPixTransaction, getLeztyTransaction, leztyPaymentState } from "./leztypay";

export const DEFAULT_OTP_PRICE_CENTS = 200;
export const DEFAULT_OTP_PRIORITY_CENTS = 250;
export const DEFAULT_OTP_RUSH_CENTS = 300;
export const DEFAULT_OTP_MIN_DEPOSIT_CENTS = 2000;
const SETTINGS_ID = "default";
const OTP_SELF_SUPPLY_EMAILS = new Set(["maykikelvin09@gmail.com"]);

export function isOtpSelfSupplyEmail(email?: string | null) {
  return Boolean(email && OTP_SELF_SUPPLY_EMAILS.has(email.trim().toLowerCase()));
}

export function usesOtpSupplierBalance(email?: string | null) {
  const owner = runtimeEnv().NEXOFLOW_OWNER_EMAIL?.trim().toLowerCase();
  const normalized = email?.trim().toLowerCase() || "";
  return Boolean(normalized && (normalized === owner || OTP_SELF_SUPPLY_EMAILS.has(normalized)));
}

export async function workspaceUsesOtpSupplierBalance(workspaceOwnerUserId: string, email?: string | null) {
  const wallet = await getWallet(workspaceOwnerUserId);
  return resolveOtpSupplierMode(wallet.billingMode, usesOtpSupplierBalance(email));
}

export async function setWorkspaceOtpBillingMode(workspaceOwnerUserId: string, mode: "platform" | "supplier") {
  await getWallet(workspaceOwnerUserId);
  await getDb().update(otpWallets).set({ billingMode: mode, updatedAt: new Date().toISOString() }).where(eq(otpWallets.workspaceOwnerUserId, workspaceOwnerUserId));
}

function clampPrice(cents: number) {
  return Math.min(100_000, Math.max(100, Math.round(cents)));
}

export function formatBrl(cents: number) {
  return (Math.max(0, cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type OtpSettingsRow = {
  id: string;
  priceCents: number;
  pricePriorityCents: number;
  priceRushCents: number;
  minDepositCents: number;
  instacasterCiphertext: string | null;
  instacasterIv: string | null;
  mercadoPagoCiphertext: string | null;
  mercadoPagoIv: string | null;
  updatedAt: string;
};

const EMPTY_SETTINGS: OtpSettingsRow = {
  id: SETTINGS_ID,
  priceCents: DEFAULT_OTP_PRICE_CENTS,
  pricePriorityCents: DEFAULT_OTP_PRIORITY_CENTS,
  priceRushCents: DEFAULT_OTP_RUSH_CENTS,
  minDepositCents: DEFAULT_OTP_MIN_DEPOSIT_CENTS,
  instacasterCiphertext: null,
  instacasterIv: null,
  mercadoPagoCiphertext: null,
  mercadoPagoIv: null,
  updatedAt: new Date().toISOString(),
};

let settingsMemo: { exp: number; row: OtpSettingsRow } | null = null;
let instacasterKeyMemo: { exp: number; value: string } | null = null;

export async function getOtpSettingsRow(): Promise<OtpSettingsRow> {
  if (settingsMemo && settingsMemo.exp > Date.now()) return settingsMemo.row;
  const db = getDb();
  const [row] = await db.select().from(otpSettings).where(eq(otpSettings.id, SETTINGS_ID)).limit(1);
  if (row) {
    const next = {
      ...EMPTY_SETTINGS,
      ...row,
      priceCents: row.priceCents || DEFAULT_OTP_PRICE_CENTS,
      pricePriorityCents: row.pricePriorityCents || DEFAULT_OTP_PRIORITY_CENTS,
      priceRushCents: row.priceRushCents || DEFAULT_OTP_RUSH_CENTS,
      minDepositCents: row.minDepositCents || DEFAULT_OTP_MIN_DEPOSIT_CENTS,
    };
    settingsMemo = { exp: Date.now() + 60_000, row: next };
    return next;
  }
  await db.insert(otpSettings).values({
    id: SETTINGS_ID,
    priceCents: DEFAULT_OTP_PRICE_CENTS,
    pricePriorityCents: DEFAULT_OTP_PRIORITY_CENTS,
    priceRushCents: DEFAULT_OTP_RUSH_CENTS,
    minDepositCents: DEFAULT_OTP_MIN_DEPOSIT_CENTS,
  }).onConflictDoNothing();
  const [created] = await db.select().from(otpSettings).where(eq(otpSettings.id, SETTINGS_ID)).limit(1);
  const next = created ? { ...EMPTY_SETTINGS, ...created } : EMPTY_SETTINGS;
  settingsMemo = { exp: Date.now() + 60_000, row: next };
  return next;
}

export async function otpSalePriceCents(priorityMode = 0) {
  const row = await getOtpSettingsRow();
  if (priorityMode === 2) return Math.max(100, row.priceRushCents);
  if (priorityMode === 1) return Math.max(100, row.pricePriorityCents);
  return Math.max(100, row.priceCents);
}

export function publicOtpPrices(row: OtpSettingsRow) {
  return {
    priceCents: row.priceCents,
    pricePriorityCents: row.pricePriorityCents,
    priceRushCents: row.priceRushCents,
    minDepositCents: row.minDepositCents,
    priceLabel: formatBrl(row.priceCents),
    pricePriorityLabel: formatBrl(row.pricePriorityCents),
    priceRushLabel: formatBrl(row.priceRushCents),
    minDepositLabel: formatBrl(row.minDepositCents),
  };
}

export async function getInstacasterApiKey() {
  if (instacasterKeyMemo && instacasterKeyMemo.exp > Date.now()) return instacasterKeyMemo.value;
  const row = await getOtpSettingsRow();
  const envKey = runtimeEnv().INSTACASTER_API_KEY?.trim();
  const cutoverAt = Date.parse(runtimeEnv().OTP_GLOBAL_API_CUTOVER_AT || "");
  const storedUpdatedAt = Date.parse(row.updatedAt || "");
  const interfaceHasPriority = Boolean(
    row.instacasterCiphertext &&
    row.instacasterIv &&
    Number.isFinite(cutoverAt) &&
    Number.isFinite(storedUpdatedAt) &&
    storedUpdatedAt >= cutoverAt,
  );
  if (envKey && !interfaceHasPriority) {
    instacasterKeyMemo = { exp: Date.now() + 60_000, value: envKey };
    return envKey;
  }
  if (!row.instacasterCiphertext || !row.instacasterIv) return envKey || "";
  try {
    const value = (await decryptToken(row.instacasterCiphertext, row.instacasterIv)).trim();
    const selected = value || envKey || "";
    instacasterKeyMemo = { exp: Date.now() + 60_000, value: selected };
    return selected;
  } catch {
    return envKey || "";
  }
}

// Allows orders created before a global-key cutover to keep using the key that
// was stored in D1. The plaintext remains inside the Worker.
export async function getStoredInstacasterApiKey() {
  const row = await getOtpSettingsRow();
  if (!row.instacasterCiphertext || !row.instacasterIv) return "";
  try {
    return (await decryptToken(row.instacasterCiphertext, row.instacasterIv)).trim();
  } catch {
    return "";
  }
}

export async function getPixApiKey() {
  const leztyKey = runtimeEnv().LEZTYPAY_API_KEY?.trim();
  return leztyKey || getLegacyBravoPayApiKey();
}

async function getLegacyBravoPayApiKey() {
  const envKey = (runtimeEnv().BRAVOPAY_API_KEY || runtimeEnv().MERCADO_PAGO_ACCESS_TOKEN || "").trim();
  if (envKey) return envKey;
  const row = await getOtpSettingsRow();
  if (!row.mercadoPagoCiphertext || !row.mercadoPagoIv) return "";
  try {
    return (await decryptToken(row.mercadoPagoCiphertext, row.mercadoPagoIv)).trim();
  } catch {
    return "";
  }
}

export async function getMercadoPagoToken() {
  return getPixApiKey();
}

export async function saveOtpSettings(input: {
  priceCents?: number;
  pricePriorityCents?: number;
  priceRushCents?: number;
  minDepositCents?: number;
  instacasterKey?: string;
  mercadoPagoToken?: string;
}) {
  const current = await getOtpSettingsRow();
  const now = new Date().toISOString();
  const priceCents = typeof input.priceCents === "number" && Number.isFinite(input.priceCents) ? clampPrice(input.priceCents) : current.priceCents;
  const pricePriorityCents = typeof input.pricePriorityCents === "number" && Number.isFinite(input.pricePriorityCents) ? clampPrice(input.pricePriorityCents) : current.pricePriorityCents;
  const priceRushCents = typeof input.priceRushCents === "number" && Number.isFinite(input.priceRushCents) ? clampPrice(input.priceRushCents) : current.priceRushCents;
  const minDepositCents = typeof input.minDepositCents === "number" && Number.isFinite(input.minDepositCents)
    ? Math.min(500_000, Math.max(500, Math.round(input.minDepositCents)))
    : current.minDepositCents;
  let instacasterCiphertext = current.instacasterCiphertext;
  let instacasterIv = current.instacasterIv;
  if (typeof input.instacasterKey === "string" && input.instacasterKey.trim()) {
    const packed = await encryptToken(input.instacasterKey.trim());
    instacasterCiphertext = packed.ciphertext;
    instacasterIv = packed.iv;
  }
  let mercadoPagoCiphertext = current.mercadoPagoCiphertext;
  let mercadoPagoIv = current.mercadoPagoIv;
  if (typeof input.mercadoPagoToken === "string" && input.mercadoPagoToken.trim()) {
    const packed = await encryptToken(input.mercadoPagoToken.trim());
    mercadoPagoCiphertext = packed.ciphertext;
    mercadoPagoIv = packed.iv;
  }
  await getDb().insert(otpSettings).values({
    id: SETTINGS_ID,
    priceCents,
    pricePriorityCents,
    priceRushCents,
    minDepositCents,
    instacasterCiphertext,
    instacasterIv,
    mercadoPagoCiphertext,
    mercadoPagoIv,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: otpSettings.id,
    set: { priceCents, pricePriorityCents, priceRushCents, minDepositCents, instacasterCiphertext, instacasterIv, mercadoPagoCiphertext, mercadoPagoIv, updatedAt: now },
  });
  settingsMemo = null;
  instacasterKeyMemo = null;
  return {
    ...publicOtpPrices({ ...current, priceCents, pricePriorityCents, priceRushCents, minDepositCents }),
    supplierReady: Boolean(instacasterCiphertext || runtimeEnv().INSTACASTER_API_KEY),
    pixReady: Boolean(runtimeEnv().LEZTYPAY_API_KEY || mercadoPagoCiphertext || runtimeEnv().BRAVOPAY_API_KEY || runtimeEnv().MERCADO_PAGO_ACCESS_TOKEN),
  };
}

export async function getWorkspaceInstacasterApiKey(workspaceOwnerUserId: string, email?: string | null) {
  if (await workspaceUsesOtpSupplierBalance(workspaceOwnerUserId, email)) {
    await ensureLegacySupplierApi(workspaceOwnerUserId, email);
    const [selected] = await getDb().select().from(otpSupplierApis).where(and(
      eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
      eq(otpSupplierApis.enabled, true),
      isNull(otpSupplierApis.deletedAt),
    )).orderBy(desc(otpSupplierApis.isPrimary), desc(otpSupplierApis.createdAt)).limit(1);
    return selected ? decryptSupplierApiKey(selected) : "";
  }
  return getInstacasterApiKey();
}

export type OtpSupplierApiPublic = {
  id: string;
  name: string;
  enabled: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

function supplierApiPublic(row: typeof otpSupplierApis.$inferSelect): OtpSupplierApiPublic {
  return {
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    isPrimary: Boolean(row.isPrimary),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function decryptSupplierApiKey(row: Pick<typeof otpSupplierApis.$inferSelect, "keyCiphertext" | "keyIv">) {
  try {
    return (await decryptToken(row.keyCiphertext, row.keyIv)).trim();
  } catch {
    return "";
  }
}

export async function ensureLegacySupplierApi(workspaceOwnerUserId: string, email?: string | null) {
  const db = getDb();
  const [existing] = await db.select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    eq(otpSupplierApis.isPrimary, true),
  )).limit(1);
  if (existing && !existing.deletedAt) return existing;

  let ciphertext = "";
  let iv = "";
  if (isOtpSelfSupplyEmail(email)) {
    const wallet = await getWallet(workspaceOwnerUserId);
    ciphertext = wallet.supplierCiphertext || "";
    iv = wallet.supplierIv || "";
  } else if (usesOtpSupplierBalance(email)) {
    const legacyKey = await getInstacasterApiKey();
    if (legacyKey) {
      const packed = await encryptToken(legacyKey);
      ciphertext = packed.ciphertext;
      iv = packed.iv;
    }
  }
  if (!ciphertext || !iv) return null;

  if (existing?.deletedAt) {
    const now = new Date().toISOString();
    await db.update(otpSupplierApis).set({
      keyCiphertext: ciphertext,
      keyIv: iv,
      enabled: true,
      deletedAt: null,
      updatedAt: now,
    }).where(eq(otpSupplierApis.id, existing.id));
    return { ...existing, keyCiphertext: ciphertext, keyIv: iv, enabled: true, deletedAt: null, updatedAt: now };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(otpSupplierApis).values({
    id,
    workspaceOwnerUserId,
    name: "API principal",
    keyCiphertext: ciphertext,
    keyIv: iv,
    enabled: true,
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  const [primary] = await db.select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    eq(otpSupplierApis.isPrimary, true),
    isNull(otpSupplierApis.deletedAt),
  )).limit(1);
  const resolved = primary || (await db.select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    eq(otpSupplierApis.name, "API principal"),
    isNull(otpSupplierApis.deletedAt),
  )).limit(1))[0];
  if (resolved) {
    await backfillLegacyInboxOrigin(workspaceOwnerUserId, resolved.id, async (input) => {
      await db.update(otpInbox).set({ supplierApiId: input.supplierApiId }).where(and(
        eq(otpInbox.workspaceOwnerUserId, input.workspaceOwnerUserId),
        isNull(otpInbox.supplierApiId),
      ));
    });
  }
  return resolved || null;
}

export async function listWorkspaceSupplierApis(workspaceOwnerUserId: string, email?: string | null) {
  await ensureLegacySupplierApi(workspaceOwnerUserId, email);
  const rows = await getDb().select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    isNull(otpSupplierApis.deletedAt),
  )).orderBy(desc(otpSupplierApis.isPrimary), desc(otpSupplierApis.createdAt));
  return rows.map(supplierApiPublic);
}

export async function getWorkspaceSupplierApi(workspaceOwnerUserId: string, apiId: string, options?: { requireEnabled?: boolean }) {
  const [row] = await getDb().select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.id, apiId),
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    isNull(otpSupplierApis.deletedAt),
  )).limit(1);
  if (!row || options?.requireEnabled && !row.enabled) return null;
  const key = await decryptSupplierApiKey(row);
  if (!key) return null;
  return { ...supplierApiPublic(row), key };
}

export async function listWorkspaceSupplierApiSecrets(workspaceOwnerUserId: string, email?: string | null, options?: { enabledOnly?: boolean }) {
  await ensureLegacySupplierApi(workspaceOwnerUserId, email);
  const rows = await getDb().select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    isNull(otpSupplierApis.deletedAt),
  ));
  const eligible = options?.enabledOnly ? rows.filter((row) => row.enabled) : rows;
  return Promise.all(eligible.map(async (row) => ({ ...supplierApiPublic(row), key: await decryptSupplierApiKey(row) })));
}

export async function createWorkspaceSupplierApi(workspaceOwnerUserId: string, name: string, apiKey: string) {
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 60);
  const key = apiKey.trim();
  if (cleanName.length < 2) throw new Error("Informe um nome para a API.");
  if (!key) throw new Error("Cole a chave da API.");
  const packed = await encryptToken(key);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const [deleted] = await getDb().select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    eq(otpSupplierApis.name, cleanName),
  )).limit(1);
  if (deleted?.deletedAt) {
    await getDb().update(otpSupplierApis).set({
      keyCiphertext: packed.ciphertext,
      keyIv: packed.iv,
      enabled: true,
      deletedAt: null,
      updatedAt: now,
    }).where(eq(otpSupplierApis.id, deleted.id));
    if (deleted.isPrimary) {
      await getWallet(workspaceOwnerUserId);
      await getDb().update(otpWallets).set({ supplierCiphertext: packed.ciphertext, supplierIv: packed.iv, updatedAt: now }).where(eq(otpWallets.workspaceOwnerUserId, workspaceOwnerUserId));
    }
    await setWorkspaceOtpBillingMode(workspaceOwnerUserId, "supplier");
    return { id: deleted.id, name: cleanName, enabled: true, isPrimary: Boolean(deleted.isPrimary), createdAt: deleted.createdAt, updatedAt: now } satisfies OtpSupplierApiPublic;
  }
  try {
    await getDb().insert(otpSupplierApis).values({
      id,
      workspaceOwnerUserId,
      name: cleanName,
      keyCiphertext: packed.ciphertext,
      keyIv: packed.iv,
      enabled: true,
      isPrimary: false,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) throw new Error("Já existe uma API com esse nome.");
    throw error;
  }
  await setWorkspaceOtpBillingMode(workspaceOwnerUserId, "supplier");
  return { id, name: cleanName, enabled: true, isPrimary: false, createdAt: now, updatedAt: now } satisfies OtpSupplierApiPublic;
}

export async function renameWorkspaceSupplierApi(workspaceOwnerUserId: string, apiId: string, name: string) {
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (cleanName.length < 2) throw new Error("Informe um nome para a API.");
  const updated = await getDb().update(otpSupplierApis).set({ name: cleanName, updatedAt: new Date().toISOString() }).where(and(
    eq(otpSupplierApis.id, apiId),
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    isNull(otpSupplierApis.deletedAt),
  )).returning({ id: otpSupplierApis.id });
  if (!updated[0]) throw new Error("API não encontrada.");
}

export async function setWorkspaceSupplierApiEnabled(workspaceOwnerUserId: string, apiId: string, enabled: boolean) {
  const updated = await getDb().update(otpSupplierApis).set({ enabled, updatedAt: new Date().toISOString() }).where(and(
    eq(otpSupplierApis.id, apiId),
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    isNull(otpSupplierApis.deletedAt),
  )).returning({ id: otpSupplierApis.id });
  if (!updated[0]) throw new Error("API não encontrada.");
}

export async function deleteWorkspaceSupplierApi(workspaceOwnerUserId: string, apiId: string, options?: { closeOpenOrders?: boolean }) {
  const db = getDb();
  const [api] = await db.select().from(otpSupplierApis).where(and(
    eq(otpSupplierApis.id, apiId),
    eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId),
    isNull(otpSupplierApis.deletedAt),
  )).limit(1);
  if (!api) throw new Error("API não encontrada.");
  const [open] = await db.select({ total: count() }).from(otpInbox).where(and(
    eq(otpInbox.workspaceOwnerUserId, workspaceOwnerUserId),
    eq(otpInbox.supplierApiId, apiId),
    eq(otpInbox.closed, 0),
  ));
  const openOrders = Number(open?.total || 0);
  if (openOrders > 0 && !options?.closeOpenOrders) throw new Error("Esta API ainda possui pedidos abertos. Encerre os pedidos ou confirme a exclusão forçada.");
  const closedOrders = openOrders > 0 ? await closeOpenInboxBySupplierApi(workspaceOwnerUserId, apiId) : 0;
  const now = new Date().toISOString();
  await db.update(otpSupplierApis).set({
    enabled: false,
    keyCiphertext: "",
    keyIv: "",
    deletedAt: now,
    updatedAt: now,
  }).where(and(eq(otpSupplierApis.id, apiId), eq(otpSupplierApis.workspaceOwnerUserId, workspaceOwnerUserId)));
  if (api.isPrimary) {
    await getWallet(workspaceOwnerUserId);
    await db.update(otpWallets).set({ supplierCiphertext: null, supplierIv: null, updatedAt: now }).where(eq(otpWallets.workspaceOwnerUserId, workspaceOwnerUserId));
  }
  return { id: api.id, name: api.name, closedOrders };
}

export async function saveWorkspaceSupplierKey(workspaceOwnerUserId: string, apiKey: string) {
  const key = apiKey.trim();
  if (!key) throw new Error("Cole a chave da API.");
  await getWallet(workspaceOwnerUserId);
  const packed = await encryptToken(key);
  const now = new Date().toISOString();
  await getDb().update(otpWallets).set({
    supplierCiphertext: packed.ciphertext,
    supplierIv: packed.iv,
    updatedAt: now,
  }).where(eq(otpWallets.workspaceOwnerUserId, workspaceOwnerUserId));
  const primary = await ensureLegacySupplierApi(workspaceOwnerUserId, "maykikelvin09@gmail.com");
  if (primary) {
    await getDb().update(otpSupplierApis).set({
      keyCiphertext: packed.ciphertext,
      keyIv: packed.iv,
      enabled: true,
      updatedAt: now,
    }).where(eq(otpSupplierApis.id, primary.id));
  }
}

export async function getWallet(workspaceOwnerUserId: string) {
  const db = getDb();
  const [row] = await db.select().from(otpWallets).where(eq(otpWallets.workspaceOwnerUserId, workspaceOwnerUserId)).limit(1);
  if (row) return row;
  await db.insert(otpWallets).values({ workspaceOwnerUserId, balanceCents: 0 }).onConflictDoNothing();
  const [created] = await db.select().from(otpWallets).where(eq(otpWallets.workspaceOwnerUserId, workspaceOwnerUserId)).limit(1);
  return created || { workspaceOwnerUserId, balanceCents: 0, billingMode: null, supplierCiphertext: null, supplierIv: null, updatedAt: new Date().toISOString() };
}

export async function adjustWalletBalance(input: { workspaceOwnerUserId: string; actorUserId: string; amountCents: number; summary: string }) {
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 5_000_000) throw new Error("Valor de ajuste inválido.");
  await getWallet(input.workspaceOwnerUserId);
  const now = new Date().toISOString();
  const updated = amount > 0
    ? await getDb().update(otpWallets).set({ balanceCents: sql`${otpWallets.balanceCents} + ${amount}`, updatedAt: now }).where(eq(otpWallets.workspaceOwnerUserId, input.workspaceOwnerUserId)).returning({ balanceCents: otpWallets.balanceCents })
    : await getDb().update(otpWallets).set({ balanceCents: sql`${otpWallets.balanceCents} + ${amount}`, updatedAt: now }).where(and(eq(otpWallets.workspaceOwnerUserId, input.workspaceOwnerUserId), gte(otpWallets.balanceCents, Math.abs(amount)))).returning({ balanceCents: otpWallets.balanceCents });
  if (!updated[0]) throw new Error("O saldo não pode ficar negativo.");
  await writeLedger({ workspaceOwnerUserId: input.workspaceOwnerUserId, actorUserId: input.actorUserId, type: amount > 0 ? "credit_manual" : "debit_manual", amountCents: amount, balanceAfterCents: updated[0].balanceCents, summary: input.summary });
  return updated[0];
}

async function writeLedger(input: { workspaceOwnerUserId: string; actorUserId: string; type: string; amountCents: number; balanceAfterCents: number; refId?: string | null; summary: string }) {
  await getDb().insert(otpLedger).values({
    id: crypto.randomUUID(),
    workspaceOwnerUserId: input.workspaceOwnerUserId,
    actorUserId: input.actorUserId,
    type: input.type,
    amountCents: input.amountCents,
    balanceAfterCents: input.balanceAfterCents,
    refId: input.refId || null,
    summary: input.summary.slice(0, 240),
  });
}

export async function creditWallet(input: { workspaceOwnerUserId: string; actorUserId: string; amountCents: number; type: "credit_pix" | "credit_manual" | "refund_order"; refId?: string | null; summary: string }) {
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor de crédito inválido.");
  await getWallet(input.workspaceOwnerUserId);
  const now = new Date().toISOString();
  await getDb().update(otpWallets).set({
    balanceCents: sql`${otpWallets.balanceCents} + ${amount}`,
    updatedAt: now,
  }).where(eq(otpWallets.workspaceOwnerUserId, input.workspaceOwnerUserId));
  const wallet = await getWallet(input.workspaceOwnerUserId);
  await writeLedger({ ...input, amountCents: amount, balanceAfterCents: wallet.balanceCents, refId: input.refId, summary: input.summary });
  return wallet;
}

export async function debitWallet(input: { workspaceOwnerUserId: string; actorUserId: string; amountCents: number; refId?: string | null; summary: string }) {
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor de débito inválido.");
  await getWallet(input.workspaceOwnerUserId);
  const now = new Date().toISOString();
  const updated = await getDb().update(otpWallets).set({
    balanceCents: sql`${otpWallets.balanceCents} - ${amount}`,
    updatedAt: now,
  }).where(and(eq(otpWallets.workspaceOwnerUserId, input.workspaceOwnerUserId), gte(otpWallets.balanceCents, amount))).returning({ balanceCents: otpWallets.balanceCents });
  if (!updated[0]) throw new Error(`Saldo insuficiente. Recarregue com PIX. Cada Gmail custa ${formatBrl(amount)}.`);
  await writeLedger({ workspaceOwnerUserId: input.workspaceOwnerUserId, actorUserId: input.actorUserId, type: "debit_order", amountCents: amount, balanceAfterCents: updated[0].balanceCents, refId: input.refId, summary: input.summary });
  return updated[0];
}

export async function refundWallet(input: { workspaceOwnerUserId: string; actorUserId: string; amountCents: number; refId?: string | null; summary: string }) {
  return creditWallet({ ...input, type: "refund_order", summary: input.summary });
}

export async function recentLedger(workspaceOwnerUserId: string, limit = 12) {
  return getDb().select().from(otpLedger).where(eq(otpLedger.workspaceOwnerUserId, workspaceOwnerUserId)).orderBy(desc(otpLedger.createdAt)).limit(limit);
}

const BRAVO_HOST = "https://bravopay.club/api/v1";

function bravoStatus(value?: string) {
  return String(value || "").trim().toUpperCase();
}

async function bravoFetch(path: string, init: RequestInit = {}) {
  const key = await getLegacyBravoPayApiKey();
  if (!key) throw new Error("Pagamento ainda não está disponível.");
  const response = await fetch(`${BRAVO_HOST}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { payload = { message: text.slice(0, 180) }; }
  return { response, payload };
}

type BravoTransaction = {
  id?: string;
  status?: string;
  amount_cents?: number;
  pix?: { copy_paste?: string; qr_code?: string; expires_at?: string };
  paid_at?: string | null;
};

async function fetchBravoTransaction(providerPaymentId: string) {
  const direct = await bravoFetch(`/transactions/${encodeURIComponent(providerPaymentId)}`);
  if (direct.response.ok && direct.payload.id) return direct.payload as BravoTransaction;
  const listed = await bravoFetch(`/transactions?limit=20`);
  const rows = Array.isArray(listed.payload.data) ? listed.payload.data as BravoTransaction[] : Array.isArray(listed.payload) ? listed.payload as BravoTransaction[] : [];
  return rows.find((item) => item.id === providerPaymentId) || null;
}

async function createLegacyBravoPixCharge(input: { workspaceOwnerUserId: string; actorUserId: string; email: string; name?: string; amountCents: number }, settings: OtpSettingsRow) {
  const id = crypto.randomUUID();
  const gmailCount = Math.max(1, Math.floor(input.amountCents / Math.max(1, settings.priceCents)));
  const { response, payload } = await bravoFetch("/transactions", {
    method: "POST",
    headers: { "Idempotency-Key": id },
    body: JSON.stringify({
      amount_cents: input.amountCents,
      method: "pix",
      description: "Resolvflow créditos",
      external_reference: id,
      expires_in: 1800,
      customer: { email: input.email, name: (input.name || input.email.split("@")[0] || "Cliente").slice(0, 80) },
      metadata: { workspace: input.workspaceOwnerUserId },
    }),
  });
  const pix = payload.pix && typeof payload.pix === "object" ? payload.pix as { copy_paste?: string; qr_code?: string } : {};
  const copy = String(pix.copy_paste || pix.qr_code || "").trim();
  if (!response.ok || !payload.id || !copy) throw new Error("Não foi possível gerar o PIX.");
  const paid = bravoStatus(String(payload.status)) === "PAID";
  await getDb().insert(otpPayments).values({
    id,
    workspaceOwnerUserId: input.workspaceOwnerUserId,
    actorUserId: input.actorUserId,
    provider: "bravopay",
    providerPaymentId: String(payload.id),
    amountCents: input.amountCents,
    gmailCount,
    status: paid ? "pending" : "pending",
    qrCode: copy,
    ticketUrl: null,
  });
  if (paid) await applyApprovedPix(String(payload.id), "bravopay");
  return { id, amountCents: input.amountCents, gmailCount, status: paid ? "paid" : "pending", qrCode: copy, ticketUrl: "", priceLabel: formatBrl(input.amountCents) };
}

export async function createPixCharge(input: { workspaceOwnerUserId: string; actorUserId: string; email: string; name?: string; customerDocument: string; amountCents: number }) {
  const settings = await getOtpSettingsRow();
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < settings.minDepositCents) {
    throw new Error(`Depósito mínimo ${formatBrl(settings.minDepositCents)}.`);
  }
  if (amountCents < 500) throw new Error("O PIX mínimo da operadora é R$ 5,00.");
  if (amountCents > 500_000) throw new Error("Valor acima do limite.");
  if (!runtimeEnv().LEZTYPAY_API_KEY?.trim()) return createLegacyBravoPixCharge({ ...input, amountCents }, settings);
  const customerDocument = String(input.customerDocument || "").replace(/\D/g, "");
  if (![11, 14].includes(customerDocument.length)) throw new Error("Informe um CPF ou CNPJ válido para gerar o PIX.");
  const apiKey = await getPixApiKey();
  if (!apiKey) throw new Error("Pagamento PIX ainda não está disponível.");
  const id = crypto.randomUUID();
  const idempotencyKey = `pix.${id}`;
  const gmailCount = Math.max(1, Math.floor(amountCents / Math.max(1, settings.priceCents)));
  await getDb().insert(otpPayments).values({
    id,
    workspaceOwnerUserId: input.workspaceOwnerUserId,
    actorUserId: input.actorUserId,
    provider: "leztypay",
    providerPaymentId: null,
    amountCents,
    gmailCount,
    status: "creating",
    qrCode: null,
    ticketUrl: null,
  });
  try {
    const { payload } = await createLeztyPixTransaction({
      apiKey,
      idempotencyKey,
      amountCents,
      customer: {
        email: input.email,
        name: (input.name || input.email.split("@")[0] || "Cliente").trim().slice(0, 120),
        document: customerDocument,
      },
      metadata: { workspace: input.workspaceOwnerUserId, payment_id: id },
      postbackUrl: "https://resolvflow.online/api/otp/pix/webhook",
    });
    const copy = String(payload.pix?.payload || "").trim();
    const state = leztyPaymentState(payload.status);
    if (!payload.id || !copy || state === "failed") throw new Error("A Lezty Pay não devolveu um PIX válido.");
    await getDb().update(otpPayments).set({
      providerPaymentId: payload.id,
      status: state === "paid" ? "pending" : state,
      qrCode: copy,
      ticketUrl: null,
      paidAt: null,
    }).where(eq(otpPayments.id, id));
    if (state === "paid") await applyApprovedPix(payload.id, "leztypay");
    return {
      id,
      amountCents,
      gmailCount,
      status: state,
      qrCode: copy,
      ticketUrl: "",
      priceLabel: formatBrl(amountCents),
    };
  } catch (error) {
    await getDb().update(otpPayments).set({ status: "failed" }).where(eq(otpPayments.id, id));
    throw error;
  }
}

export async function applyApprovedPix(providerPaymentId: string, provider?: string) {
  const db = getDb();
  const paymentFilter = provider
    ? and(eq(otpPayments.provider, provider), eq(otpPayments.providerPaymentId, providerPaymentId))
    : eq(otpPayments.providerPaymentId, providerPaymentId);
  const [payment] = await db.select().from(otpPayments).where(paymentFilter).limit(1);
  if (!payment) return { applied: false, reason: "not_found" as const };
  if (payment.status === "paid") return { applied: false, reason: "already_paid" as const, payment };
  const now = new Date().toISOString();
  const updated = await db.update(otpPayments).set({ status: "paid", paidAt: now }).where(and(eq(otpPayments.id, payment.id), eq(otpPayments.status, "pending"))).returning({ id: otpPayments.id });
  if (!updated[0]) return { applied: false, reason: "already_paid" as const, payment };
  await creditWallet({
    workspaceOwnerUserId: payment.workspaceOwnerUserId,
    actorUserId: payment.actorUserId,
    amountCents: payment.amountCents,
    type: "credit_pix",
    refId: providerPaymentId,
    summary: `PIX confirmado · ${formatBrl(payment.amountCents)}`,
  });
  return { applied: true, reason: "paid" as const, payment };
}

export async function refreshPixPayment(paymentId: string, workspaceOwnerUserId: string) {
  const db = getDb();
  const [payment] = await db.select().from(otpPayments).where(and(eq(otpPayments.id, paymentId), eq(otpPayments.workspaceOwnerUserId, workspaceOwnerUserId))).limit(1);
  if (!payment) throw new Error("Pagamento não encontrado.");
  if (payment.status === "paid") return { ...payment, priceLabel: formatBrl(payment.amountCents) };
  if (!payment.providerPaymentId) throw new Error("Pagamento sem identificador.");
  if (payment.provider === "leztypay") {
    const apiKey = await getPixApiKey();
    const { payload: tx } = await getLeztyTransaction(apiKey, payment.providerPaymentId);
    const state = leztyPaymentState(tx.status);
    if (state === "paid") {
      await applyApprovedPix(payment.providerPaymentId, "leztypay");
      const [fresh] = await db.select().from(otpPayments).where(eq(otpPayments.id, payment.id)).limit(1);
      return { ...(fresh || payment), status: "paid", priceLabel: formatBrl(payment.amountCents) };
    }
    if (state !== "pending") await db.update(otpPayments).set({ status: state }).where(and(eq(otpPayments.id, payment.id), sql`${otpPayments.status} != 'paid'`));
    return { ...payment, status: state, priceLabel: formatBrl(payment.amountCents) };
  }
  const tx = await fetchBravoTransaction(payment.providerPaymentId);
  if (tx && bravoStatus(tx.status) === "PAID") {
    await applyApprovedPix(payment.providerPaymentId);
    const [fresh] = await db.select().from(otpPayments).where(eq(otpPayments.id, payment.id)).limit(1);
    return { ...(fresh || payment), status: "paid", priceLabel: formatBrl(payment.amountCents) };
  }
  if (tx && bravoStatus(tx.status) === "EXPIRED") {
    await db.update(otpPayments).set({ status: "expired" }).where(and(eq(otpPayments.id, payment.id), eq(otpPayments.status, "pending")));
    return { ...payment, status: "expired", priceLabel: formatBrl(payment.amountCents) };
  }
  return { ...payment, priceLabel: formatBrl(payment.amountCents) };
}

export async function settleBravoPayNotification(providerPaymentId: string) {
  const id = String(providerPaymentId || "").trim();
  if (!id) return { applied: false, reason: "missing_id" as const };
  const tx = await fetchBravoTransaction(id);
  if (!tx?.id) return { applied: false, reason: "lookup_failed" as const };
  if (bravoStatus(tx.status) !== "PAID") return { applied: false, reason: "not_paid" as const };
  return applyApprovedPix(String(tx.id));
}

export async function processLeztyWebhookEvent(eventId: string) {
  const db = getDb();
  const [event] = await db.select().from(otpPixWebhookEvents).where(eq(otpPixWebhookEvents.eventId, eventId)).limit(1);
  if (!event || event.status === "processed") return { applied: false, reason: event ? "already_processed" as const : "not_found" as const };
  try {
    const apiKey = await getPixApiKey();
    const { payload: transaction } = await getLeztyTransaction(apiKey, event.providerPaymentId);
    const state = leztyPaymentState(transaction.status);
    let result: Awaited<ReturnType<typeof applyApprovedPix>> | { applied: false; reason: "not_paid" } = { applied: false, reason: "not_paid" };
    if (state === "paid") {
      result = await applyApprovedPix(transaction.id, "leztypay");
    } else {
      await db.update(otpPayments).set({ status: state }).where(and(
        eq(otpPayments.provider, "leztypay"),
        eq(otpPayments.providerPaymentId, transaction.id),
        sql`${otpPayments.status} != 'paid'`,
      ));
    }
    await db.update(otpPixWebhookEvents).set({ status: "processed", processedAt: new Date().toISOString(), lastError: null }).where(eq(otpPixWebhookEvents.eventId, eventId));
    return result;
  } catch (error) {
    await db.update(otpPixWebhookEvents).set({ status: "failed", lastError: "Falha ao reconciliar cobrança." }).where(eq(otpPixWebhookEvents.eventId, eventId));
    throw error;
  }
}

export async function settleMercadoPagoNotification(providerPaymentId: string) {
  return settleBravoPayNotification(providerPaymentId);
}
