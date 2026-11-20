"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./InstagramSms.module.css";

type Order = { id: string; phone: string | null; country: string; state: string; status: string | null; code: string | null; expiresAt: string | null; createdAt: string };
type SmsData = { enabled: boolean; limit: number; delivered: number; remaining: number; orders: Order[]; error?: string; order?: Order };

export function InstagramSms({ canOperate }: { canOperate: boolean }) {
  const [data, setData] = useState<SmsData | null>(null);
  const [country, setCountry] = useState<"brazil" | "any">("brazil");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/instagram-sms", { cache: "no-store" });
    const result = await response.json() as SmsData;
    if (!response.ok) throw new Error(result.error || "Não foi possível carregar o SMS.");
    setData(result);
    return result;
  }, []);

  const action = useCallback(async (kind: "buy" | "check" | "cancel", id?: string) => {
    const response = await fetch("/api/instagram-sms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: kind, id, country }) });
    const result = await response.json() as SmsData;
    if (!response.ok) throw new Error(result.error || "Não foi possível processar o pedido.");
    await load();
    return result;
  }, [country, load]);

  useEffect(() => { let active = true; const timer = window.setTimeout(() => { void load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar."); }); }, 0); return () => { active = false; window.clearTimeout(timer); }; }, [load]);
  useEffect(() => {
    if (!data?.orders.some((order) => order.state === "pending")) return;
    const timer = window.setInterval(() => {
      const pending = data.orders.filter((order) => order.state === "pending");
      void Promise.all(pending.map((order) => action("check", order.id).catch(() => null)));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [data?.orders, action]);

  async function run(kind: "buy" | "check" | "cancel", id?: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await action(kind, id);
      setMessage(kind === "buy" ? "Número pronto. Cole no Instagram e aguarde o SMS nesta tela." : kind === "cancel" ? "Pedido encerrado." : result.order?.code ? "Código recebido. Copie e cole no Instagram." : "Ainda aguardando o código SMS.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível processar o SMS."); }
    finally { setBusy(false); }
  }

  if (data && !data.enabled) return null;
  const pending = data?.orders.some((order) => order.state === "pending");
  return <div className={`content ${styles.page}`}>
    <div className={styles.heading}><span className="eyebrow">Criação manual de conta</span><h1>SMS para Instagram</h1><p>Peça um número, informe no Instagram e copie o código quando ele chegar. A criação da conta é feita por você no Instagram.</p></div>
    <section className={styles.panel} aria-label="Pedir número SMS">
      <div className={styles.balance}><strong>{data ? data.remaining : "…"}</strong><span>de 15 pedidos grátis restantes</span></div>
      {data?.remaining === 0 ? <p role="status" className={styles.notice}>Seus 15 pedidos grátis acabaram. Novos pedidos estão bloqueados.</p> : null}
      <div className={styles.actions}><label>País do número<select value={country} disabled={busy || pending} onChange={(event) => setCountry(event.target.value as "brazil" | "any")}><option value="brazil">Brasil</option><option value="any">Qualquer país</option></select></label><button type="button" className="primary-button" disabled={!data?.enabled || !canOperate || busy || pending || data.remaining === 0} onClick={() => void run("buy")}>{busy ? "Processando…" : "Pedir número"}</button></div>
      {pending ? <small>Conclua ou cancele o pedido atual antes de pedir outro número.</small> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}{message ? <p role="status" className={styles.notice}>{message}</p> : null}
    </section>
    <section className={styles.orders} aria-label="Pedidos SMS"><h2>Seus pedidos</h2>{!data?.orders.length ? <p>Nenhum número pedido ainda.</p> : data.orders.map((order) => <article key={order.id} className={styles.order}>
      <div><small>{order.state === "delivered" ? "Código entregue" : order.state === "failed" ? "Pedido não entregue · não consumiu crédito" : "Aguardando SMS"}</small><strong>{order.phone || "Número indisponível"}</strong>{order.expiresAt && order.state === "pending" ? <span>Válido até {new Date(order.expiresAt).toLocaleString("pt-BR")}</span> : null}</div>
      {order.code ? <div className={styles.code}><small>Código SMS</small><strong>{order.code}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(order.code || "")}>Copiar código</button></div> : null}
      {order.state === "pending" ? <div className={styles.orderActions}><button type="button" disabled={busy} onClick={() => void run("check", order.id)}>Buscar código</button><button type="button" disabled={busy} onClick={() => void run("cancel", order.id)}>Cancelar pedido</button></div> : null}
    </article>)}</section>
  </div>;
}
