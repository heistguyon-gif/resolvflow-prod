"use client";

import { useEffect, useState } from "react";
import styles from "./AdminOtpMetrics.module.css";

type Metrics = {
  pixDepositsCents: number;
  walletConsumptionCents: number;
  gmailCount: number;
  ownApiGmailCount: number;
  globalOrLegacyGmailCount: number;
  codesReceived: number;
  openOrders: number;
  walletBalanceCents: number;
  sharedWallet: boolean;
  error?: string;
};

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const count = (number: number) => new Intl.NumberFormat("pt-BR").format(number);

export default function AdminOtpMetrics({ accountUserId, workspaceOwnerUserId, from, to, mode, revision = 0 }: {
  accountUserId?: string; workspaceOwnerUserId?: string; from?: string; to?: string;
  mode?: "platform" | "supplier"; revision?: number;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (accountUserId && workspaceOwnerUserId) {
      params.set("accountUserId", accountUserId);
      params.set("workspaceOwnerUserId", workspaceOwnerUserId);
    }
    if (from && to) { params.set("from", from); params.set("to", to); }
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/otp/metrics?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as Metrics;
        if (!response.ok) throw new Error(body.error || "Métricas indisponíveis.");
        setMetrics(body);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Métricas indisponíveis.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [accountUserId, workspaceOwnerUserId, from, to, revision]);

  const individual = Boolean(accountUserId);
  return <section className={styles.root} aria-label={individual ? "Métricas de Gmail OTP do usuário" : "Métricas globais de Gmail OTP"}>
    <header className={styles.header}><div><span className="panel-kicker">Indicadores Gmail OTP</span><h3>{individual ? "Atividade deste usuário" : "Atividade da plataforma"}</h3>
      <p>{from && to ? "Movimento no período selecionado no TOP" : "Movimento em todo o histórico"} · abertos e saldo são valores atuais.</p></div>
      {individual ? <span className={styles.mode}>{mode === "supplier" ? "Modo atual: APIs próprias" : "Modo atual: Carteira e PIX"}</span> : null}</header>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {loading ? <p className={styles.empty} role="status">Carregando indicadores…</p> : metrics && !error ? <>
      <div className={styles.grid}>
        <article><small>Depósitos PIX confirmados</small><strong>{money(metrics.pixDepositsCents)}</strong><span>Entradas na carteira</span></article>
        <article><small>Consumo efetivo da carteira</small><strong>{money(metrics.walletConsumptionCents)}</strong><span>Débitos de pedidos menos reembolsos</span></article>
        <article><small>Gmails comprados</small><strong>{count(metrics.gmailCount)}</strong><span>{count(metrics.ownApiGmailCount)} API própria · {count(metrics.globalOrLegacyGmailCount)} global/legado</span></article>
        <article><small>Códigos recebidos</small><strong>{count(metrics.codesReceived)}</strong><span>Códigos ainda registrados na caixa</span></article>
        <article><small>Pedidos abertos agora</small><strong>{count(metrics.openOrders)}</strong><span>Inclui pedidos de ambas as origens</span></article>
        <article><small>Saldo atual da carteira</small><strong>{money(metrics.walletBalanceCents)}</strong><span>{individual
          ? metrics.sharedWallet ? "Compartilhado neste workspace" : "Saldo deste workspace"
          : "Soma das carteiras, cada workspace uma vez"}</span></article>
      </div>
      <p className={styles.note}>A origem da API, por si só, não determina se houve cobrança na carteira. O consumo considera débitos de pedidos menos reembolsos registrados no ledger. Valores PIX e consumo mostram movimentação, não resultado financeiro; custo do fornecedor e câmbio não estão consolidados. São preservados até 20 códigos por Gmail.</p>
    </> : null}
  </section>;
}
