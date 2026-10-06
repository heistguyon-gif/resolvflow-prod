import { env } from "cloudflare:workers";
import { authErrorResponse, requirePlatformAdmin } from "../../../../../lib/auth";
import { otpMetricsQueries, toOtpMetrics } from "../../../../../lib/admin-otp-metrics";

const noStore = { "cache-control": "private, no-store" };
const value = (row: Record<string, unknown> | null, key: string) => Number(row?.[key]) || 0;

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const accountUserId = params.get("accountUserId")?.trim() || "";
    const workspaceOwnerUserId = params.get("workspaceOwnerUserId")?.trim() || "";
    if (Boolean(accountUserId) !== Boolean(workspaceOwnerUserId) || accountUserId.length > 100 || workspaceOwnerUserId.length > 100) {
      return Response.json({ error: "Usuário e workspace devem ser informados juntos." }, { status: 400, headers: noStore });
    }
    const from = params.get("from");
    const to = params.get("to");
    if (Boolean(from) !== Boolean(to)) return Response.json({ error: "Período incompleto." }, { status: 400, headers: noStore });
    const bounded = Boolean(from && to);
    const fromDate = bounded ? new Date(from as string) : null;
    const toDate = bounded ? new Date(to as string) : null;
    if (bounded && (!fromDate || !toDate || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate)) {
      return Response.json({ error: "Período inválido." }, { status: 400, headers: noStore });
    }
    const db = env.DB;
    if (!db) throw new Error("Banco indisponível.");
    const userScope = Boolean(accountUserId);
    if (userScope) {
      const member = await db.prepare(`SELECT 1 FROM workspace_members m
        JOIN app_users u ON u.id = ?
        WHERE m.workspace_owner_user_id = ? AND m.status = 'active'
        AND (m.account_user_id = u.id OR (m.account_user_id IS NULL AND lower(m.email) = lower(u.email))) LIMIT 1`)
        .bind(accountUserId, workspaceOwnerUserId).first();
      if (!member) return Response.json({ error: "Usuário ou workspace não encontrado." }, { status: 404, headers: noStore });
    }
    const queries = otpMetricsQueries(userScope ? "user" : "global", bounded);
    const periodArgs = bounded ? [fromDate!.toISOString(), toDate!.toISOString()] : [];
    const actorArgs = userScope ? [workspaceOwnerUserId, accountUserId] : [];
    const first = (statement: string, args: string[]) => {
      const prepared = db.prepare(statement);
      return args.length ? prepared.bind(...args).first() : prepared.first();
    };
    const [payments, consumption, orders, codes, open, balance, members] = await Promise.all([
      first(queries.payments, [...periodArgs, ...actorArgs]),
      first(queries.consumption, [...periodArgs, ...actorArgs]),
      first(queries.orders, [...periodArgs, ...actorArgs]),
      first(queries.codes, [...periodArgs, ...actorArgs]),
      first(queries.open, actorArgs),
      first(queries.balance, userScope ? [workspaceOwnerUserId] : []),
      userScope ? first(queries.members, [workspaceOwnerUserId]) : Promise.resolve(null),
    ]);
    return Response.json({
      ...toOtpMetrics({
        payments: value(payments, "amount"),
        consumption: value(consumption, "amount"),
        orders: value(orders, "total"),
        ownOrders: value(orders, "own"),
        globalOrLegacyOrders: value(orders, "global_or_legacy"),
        codes: value(codes, "total"),
        open: value(open, "total"),
        balance: value(balance, "amount"),
        activeMembers: value(members, "total"),
      }),
      period: bounded ? { from: fromDate!.toISOString(), to: toDate!.toISOString() } : null,
    }, { headers: noStore });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      const headers = new Headers(authResponse.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(authResponse.body, { status: authResponse.status, headers });
    }
    return Response.json({ error: "Não foi possível carregar as métricas de Gmail OTP." }, { status: 500, headers: noStore });
  }
}
