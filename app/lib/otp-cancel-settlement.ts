import { formatBrl, GMAIL_WALLET_CENTS, refundWalletOnce } from "./otp-billing";
import { markInboxClosed } from "./otp-inbox";
import { recordAuditEvent } from "./audit";
import { closeGuardedCancelledGmail, type CancelRefundDatabase, type CancelRefundInput } from "./otp-cancel-refund";

type SettlementInput = {
  ownerCost: boolean;
  accountUserId: string;
  workspaceOwnerUserId: string;
  orderId: string;
  email: string;
};
type SettlementGuard = { db: CancelRefundDatabase; guard: NonNullable<CancelRefundInput["guard"]> };

export function settleCancelledGmail(request: Request, input: SettlementInput): Promise<number>;
export function settleCancelledGmail(request: Request, input: SettlementInput, guarded: SettlementGuard): Promise<number | null>;
export async function settleCancelledGmail(request: Request, input: SettlementInput, guarded?: SettlementGuard) {
  let refundedCents = 0;
  if (!input.ownerCost) {
    const refund = await refundWalletOnce({
      workspaceOwnerUserId: input.workspaceOwnerUserId,
      actorUserId: input.accountUserId,
      amountCents: GMAIL_WALLET_CENTS,
      orderId: input.orderId,
      summary: `Gmail sem código cancelado · ${formatBrl(GMAIL_WALLET_CENTS)}`,
      ...(guarded ? { guard: guarded.guard } : {}),
    });
    if ("skipped" in refund && refund.skipped) return null;
    refundedCents = refund.already ? 0 : refund.refundedCents;
  }
  if (!guarded) await markInboxClosed(input.accountUserId, input.orderId, null);
  else if (input.ownerCost && !await closeGuardedCancelledGmail(guarded.db, {
    actorUserId: input.accountUserId, workspaceOwnerUserId: input.workspaceOwnerUserId,
    orderId: input.orderId, guard: guarded.guard,
  })) return null;
  try {
    await recordAuditEvent(request, {
      ownerUserId: input.workspaceOwnerUserId,
      action: "otp.cancel",
      entityType: "otp_order",
      entityId: input.orderId,
      summary: refundedCents ? `Gmail cancelado · ${formatBrl(refundedCents)} devolvidos` : "Gmail cancelado no fornecedor",
      metadata: { refundedCents, email: input.email },
    });
  } catch { /* The ledger row is the money record. */ }
  return refundedCents;
}
