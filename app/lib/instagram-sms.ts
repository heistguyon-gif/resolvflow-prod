import { env } from "cloudflare:workers";

export const SMS_FREE_LIMIT = 15;
type SimOrder = { id?: number; phone?: string; status?: string; expires?: string; sms?: Array<{ code?: string; text?: string }> | null };

function token() {
  const value = (env as unknown as { FIVE_SIM_API_KEY?: string }).FIVE_SIM_API_KEY?.trim();
  if (!value) throw new Error("O serviço de SMS ainda não foi configurado.");
  return value;
}

async function call5sim(path: string): Promise<SimOrder> {
  const response = await fetch(`https://5sim.net/v1/user/${path}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(response.status === 401 ? "A chave do serviço de SMS foi recusada." : `O serviço de SMS não concluiu o pedido (${response.status}): ${body.slice(0, 120)}`);
  try { return JSON.parse(body) as SimOrder; } catch { throw new Error("Resposta inválida do serviço de SMS."); }
}

export async function buyInstagramNumber(country: "brazil" | "any") {
  const order = await call5sim(`buy/activation/${country}/any/instagram`);
  if (!Number.isSafeInteger(order.id) || !order.phone) throw new Error("O serviço de SMS não devolveu um número válido.");
  return order;
}

export async function checkInstagramNumber(id: number) { return call5sim(`check/${id}`); }
export async function cancelInstagramNumber(id: number) { return call5sim(`cancel/${id}`); }
export async function finishInstagramNumber(id: number) { return call5sim(`finish/${id}`); }

export function receivedCode(order: SimOrder) {
  const sms = order.sms?.find((item) => typeof item.code === "string" && item.code.trim());
  return sms?.code?.trim() || null;
}

export function terminalWithoutCode(order: SimOrder) {
  return ["CANCELED", "CANCELLED", "BANNED", "TIMEOUT", "EXPIRED", "FINISHED"].includes((order.status || "").toUpperCase());
}
