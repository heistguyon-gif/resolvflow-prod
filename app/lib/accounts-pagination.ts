/** Keyset cursor is a position, never an authorization source. */
export class AccountsInputError extends Error {}

export type AccountPosition = { createdAt: string; id: string };

export function accountPageSize(value: string | null) {
  if (value === null || value === "") return 500;
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1) throw new AccountsInputError("Tamanho de página inválido.");
  return Math.min(size, 500);
}

export async function accountCursorScope(values: readonly unknown[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function encodeAccountCursor(position: AccountPosition, scope: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, scope, createdAt: position.createdAt, id: position.id }));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeAccountCursor(value: string | null, scope: string): AccountPosition | null {
  if (value === null) return null;
  try {
    if (!value || value.length > 2048 || !/^[\w-]+$/.test(value)) throw new Error();
    const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (parsed.v !== 1 || parsed.scope !== scope || typeof parsed.id !== "string" || !parsed.id || parsed.id.length > 200
      || typeof parsed.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}[T ][\d:.Z+-]+$/.test(parsed.createdAt) || parsed.createdAt.length > 40
      || !Number.isFinite(Date.parse(parsed.createdAt))) throw new Error();
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    throw new AccountsInputError("Cursor inválido ou incompatível com os filtros. Recarregue o catálogo.");
  }
}

/** Reject over-limit input before mutations: never silently discard selected ids. */
export function accountBatchIds(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some((id) => typeof id !== "string" || !id.trim() || id.length > 200)) {
    throw new AccountsInputError(`Informe de 1 a ${maximum} IDs por requisição.`);
  }
  const ids = [...new Set(value as string[])];
  if (!ids.length) throw new AccountsInputError("Selecione pelo menos uma conta.");
  return ids;
}
