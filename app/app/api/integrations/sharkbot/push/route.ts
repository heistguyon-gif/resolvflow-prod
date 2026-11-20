import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { pushSubscriptions } from "../../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../../lib/auth";
import { deliverSharkBotManualSalePush, deliverSharkBotTestPush, publicPushConfiguration } from "../../../../../lib/sharkbot-push";

type PushBody = {
  action?: unknown;
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  preferences?: { newLead?: unknown; paymentCreated?: unknown; paymentApproved?: unknown };
};

const DEFAULT_PREFERENCES = { newLead: true, paymentCreated: false, paymentApproved: true };

function validKey(value: unknown, minimum: number) {
  return typeof value === "string" && value.length >= minimum && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value);
}

function validEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export async function GET(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    const [totals] = await getDb().select({ active: sql<number>`count(*)` }).from(pushSubscriptions).where(and(
      eq(pushSubscriptions.ownerUserId, context.workspaceOwnerUserId),
      eq(pushSubscriptions.accountUserId, context.accountUserId),
      isNull(pushSubscriptions.disabledAt),
    ));
    let preferences = DEFAULT_PREFERENCES;
    if (endpoint && validEndpoint(endpoint)) {
      const [subscription] = await getDb().select({
        newLead: pushSubscriptions.notifyNewLead,
        paymentCreated: pushSubscriptions.notifyPaymentCreated,
        paymentApproved: pushSubscriptions.notifyPaymentApproved,
      }).from(pushSubscriptions).where(and(
        eq(pushSubscriptions.ownerUserId, context.workspaceOwnerUserId),
        eq(pushSubscriptions.accountUserId, context.accountUserId),
        eq(pushSubscriptions.endpoint, endpoint),
        isNull(pushSubscriptions.disabledAt),
      )).limit(1);
      if (subscription) preferences = subscription;
    }
    return Response.json({ ...publicPushConfiguration(), activeDevices: Number(totals?.active || 0), preferences }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível verificar as notificações." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requirePlatformAdmin(request);
    const body = await request.json().catch(() => ({})) as PushBody;
    const action = String(body.action || "");
    const db = getDb();

    if (action === "subscribe") {
      if (!validEndpoint(body.endpoint) || !validKey(body.keys?.p256dh, 40) || !validKey(body.keys?.auth, 16)) {
        return Response.json({ error: "Assinatura de notificação inválida." }, { status: 400 });
      }
      const now = new Date().toISOString();
      await db.insert(pushSubscriptions).values({
        id: crypto.randomUUID(),
        ownerUserId: context.workspaceOwnerUserId,
        accountUserId: context.accountUserId,
        endpoint: body.endpoint as string,
        p256dh: body.keys?.p256dh as string,
        auth: body.keys?.auth as string,
        userAgent: (request.headers.get("user-agent") || "").slice(0, 500) || null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          ownerUserId: context.workspaceOwnerUserId,
          accountUserId: context.accountUserId,
          p256dh: body.keys?.p256dh as string,
          auth: body.keys?.auth as string,
          userAgent: (request.headers.get("user-agent") || "").slice(0, 500) || null,
          disabledAt: null,
          updatedAt: now,
        },
      });
      return Response.json({ ok: true });
    }

    if (action === "unsubscribe") {
      if (!validEndpoint(body.endpoint)) return Response.json({ error: "Assinatura inválida." }, { status: 400 });
      await db.delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.ownerUserId, context.workspaceOwnerUserId),
        eq(pushSubscriptions.accountUserId, context.accountUserId),
        eq(pushSubscriptions.endpoint, body.endpoint as string),
      ));
      return Response.json({ ok: true });
    }

    if (action === "preferences") {
      if (!validEndpoint(body.endpoint)) return Response.json({ error: "Assinatura inválida." }, { status: 400 });
      const preferences = body.preferences;
      if (!preferences || typeof preferences.newLead !== "boolean" || typeof preferences.paymentCreated !== "boolean" || typeof preferences.paymentApproved !== "boolean") {
        return Response.json({ error: "Preferências inválidas." }, { status: 400 });
      }
      const updated = await db.update(pushSubscriptions).set({
        notifyNewLead: preferences.newLead,
        notifyPaymentCreated: preferences.paymentCreated,
        notifyPaymentApproved: preferences.paymentApproved,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(pushSubscriptions.ownerUserId, context.workspaceOwnerUserId),
        eq(pushSubscriptions.accountUserId, context.accountUserId),
        eq(pushSubscriptions.endpoint, body.endpoint as string),
        isNull(pushSubscriptions.disabledAt),
      )).returning({ id: pushSubscriptions.id });
      if (!updated.length) return Response.json({ error: "Este dispositivo não possui notificações ativas." }, { status: 404 });
      return Response.json({ ok: true, preferences });
    }

    if (action === "test") {
      const result = await deliverSharkBotTestPush({ ownerUserId: context.workspaceOwnerUserId, accountUserId: context.accountUserId });
      if (!result.configured) return Response.json({ error: "As chaves de notificação ainda não foram configuradas no Worker." }, { status: 503 });
      return Response.json({ ok: true, delivered: result.delivered, expired: result.expired, failed: result.failed });
    }

    if (action === "sale") {
      const result = await deliverSharkBotManualSalePush({ ownerUserId: context.workspaceOwnerUserId, accountUserId: context.accountUserId });
      if (!result.configured) return Response.json({ error: "As chaves de notificação ainda não foram configuradas no Worker." }, { status: 503 });
      return Response.json({ ok: true, delivered: result.delivered, expired: result.expired, failed: result.failed, amountCents: result.amountCents, tag: result.tag });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    console.error(JSON.stringify({ type: "sharkbot.push_admin", outcome: "error", error: error instanceof Error ? error.message : "Falha desconhecida." }));
    return Response.json({ error: "Não foi possível atualizar as notificações." }, { status: 500 });
  }
}
