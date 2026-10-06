export function summarizeOtpHistoryRow<T extends { codesJson: string; closed: number; hiddenAt: string | null }>(row: T) {
  const { codesJson, ...publicRow } = row;
  let codeCount = 0;
  try {
    const codes: unknown = JSON.parse(codesJson);
    if (Array.isArray(codes)) codeCount = codes.filter((item) => item && typeof item === "object" && "code" in item && Boolean(item.code)).length;
  } catch { /* Dados legados inválidos são exibidos sem contagem. */ }
  return {
    ...publicRow,
    codeCount,
    status: row.hiddenAt ? "hidden" : row.closed ? "closed" : "open",
  };
}
