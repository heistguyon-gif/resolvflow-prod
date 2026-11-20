import { waitUntil } from "cloudflare:workers";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { appUsers, sharkbotEvents, workspaceMembers } from "../../../../db/schema";
import { authErrorResponse, isPlatformAdminEmail, requireWorkspaceContext } from "../../../../lib/auth";
import { runtimeEnv } from "../../../../lib/runtime-env";
import { deliverSharkBotEventPush } from "../../../../lib/sharkbot-push";
import { SHARKBOT_ADMIN_EMAIL, isSharkBotPushEvent, type SharkBotPushEventType } from "../../../../lib/sharkbot-push-policy";
import { matchingSharkBotSecretIndex, normalizeSharkBotEvent, resolveSharkBotTarget, sharkBotEventKey } from "../../../../lib/sharkbot";

const MAX_WEBHOOK_BYTES = 256 * 1024;

function webhookSecrets() {
  const values = runtimeEnv();
  return [values.SHARKBOT_WEBHOOK_SECRET, values.SHARKBOT_WEBHOOK_SECRET_2];
}

export async function configuredWebhookTarget() {
  const configuredOwnerId = runtimeEnv().SHARKBOT_WORKSPACE_OWNER_ID?.trim() || null;
  const db = getDb();
  return resolveSharkBotTarget({
    configuredOwnerEmail: runtimeEnv().NEXOFLOW_OWNER_EMAIL,
    configuredWorkspaceOwnerId: configuredOwnerId,
    targetEmail: SHARKBOT_ADMIN_EMAIL,
    findTarget: async (email, workspaceOwnerId) => {
      const memberWhere = workspaceOwnerId
        ? and(eq(workspaceMembers.workspaceOwnerUserId, workspaceOwnerId), eq(workspaceMembers.email, email), eq(workspaceMembers.role, "owner"))
        : and(eq(workspaceMembers.email, email), eq(workspaceMembers.role, "owner"));
      const [member] = await db.select({ ownerUserId: workspaceMembers.workspaceOwnerUserId, accountUserId: workspaceMembers.accountUserId }).from(workspaceMembers).where(memberWhere).limit(1);
      if (member?.accountUserId) return { ownerUserId: member.ownerUserId, accountUserId: member.accountUserId };
      const userWhere = workspaceOwnerId
        ? and(eq(appUsers.email, email), eq(appUsers.id, workspaceOwnerId))
        : eq(appUsers.email, email);
      const [user] = await db.select({ id: appUsers.id }).from(appUsers).where(userWhere).limit(1);
      return user ? { ownerUserId: workspaceOwnerId || user.id, accountUserId: user.id } : null;
    },
  });
}

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const ownerUserId = context.workspaceOwnerUserId;
    const db = getDb();
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const includeSummary = url.searchParams.get("summary") !== "0";
    const [rows, totals] = await Promise.all([
      db.select({
        id: sharkbotEvents.id, eventType: sharkbotEvents.eventType, paymentId: sharkbotEvents.paymentId,
        status: sharkbotEvents.status, amountCents: sharkbotEvents.amountCents, currency: sharkbotEvents.currency,
        payerName: sharkbotEvents.payerName, productName: sharkbotEvents.productName, botName: sharkbotEvents.botName,
        flowName: sharkbotEvents.flowName, gateway: sharkbotEvents.gateway, occurredAt: sharkbotEvents.occurredAt,
      }).from(sharkbotEvents).where(eq(sharkbotEvents.ownerUserId, ownerUserId)).orderBy(desc(sharkbotEvents.occurredAt)).limit(limit),
      includeSummary ? db.select({
        events: sql<number>`count(*)`,
        approved: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'payment_approved' then 1 else 0 end)`,
        revenueCents: sql<number>`sum(case when ${sharkbotEvents.eventType} = 'payment_approved' then ${sharkbotEvents.amountCents} else 0 end)`,
      }).from(sharkbotEvents).where(eq(sharkbotEvents.ownerUserId, ownerUserId)) : Promise.resolve([]),
    ]);
    const stats = totals[0] || { approved: 0, revenueCents: 0, events: 0 };
    let routing: "linked" | "needs_configuration" = "needs_configuration";
    if (isPlatformAdminEmail(context.email)) {
      try {
        const target = await configuredWebhookTarget();
        if (target.ownerUserId === context.workspaceOwnerUserId && target.accountUserId === context.accountUserId) routing = "linked";
      } catch {
        routing = "needs_configuration";
      }
    }
    return Response.json({
      configured: webhookSecrets().some((secret) => Boolean(secret?.trim())),
      isPlatformAdmin: isPlatformAdminEmail(context.email),
      routing,
      webhookUrl: `${new URL(request.url).origin}/api/integrations/sharkbot`,
      stats,
      events: rows,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a integração SharkBot." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const secrets = webhookSecrets();
    if (!secrets.some((secret) => Boolean(secret?.trim()))) return Response.json({ error: "Webhook não configurado." }, { status: 503 });
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > MAX_WEBHOOK_BYTES) return Response.json({ error: "Payload muito grande." }, { status: 413 });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > MAX_WEBHOOK_BYTES) return Response.json({ error: "Payload muito grande." }, { status: 413 });
    const signature = request.headers.get("x-webhook-signature") || "";
    const secretIndex = signature ? await matchingSharkBotSecretIndex(rawBody, signature, secrets) : -1;
    if (secretIndex < 0) return Response.json({ error: "Assinatura inválida." }, { status: 401 });
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const normalized = normalizeSharkBotEvent(payload);
    const [target, rawEventKey] = await Promise.all([configuredWebhookTarget(), sharkBotEventKey(rawBody, normalized)]);
    const eventKey = secretIndex === 0 ? rawEventKey : `source:${secretIndex + 1}:${rawEventKey}`;
    const inserted = await getDb().insert(sharkbotEvents).values({
      id: crypto.randomUUID(), ownerUserId: target.ownerUserId, eventKey, eventType: normalized.eventType,
      externalEventId: normalized.externalEventId, paymentId: normalized.paymentId, status: normalized.status,
      amountCents: normalized.amountCents, currency: normalized.currency, payerName: normalized.payerName,
      productName: normalized.productName, botName: normalized.botName, flowName: normalized.flowName,
      gateway: normalized.gateway, occurredAt: normalized.occurredAt, payloadJson: rawBody,
    }).onConflictDoNothing().returning({ id: sharkbotEvents.id });
    console.log(JSON.stringify({ type: "sharkbot.webhook", eventType: normalized.eventType, duplicate: inserted.length === 0 }));
    const insertedEventId = inserted[0]?.id;
    if (insertedEventId && isSharkBotPushEvent(normalized.eventType)) {
      const push = deliverSharkBotEventPush(target, {
        id: insertedEventId,
        eventType: normalized.eventType as SharkBotPushEventType,
        amountCents: normalized.amountCents,
        currency: normalized.currency,
      });
      waitUntil(push.catch((pushError) => {
        console.error(JSON.stringify({ type: "sharkbot.push", eventId: insertedEventId, outcome: "error", error: pushError instanceof Error ? pushError.message : "Falha desconhecida." }));
      }));
    }
    return Response.json({ ok: true, duplicate: inserted.length === 0 });
  } catch (error) {
    console.error(JSON.stringify({ type: "sharkbot.webhook", outcome: "error", error: error instanceof Error ? error.message : "Falha desconhecida." }));
    return Response.json({ error: error instanceof SyntaxError ? "JSON inválido." : "Não foi possível processar o webhook." }, { status: 400 });
  }
}
