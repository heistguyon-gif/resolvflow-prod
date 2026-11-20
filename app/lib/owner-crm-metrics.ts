import { otpMetricsQueries } from "./admin-otp-metrics";
import type { CrmExchange } from "./crm-exchange";

export type CrmMetrics = {
  depositsCents: number; chargesCents: number; refundsCents: number; netChargesCents: number;
  gmailCount: number; commercialGmailCount: number; excludedGmailCount: number; ownApiGmailCount: number;
  codesReceived: number; estimatedCostUsd: number; estimatedCostBrlCents: number | null;
  estimatedResultBrlCents: number | null;
};

/** No membership join: an actor is counted across all workspaces, including old memberships.
 * Inbox duplicates are collapsed by provider origin + order id, independently of workspace.
 * The legacy inbox has no billing flag: platform/legacy is an explicit estimate, not proof of sale.
 */
export function crmMetricQueries(reliable: boolean) {
  const base = otpMetricsQueries("global", true, reliable);
  const origin = "CASE WHEN order_id GLOB 'og_*' THEN '' ELSE COALESCE(supplier_api_id,'') END";
  const identity = "COALESCE(NULLIF(i.order_id,''),i.id)";
  const knownBilling = reliable ? `CASE
    WHEN EXISTS (SELECT 1 FROM otp_order_items r JOIN otp_order_operations o ON o.id=r.operation_id
      WHERE o.account_user_id=i.account_user_id AND r.provider_order_id=i.order_id AND r.status='delivered'
      AND COALESCE(r.supplier_api_id,'')=COALESCE(i.supplier_api_id,'') AND o.unit_cents>0) THEN 1
    WHEN EXISTS (SELECT 1 FROM otp_order_items r JOIN otp_order_operations o ON o.id=r.operation_id
      WHERE o.account_user_id=i.account_user_id AND r.provider_order_id=i.order_id AND r.status='delivered'
      AND COALESCE(r.supplier_api_id,'')=COALESCE(i.supplier_api_id,'')) THEN 0
    ELSE CASE WHEN i.supplier_api_id IS NULL OR i.order_id GLOB 'og_*' THEN 1 ELSE 0 END END`
    : "CASE WHEN i.supplier_api_id IS NULL OR i.order_id GLOB 'og_*' THEN 1 ELSE 0 END";
  const inbox = `WITH actor_inbox AS (SELECT * FROM otp_inbox WHERE account_user_id=?),
    crm_inbox AS (SELECT ${origin} AS supplier_origin, ${identity} AS order_identity,
      MIN(created_at) AS created_at, MAX(${knownBilling}) AS commercial,
      MAX(CASE WHEN supplier_api_id IS NOT NULL AND order_id NOT GLOB 'og_*' THEN 1 ELSE 0 END) AS own
      FROM actor_inbox i GROUP BY ${origin},${identity})`;
  // Same delivered-item recognition as admin-otp-metrics. Reservations and failed-item
  // releases are not sales/refunds; cancellation refunds remain in the legacy ledger.
  const events = `WITH events AS (
    SELECT actor_user_id,created_at,type,amount_cents FROM otp_ledger
      WHERE type IN ('debit_order','refund_order') AND balance_after_cents >= 0
      ${reliable ? "AND id NOT LIKE 'otp-reserve:%' AND id NOT LIKE 'otp-refund:%'" : ""}
    ${reliable ? `UNION ALL SELECT o.account_user_id,i.updated_at,'debit_order',o.unit_cents
      FROM otp_order_items i JOIN otp_order_operations o ON o.id=i.operation_id WHERE i.status='delivered'` : ""}
  )`;
  return {
    deposits: `${base.payments} AND actor_user_id = ?`,
    money: `${events} SELECT
      COALESCE(SUM(CASE WHEN type='debit_order' THEN amount_cents ELSE 0 END),0) AS charges,
      COALESCE(SUM(CASE WHEN type='refund_order' THEN amount_cents ELSE 0 END),0) AS refunds
      FROM events WHERE actor_user_id=? AND datetime(created_at)>=datetime(?) AND datetime(created_at)<=datetime(?)`,
    gmails: `${inbox} SELECT COUNT(*) AS total, COALESCE(SUM(commercial),0) AS commercial,
      COALESCE(SUM(own),0) AS own FROM crm_inbox WHERE datetime(created_at)>=datetime(?) AND datetime(created_at)<=datetime(?)`,
    codes: `WITH actor_inbox AS (SELECT * FROM otp_inbox WHERE account_user_id=?), codes AS (
      SELECT ${origin} AS origin,${identity} AS order_identity,
        TRIM(CASE WHEN c.type='object' THEN json_extract(c.value,'$.code') END) AS code,
        CASE WHEN c.type='object' THEN json_extract(c.value,'$.at') END AS at
      FROM actor_inbox i JOIN json_each(CASE WHEN json_valid(i.codes_json) THEN
        CASE WHEN json_type(i.codes_json)='array' THEN i.codes_json ELSE '[]' END ELSE '[]' END) c
    ) SELECT COUNT(*) AS total FROM (SELECT DISTINCT origin,order_identity,code,at FROM codes
      WHERE COALESCE(code,'')<>'' AND datetime(at)>=datetime(?) AND datetime(at)<=datetime(?))`,
  };
}

