type CodeHistoryRow = { codesJson: string; updatedAt: string };

/** Compare-and-swap avoids losing a code when two tabs read the same history. */
export async function appendUniqueInboxCode<Row extends CodeHistoryRow>(input: {
  code: string;
  read: () => Promise<Row | null>;
  saveIfUnchanged: (previous: Row, next: Row) => Promise<boolean>;
}): Promise<Row | null> {
  const at = new Date().toISOString();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const row = await input.read();
    if (!row) return null;
    let codes: Array<{ code: string; at: string }> = [];
    try {
      const parsed = JSON.parse(row.codesJson);
      if (Array.isArray(parsed)) codes = parsed.filter((item) => item && typeof item.code === "string");
    } catch { /* A corrupt old history is replaced by the received code. */ }
    if (codes.some((item) => item.code === input.code)) return row;
    const next = { ...row, codesJson: JSON.stringify([{ code: input.code, at }, ...codes].slice(0, 20)), updatedAt: at };
    if (await input.saveIfUnchanged(row, next)) return next;
  }
  throw new Error("Os códigos estão sendo atualizados em outra aba. Tente buscar novamente.");
}
