export function summarizeOtpHistoryRow<T extends {
  orderId: string;
  supplierApiId?: string | null;
  supplierApiName?: string | null;
  codesJson: string;
  closed: number;
  hiddenAt: string | null;
}>(row: T) {
  const { codesJson, ...publicRow } = row;
  // og_ is persisted by the OTPGmail adapter and also selects its code lookup.
  // Use the saved order, never the account's current supplier preference.
  const provider = !row.orderId ? null : row.orderId.startsWith("og_") ? "otpgmail" : "instacaster";
  const originLabel = provider === "otpgmail"
    ? "OTPGmail · API da plataforma"
    : provider === "instacaster"
      ? row.supplierApiId
        ? `InstaCaster · API própria · ${row.supplierApiName || "nome indisponível"}`
        : "InstaCaster · API da plataforma"
      : "Origem não registrada";
  let codeCount = 0;
  try {
    const codes: unknown = JSON.parse(codesJson);
    if (Array.isArray(codes)) codeCount = codes.filter((item) => item && typeof item === "object" && "code" in item && Boolean(item.code)).length;
  } catch { /* Dados legados inválidos são exibidos sem contagem. */ }
  return {
    ...publicRow,
    provider,
    originLabel,
    codeCount,
    status: row.hiddenAt ? "hidden" : row.closed ? "closed" : "open",
  };
}
