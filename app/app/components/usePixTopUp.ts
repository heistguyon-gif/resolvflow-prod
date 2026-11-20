"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PixCharge = { id: string; qrCode: string; ticketUrl: string; priceLabel: string; status: string };
type Intent = { requestId: string; amountCents: number; paymentId?: string };
type State = { scope: string; intent: Intent | null; charge: PixCharge | null; busy: boolean; locked: boolean; error: string; notice: string };
const empty = (scope: string): State => ({ scope, intent: null, charge: null, busy: false, locked: false, error: "", notice: "" });
const key = (scope: string) => `resolvflow:pix-intent:v1:${scope}`;
const terminal = (status?: string) => ["paid", "expired", "cancelled", "rejected"].includes(status ?? "");

function remember(scope: string, intent: Intent | null) {
  try { if (intent) sessionStorage.setItem(key(scope), JSON.stringify(intent)); else sessionStorage.removeItem(key(scope)); } catch { /* In-memory identity remains stable if storage is unavailable. */ }
}
function restore(scope: string): Intent | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(scope)) ?? "null") as Intent | null;
    if (value && /^[a-f0-9-]{36}$/i.test(value.requestId) && Number.isSafeInteger(value.amountCents) && value.amountCents > 0 && (value.paymentId === undefined || typeof value.paymentId === "string")) return value;
  } catch { /* No credentials or payer document are stored. */ }
  return null;
}
function chargeFrom(value: unknown): PixCharge {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || !value.id || !("status" in value) || typeof value.status !== "string") throw new Error("invalid_response");
  const row = value as Record<string, unknown>;
  let ticketUrl = "";
  try { const url = new URL(String(row.ticketUrl ?? "")); if (url.protocol === "https:" && !url.username && !url.password) ticketUrl = url.href; } catch { /* Optional URL. */ }
  return { id: value.id, status: value.status, qrCode: typeof row.qrCode === "string" ? row.qrCode : "", ticketUrl, priceLabel: typeof row.priceLabel === "string" ? row.priceLabel : "" };
}

/** One intention per authenticated account/workspace. Never replay a creation on an uncertain result:
 * legacy providers do not honor requestId. Managed requests still receive the stable identity. */
export function usePixTopUp(scope: string, onPaid: () => Promise<unknown>) {
  const [state, setState] = useState<State>(() => empty(scope));
  const current = useRef(state), generation = useRef(0), mounted = useRef(false);
  const request = useRef<AbortController | null>(null), busy = useRef(false), onPaidRef = useRef(onPaid);
  useEffect(() => { onPaidRef.current = onPaid; }, [onPaid]);
  const update = useCallback((next: State) => { current.current = next; setState(next); }, []);

  useEffect(() => {
    const sequence = ++generation.current; mounted.current = true; busy.current = false;
    const intent = scope ? restore(scope) : null;
    const next = { ...empty(scope), intent, locked: !!intent, notice: intent ? "Uma recarga já foi solicitada nesta sessão. Confira o mesmo pedido antes de gerar outra." : "" };
    current.current = next;
    queueMicrotask(() => { if (mounted.current && sequence === generation.current) setState(next); });
    return () => { mounted.current = false; generation.current = sequence + 1; request.current?.abort(); };
  }, [scope]);

  const perform = useCallback(async (kind: "create" | "status", input?: { amountCents: number; customerDocument: string }) => {
    if (!scope || !mounted.current || busy.current || current.current.scope !== scope) return;
    const previous = current.current;
    if (kind === "create" && (previous.locked || !input)) return;
    if (kind === "status" && !previous.intent?.paymentId) return;
    busy.current = true;
    const sequence = generation.current, abort = new AbortController(); request.current = abort;
    const intent: Intent = kind === "create" ? { requestId: previous.intent?.requestId ?? crypto.randomUUID(), amountCents: input!.amountCents } : previous.intent!;
    if (kind === "create") remember(scope, intent); // UUID + amount only; never credentials, CPF/CNPJ, QR or provider response.
    update({ ...previous, intent, locked: true, busy: true, error: "", notice: "" });
    const deadline = window.setTimeout(() => abort.abort(), 30_000);
    const alive = () => mounted.current && sequence === generation.current && current.current.scope === scope;
    try {
      const response = await fetch("/api/otp/pix", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, signal: abort.signal,
        body: JSON.stringify(kind === "create" ? { requestId: intent.requestId, amountCents: intent.amountCents, customerDocument: input!.customerDocument } : { action: "status", paymentId: intent.paymentId }) });
      const payload: unknown = await response.json();
      if (!alive()) return;
      if (!response.ok) {
        const code = payload && typeof payload === "object" && "code" in payload ? payload.code : undefined;
        // Only explicit pre-effect input rejection unlocks this same intention for correction.
        if (kind === "create" && response.status === 400 && ["invalid_input", "invalid_amount", "invalid_document", "request_id_required"].includes(String(code))) {
          remember(scope, null); update({ ...current.current, locked: false, error: "Revise o valor e o CPF/CNPJ. A solicitação foi rejeitada antes de gerar a cobrança." }); return;
        }
        throw new Error("unconfirmed");
      }
      const charge = chargeFrom(payload);
      if (kind === "status" && charge.id !== intent.paymentId) throw new Error("wrong_payment");
      const saved = { ...intent, paymentId: charge.id }; remember(scope, saved);
      const notice = charge.status === "paid" ? "Pagamento confirmado. Saldo liberado." : terminal(charge.status) ? "Esta cobrança foi encerrada pelo provedor." : charge.qrCode ? "PIX gerado. Aguarde a confirmação do pagamento." : "Cobrança em confirmação. Nenhum novo PIX será gerado enquanto o resultado estiver pendente.";
      update({ ...current.current, intent: saved, charge, locked: true, notice, error: "" });
      if (charge.status === "paid" && previous.charge?.status !== "paid") await onPaidRef.current().catch(() => undefined);
    } catch {
      if (alive()) update({ ...current.current, locked: true, error: kind === "create" ? "Não foi possível confirmar a geração. Não repita a recarga: a cobrança pode existir. Confira o pedido com o administrador." : "Não foi possível consultar esta cobrança. O pedido anterior foi preservado." });
    } finally {
      window.clearTimeout(deadline);
      if (alive()) { busy.current = false; update({ ...current.current, busy: false }); }
    }
  }, [scope, update]);

  const visible = state.scope === scope ? state : empty(scope);
  useEffect(() => {
    if (!visible.intent?.paymentId || terminal(visible.charge?.status)) return;
    const timer = window.setInterval(() => { void perform("status"); }, 12_000);
    return () => window.clearInterval(timer);
  }, [visible.intent?.paymentId, visible.charge?.status, perform]);

  function newIntent() {
    if (busy.current || !terminal(current.current.charge?.status)) return;
    remember(scope, null); update(empty(scope));
  }
  return { ...visible, canStartNew: terminal(visible.charge?.status), start: (amountCents: number, customerDocument: string) => perform("create", { amountCents, customerDocument }), check: () => perform("status"), newIntent };
}
