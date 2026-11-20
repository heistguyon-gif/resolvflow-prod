import { MailWaitError, retryAfterMilliseconds } from "./cloudMailWait";

// Same v1 reader endpoints; no new polling or telemetry endpoint.
export async function cloudMailApi<T>(path = "", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/own-emails" + path, {
    cache: "no-store", signal,
    ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  let data: unknown;
  try { data = await response.json(); }
  catch {
    throw new MailWaitError("Resposta indisponível. Tente novamente mais tarde.", response.ok ? "response_invalid" : "unavailable", response.status, retryAfterMilliseconds(response.headers.get("retry-after")));
  }
  if (!response.ok) {
    const details: Record<string, unknown> = typeof data === "object" && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const headerDelay = retryAfterMilliseconds(response.headers.get("retry-after"));
    const bodyDelay = typeof details.retryAfterSeconds === "number" && Number.isFinite(details.retryAfterSeconds) && details.retryAfterSeconds >= 0
      ? Math.max(1000, details.retryAfterSeconds * 1000) : undefined;
    const delay = headerDelay === undefined ? bodyDelay : Math.max(headerDelay, bodyDelay ?? 0);
    throw new MailWaitError(typeof details.error === "string" ? details.error : "Não foi possível concluir a consulta.",
      typeof details.code === "string" ? details.code : "unavailable", response.status, delay);
  }
  return data as T;
}
