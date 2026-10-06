import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { otpInbox, otpInboxState, otpSupplierApis } from "../db/schema";
import { applyInboxVisibilityChange, buildInboxInsertRecord, maskCustomerInboxOrder, type InboxOrderInput } from "./otp-inbox-record";

export type OtpInboxPublic = {
  inboxId: string;
  order_id: string;
  email: string;
  product: string;
  status: string;
  price: string;
  codes: Array<{ code: string; at: string }>;
  closed: boolean;
  hidden: boolean;
  savedAt: string;
  supplierApiId: string | null;
  supplierApiName: string;
};

function parseCodes(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Array<{ code?: string; at?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.code).map((item) => ({ code: String(item.code), at: String(item.at || "") }));
  } catch {
    return [];
  }
}

function toPublic(row: typeof otpInbox.$inferSelect, supplierApiName = "API principal"): OtpInboxPublic {
  return {
    inboxId: row.id,
    order_id: row.orderId,
    email: row.email,
    product: row.product,
    status: row.status,
    price: row.price,
    codes: parseCodes(row.codesJson),
    closed: Boolean(row.closed),
    hidden: Boolean(row.hiddenAt),
    savedAt: row.createdAt,
    supplierApiId: row.supplierApiId || null,
    supplierApiName,
  };
}

export async function listInbox(accountUserId: string, supplierApiId?: string | null) {
  const db = getDb();
  const inboxWhere = supplierApiId
    ? and(eq(otpInbox.accountUserId, accountUserId), eq(otpInbox.supplierApiId, supplierApiId))
    : eq(otpInbox.accountUserId, accountUserId);
  const [openRows, closedRows, state] = await Promise.all([
    db.select({ inbox: otpInbox, supplierApiName: otpSupplierApis.name }).from(otpInbox)
      .leftJoin(otpSupplierApis, eq(otpInbox.supplierApiId, otpSupplierApis.id))
      .where(and(inboxWhere, eq(otpInbox.closed, 0))).orderBy(desc(otpInbox.createdAt)),
    db.select({ inbox: otpInbox, supplierApiName: otpSupplierApis.name }).from(otpInbox)
      .leftJoin(otpSupplierApis, eq(otpInbox.supplierApiId, otpSupplierApis.id))
      .where(and(inboxWhere, eq(otpInbox.closed, 1))).orderBy(desc(otpInbox.createdAt)),
    db.select().from(otpInboxState).where(eq(otpInboxState.accountUserId, accountUserId)).limit(1),
  ]);
  const rows = [...openRows, ...closedRows].sort((a, b) => b.inbox.createdAt.localeCompare(a.inbox.createdAt));
  const orders = rows.map((item) => toPublic(item.inbox, item.supplierApiName || "API principal"));
  const activeId = state[0]?.activeOrderId && orders.some((item) => !item.hidden && item.order_id === state[0].activeOrderId && (!state[0].activeSupplierApiId || item.supplierApiId === state[0].activeSupplierApiId))
    ? state[0].activeOrderId
    : orders.find((item) => !item.hidden)?.order_id || null;
  const activeSupplierApiId = activeId === state[0]?.activeOrderId
    ? state[0]?.activeSupplierApiId || orders.find((item) => item.order_id === activeId)?.supplierApiId || null
    : orders.find((item) => !item.hidden)?.supplierApiId || null;
  return { orders, activeId, activeSupplierApiId };
}

export function customerInbox(inbox: Awaited<ReturnType<typeof listInbox>>) {
  return {
    ...inbox,
    activeSupplierApiId: null,
    orders: inbox.orders.map(maskCustomerInboxOrder),
  };
}

export async function listOpenInbox(accountUserId: string, supplierApiId?: string | null) {
  const inboxWhere = supplierApiId
    ? and(eq(otpInbox.accountUserId, accountUserId), eq(otpInbox.supplierApiId, supplierApiId), eq(otpInbox.closed, 0), isNull(otpInbox.hiddenAt))
    : and(eq(otpInbox.accountUserId, accountUserId), eq(otpInbox.closed, 0), isNull(otpInbox.hiddenAt));
  const rows = await getDb().select({ inbox: otpInbox, supplierApiName: otpSupplierApis.name }).from(otpInbox)
    .leftJoin(otpSupplierApis, eq(otpInbox.supplierApiId, otpSupplierApis.id))
    .where(inboxWhere).orderBy(desc(otpInbox.createdAt));
  return rows.map((item) => toPublic(item.inbox, item.supplierApiName || "API principal"));
}

export async function countOpenInboxBySupplierApi(accountUserId: string, workspaceOwnerUserId?: string) {
  const rows = await getDb().select({ supplierApiId: otpInbox.supplierApiId, quantity: count() }).from(otpInbox).where(and(
    eq(otpInbox.accountUserId, accountUserId),
    workspaceOwnerUserId ? eq(otpInbox.workspaceOwnerUserId, workspaceOwnerUserId) : undefined,
    eq(otpInbox.closed, 0),
  )).groupBy(otpInbox.supplierApiId);
  return new Map(rows.map((row) => [row.supplierApiId || "legacy", Number(row.quantity) || 0]));
}

const ownedMemo = new Map<string, { exp: number; row: typeof otpInbox.$inferSelect | null }>();

