export type ReaderAccount = { id: string; email: string; status: string; checked: string | null; messages: number; codeMessageCount?: number | null; historyObservedAt?: string | null };
export type MailFolderView = "active" | "archived" | "all";
export type MailStatusView = "all" | "ok" | "attention" | "never" | "messages";
export type MailHistoryView = "all" | "codes" | "no-codes" | "unknown";
export type MailSort = "newest" | "email" | "checked" | "messages";
// Missing metadata stays unknown. A failed check is not a successful history observation.
export function mailCodeCount(account: ReaderAccount) {
  return Number.isSafeInteger(account.codeMessageCount) && account.codeMessageCount! >= 0 ? account.codeMessageCount! : null;
}
export function filterMailAccounts<T extends ReaderAccount>(accounts: T[], entries: Record<string, { archived: boolean }>, query: string, folder: MailFolderView, status: MailStatusView, sort: MailSort) {
  const ranked = accounts.map((account, index) => ({ account, index })).filter(({ account: a }) => {
    const archived = entries[a.id]?.archived === true;
    return (folder === "all" || (folder === "archived" ? archived : !archived)) && a.email.toLowerCase().includes(query.trim().toLowerCase())
      && (status === "all" || status === "ok" && a.status === "ok" || status === "never" && !a.checked
        || status === "messages" && a.messages > 0 || status === "attention" && !["ok", "ready", "reading"].includes(a.status));
  });
  ranked.sort((a, b) => (sort === "email" ? a.account.email.localeCompare(b.account.email, "pt-BR") : sort === "checked"
    ? (b.account.checked ?? "").localeCompare(a.account.checked ?? "") : sort === "messages" ? b.account.messages - a.account.messages : b.index - a.index)
    || a.account.id.localeCompare(b.account.id));
  return ranked.map(item => item.account);
}
export function mailAccountPage<T>(accounts: readonly T[], requestedPage: number, size = 25) {
  const pageSize = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 25;
  const pages = Math.max(1, Math.ceil(accounts.length / pageSize));
  const page = Math.max(1, Math.min(pages, Math.floor(requestedPage) || 1));
  return { page, pages, items: accounts.slice((page - 1) * pageSize, page * pageSize), start: accounts.length ? (page - 1) * pageSize + 1 : 0, end: Math.min(page * pageSize, accounts.length) };
}
export function filterMailHistory<T extends ReaderAccount>(accounts: T[], history: MailHistoryView) {
  return accounts.filter(a => { const count = mailCodeCount(a); return history === "all" || (history === "unknown" ? count === null : history === "codes" ? count !== null && count > 0 : count === 0); });
}
export function selectMailPage(selected: readonly string[], page: readonly { id: string }[]) {
  return [...new Set([...selected, ...page.map(a => a.id)])];
}
