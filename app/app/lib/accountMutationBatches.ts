import type { CatalogFetch } from "./accountsCatalog";

type Operation = "metadata" | "archive" | "restore" | "delete";
export type AccountBatchResult = {
  completedIds: string[]; remainingIds: string[]; uncertainIds: string[];
  confirmedCount: number; total: number; error: string; complete: boolean;
};

/** Sequential, at most once per batch. A missing/partial receipt stops the operation. */
export async function mutateAccountBatches(fetcher: CatalogFetch, options: {
  operation: Operation; ids: string[]; payload?: Record<string, unknown>;
  isCurrent: () => boolean; onProgress?: (confirmed: number, total: number) => void;
}): Promise<AccountBatchResult> {
  const ids = [...new Set(options.ids)];
  const limit = options.operation === "metadata" ? 500 : options.operation === "delete" ? 50 : 200;
  const completedIds: string[] = [];
  const result = (error = "", uncertainIds: string[] = [], extraConfirmed = 0): AccountBatchResult => ({
    completedIds, remainingIds: ids.slice(completedIds.length), uncertainIds,
    confirmedCount: completedIds.length + extraConfirmed, total: ids.length,
    error, complete: !error && completedIds.length === ids.length,
  });
  for (let offset = 0; offset < ids.length; offset += limit) {
    if (!options.isCurrent()) return result("Contexto alterado. Nenhum novo lote foi enviado.");
    const batch = ids.slice(offset, offset + limit);
    try {
      const response = await fetcher("/api/accounts", {
        method: options.operation === "delete" ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...options.payload, ids: batch,
          ...(options.operation === "archive" || options.operation === "restore" ? { action: options.operation } : {}),
          ...(options.operation === "delete" ? { confirmation: "EXCLUIR" } : {}),
        }),
      });
      // Only explicit validation/permission rejection is known not to have mutated.
      const rejected = [400, 401, 403].includes(response.status);
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok) return result(typeof body?.error === "string" ? body.error : "Falha ao processar o lote.", rejected ? [] : batch);
      const count = body?.[options.operation === "metadata" ? "updated" : options.operation === "restore" ? "restored" : "archived"]
        ?? (options.operation === "delete" ? body?.deleted : undefined);
      if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > batch.length) {
        return result("Recibo inválido. Confira o lote antes de qualquer nova tentativa.", batch);
      }
      if (count !== batch.length) {
        return result("O lote teve confirmação parcial sem identificação de todas as contas. Confira antes de repetir.", batch, count as number);
      }
      completedIds.push(...batch);
      options.onProgress?.(completedIds.length, ids.length);
      if (!options.isCurrent()) return result("Contexto alterado. Nenhum novo lote foi enviado.");
    } catch (error) {
      // Fetch/JSON failures may occur after the server committed: never retry here.
      return result(error instanceof Error ? error.message : "Falha de comunicação com o servidor.", batch);
    }
  }
  return result();
}

export function accountBatchMessage(result: AccountBatchResult, action: string): string {
  const summary = `${result.confirmedCount} de ${result.total} conta(s) ${action}.`;
  if (result.complete) return summary;
  const pending = result.total - result.confirmedCount;
  return `${summary} ${pending} sem confirmação. ${result.error}${result.uncertainIds.length ? ` ${result.uncertainIds.length} conta(s) no lote a conferir; o resultado pode ter sido aplicado. Nenhuma repetição automática.` : " Os lotes restantes não foram enviados."}`;
}
