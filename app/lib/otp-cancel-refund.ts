type RefundStatement = {
  run(): Promise<{ meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
};

export type CancelRefundDatabase = {
  prepare(query: string): { bind(...values: unknown[]): RefundStatement };
  batch(statements: RefundStatement[]): Promise<unknown>;
};

export type CancelRefundInput = {
  workspaceOwnerUserId: string;
  actorUserId: string;
  amountCents: number;
  orderId: string;
  summary: string;
  guard?: { inboxId: string; accountUserId: string };
};

export const OTP_GMAIL_EMPTY_CODES = `CASE WHEN json_valid(i.codes_json) THEN
  json_type(i.codes_json) = 'array' AND json_array_length(i.codes_json) = 0 ELSE 0 END`;
export const OTP_GMAIL_ORDER_HAS_NO_CODES = `NOT EXISTS (
  SELECT 1 FROM otp_inbox sibling WHERE sibling.order_id = i.order_id
    AND sibling.supplier_api_id IS NULL AND NOT (CASE WHEN json_valid(sibling.codes_json) THEN
      json_type(sibling.codes_json) = 'array' AND json_array_length(sibling.codes_json) = 0 ELSE 0 END)
)`;
const INBOX_GUARD = `EXISTS (SELECT 1 FROM otp_inbox i
  WHERE i.id = ? AND i.account_user_id = ? AND i.workspace_owner_user_id = ?
    AND i.order_id = ? AND i.order_id GLOB 'og_*' AND i.supplier_api_id IS NULL
    AND i.closed = 0 AND (${OTP_GMAIL_EMPTY_CODES}) AND ${OTP_GMAIL_ORDER_HAS_NO_CODES})`;

function guardValues(input: Pick<CancelRefundInput, "guard" | "actorUserId" | "workspaceOwnerUserId" | "orderId">) {
  if (!input.guard || input.guard.accountUserId !== input.actorUserId) throw new Error("Conta inválida para devolução.");
  return [input.guard.inboxId, input.guard.accountUserId, input.workspaceOwnerUserId, input.orderId];
}

// Snapshot all duplicate targets before closing the selected row invalidates its guard.
function guardedClose(db: CancelRefundDatabase, input: Pick<CancelRefundInput, "guard" | "actorUserId" | "workspaceOwnerUserId" | "orderId">, now: string, settled = false) {
  return db.prepare(`WITH targets AS MATERIALIZED (
    SELECT id FROM otp_inbox WHERE account_user_id = ? AND order_id = ?
      AND supplier_api_id IS NULL AND closed = 0 AND ${INBOX_GUARD}
      ${settled ? "AND EXISTS (SELECT 1 FROM otp_ledger WHERE id = ? AND workspace_owner_user_id = ? AND balance_after_cents >= 0)" : ""}
  ) UPDATE otp_inbox SET closed = 1, status = 'closed', updated_at = ?
    WHERE id IN (SELECT id FROM targets)`)
    .bind(input.actorUserId, input.orderId, ...guardValues(input),
      ...(settled ? [`otp-cancel:${input.orderId}`, input.workspaceOwnerUserId] : []), now);
}

export async function closeGuardedCancelledGmail(db: CancelRefundDatabase, input: Pick<CancelRefundInput, "guard" | "actorUserId" | "workspaceOwnerUserId" | "orderId">) {
  const result = await guardedClose(db, input, new Date().toISOString()).run();
  return (result.meta?.changes || 0) > 0;
}

async function applyGuardedRefund(db: CancelRefundDatabase, input: CancelRefundInput, amount: number, id: string, now: string) {
  const values = guardValues(input);
  const results = await db.batch([
    db.prepare(`SELECT ${INBOX_GUARD} AS eligible`).bind(...values),
    db.prepare(`INSERT INTO otp_ledger (id, workspace_owner_user_id, actor_user_id, type, amount_cents, balance_after_cents, ref_id, summary, created_at)
      SELECT ?, ?, ?, 'refund_order', ?, -1, ?, ?, ? WHERE ${INBOX_GUARD}
      ON CONFLICT(id) DO NOTHING`).bind(id, input.workspaceOwnerUserId, input.actorUserId, amount, input.orderId, input.summary.slice(0, 240), now, ...values),
    db.prepare(`UPDATE otp_wallets SET balance_cents = balance_cents + (
        SELECT amount_cents FROM otp_ledger WHERE id = ? AND workspace_owner_user_id = ? AND balance_after_cents = -1
      ), updated_at = ? WHERE workspace_owner_user_id = ? AND ${INBOX_GUARD}
      AND EXISTS (SELECT 1 FROM otp_ledger WHERE id = ? AND workspace_owner_user_id = ? AND balance_after_cents = -1)`)
      .bind(id, input.workspaceOwnerUserId, now, input.workspaceOwnerUserId, ...values, id, input.workspaceOwnerUserId),
    // Identical eligibility plus wallet existence means the previous statement credited it.
    db.prepare(`UPDATE otp_ledger SET balance_after_cents = (
        SELECT balance_cents FROM otp_wallets WHERE workspace_owner_user_id = ?
      ) WHERE id = ? AND workspace_owner_user_id = ? AND balance_after_cents = -1
      AND ${INBOX_GUARD} AND EXISTS (SELECT 1 FROM otp_wallets WHERE workspace_owner_user_id = ?)`)
      .bind(input.workspaceOwnerUserId, id, input.workspaceOwnerUserId, ...values, input.workspaceOwnerUserId),
    guardedClose(db, input, now, true),
    db.prepare(`SELECT amount_cents AS amountCents, balance_after_cents AS balanceAfterCents
      FROM otp_ledger WHERE id = ? AND workspace_owner_user_id = ?`).bind(id, input.workspaceOwnerUserId),
  ]) as Array<{ meta?: { changes?: number }; results?: Array<{ eligible?: number; amountCents?: number; balanceAfterCents?: number }> }>;
  if (results[0].results?.[0]?.eligible !== 1) return { refundedCents: 0, balanceCents: null, already: false, skipped: true };
  const after = results[5].results?.[0];
  if (!after || typeof after.balanceAfterCents !== "number" || after.balanceAfterCents < 0) throw new Error("Não foi possível devolver o saldo.");
  const credited = (results[2].meta?.changes || 0) > 0;
  return { refundedCents: credited ? after.amountCents! : 0, balanceCents: after.balanceAfterCents, already: !credited, skipped: false };
}

// The ledger id is the lock. The wallet moves only while that row still says
// the refund is unfinished (-1), and both writes share one transaction.
export async function applyOtpCancelRefund(db: CancelRefundDatabase, input: CancelRefundInput) {
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return { refundedCents: 0, balanceCents: null as number | null, already: false };
  if (!/^og_[A-Za-z0-9_-]{1,61}$/.test(input.orderId)) throw new Error("Pedido inválido para devolução.");
  const id = `otp-cancel:${input.orderId}`;
  const now = new Date().toISOString();
  if (input.guard) return applyGuardedRefund(db, input, amount, id, now);
  await db.prepare(
    `INSERT INTO otp_ledger (id, workspace_owner_user_id, actor_user_id, type, amount_cents, balance_after_cents, ref_id, summary, created_at)
     VALUES (?, ?, ?, 'refund_order', ?, -1, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).bind(id, input.workspaceOwnerUserId, input.actorUserId, amount, input.orderId, input.summary.slice(0, 240), now).run();

  const before = await db.prepare(
    `SELECT amount_cents AS amountCents, balance_after_cents AS balanceAfterCents
     FROM otp_ledger WHERE id = ? AND workspace_owner_user_id = ?`,
  ).bind(id, input.workspaceOwnerUserId).first<{ amountCents: number; balanceAfterCents: number }>();
  if (!before) throw new Error("Não foi possível reservar a devolução.");
  if (before.balanceAfterCents >= 0) return { refundedCents: 0, balanceCents: before.balanceAfterCents, already: true };

  const credit = db.prepare(
    `UPDATE otp_wallets
     SET balance_cents = balance_cents + (
       SELECT amount_cents FROM otp_ledger
       WHERE id = ? AND workspace_owner_user_id = ? AND balance_after_cents = -1
     ), updated_at = ?
     WHERE workspace_owner_user_id = ?
       AND EXISTS (
         SELECT 1 FROM otp_ledger
         WHERE id = ? AND workspace_owner_user_id = ? AND balance_after_cents = -1
       )`,
  ).bind(id, input.workspaceOwnerUserId, now, input.workspaceOwnerUserId, id, input.workspaceOwnerUserId);
  const settle = db.prepare(
    `UPDATE otp_ledger
     SET balance_after_cents = (
       SELECT balance_cents FROM otp_wallets WHERE workspace_owner_user_id = ?
     )
     WHERE id = ? AND workspace_owner_user_id = ? AND balance_after_cents = -1`,
  ).bind(input.workspaceOwnerUserId, id, input.workspaceOwnerUserId);
  await db.batch([credit, settle]);

  const after = await db.prepare(
    `SELECT amount_cents AS amountCents, balance_after_cents AS balanceAfterCents
     FROM otp_ledger WHERE id = ? AND workspace_owner_user_id = ?`,
  ).bind(id, input.workspaceOwnerUserId).first<{ amountCents: number; balanceAfterCents: number }>();
  if (!after || typeof after.balanceAfterCents !== "number" || after.balanceAfterCents < 0) {
    throw new Error("Não foi possível devolver o saldo.");
  }
  return { refundedCents: after.amountCents, balanceCents: after.balanceAfterCents, already: false };
}
