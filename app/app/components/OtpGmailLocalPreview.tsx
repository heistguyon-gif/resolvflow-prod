"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./OtpGmailLocalPreview.module.css";

type Order = { id: string; email: string | null; status: string; warehouse: number | null; code: string | null; codeCount: number; createdAt: string };
type PreviewData = { configured: boolean; orders: Order[]; error?: string; order?: Order };
const endpoint = "/api/otp/otpgmail-preview";

async function request(action: "buy" | "check", id?: string) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id }), cache: "no-store" });
  const result = await response.json() as PreviewData;
  if (!response.ok) throw new Error(result.error || "OTPGmail não concluiu o pedido.");
  return result;
}

export function OtpGmailLocalPreview({ canOperate }: { canOperate: boolean }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const result = await response.json() as PreviewData;
    if (!response.ok) throw new Error(result.error || "Não foi possível carregar os Gmails.");
    setData(result);
    return result;
  }, []);

  useEffect(() => { let active = true; const timer = window.setTimeout(() => { void load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar."); }); }, 0); return () => { active = false; window.clearTimeout(timer); }; }, [load]);
  const newest = data?.orders[0];
  useEffect(() => {
    if (!newest?.id || !["waiting_code", "completed"].includes(newest.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      void request("check", newest.id).then(() => { if (active) return load(); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao buscar o código."); });
    }, newest.status === "waiting_code" ? 4000 : 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [newest?.id, newest?.status, load]);

  async function buy() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request("buy");
      await load();
      setMessage(result.order?.email ? "Gmail pronto. Cole o e-mail no Instagram e aguarde o código aqui." : "Pedido enviado.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "OTPGmail não concluiu o pedido."); }
    finally { setBusy(false); }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${label} copiado.`); }
    catch { setError(`Não foi possível copiar o ${label.toLowerCase()}.`); }
  }

  return <div className={`content ${styles.page}`}>
    <div className={styles.heading}><span className="eyebrow">Preview local · OTPGmail</span><h1>Gmail OTP</h1><p>Peça um Gmail para o Instagram e veja o código nesta tela. O pedido usa o saldo da sua conta OTPGmail.</p></div>
    <section className={styles.panel}><div><h2>Pedir Gmail</h2><p>Serviço Instagram · gmail.com · armazém 2, com alternativa automática se estiver sem estoque.</p></div><button type="button" className="primary-button" disabled={!canOperate || !data?.configured || busy || newest?.status === "requesting"} onClick={() => void buy()}>{busy ? "Pedindo…" : "Pedir Gmail"}</button></section>
    {data && !data.configured ? <p role="alert" className={styles.error}>Chave OTPGmail não configurada no preview.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}{message ? <p role="status" className={styles.message}>{message}</p> : null}
    <section className={styles.orders} aria-label="Gmails pedidos"><h2>Gmails pedidos</h2>{!data?.orders.length ? <p>Nenhum Gmail pedido ainda.</p> : data.orders.map((order) => <article key={order.id} className={styles.order}>
      <div><small>{order.status === "waiting_code" ? "Aguardando código" : order.status === "completed" ? "Código recebido" : order.status === "cancelled" ? "Cancelado pelo fornecedor" : order.status === "requesting" ? "Preparando pedido" : "Pedido falhou"}</small><strong>{order.email || "Aguardando e-mail"}</strong>{order.warehouse ? <span>Armazém {order.warehouse}</span> : null}</div>
      {order.email ? <button type="button" onClick={() => void copy(order.email!, "E-mail")}>Copiar e-mail</button> : null}
      {order.code ? <div className={styles.code}><small>Código mais recente · {order.codeCount} recebido(s)</small><strong>{order.code}</strong><button type="button" onClick={() => void copy(order.code!, "Código")}>Copiar código</button></div> : null}
    </article>)}</section>
  </div>;
}
