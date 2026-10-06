export type OtpMetricsScope = "global" | "user";

// Every query returns one aggregate row. Scope fragments are fixed SQL, never user input.
export function otpMetricsQueries(scope: OtpMetricsScope, bounded: boolean) {
  const paymentScope = scope === "user" ? " AND workspace_owner_user_id = ? AND actor_user_id = ?" : "";
  const ledgerScope = scope === "user" ? " AND workspace_owner_user_id = ? AND actor_user_id = ?" : "";
  const inboxScope = scope === "user" ? " AND workspace_owner_user_id = ? AND account_user_id = ?" : "";
  const codeScope = scope === "user" ? " AND i.workspace_owner_user_id = ? AND i.account_user_id = ?" : "";
  return {
    payments: `SELECT COALESCE(SUM(amount_cents), 0) AS amount FROM otp_payments
      WHERE status = 'paid' AND paid_at IS NOT NULL
      ${bounded ? "AND datetime(paid_at) >= datetime(?) AND datetime(paid_at) <= datetime(?)" : ""}${paymentScope}`,
    consumption: `SELECT COALESCE(SUM(CASE type WHEN 'debit_order' THEN amount_cents WHEN 'refund_order' THEN -amount_cents ELSE 0 END), 0) AS amount
      FROM otp_ledger WHERE type IN ('debit_order', 'refund_order')
      ${bounded ? "AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)" : ""}${ledgerScope}`,
    orders: `SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN supplier_api_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS own,
      COALESCE(SUM(CASE WHEN supplier_api_id IS NULL THEN 1 ELSE 0 END), 0) AS global_or_legacy
      FROM otp_inbox WHERE 1 = 1
      ${bounded ? "AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)" : ""}${inboxScope}`,
    codes: `SELECT COUNT(*) AS total FROM otp_inbox i
      JOIN json_each(CASE WHEN json_valid(i.codes_json) THEN
        CASE WHEN json_type(i.codes_json) = 'array' THEN i.codes_json ELSE '[]' END ELSE '[]' END) c
      WHERE TRIM(COALESCE(CASE WHEN c.type = 'object' THEN json_extract(c.value, '$.code') END, '')) <> ''
      ${bounded ? "AND datetime(CASE WHEN c.type = 'object' THEN json_extract(c.value, '$.at') END) >= datetime(?) AND datetime(CASE WHEN c.type = 'object' THEN json_extract(c.value, '$.at') END) <= datetime(?)" : ""}${codeScope}`,
    open: `SELECT COUNT(*) AS total FROM otp_inbox WHERE closed = 0${inboxScope}`,
    balance: scope === "user"
      ? "SELECT COALESCE(balance_cents, 0) AS amount FROM otp_wallets WHERE workspace_owner_user_id = ?"
      : "SELECT COALESCE(SUM(balance_cents), 0) AS amount FROM otp_wallets",
    members: "SELECT COUNT(*) AS total FROM workspace_members WHERE workspace_owner_user_id = ? AND status = 'active'",
  };
}

export function toOtpMetrics(input: {
  payments: number; consumption: number; orders: number; ownOrders: number; globalOrLegacyOrders: number;
  codes: number; open: number; balance: number; activeMembers?: number;
}) {
  const number = (value: number) => Number(value) || 0;
  return {
    pixDepositsCents: number(input.payments),
    walletConsumptionCents: number(input.consumption),
    gmailCount: number(input.orders),
    ownApiGmailCount: number(input.ownOrders),
    globalOrLegacyGmailCount: number(input.globalOrLegacyOrders),
    codesReceived: number(input.codes),
    openOrders: number(input.open),
    walletBalanceCents: number(input.balance),
    sharedWallet: number(input.activeMembers || 0) > 1,
  };
}
