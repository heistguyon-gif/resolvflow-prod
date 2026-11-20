type Task = () => PromiseLike<unknown>;
type Results<T extends readonly Task[]> = { [K in keyof T]: Awaited<ReturnType<T[K]>> };
class CatalogReadError extends Error {
  constructor(readonly query: string, cause: unknown) { super("Account catalog read failed", { cause }); }
}
export function catalogFailureDiagnostic(error: unknown) {
  const codes = new Set<string>(), kinds = new Set<string>();
  const seen = new Set<unknown>();
  for (let current = error, depth = 0; current && depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    const item = current as { message?: unknown; cause?: unknown; code?: unknown };
    // Drizzle's wrapper includes SQL/params, so classify only its underlying cause.
    const message = typeof item.message === "string" && !item.message.startsWith("Failed query:") ? item.message : "";
    if (item.code === 7429 || item.code === 7500) codes.add(String(item.code));
    for (const code of message.match(/\b(?:7429|7500|SQLITE_BUSY|SQLITE_LOCKED|SQLITE_ERROR|D1_ERROR)\b/g) || []) codes.add(code);
    if (/overload|too many.*queued|queue.*full/i.test(message)) kinds.add("overloaded");
    if (/timed?\s*out|timeout/i.test(message)) kinds.add("timeout");
    if (/different request|I\/O.*context|I\/O.*cancel|context.*cancel/i.test(message)) kinds.add("request_io_lifecycle");
    if (/daily.*limit|quota|exceed.*rows.*read/i.test(message)) kinds.add("quota_or_limit");
    current = item.cause;
  }
  return { query: error instanceof CatalogReadError ? error.query : "catalog.context_or_payload", codes: [...codes], kinds: [...kinds] };
}

// Lazy tasks only: at most two D1 reads open at once, below the invocation limit.
// No global cache, stale catalog, cross-request promise or write is involved.
export async function readCatalogGroup<const T extends readonly Task[]>(names: readonly string[], tasks: T): Promise<Results<T>> {
  const result: unknown[] = [];
  for (let index = 0; index < tasks.length; index += 2) {
    const settled = await Promise.allSettled(tasks.slice(index, index + 2).map(async (task, offset) => {
      try { return await task(); } catch (error) { throw new CatalogReadError(names[index + offset] || "catalog.read", error); }
    }));
    // Drain in-flight reads on failure too; do not leave detached I/O at return.
    const rejected = settled.find(item => item.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
    result.push(...settled.map(item => item.status === "fulfilled" ? item.value : undefined));
  }
  return result as Results<T>;
}
