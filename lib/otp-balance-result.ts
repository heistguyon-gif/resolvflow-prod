export type GlobalOtpBalance = {
  state: "unconfigured" | "ready" | "not_reported" | "invalid_key" | "insufficient_balance" | "unavailable";
  balance?: string;
  currency?: string;
  checkedAt?: string;
};

export function parseGlobalOtpBalance(status: number, data: unknown, checkedAt: string): GlobalOtpBalance {
  if (status < 200 || status >= 300) return {
    state: status === 401 ? "invalid_key" : status === 402 ? "insufficient_balance" : "unavailable",
    checkedAt,
  };
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const balance = record.balance;
  if ((typeof balance !== "string" && typeof balance !== "number") || String(balance).trim() === "") {
    return { state: "not_reported", checkedAt };
  }
  return { state: "ready", balance: String(balance),
    currency: typeof record.currency === "string" && record.currency.trim() ? record.currency.trim() : undefined,
    checkedAt };
}
