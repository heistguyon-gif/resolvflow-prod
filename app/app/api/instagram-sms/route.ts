import { env } from "cloudflare:workers";
import { authErrorResponse, requireWorkspaceContext } from "../../../lib/auth";
import { buyInstagramNumber, cancelInstagramNumber, checkInstagramNumber, finishInstagramNumber, receivedCode, SMS_FREE_LIMIT, terminalWithoutCode } from "../../../lib/instagram-sms";

type Access = { enabled: number; delivered_count: number; reserved_count: number };
type Order = { id: string; provider_order_id: number | null; phone: string | null; country: string; state: string; provider_status: string | null; sms_code: string | null; expires_at: string | null; created_at: string };
const noStore = { "cache-control": "private, no-store" };
const listSql = "SELECT id, provider_order_id, phone, country, state, provider_status, sms_code, expires_at, created_at FROM instagram_sms_orders WHERE account_user_id = ? ORDER BY created_at DESC LIMIT 20";
function serialize(order: Order) { return { id: order.id, phone: order.phone, country: order.country, state: order.state, status: order.provider_status, code: order.sms_code, expiresAt: order.expires_at, createdAt: order.created_at }; }
async function accessFor(userId: string) {
  try {
    return await env.DB.prepare("SELECT enabled, delivered_count, reserved_count FROM instagram_sms_access WHERE account_user_id = ?").bind(userId).first<Access>();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/no such table:\s*instagram_sms_access/i.test(message)) return null;
    throw error;
  }
}
async function orderFor(userId: string, id: string) { return env.DB.prepare("SELECT * FROM instagram_sms_orders WHERE account_user_id = ? AND id = ?").bind(userId, id).first<Order>(); }
function accessResponse(access: Access | null) { return { enabled: access?.enabled === 1, limit: SMS_FREE_LIMIT, delivered: access?.delivered_count || 0, remaining: Math.max(0, SMS_FREE_LIMIT - (access?.delivered_count || 0)) }; }

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request);
    const access = await accessFor(ctx.accountUserId);
    if (!access?.enabled) return Response.json({ ...accessResponse(access), orders: [] }, { headers: noStore });
    const rows = await env.DB.prepare(listSql).bind(ctx.accountUserId).all<Order>();
    return Response.json({ ...accessResponse(access), orders: rows.results.map(serialize) }, { headers: noStore });
  } catch (error) { return authErrorResponse(error) || Response.json({ error: "Não foi possível carregar o SMS." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspaceContext(request, "editor");
    const db = env.DB;
    const body = await request.json() as { action?: string; id?: string; country?: string };
    const access = await accessFor(ctx.accountUserId);
    if (!access?.enabled) return Response.json({ error: "SMS não está liberado para esta pessoa." }, { status: 403 });

    if (body.action === "buy") {
      if (body.country !== "brazil" && body.country !== "any") return Response.json({ error: "País inválido." }, { status: 400 });
      const id = crypto.randomUUID();
      const reserved = await db.prepare("UPDATE instagram_sms_access SET reserved_count = reserved_count + 1, updated_at = CURRENT_TIMESTAMP WHERE account_user_id = ? AND enabled = 1 AND delivered_count + reserved_count < 15 AND NOT EXISTS (SELECT 1 FROM instagram_sms_orders WHERE account_user_id = ? AND state IN ('purchasing', 'pending')) RETURNING account_user_id")
        .bind(ctx.accountUserId, ctx.accountUserId).first();
      if (!reserved) return Response.json({ error: "Os 15 pedidos grátis acabaram ou há um pedido em andamento." }, { status: 409 });
      try {
        await db.prepare("INSERT INTO instagram_sms_orders (id, account_user_id, country) VALUES (?, ?, ?)").bind(id, ctx.accountUserId, body.country).run();
        const purchased = await buyInstagramNumber(body.country);
        await db.prepare("UPDATE instagram_sms_orders SET provider_order_id = ?, phone = ?, provider_status = ?, expires_at = ?, state = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(purchased.id, purchased.phone, purchased.status || "PENDING", purchased.expires || null, id).run();
        return Response.json({ order: { id, phone: purchased.phone, country: body.country, state: "pending", status: purchased.status || "PENDING", code: null, expiresAt: purchased.expires || null }, ...accessResponse(await accessFor(ctx.accountUserId)) }, { headers: noStore });
      } catch (error) {
        await db.batch([
          db.prepare("UPDATE instagram_sms_orders SET state = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'purchasing'").bind(id),
          db.prepare("UPDATE instagram_sms_access SET reserved_count = reserved_count - 1, updated_at = CURRENT_TIMESTAMP WHERE account_user_id = ? AND reserved_count > 0").bind(ctx.accountUserId),
        ]);
        throw error;
      }
    }

    if (body.action !== "check" && body.action !== "cancel") return Response.json({ error: "Ação inválida." }, { status: 400 });
    if (typeof body.id !== "string") return Response.json({ error: "Pedido inválido." }, { status: 400 });
    const local = await orderFor(ctx.accountUserId, body.id);
    if (!local) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    if (local.state !== "pending" || !local.provider_order_id) return Response.json({ order: serialize(local), ...accessResponse(await accessFor(ctx.accountUserId)) }, { headers: noStore });
    const remote = body.action === "cancel" ? await cancelInstagramNumber(local.provider_order_id) : await checkInstagramNumber(local.provider_order_id);
    const code = receivedCode(remote);
    if (code) {
      await db.batch([
        db.prepare("UPDATE instagram_sms_access SET delivered_count = delivered_count + 1, reserved_count = reserved_count - 1, updated_at = CURRENT_TIMESTAMP WHERE account_user_id = ? AND EXISTS (SELECT 1 FROM instagram_sms_orders WHERE id = ? AND state = 'pending')").bind(ctx.accountUserId, local.id),
        db.prepare("UPDATE instagram_sms_orders SET state = 'delivered', provider_status = ?, sms_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'pending'").bind(remote.status || "RECEIVED", code, local.id),
      ]);
      try { await finishInstagramNumber(local.provider_order_id); } catch { /* SMS is already delivered. */ }
    } else if (body.action === "cancel" || terminalWithoutCode(remote)) {
      await db.batch([
        db.prepare("UPDATE instagram_sms_access SET reserved_count = reserved_count - 1, updated_at = CURRENT_TIMESTAMP WHERE account_user_id = ? AND EXISTS (SELECT 1 FROM instagram_sms_orders WHERE id = ? AND state = 'pending')").bind(ctx.accountUserId, local.id),
        db.prepare("UPDATE instagram_sms_orders SET state = 'failed', provider_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'pending'").bind(remote.status || "CANCELED", local.id),
      ]);
    } else {
      await db.prepare("UPDATE instagram_sms_orders SET provider_status = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'pending'").bind(remote.status || "PENDING", remote.expires || local.expires_at, local.id).run();
    }
    const current = await orderFor(ctx.accountUserId, local.id);
    return Response.json({ order: current && serialize(current), ...accessResponse(await accessFor(ctx.accountUserId)) }, { headers: noStore });
  } catch (error) {
    return authErrorResponse(error) || Response.json({ error: error instanceof Error ? error.message : "Não foi possível processar o SMS." }, { status: 500 });
  }
}
