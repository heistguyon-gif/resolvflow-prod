import { isOtpCostOwnerEmail } from "./otp-billing";
import { appendInboxCode } from "./otp-inbox";
import { settleCancelledGmail } from "./otp-cancel-settlement";
import { otpGmailCode } from "./otpgmail-fallback";
import { OTP_GMAIL_EMPTY_CODES, OTP_GMAIL_ORDER_HAS_NO_CODES } from "./otp-cancel-refund";

// GLOB treats the underscore literally. Malformed/non-array JSON stays untouched.
const ELIGIBLE = `i.closed = 0 AND i.supplier_api_id IS NULL
  AND i.order_id GLOB 'og_*'
  AND (${OTP_GMAIL_EMPTY_CODES}) AND ${OTP_GMAIL_ORDER_HAS_NO_CODES}`;
const SELECT_ORDER = `SELECT i.id, i.account_user_id AS accountUserId,
  i.workspace_owner_user_id AS workspaceOwnerUserId, i.order_id AS orderId,
  i.email, i.created_at AS createdAt, u.email AS accountEmail FROM otp_inbox i
  JOIN app_users u ON u.id = i.account_user_id WHERE ${ELIGIBLE}`;
type Candidate = {
  id: string;
  accountUserId: string;
  workspaceOwnerUserId: string;
  orderId: string;
  email: string;
  accountEmail: string;
};

export async function reconcileOtpGmail(input: {
  db: D1Database;
  apiKey: string;
  startedAt: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}) {
  const deadline = Math.min(input.startedAt + 38_000, Date.now() + 8_000);
  const result = { checked: 0, closed: 0, codes: 0, refundedCents: 0, errors: 0 };
  // Leave time for local settlement and the scheduler's health finally block.
  const available = () => !input.signal?.aborted && Date.now() < deadline - 1_000;
  if (!input.apiKey.trim() || !available()) return result;
  const candidates = await input.db.prepare(`WITH candidates AS (${SELECT_ORDER}),
    ranked AS (SELECT *, ROW_NUMBER() OVER (
      PARTITION BY orderId ORDER BY julianday(createdAt), id
    ) AS position FROM candidates)
    SELECT * FROM ranked WHERE position = 1
    ORDER BY julianday(createdAt), id LIMIT 20`).all<Candidate>();
  const request = new Request("https://resolvflow.online/api/otp", { method: "GET" });
  const seen = new Set<string>();
  for (const candidate of candidates.results) {
    if (!available()) break;
    if (seen.has(candidate.orderId)) continue;
    seen.add(candidate.orderId);
    try {
      // Admission is checked again by the fetch wrapper, after any async work.
      const boundedFetch: typeof fetch = (url, init = {}) => {
        if (!available()) throw new Error("OTPGmail reconciliation deadline reached.");
        const signals = [AbortSignal.timeout(Math.min(1_500, deadline - Date.now() - 1_000))];
        if (input.signal) signals.push(input.signal);
        if (init.signal) signals.push(init.signal);
        return (input.fetchImpl || fetch)(url, { ...init, signal: AbortSignal.any(signals) });
      };
      result.checked++;
      const lookup = await otpGmailCode(input.apiKey, candidate.orderId, boundedFetch);
      if (!lookup.response.ok) { result.errors++; continue; }
      if (!available()) break;
      // Never use cached inbox state: a code/close may arrive during the GET.
      const current = await input.db.prepare(`${SELECT_ORDER} AND i.id = ?
        AND i.account_user_id = ? AND i.order_id = ? LIMIT 1`)
        .bind(candidate.id, candidate.accountUserId, candidate.orderId).first<Candidate>();
      if (!available()) break;
      if (!current) continue;
      const record = lookup.data as { status?: string; code?: string };
      if (record.code) {
        await appendInboxCode(current.accountUserId, current.orderId, String(record.code), null);
        result.codes++;
      } else if (record.status === "closed") {
        const refundedCents = await settleCancelledGmail(request, {
          ownerCost: isOtpCostOwnerEmail(current.accountEmail),
          accountUserId: current.accountUserId,
          workspaceOwnerUserId: current.workspaceOwnerUserId,
          orderId: current.orderId,
          email: current.email,
        }, { db: input.db, guard: { inboxId: current.id, accountUserId: current.accountUserId } });
        if (refundedCents !== null) {
          result.refundedCents += refundedCents;
          result.closed++;
        }
      }
    } catch {
      // Network/refund failures retain the open row for the next minute.
      result.errors++;
    }
  }
  // Every write is awaited; no Promise.race can leave settlement running behind us.
  return result;
}
