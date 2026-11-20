import { env } from "cloudflare:workers";
import { authErrorResponse, requirePlatformAdmin } from "../../../../lib/auth";
import { SMS_FREE_LIMIT } from "../../../../lib/instagram-sms";

export async function PATCH(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const body = await request.json() as { accountUserId?: unknown; enabled?: unknown };
    if (typeof body.accountUserId !== "string" || !body.accountUserId || typeof body.enabled !== "boolean")
      return Response.json({ error: "Pessoa e estado do SMS são obrigatórios." }, { status: 400 });
    const db = env.DB;
    const user = await db.prepare("SELECT id FROM app_users WHERE id = ? AND status = 'active'").bind(body.accountUserId).first();
    if (!user) return Response.json({ error: "Pessoa ativa não encontrada." }, { status: 404 });
    await db.prepare("INSERT INTO instagram_sms_access (account_user_id, enabled, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(account_user_id) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP")
      .bind(body.accountUserId, body.enabled ? 1 : 0).run();
    const row = await db.prepare("SELECT enabled, delivered_count, reserved_count FROM instagram_sms_access WHERE account_user_id = ?").bind(body.accountUserId).first<{ enabled: number; delivered_count: number; reserved_count: number }>();
    return Response.json({ enabled: row?.enabled === 1, remaining: SMS_FREE_LIMIT - (row?.delivered_count || 0), delivered: row?.delivered_count || 0 }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error) || Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar o SMS." }, { status: 500 });
  }
}