export function calculateCrmMetrics(input: {
  depositsCents: number; chargesCents: number; refundsCents: number;
  gmailCount: number; commercialGmailCount: number; ownApiGmailCount: number; codesReceived: number;
}, gmailCostUsd: number, exchange: CrmExchange | null): CrmMetrics {
  const counts = { depositsCents: input.depositsCents, chargesCents: input.chargesCents, refundsCents: input.refundsCents, gmailCount: input.gmailCount, commercialGmailCount: input.commercialGmailCount, ownApiGmailCount: input.ownApiGmailCount, codesReceived: input.codesReceived };
  for (const value of Object.values(counts)) if (!Number.isSafeInteger(value) || value < 0) throw new Error("Métrica inválida.");
  if (input.commercialGmailCount > input.gmailCount || input.ownApiGmailCount > input.gmailCount || !Number.isFinite(gmailCostUsd) || gmailCostUsd < 0 || gmailCostUsd > 1000) throw new Error("Métrica inválida.");
  if (exchange && (!Number.isFinite(exchange.brlPerUsd) || exchange.brlPerUsd <= 0 || exchange.brlPerUsd > 100)) throw new Error("Cotação inválida.");
  const netChargesCents = input.chargesCents - input.refundsCents;
  // Round only after multiplying the Gmail count, never by the code count.
  const estimatedCostUsd = Math.round(input.commercialGmailCount * gmailCostUsd * 10000) / 10000;
  const estimatedCostBrlCents = exchange ? Math.round(estimatedCostUsd * exchange.brlPerUsd * 100) : null;
  if (!Number.isSafeInteger(Math.round(estimatedCostUsd * 10000)) || (estimatedCostBrlCents !== null && !Number.isSafeInteger(estimatedCostBrlCents))) throw new Error("Métrica acima do limite.");
  const estimatedResultBrlCents = estimatedCostBrlCents === null ? null : netChargesCents - estimatedCostBrlCents;
  if (estimatedResultBrlCents !== null && !Number.isSafeInteger(estimatedResultBrlCents)) throw new Error("Métrica acima do limite.");
  return { ...counts, netChargesCents, excludedGmailCount: input.gmailCount - input.commercialGmailCount, estimatedCostUsd, estimatedCostBrlCents, estimatedResultBrlCents };
}

export async function readCrmMetrics(db: D1Database, userId: string, period: { from: string; to: string }, reliable: boolean, cost: number, exchange: CrmExchange | null) {
  const queries = crmMetricQueries(reliable);
  const [deposits, money, gmails, codes] = await Promise.all([
    db.prepare(queries.deposits).bind(period.from, period.to, userId).first<{ amount: number }>(),
    db.prepare(queries.money).bind(userId, period.from, period.to).first<{ charges: number; refunds: number }>(),
    db.prepare(queries.gmails).bind(userId, period.from, period.to).first<{ total: number; commercial: number; own: number }>(),
    db.prepare(queries.codes).bind(userId, period.from, period.to).first<{ total: number }>(),
  ]);
  if (!deposits || !money || !gmails || !codes) throw new Error("Métricas indisponíveis.");
  return calculateCrmMetrics({ depositsCents: deposits.amount, chargesCents: money.charges, refundsCents: money.refunds, gmailCount: gmails.total, commercialGmailCount: gmails.commercial, ownApiGmailCount: gmails.own, codesReceived: codes.total }, cost, exchange);
}
