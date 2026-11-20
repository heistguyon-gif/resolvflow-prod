export type OtpOperation = {
  id: string; account_user_id: string; workspace_owner_user_id: string; request_id: string;
  quantity: number; unit_cents: number; status: string; lock_token: string | null;
  lock_until: number; created_at: string; updated_at: string;
};
export type OtpOrderItem = {
  id: string; operation_id: string; position: number; status: string;
  provider: "instacaster" | "otpgmail"; supplier_api_id: string | null;
  provider_key_hash: string | null; idempotency_key: string; warehouse: 2 | 99;
  provider_order_id: string | null; email: string | null; provider_status: string | null;
  provider_price: string | null; error_code: string | null; started_at: number | null;attempt_count:number;
};

export class OtpOrderStore {
  readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async create(input: { id: string; requestId: string; accountUserId: string; workspaceOwnerUserId: string; quantity: number; unitCents: number; provider: OtpOrderItem["provider"]; supplierApiId: string | null }) {
    const existing = await this.get(input.id,input.accountUserId);
    if (existing) {
      if (existing.request_id !== input.requestId || existing.quantity !== input.quantity || existing.unit_cents !== input.unitCents || existing.workspace_owner_user_id !== input.workspaceOwnerUserId) throw new Error("A identificação deste pedido já foi usada com outra quantidade ou conta.");
      return existing;
    }
    const statements = [this.db.prepare(`INSERT INTO otp_order_operations
      (id,account_user_id,workspace_owner_user_id,request_id,quantity,unit_cents) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
      .bind(input.id,input.accountUserId,input.workspaceOwnerUserId,input.requestId,input.quantity,input.unitCents)];
    for (let position = 0; position < input.quantity; position++) {
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO otp_order_items
        (id,operation_id,position,provider,supplier_api_id,idempotency_key)
        SELECT ?,id,?,?,?,? FROM otp_order_operations WHERE id = ? AND account_user_id = ? AND request_id = ? AND quantity = ? AND unit_cents = ? AND workspace_owner_user_id = ?`)
        .bind(`${input.id}:${position}`,position,input.provider,input.supplierApiId,crypto.randomUUID(),input.id,input.accountUserId,input.requestId,input.quantity,input.unitCents,input.workspaceOwnerUserId));
    }
    await this.db.batch(statements);
    const operation = await this.get(input.id,input.accountUserId);
    if (!operation || operation.quantity !== input.quantity || operation.unit_cents !== input.unitCents || operation.workspace_owner_user_id !== input.workspaceOwnerUserId) {
      throw new Error("A identificação deste pedido já foi usada com outra quantidade ou conta.");
    }
    return operation;
  }

  get(id: string, accountUserId: string) {
    return this.db.prepare("SELECT * FROM otp_order_operations WHERE id = ? AND account_user_id = ?").bind(id,accountUserId).first<OtpOperation>();
  }
  async items(id: string) {
    const rows = await this.db.prepare("SELECT * FROM otp_order_items WHERE operation_id = ? ORDER BY position").bind(id).all<OtpOrderItem>();
    return rows.results;
  }
  async pending(accountUserId: string,workspaceOwnerUserId?:string) {
    await this.recoverAbandoned(accountUserId);
    const rows = await this.db.prepare(`SELECT id FROM otp_order_operations WHERE account_user_id = ? AND status <> 'completed'${workspaceOwnerUserId ? " AND workspace_owner_user_id=?" : ""} ORDER BY created_at DESC LIMIT 20`).bind(...(workspaceOwnerUserId ? [accountUserId,workspaceOwnerUserId] : [accountUserId])).all<{id:string}>();
    return Promise.all(rows.results.map(row=>this.publicStatus(row.id,accountUserId)));
  }
  async reviews() {
    await this.recoverAbandoned();
    const rows=await this.db.prepare(`SELECT i.*,o.account_user_id,o.workspace_owner_user_id,o.unit_cents,o.created_at AS requested_at,u.email AS account_email,u.display_name AS account_name
      FROM otp_order_items i JOIN otp_order_operations o ON o.id=i.operation_id
      LEFT JOIN app_users u ON u.id=o.account_user_id
      WHERE i.status='uncertain' AND o.lock_until <= ? ORDER BY o.created_at LIMIT 50`).bind(Date.now()).all<OtpOrderItem & {account_user_id:string;workspace_owner_user_id:string;unit_cents:number;requested_at:string;account_email:string|null;account_name:string|null}>();
    return rows.results;
  }
  async recoverAbandoned(accountUserId?:string) {
    const scope=accountUserId ? " AND account_user_id=?" : "";
    const args=accountUserId ? [Date.now(),accountUserId] : [Date.now()];
    await this.db.batch([
      this.db.prepare(`UPDATE otp_order_items SET status='uncertain',error_code='interrupted',updated_at=CURRENT_TIMESTAMP
        WHERE status='requesting' AND operation_id IN(SELECT id FROM otp_order_operations WHERE lock_until <= ?${scope})`).bind(...args),
      this.db.prepare(`UPDATE otp_order_operations SET status=CASE WHEN EXISTS(SELECT 1 FROM otp_order_items i WHERE i.operation_id=otp_order_operations.id AND i.status NOT IN ('delivered','failed')) THEN 'review' ELSE 'completed' END,
        lock_token=NULL,lock_until=0,updated_at=CURRENT_TIMESTAMP WHERE status='running' AND lock_until <= ?${scope}`).bind(...args),
    ]);
  }
  async acquire(id: string, accountUserId: string) {
    const token = crypto.randomUUID();
    const row = await this.db.prepare(`UPDATE otp_order_operations SET lock_token = ?,lock_until = ?,status = 'running',updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND account_user_id = ? AND status <> 'completed' AND lock_until <= ? RETURNING id`)
      .bind(token,Date.now()+120_000,id,accountUserId,Date.now()).first();
    if (!row) return null;
    // An earlier process stopped before recording the provider's response.
    await this.db.prepare("UPDATE otp_order_items SET status = 'uncertain',error_code = 'interrupted',updated_at = CURRENT_TIMESTAMP WHERE operation_id = ? AND status = 'requesting'").bind(id).run();
    return token;
  }
  async renew(id: string, token: string) {
    const row = await this.db.prepare("UPDATE otp_order_operations SET lock_until = ? WHERE id = ? AND lock_token = ? RETURNING id")
      .bind(Date.now()+120_000,id,token).first();
    if (!row) throw new Error("Este pedido já está sendo conferido em outra sessão.");
  }
  async begin(item: OtpOrderItem, keyHash: string) {
    await this.db.prepare(`UPDATE otp_order_items SET status = 'requesting',provider_key_hash = ?,started_at = COALESCE(started_at,?),attempt_count=attempt_count+1,updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('pending','uncertain')`).bind(keyHash,Date.now(),item.id).run();
  }
  async fallback(itemId: string) {
    await this.db.prepare(`UPDATE otp_order_items SET provider = 'otpgmail',supplier_api_id = NULL,status = 'pending',
      idempotency_key = ?,warehouse = 2,started_at = NULL,attempt_count=0,error_code = NULL,updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'requesting'`)
      .bind(crypto.randomUUID(),itemId).run();
  }
  async warehouse99(itemId: string) {
    await this.db.prepare(`UPDATE otp_order_items SET warehouse = 99,status = 'pending',idempotency_key = ?,started_at = NULL,attempt_count=0,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'requesting'`).bind(crypto.randomUUID(),itemId).run();
  }
  async fail(itemId: string, code: string, resolution?:{actor:string;note:string}) {
    await this.db.prepare(`UPDATE otp_order_items SET status = 'failed',error_code = ?,resolved_by=COALESCE(?,resolved_by),resolution_note=COALESCE(?,resolution_note),
      resolved_at=CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE resolved_at END,updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending','requesting','uncertain')`)
      .bind(code.slice(0,80),resolution?.actor||null,resolution?.note||null,resolution?.actor||null,itemId).run();
  }
  async uncertain(itemId: string, code: string) {
    await this.db.prepare("UPDATE otp_order_items SET status = 'uncertain',error_code = ?,updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending','requesting','uncertain')").bind(code.slice(0,80),itemId).run();
  }
  async delivered(itemId: string, record: { orderId: string; email: string; status: string; price?: string },resolution?:{actor:string;note:string}) {
    await this.db.batch([
      this.db.prepare(`UPDATE otp_order_items SET status = 'delivered',provider_order_id = ?,email = ?,provider_status = ?,provider_price = ?,error_code = NULL,
        resolved_by=COALESCE(?,resolved_by),resolution_note=COALESCE(?,resolution_note),resolved_at=CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE resolved_at END,updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending','requesting','uncertain')`).bind(record.orderId,record.email,record.status,record.price || "",resolution?.actor||null,resolution?.note||null,resolution?.actor||null,itemId),
      this.db.prepare(`INSERT INTO otp_inbox
        (id,account_user_id,workspace_owner_user_id,supplier_api_id,order_id,email,product,status,price)
        SELECT 'purchase:' || i.id,o.account_user_id,o.workspace_owner_user_id,i.supplier_api_id,
          i.provider_order_id,i.email,'ig_gmail_otp',i.provider_status,COALESCE(i.provider_price,'')
        FROM otp_order_items i JOIN otp_order_operations o ON o.id = i.operation_id WHERE i.id = ? AND i.status = 'delivered'
        ON CONFLICT(id) DO NOTHING`).bind(itemId),
    ]);
  }
  async finish(id: string, token: string) {
    await this.db.prepare(`UPDATE otp_order_operations SET status = CASE
      WHEN NOT EXISTS (SELECT 1 FROM otp_order_items WHERE operation_id = ? AND status NOT IN ('delivered','failed')) THEN 'completed'
      WHEN EXISTS (SELECT 1 FROM otp_order_items WHERE operation_id = ? AND status = 'uncertain') THEN 'review' ELSE 'pending' END,
      lock_token = NULL,lock_until = 0,updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lock_token = ?`).bind(id,id,id,token).run();
  }
  async publicStatus(id: string, accountUserId: string) {
    const operation = await this.get(id,accountUserId);
    if (!operation) return null;
    const items = await this.items(id);
    const orders = items.filter(item=>item.status === "delivered").map(item=>({order_id:item.provider_order_id,email:item.email,status:item.provider_status}));
    const failed = items.filter(item=>item.status === "failed").length;
    const pending = items.length - orders.length - failed;
    return { operationId:id, requestId:operation.request_id, status:operation.status, orders, ordered:orders.length,
      requested:operation.quantity, failed, pending, charged_cents:orders.length*operation.unit_cents,
      reserved_cents:pending*operation.unit_cents, refunded_cents:failed*operation.unit_cents,
      needsReview:items.some(item=>item.status === "uncertain" && (item.provider === "instacaster" || item.attempt_count>=3 || item.error_code === "credentials_changed" || !item.started_at || Date.now()-item.started_at > 23*3_600_000)),
      canContinue:items.some(item=>item.status === "pending" || item.status === "uncertain" && item.provider === "otpgmail" && item.attempt_count<3 && item.error_code !== "credentials_changed" && item.started_at && Date.now()-item.started_at <= 23*3_600_000),
      state:!orders.length && !pending ? items.some(item=>item.error_code === "out_of_stock") ? "out_of_stock" : "unavailable" : undefined,
      billed:operation.unit_cents ? "wallet" : "supplier", partial:orders.length < operation.quantity };
  }
}
