import { env } from "cloudflare:workers";
import { runtimeEnv } from "../../../../lib/runtime-env";

const errorCodes = new Set(["exact_not_found", "meta_unavailable", "session_required", "ambiguous_result", "app_mismatch", "other"]);
type ClaimedJob = { id: string; username: string; meta_app_key: string; invite_claim_token: string; invite_lease_until: string; invite_attempts: number };

async function equalSecretHash(expected: string, received: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(expected)), crypto.subtle.digest("SHA-256", encoder.encode(received))]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function POST(request: Request) {
  const secret = runtimeEnv().META_INVITE_AGENT_TOKEN || "";
  if (secret.length < 32) return Response.json({ error: "Agente indisponível." }, { status: 503 });
  const authorization = request.headers.get("authorization") || "";
  const received = /^Bearer ([^\s]+)$/.exec(authorization)?.[1] || "";
  if (!await equalSecretHash(secret, received)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  const db = env.DB;
  const now = new Date().toISOString();
  if (body.action === "heartbeat") {
    await db.prepare("INSERT INTO meta_invite_agent_health(agent_id,checked_at,status,browser_ready) VALUES ('primary',?,?,?) ON CONFLICT(agent_id) DO UPDATE SET checked_at=excluded.checked_at,status=excluded.status,browser_ready=excluded.browser_ready")
      .bind(now,body.status === "ready" ? "ready" : "needs_attention",body.browserReady === true ? 1 : 0).run();
    return Response.json({ok:true});
  }
  if (body.action === "apps") {
    const routes = await db.prepare(`SELECT 'workspace:' || app.id AS key, route.dashboard_app_id AS dashboardAppId,
      app.app_id AS instagramAppId, app.label,
      (SELECT count(*) FROM connection_requests cr WHERE cr.meta_app_key = 'workspace:' || app.id
        AND cr.invite_mode='automatic' AND cr.status IN ('pending','processing')) AS pendingCount
      FROM meta_invite_app_routes route JOIN meta_apps app ON app.id=route.meta_app_id AND app.status='active'
      WHERE route.enabled=1
      AND EXISTS(SELECT 1 FROM meta_invite_platform_settings WHERE key='bot_invite' AND enabled=1)
      AND EXISTS(SELECT 1 FROM meta_app_assignments a JOIN meta_connection_modes m
        ON m.account_user_id=a.account_user_id AND m.workspace_owner_user_id=a.workspace_owner_user_id AND m.mode='bot'
        WHERE a.meta_app_id=app.id AND a.status='active') ORDER BY app.id`).all();
    return Response.json({ apps: routes.results }, {headers:{"cache-control":"no-store"}});
  }
  if (body.action === "claim_batch") {
    const key = String(body.metaAppKey || "");
    const dashboardId = String(body.dashboardAppId || "");
    if (!/^workspace:[0-9a-f-]{36}$/i.test(key) || !/^\d{8,25}$/.test(dashboardId))
      return Response.json({ jobs: [] });
    const token = crypto.randomUUID();
    const leaseUntil = new Date(Date.now() + 300_000).toISOString();
    const result = await db.prepare(`WITH eligible AS MATERIALIZED (
      SELECT cr.id, cr.owner_user_id, cr.requested_by_user_id, cr.created_at, cr.rowid AS position
      FROM connection_requests cr
      JOIN meta_apps app ON 'workspace:' || app.id = cr.meta_app_key AND app.status='active'
      JOIN meta_invite_app_routes route ON route.meta_app_id=app.id AND route.enabled=1 AND route.dashboard_app_id=?
      WHERE cr.meta_app_key=? AND cr.invite_mode='automatic'
        AND (cr.status='pending' OR (cr.status='processing' AND cr.invite_lease_until < ?))
        AND EXISTS(SELECT 1 FROM meta_invite_platform_settings WHERE key='bot_invite' AND enabled=1)
        AND EXISTS(SELECT 1 FROM meta_app_assignments ass JOIN meta_connection_modes mode
          ON mode.account_user_id=ass.account_user_id AND mode.workspace_owner_user_id=ass.workspace_owner_user_id AND mode.mode='bot'
          WHERE ass.meta_app_id=app.id AND ass.status='active' AND ass.account_user_id=cr.requested_by_user_id
            AND ass.workspace_owner_user_id=cr.owner_user_id)
    ), first_job AS MATERIALIZED (SELECT * FROM eligible ORDER BY created_at,position LIMIT 1)
    UPDATE connection_requests SET status='processing',invite_claim_token=?,invite_lease_until=?,
      invite_attempts=invite_attempts+1,updated_at=?
    WHERE id IN (SELECT e.id FROM eligible e JOIN first_job f
      ON e.owner_user_id=f.owner_user_id AND e.requested_by_user_id=f.requested_by_user_id
      ORDER BY e.created_at,e.position LIMIT 5)
    RETURNING id,username,meta_app_key,owner_user_id,requested_by_user_id,invite_claim_token,invite_lease_until,invite_attempts,created_at`)
      .bind(dashboardId,key,now,token,leaseUntil,now)
      .all<ClaimedJob & { owner_user_id: string; requested_by_user_id: string; created_at: string }>();
    return Response.json({ jobs: result.results.map(job => ({ id: job.id, username: job.username,
      metaAppKey: job.meta_app_key, workspaceOwnerUserId: job.owner_user_id, accountUserId: job.requested_by_user_id,
      claimToken: job.invite_claim_token, leaseUntil: job.invite_lease_until, attempts: job.invite_attempts,
      createdAt: job.created_at })) });
  }
  if (body.action === "claim") {
    const metaAppKey = typeof body.metaAppKey === "string" ? body.metaAppKey : "";
    if (!/^workspace:[0-9a-f-]{36}$/i.test(metaAppKey)) return Response.json({ job: null });
    if (typeof body.dashboardAppId === "string") {
      const route = await db.prepare("SELECT meta_app_id FROM meta_invite_app_routes WHERE meta_app_id = ? AND dashboard_app_id = ? AND enabled=1").bind(metaAppKey.slice(10),body.dashboardAppId).first();
      if (!route) return Response.json({ job:null });
    }
    const leaseUntil = new Date(Date.now() + 120_000).toISOString();
    const token = crypto.randomUUID();
    // A única instrução UPDATE escolhe e altera no mesmo turno de escrita do D1.
    const job = await db.prepare(`UPDATE connection_requests
      SET status = 'processing', invite_claim_token = ?, invite_lease_until = ?, invite_attempts = invite_attempts + 1, updated_at = ?
      WHERE id = (
        SELECT cr.id FROM connection_requests cr
        JOIN meta_connection_modes mode ON mode.account_user_id = cr.requested_by_user_id
          AND mode.workspace_owner_user_id = cr.owner_user_id AND mode.mode = 'bot'
        JOIN meta_app_assignments assignment ON assignment.account_user_id = cr.requested_by_user_id
          AND assignment.workspace_owner_user_id = cr.owner_user_id AND assignment.status = 'active'
          AND cr.meta_app_key = 'workspace:' || assignment.meta_app_id
        JOIN meta_apps app ON app.id = assignment.meta_app_id AND app.status = 'active'
        WHERE cr.invite_mode = 'automatic' AND cr.meta_app_key = ?
          AND (cr.status = 'pending' OR (cr.status = 'processing' AND cr.invite_lease_until < ?))
          AND EXISTS (SELECT 1 FROM meta_invite_platform_settings WHERE key = 'bot_invite' AND enabled = 1)
        ORDER BY cr.created_at, cr.rowid LIMIT 1
      ) AND invite_mode = 'automatic' AND meta_app_key = ?
        AND (status = 'pending' OR (status = 'processing' AND invite_lease_until < ?))
        AND EXISTS (SELECT 1 FROM meta_invite_platform_settings WHERE key = 'bot_invite' AND enabled = 1)
      RETURNING id, username, meta_app_key, invite_claim_token, invite_lease_until, invite_attempts`)
      .bind(token, leaseUntil, now, metaAppKey, now, metaAppKey, now).first<ClaimedJob>();
    return Response.json({ job: job ? { id: job.id, username: job.username, metaAppKey: job.meta_app_key,
      claimToken: job.invite_claim_token, leaseUntil: job.invite_lease_until, attempts: job.invite_attempts } : null });
  }
  if (body.action === "renew") {
    const renewed = await db.prepare(`UPDATE connection_requests SET invite_lease_until = ?
      WHERE id = ? AND invite_claim_token = ? AND status='processing' AND invite_mode='automatic'
      AND EXISTS(SELECT 1 FROM meta_invite_platform_settings WHERE key='bot_invite' AND enabled=1)
      AND EXISTS(SELECT 1 FROM meta_invite_app_routes r JOIN meta_apps a ON a.id=r.meta_app_id AND a.status='active'
        JOIN meta_app_assignments ass ON ass.meta_app_id=a.id AND ass.status='active'
        JOIN meta_connection_modes m ON m.account_user_id=ass.account_user_id AND m.workspace_owner_user_id=ass.workspace_owner_user_id AND m.mode='bot'
        WHERE 'workspace:' || a.id = connection_requests.meta_app_key AND r.dashboard_app_id = ? AND r.enabled=1
        AND ass.account_user_id=connection_requests.requested_by_user_id AND ass.workspace_owner_user_id=connection_requests.owner_user_id)
      RETURNING id`).bind(new Date(Date.now()+120_000).toISOString(),String(body.id||""),String(body.claimToken||""),String(body.dashboardAppId||"")).first();
    return Response.json({renewed:!!renewed},{status:renewed?200:409});
  }
  if (body.action === "complete") {
    const id = typeof body.id === "string" ? body.id : "";
    const claimToken = typeof body.claimToken === "string" ? body.claimToken : "";
    const result = body.result;
    const success = result === "sent" || result === "already_present";
    const errorCode = typeof body.errorCode === "string" ? body.errorCode : "";
    if (!id || !claimToken || (!success && (result !== "failed" || !errorCodes.has(errorCode))))
      return Response.json({ error: "Conclusão inválida." }, { status: 400 });
    const updated = await db.prepare(`UPDATE connection_requests SET status = ?, invited_at = ?, invited_by_email = ?,
      invite_last_error = ?, invite_claim_token = NULL, invite_lease_until = NULL, updated_at = ?
      WHERE id = ? AND invite_mode = 'automatic' AND status = 'processing' AND invite_claim_token = ?
      RETURNING id`)
      .bind(success ? "invited" : "failed", success ? now : null, success ? "bot" : null,
        success ? null : errorCode, now, id, claimToken).first<{ id: string }>();
    if (!updated) return Response.json({ error: "Claim expirado ou já concluído." }, { status: 409 });
    return Response.json({ completed: true, status: success ? "invited" : "failed" });
  }
  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
