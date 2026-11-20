export type CatalogAccount = { id: string; [key: string]: unknown };
export type AccountCatalog<T extends CatalogAccount = CatalogAccount> = {
  accounts: T[]; canViewRecovery: boolean; scope: string; total: number;
};
export type CatalogFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Complete-or-error: never hand a page prefix to a catalog/selection consumer. */
export async function loadAccountsCatalog<T extends CatalogAccount = CatalogAccount>(fetcher: CatalogFetch, options: {
  scope?: "workspace" | "platform"; filters?: Record<string, string>; signal?: AbortSignal;
  isCurrent?: () => boolean; onProgress?: (loaded: number, total: number) => void;
} = {}): Promise<AccountCatalog<T>> {
  const scope = options.scope || "workspace";
  const params = new URLSearchParams(options.filters);
  params.delete("cursor"); params.set("limit", "500");
  if (scope === "platform") params.set("scope", scope); else params.delete("scope");
  const accounts = new Map<string, T>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let total: number | undefined;
  let canViewRecovery: boolean | undefined;
  const assertCurrent = () => {
    if (options.signal?.aborted || options.isCurrent?.() === false) throw new DOMException("Leitura de contas substituída.", "AbortError");
  };
  do {
    assertCurrent();
    if (cursor) params.set("cursor", cursor);
    const response = await fetcher(`/api/accounts?${params}`, { cache: "no-store", signal: options.signal });
    assertCurrent();
    // JSON is untrusted. Validate its shape before committing a complete catalog.
    const data = await response.json() as {
      error?: string; accounts?: T[]; scope?: string; canViewRecovery?: boolean;
      pagination?: { hasMore: boolean; total: number; pageSize: number; nextCursor: string | null };
    } | null;
    assertCurrent();
    if (!response.ok) throw new Error(data?.error || "Não foi possível concluir a leitura das contas.");
    const page = data?.pagination;
    if (!Array.isArray(data?.accounts) || data.scope !== scope || typeof data.canViewRecovery !== "boolean"
      || !page || typeof page.hasMore !== "boolean" || !Number.isSafeInteger(page.total) || page.total < 0
      || !Number.isSafeInteger(page.pageSize) || page.pageSize < 1 || page.pageSize > 500 || data.accounts.length > page.pageSize
      || (page.hasMore ? typeof page.nextCursor !== "string" || !page.nextCursor : page.nextCursor !== null)) {
      throw new Error("Resposta de paginação inválida. A lista completa não foi atualizada.");
    }
    if (total !== undefined && (page.total !== total || data.canViewRecovery !== canViewRecovery)) {
      throw new Error("O catálogo mudou durante a leitura. Atualize novamente para obter a lista completa.");
    }
    total = page.total;
    canViewRecovery = data.canViewRecovery;
    const previousSize = accounts.size;
    for (const account of data.accounts) {
      if (!account || typeof account.id !== "string" || !account.id) throw new Error("Conta inválida na resposta de paginação.");
      accounts.set(account.id, account);
    }
    if (accounts.size > total! || (page.hasMore && accounts.size === previousSize)) throw new Error("A paginação não avançou corretamente. A lista completa não foi atualizada.");
    options.onProgress?.(accounts.size, total!);
    cursor = page.nextCursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error("Cursor repetido. A lista completa não foi atualizada.");
      cursors.add(cursor);
    }
  } while (cursor !== null);
  assertCurrent();
  if (accounts.size !== total) throw new Error("Leitura incompleta das contas. O último catálogo completo foi preservado.");
  return { accounts: [...accounts.values()], canViewRecovery: canViewRecovery!, scope, total: total! };
}
