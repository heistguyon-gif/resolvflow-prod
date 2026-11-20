// Shared browser/server format only. No storage, network or logging.
export type MailPackageMessage = { id: string; receivedAt: string | null; sender: string | null; subject: string | null; folder: string | null; code: string | null };
export type MailPackageHistory = { scope: "stored_history"; observedAt: string | null; codeMessageCount: number | null; messages: MailPackageMessage[] };
export type MailExportRow = { id: string; email: string; refresh: string; client: string; importFields?: string[]; history?: MailPackageHistory };
export type MailExportFilter = "all" | "under-five" | "unknown";
export function resolvbotMailPackage(rows: MailExportRow[], exportedAt: string) {
  if (!rows.length || !Number.isFinite(Date.parse(exportedAt))) throw new Error("Pacote indisponível.");
  return {
    format: "resolvflow-mailboxes" as const, version: 1 as const, exportedAt,
    accounts: rows.map(row => {
      if (!row.history) throw new Error("Histórico salvo indisponível. Nenhum pacote parcial foi gerado.");
      return { email: row.email, clientId: row.client, refreshToken: row.refresh,
        history: { scope: "stored_history" as const, observedAt: row.history.observedAt, codeMessageCount: row.history.codeMessageCount,
          messages: row.history.messages.map(message => ({ id: message.id, receivedAt: message.receivedAt, sender: message.sender, subject: message.subject, folder: message.folder, code: message.code })) } };
    }),
  };
}
const email = (value: string) => /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(value.trim());
export function validImportedMailFields(value: unknown): value is string[] {
  return Array.isArray(value) && [4, 5].includes(value.length) && value.every(field => typeof field === "string" && !/[|\r\n\0]/.test(field))
    && email(value[0]) && value[1].length > 0 && value[1].length <= 8192
    && value[2].trim().length >= 80 && value[2].trim().length <= 8192
    && /^[a-f0-9-]{36}$/i.test(value[3].trim()) && (value.length === 4 || email(value[4]));
}
export function hasCompleteMailImport(row: Pick<MailExportRow, "email" | "client" | "importFields">) {
  return validImportedMailFields(row.importFields) && row.importFields[0].trim().toLowerCase() === row.email.toLowerCase()
    && row.importFields[3].trim().toLowerCase() === row.client.toLowerCase();
}
export function matchesMailExportFilter(count: number | null, filter: MailExportFilter) {
  return filter === "all" || (filter === "unknown" ? count === null : count !== null && count >= 0 && count < 5);
}
export function completeMailExport(rows: MailExportRow[], originalText?: string) {
  const originals = new Map<string, string[]>();
  if (originalText !== undefined) {
    if (new TextEncoder().encode(originalText).byteLength > 2_000_000) throw new Error("O TXT original excede 2 MB.");
    for (const line of originalText.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim())) {
      const fields = line.split("|");
      if (!validImportedMailFields(fields)) throw new Error("TXT original inválido: use quatro ou cinco campos completos por linha.");
      const key = fields[0].trim().toLowerCase();
      if (originals.has(key)) throw new Error("O TXT original contém e-mails duplicados.");
      originals.set(key, fields);
    }
  }
  if (!rows.length) throw new Error("Nenhuma caixa corresponde à seleção e ao filtro.");
  const seen = new Set<string>();
  return rows.map(row => {
    if (!row || typeof row.email !== "string" || seen.has(row.email.toLowerCase())) throw new Error("Resposta de exportação inválida.");
    seen.add(row.email.toLowerCase());
    const fields = hasCompleteMailImport(row) ? [...row.importFields!] : originals.get(row.email.toLowerCase());
    if (!fields || !validImportedMailFields(fields)) throw new Error("Faltam dados originais de uma ou mais caixas. Selecione o TXT original; nenhum arquivo parcial foi gerado.");
    if (fields[3].trim().toLowerCase() !== row.client.toLowerCase()) throw new Error("O client ID do TXT original diverge da caixa salva. Nenhum arquivo foi gerado.");
    if (typeof row.refresh !== "string" || row.refresh.length < 80 || row.refresh.length > 8192 || /[|\r\n\0]/.test(row.refresh)) throw new Error("Refresh atual inválido. Nenhum arquivo foi gerado.");
    const output = [...fields]; output[2] = row.refresh; output[3] = row.client;
    return output.join("|");
  }).join("\r\n") + "\r\n";
}
