import { env } from "cloudflare:workers";
import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { runtimeEnv } from "../../../../lib/runtime-env";

type ProviderOrder = { orderId: string; email: string | null; status: string; warehouse: number; otp: Array<{ code: string }> };
type ProviderResult = { success: boolean; data?: ProviderOrder | ProviderOrder[]; error?: { code?: string; message?: string } };
type LocalOrder = { id: string; account_user_id: string; idempotency_key: string; fallback_key: string; attempt_warehouse: number; provider_order_id: string | null; email: string | null; status: string; warehouse: number | null; latest_code: string | null; code_count: number; created_at: string };
const noStore = { "cache-control": "private, no-store" };

function localOnly() { return runtimeEnv().TOP_LOCAL_PREVIEW === "1"; }
function publicOrder(row: LocalOrder) { return { id: row.id, email: row.email, status: row.status, warehouse: row.warehouse, code: row.latest_code, codeCount: row.code_count, createdAt: row.created_at }; }

class ProviderError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

async function provider(path: string, init?: RequestInit, timeoutMs = 20_000): Promise<ProviderResult> {
  const key = runtimeEnv().OTPGMAIL_API_KEY?.trim();
  if (!key) throw new Error("OTPGmail não está configurado neste preview.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("X-Lang", "en");
  headers.set("Accept", "application/json");
  const response = await fetch(`https://otpgmail.net/v1/${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let result: ProviderResult;
  try { result = await response.json() as ProviderResult; }
  catch { throw new Error("Resposta inválida do OTPGmail."); }
  if (!response.ok || !result.success) throw new ProviderError(result.error?.code || `HTTP_${response.status}`, result.error?.message || "OTPGmail recusou a operação.", response.status);
  return result;
}

async function requestOrder(warehouse: 2 | 99, idempotencyKey: string) {
  const result = await provider("orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ service: "ig", quantity: 1, domain: "gmail.com", warehouse }),
  }, warehouse === 99 ? 60_000 : 20_000);
  const order = Array.isArray(result.data) ? result.data[0] : null;
  if (!order?.orderId || !order.email) throw new Error("OTPGmail não devolveu um pedido com e-mail.");
  return order;
}

const noStock = new Set(["OUT_OF_STOCK", "WAREHOUSE_UNAVAILABLE", "NO_MAILS_AVAILABLE"]);
const listSql = "SELECT * FROM otpgmail_preview_orders WHERE account_user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20";

export async function GET(request: Request) {
  if (!localOnly()) return Response.json({ error: "Não encontrado." }, { status: 404 });
  try {
    const ctx = await requireWorkspaceContext(request);
    const rows = await env.DB.prepare(listSql).bind(ctx.accountUserId).all<LocalOrder>();
    return Response.json({ configured: Boolean(runtimeEnv().OTPGMAIL_API_KEY?.trim()), orders: rows.results.map(publicOrder) }, { headers: noStore });
  } catch (error) { return authErrorResponse(error) || Response.json({ error: "Não foi possível carregar os Gmails." }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!localOnly()) return Response.json({ error: "Não encontrado." }, { status: 404 });
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const body = await request.json() as { action?: string; id?: string };
    const db = env.DB;
    if (body.action === "buy") {
      let row = await db.prepare("SELECT * FROM otpgmail_preview_orders WHERE account_user_id = ? AND status = 'requesting' ORDER BY created_at DESC LIMIT 1").bind(ctx.accountUserId).first<LocalOrder>();
      if (!row) {
        const id = crypto.randomUUID();
        await db.prepare("INSERT INTO otpgmail_preview_orders (id, account_user_id, idempotency_key, fallback_key, attempt_warehouse) VALUES (?, ?, ?, ?, 2)")
          .bind(id, ctx.accountUserId, crypto.randomUUID(), crypto.randomUUID()).run();
        row = await db.prepare("SELECT * FROM otpgmail_preview_orders WHERE id = ?").bind(id).first<LocalOrder>();
      }
      if (!row) throw new Error("Não foi possível preparar o pedido local.");
      try {
        let order: ProviderOrder;
        if (row.attempt_warehouse === 99) {
          order = await requestOrder(99, row.fallback_key);
        } else {
          try { order = await requestOrder(2, row.idempotency_key); }
          catch (error) {
            if (!(error instanceof ProviderError) || !noStock.has(error.code)) throw error;
            await db.prepare("UPDATE otpgmail_preview_orders SET attempt_warehouse = 99, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
            order = await requestOrder(99, row.fallback_key);
          }
        }
        const latest = order.otp?.at(-1)?.code || null;
        await db.prepare("UPDATE otpgmail_preview_orders SET provider_order_id = ?, email = ?, status = ?, warehouse = ?, latest_code = ?, code_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(order.orderId, order.email, order.status, order.warehouse, latest, order.otp?.length || 0, row.id).run();
        return Response.json({ order: { id: row.id, email: order.email, status: order.status, warehouse: order.warehouse, code: latest, codeCount: order.otp?.length || 0 } }, { headers: noStore });
      } catch (error) {
        if (error instanceof ProviderError && error.code !== "DUPLICATE_REQUEST") await db.prepare("UPDATE otpgmail_preview_orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
        throw error;
      }
    }
    if (body.action !== "check" || typeof body.id !== "string") return Response.json({ error: "Ação inválida." }, { status: 400 });
    const row = await db.prepare("SELECT * FROM otpgmail_preview_orders WHERE account_user_id = ? AND id = ?").bind(ctx.accountUserId, body.id).first<LocalOrder>();
    if (!row?.provider_order_id) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    const result = await provider(`orders/${encodeURIComponent(row.provider_order_id)}`);
    const order = !Array.isArray(result.data) ? result.data : null;
    if (!order?.orderId) throw new Error("OTPGmail não devolveu o pedido solicitado.");
    const latest = order.otp?.at(-1)?.code || null;
    await db.prepare("UPDATE otpgmail_preview_orders SET status = ?, latest_code = ?, code_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(order.status, latest, order.otp?.length || 0, row.id).run();
    return Response.json({ order: { id: row.id, email: row.email, status: order.status, warehouse: row.warehouse, code: latest, codeCount: order.otp?.length || 0 } }, { headers: noStore });
  } catch (error) {
    const auth = authErrorResponse(error); if (auth) return auth;
    const status = error instanceof ProviderError ? error.status : 502;
    return Response.json({ error: error instanceof Error ? error.message : "OTPGmail indisponível.", code: error instanceof ProviderError ? error.code : undefined }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
