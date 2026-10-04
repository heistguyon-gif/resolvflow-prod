import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { systemHealth } from "../../../../db/schema";
import { authErrorResponse, requireOwnerId } from "../../../../lib/auth";
import { processDuePosts } from "../../../../lib/queue-engine";
import { runtimeEnv } from "../../../../lib/runtime-env";
import { NEXOFLOW_QUARANTINE, QUARANTINE_MESSAGE } from "../../../../lib/quarantine";

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function POST(request: Request) {
  try {
    const suppliedSecret = request.headers.get("x-nexoflow-scheduler-secret");
    const schedulerSecret = runtimeEnv().SCHEDULER_SECRET;
    const isScheduler = Boolean(schedulerSecret && suppliedSecret && safeEqual(suppliedSecret, schedulerSecret));
    const ownerUserId = isScheduler ? undefined : await requireOwnerId(request);
    if (NEXOFLOW_QUARANTINE) {
      return Response.json({ quarantine: true, found: 0, published: 0, advanced: 0, message: QUARANTINE_MESSAGE });
    }
    const startedAt = new Date().toISOString();
    const staleLockAt = new Date(Date.now() - 90_000).toISOString();
    const [claimed] = await getDb().update(systemHealth).set({
      status: "running",
      lastStartedAt: startedAt,
      lastError: null,
      updatedAt: startedAt,
    }).where(and(
      eq(systemHealth.key, "scheduler"),
      or(ne(systemHealth.status, "running"), isNull(systemHealth.lastStartedAt), lt(systemHealth.lastStartedAt, staleLockAt)),
    )).returning({ key: systemHealth.key });
    if (!claimed) return Response.json({ busy: true, message: "O agendador já está processando a fila. Aguarde o próximo ciclo." }, { status: 409 });
    const { setQueueAbortSignal } = await import("../../../../lib/meta-api");
    const abort = AbortSignal.timeout(40_000);
    setQueueAbortSignal(abort);
    let result;
    let runError: string | null = null;
    try {
      result = await processDuePosts(ownerUserId, 8);
    } catch (error) {
      runError = error instanceof Error ? error.message : "Falha ao processar a fila.";
      throw error;
    } finally {
      setQueueAbortSignal(undefined);
      const completedAt = new Date().toISOString();
      const degraded = !runError && result && (result.retried > 0 || result.failed > 0);
      const healthMessage = runError || (degraded ? `A fila teve ${result.retried} nova(s) tentativa(s) e ${result.failed} falha(s) neste ciclo.` : null);
      await getDb().update(systemHealth).set({ status: runError ? "error" : degraded ? "degraded" : "healthy", lastCompletedAt: completedAt, lastError: healthMessage, updatedAt: completedAt }).where(eq(systemHealth.key, "scheduler"));
    }
    return Response.json(result);
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível processar a fila." }, { status: 500 });
  }
}