export async function getOwnedInboxOrder(accountUserId: string, orderId: string, supplierApiId?: string | null) {
  const key = `${accountUserId}:${supplierApiId || "legacy"}:${orderId}`;
  const memo = ownedMemo.get(key);
  if (memo && memo.exp > Date.now()) return memo.row;
  const conditions = [eq(otpInbox.accountUserId, accountUserId), eq(otpInbox.orderId, orderId)];
  if (supplierApiId) conditions.push(eq(otpInbox.supplierApiId, supplierApiId));
  const [row] = await getDb().select().from(otpInbox).where(and(...conditions)).limit(1);
  const next = row || null;
  if (ownedMemo.size > 300) ownedMemo.clear();
  ownedMemo.set(key, { exp: Date.now() + 20_000, row: next });
  return next;
}

export async function getOwnedInboxOrderById(accountUserId: string, inboxId: string) {
  const [row] = await getDb().select().from(otpInbox).where(and(
    eq(otpInbox.accountUserId, accountUserId),
    eq(otpInbox.id, inboxId),
  )).limit(1);
  return row || null;
}

export async function setInboxHidden(accountUserId: string, inboxId: string, hidden: boolean) {
  const row = await getOwnedInboxOrderById(accountUserId, inboxId);
  if (!row) return { state: "missing" as const };
  const now = new Date().toISOString();
  return applyInboxVisibilityChange(row, hidden, async () => {
    await getDb().update(otpInbox).set({ hiddenAt: hidden ? now : null, updatedAt: now }).where(and(
      eq(otpInbox.id, inboxId),
      eq(otpInbox.accountUserId, accountUserId),
      eq(otpInbox.closed, 1),
    ));
  });
}

export async function setActiveInboxOrder(accountUserId: string, orderId: string | null, supplierApiId?: string | null) {
  const now = new Date().toISOString();
  await getDb().insert(otpInboxState).values({
    accountUserId,
    activeOrderId: orderId,
    activeSupplierApiId: supplierApiId || null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: otpInboxState.accountUserId,
    set: { activeOrderId: orderId, activeSupplierApiId: supplierApiId || null, updatedAt: now },
  });
}

export async function upsertInboxOrder(input: InboxOrderInput) {
  const now = new Date().toISOString();
  const existing = await getOwnedInboxOrder(input.accountUserId, input.orderId, input.supplierApiId);
  if (existing) {
    await getDb().update(otpInbox).set({
      email: input.email,
      product: input.product,
      status: input.status || existing.status,
      price: input.price ?? existing.price,
      supplierApiId: input.supplierApiId || existing.supplierApiId,
      updatedAt: now,
    }).where(eq(otpInbox.id, existing.id));
  } else {
    await getDb().insert(otpInbox).values(buildInboxInsertRecord(input, crypto.randomUUID(), now));
  }
  await setActiveInboxOrder(input.accountUserId, input.orderId, input.supplierApiId);
  ownedMemo.delete(`${input.accountUserId}:${input.supplierApiId || "legacy"}:${input.orderId}`);
}

export async function appendInboxCode(accountUserId: string, orderId: string, code: string, supplierApiId?: string | null) {
  const row = await getOwnedInboxOrder(accountUserId, orderId, supplierApiId);
  if (!row) return null;
  const codes = parseCodes(row.codesJson);
  if (codes.some((item) => item.code === code)) return toPublic(row);
  const next = [{ code, at: new Date().toISOString() }, ...codes].slice(0, 20);
  const now = new Date().toISOString();
  await getDb().update(otpInbox).set({
    codesJson: JSON.stringify(next),
    updatedAt: now,
  }).where(eq(otpInbox.id, row.id));
  ownedMemo.set(`${accountUserId}:${supplierApiId || "legacy"}:${orderId}`, { exp: Date.now() + 20_000, row: { ...row, codesJson: JSON.stringify(next), updatedAt: now } });
  return toPublic({ ...row, codesJson: JSON.stringify(next), updatedAt: now });
}

export async function markInboxClosed(accountUserId: string, orderId: string, supplierApiId?: string | null) {
  const row = await getOwnedInboxOrder(accountUserId, orderId, supplierApiId);
  if (!row) return null;
  const now = new Date().toISOString();
  await getDb().update(otpInbox).set({ closed: 1, status: "closed", updatedAt: now }).where(eq(otpInbox.id, row.id));
  ownedMemo.set(`${accountUserId}:${supplierApiId || "legacy"}:${orderId}`, { exp: Date.now() + 20_000, row: { ...row, closed: 1, status: "closed", updatedAt: now } });
  return toPublic({ ...row, closed: 1, status: "closed", updatedAt: now });
}

export async function closeOpenInboxBySupplierApi(workspaceOwnerUserId: string, supplierApiId: string) {
  const now = new Date().toISOString();
  const closed = await getDb().update(otpInbox).set({
    closed: 1,
    status: "closed",
    updatedAt: now,
  }).where(and(
    eq(otpInbox.workspaceOwnerUserId, workspaceOwnerUserId),
    eq(otpInbox.supplierApiId, supplierApiId),
    eq(otpInbox.closed, 0),
  )).returning({ id: otpInbox.id });
  ownedMemo.clear();
  return closed.length;
}
