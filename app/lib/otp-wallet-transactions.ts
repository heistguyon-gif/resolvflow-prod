/** Payment status, balance and statement commit together, even after webhook retries. */
export async function settleOtpPayment(db:D1Database,id:string,summary:string,options?:{verifiedCanonicalPaid:true}) {
  const results=await db.batch([
    // Only a caller that verified canonical identity/amount/status may revive a
    // local terminal observation. Do so atomically with the credit, never before it.
    ...(options?.verifiedCanonicalPaid ? [db.prepare("UPDATE otp_payments SET status='pending' WHERE id=? AND status!='paid'").bind(id)] : []),
    db.prepare(`INSERT INTO otp_wallets(workspace_owner_user_id,balance_cents)
      SELECT workspace_owner_user_id,0 FROM otp_payments WHERE id=? AND status='pending'
      ON CONFLICT(workspace_owner_user_id) DO NOTHING`).bind(id),
    db.prepare(`INSERT INTO otp_ledger(id,workspace_owner_user_id,actor_user_id,type,amount_cents,balance_after_cents,ref_id,summary)
      SELECT 'pix:' || p.id,p.workspace_owner_user_id,p.actor_user_id,'credit_pix',p.amount_cents,w.balance_cents+p.amount_cents,p.provider_payment_id,?
      FROM otp_payments p JOIN otp_wallets w ON w.workspace_owner_user_id=p.workspace_owner_user_id WHERE p.id=? AND p.status='pending'`).bind(summary,id),
    db.prepare(`UPDATE otp_wallets SET balance_cents=balance_cents+(SELECT amount_cents FROM otp_payments WHERE id=?),updated_at=CURRENT_TIMESTAMP
      WHERE workspace_owner_user_id=(SELECT workspace_owner_user_id FROM otp_payments WHERE id=? AND status='pending')`).bind(id,id),
    db.prepare("UPDATE otp_payments SET status='paid',paid_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(id),
  ]);
  return Number(results[results.length-1].meta.changes)>0;
}

export async function adjustOtpWallet(db:D1Database,input:{workspaceOwnerUserId:string;actorUserId:string;amountCents:number;summary:string}) {
  const id=crypto.randomUUID(),type=input.amountCents>0?"credit_manual":"debit_manual";
  await db.batch([
    db.prepare(`INSERT INTO otp_ledger(id,workspace_owner_user_id,actor_user_id,type,amount_cents,balance_after_cents,summary)
      SELECT ?,workspace_owner_user_id,?,?,?,balance_cents+?,? FROM otp_wallets WHERE workspace_owner_user_id=? AND balance_cents+? >= 0`)
      .bind(id,input.actorUserId,type,input.amountCents,input.amountCents,input.summary.slice(0,240),input.workspaceOwnerUserId,input.amountCents),
    db.prepare("UPDATE otp_wallets SET balance_cents=balance_cents+?,updated_at=CURRENT_TIMESTAMP WHERE workspace_owner_user_id=? AND EXISTS(SELECT 1 FROM otp_ledger WHERE id=?)")
      .bind(input.amountCents,input.workspaceOwnerUserId,id),
  ]);
  const row=await db.prepare("SELECT balance_after_cents AS balanceCents FROM otp_ledger WHERE id=?").bind(id).first<{balanceCents:number}>();
  if(!row)throw new Error("O saldo não pode ficar negativo.");
  return row;
}
