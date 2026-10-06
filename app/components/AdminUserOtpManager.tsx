"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminOtpHistory from "./AdminOtpHistory";
import AdminOtpMetrics from "./AdminOtpMetrics";
import styles from "./PlatformAdminDashboard.module.css";
import { formatAdminDateTime } from "../lib/adminDateTime";

export type AdminOtpTarget = {
  accountUserId: string;
  workspaceOwnerUserId: string;
  email: string;
  displayName: string;
  workspaceName: string;
};

type ApiCard = {
  id: string;
  name: string;
  enabled: boolean;
  isPrimary: boolean;
  openOrders: number;
  state: string;
  balance?: string;
  currency?: string;
  error?: string;
};

type OtpAdminData = {
  target: AdminOtpTarget;
  mode: "platform" | "supplier";
  explicitMode: string | null;
  balanceCents: number;
  balanceLabel: string;
  openOrders: number;
  apis: ApiCard[];
  ledger: Array<{ id: string; type: string; summary: string; amountCents: number; amountLabel: string; balanceAfterLabel: string; at: string }>;
};

function stateLabel(api: ApiCard) {
  if (!api.enabled) return "Pausada";
  if (api.state === "ready") return "Disponível";
  if (api.state === "invalid_key") return "Chave inválida";
  if (api.state === "insufficient_balance") return "Sem saldo";
  return api.error || "Indisponível";
}

function dateLabel(value: string) {
  return formatAdminDateTime(value);
}

export default function AdminUserOtpManager({ target, onClose }: { target: AdminOtpTarget; onClose: () => void }) {
  const [data, setData] = useState<OtpAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [amount, setAmount] = useState("");
  const [apiName, setApiName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [historyVersion, setHistoryVersion] = useState(0);

  const query = useMemo(() => new URLSearchParams({ accountUserId: target.accountUserId, workspaceOwnerUserId: target.workspaceOwnerUserId }).toString(), [target]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/otp?${query}`, { cache: "no-store" });
      const body = await response.json() as OtpAdminData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar.");
      setData(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(action: string, payload: Record<string, unknown>, message: string) {
    setBusy(action + String(payload.apiId || ""));
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, accountUserId: target.accountUserId, workspaceOwnerUserId: target.workspaceOwnerUserId, ...payload }),
      });
      const body = await response.json() as OtpAdminData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      setData(body);
      setHistoryVersion((current) => current + 1);
      setSuccess(message);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function adjust(sign: 1 | -1) {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return setError("Informe um valor válido em reais.");
    const cents = Math.round(parsed * 100) * sign;
    if (await mutate("adjust_balance", { amountCents: cents }, sign > 0 ? "Saldo adicionado." : "Saldo removido.")) setAmount("");
  }

  async function addApi() {
    if (await mutate("add_api", { name: apiName, supplierKey: apiKey }, "API adicionada sem expor a chave.")) {
      setApiName("");
      setApiKey("");
    }
  }

  async function deleteApi(api: ApiCard) {
    const force = api.openOrders > 0;
    const question = force
      ? `A API “${api.name}” possui ${api.openOrders} e-mail(s) aberto(s). Excluir também encerrará esses pedidos. Confirmar?`
      : `Excluir definitivamente a API “${api.name}”? A chave salva será removida.`;
    if (!window.confirm(question)) return;
    await mutate("delete_api", { apiId: api.id, closeOpenOrders: force }, "API excluída.");
  }

  async function revealApi(api: ApiCard) {
    if (revealedKeys[api.id]) {
      setRevealedKeys((current) => { const next = { ...current }; delete next[api.id]; return next; });
      return;
    }
    setBusy(`reveal_api${api.id}`);
    setError("");
    try {
      const response = await fetch("/api/admin/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reveal_api", accountUserId: target.accountUserId, workspaceOwnerUserId: target.workspaceOwnerUserId, apiId: api.id }),
      });
      const body = await response.json() as { supplierKey?: string; error?: string };
      if (!response.ok || !body.supplierKey) throw new Error(body.error || "Não foi possível visualizar a chave.");
      setRevealedKeys((current) => ({ ...current, [api.id]: body.supplierKey as string }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível visualizar a chave.");
    } finally {
      setBusy("");
    }
  }

  return <section className={`panel ${styles.otpManager}`} aria-label={`Gmail OTP de ${target.displayName}`}>
    <header className={styles.otpHeader}>
      <div><span className="panel-kicker">Configuração individual</span><h2>Gmail OTP · {target.displayName}</h2><p>{target.email} · {target.workspaceName}</p></div>
      <button type="button" className={styles.otpClose} onClick={onClose} aria-label="Fechar configuração">Fechar</button>
    </header>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {success ? <div className={styles.otpSuccess} role="status">{success}</div> : null}
    {loading ? <p className={styles.otpEmpty}>Carregando configuração…</p> : data ? <>
      <div className={styles.otpSummary}>
        <article><span>Modelo atual</span><strong>{data.mode === "supplier" ? "APIs próprias" : "Carteira e PIX"}</strong><small>Aplicado somente neste workspace</small></article>
        <article><span>Saldo interno</span><strong>{data.balanceLabel}</strong><small>Usado apenas no modo Carteira e PIX</small></article>
        <article><span>APIs cadastradas</span><strong>{data.apis.length}</strong><small>{data.apis.filter(api => api.enabled).length} habilitada(s)</small></article>
        <article><span>E-mails abertos</span><strong>{data.openOrders}</strong><small>Somados neste usuário</small></article>
      </div>
      <AdminOtpMetrics accountUserId={target.accountUserId} workspaceOwnerUserId={target.workspaceOwnerUserId} mode={data.mode} revision={historyVersion} />

      <div className={styles.otpSection}>
        <div className={styles.otpSectionTitle}><div><span>Forma de operação</span><h3>Origem do saldo e dos pedidos</h3></div></div>
        <div className={styles.otpModes}>
          <button type="button" className={data.mode === "platform" ? styles.otpModeActive : ""} disabled={Boolean(busy)} onClick={() => void mutate("set_mode", { mode: "platform" }, "Modo Carteira e PIX ativado.")}><strong>Carteira e PIX</strong><small>Usa o saldo interno e a API global da plataforma.</small></button>
          <button type="button" className={data.mode === "supplier" ? styles.otpModeActive : ""} disabled={Boolean(busy)} onClick={() => void mutate("set_mode", { mode: "supplier" }, "Modo APIs próprias ativado.")}><strong>APIs próprias</strong><small>Usa exclusivamente o saldo de cada API cadastrada.</small></button>
        </div>
      </div>

      <div className={styles.otpSection}>
        <div className={styles.otpSectionTitle}><div><span>Carteira interna</span><h3>Adicionar ou remover saldo</h3></div><b>{data.balanceLabel}</b></div>
        <div className={styles.otpBalanceForm}>
          <label><span>Valor em reais</span><div><i>R$</i><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" aria-label="Valor do ajuste" /></div></label>
          <button type="button" disabled={Boolean(busy)} onClick={() => void adjust(1)}>Adicionar saldo</button>
          <button type="button" className={styles.otpDangerOutline} disabled={Boolean(busy)} onClick={() => void adjust(-1)}>Remover saldo</button>
        </div>
      </div>

      <div className={styles.otpSection}>
        <div className={styles.otpSectionTitle}><div><span>Ambientes independentes</span><h3>APIs de Gmail deste usuário</h3></div><small>As chaves ficam ocultas por padrão e só o superadmin pode revelá-las.</small></div>
        <div className={styles.otpApiForm}>
          <label><span>Nome da API</span><input value={apiName} onChange={event => setApiName(event.target.value)} placeholder="Ex.: API principal" /></label>
          <label><span>Chave secreta</span><input type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Cole a chave do fornecedor" /></label>
          <button type="button" disabled={Boolean(busy) || !apiName.trim() || !apiKey.trim()} onClick={() => void addApi()}>Adicionar API</button>
        </div>
        <div className={styles.otpApiGrid}>
          {data.apis.map(api => <article key={api.id} className={styles.otpApiCard}>
            <div className={styles.otpApiTop}><span className={api.state === "ready" ? styles.otpReady : api.enabled ? styles.otpWarning : styles.otpPaused}>{stateLabel(api)}</span>{api.isPrimary ? <small>Principal</small> : null}</div>
            <h4>{api.name}</h4>
            <strong>{api.balance !== undefined ? `${api.balance} ${String(api.currency || "USD").toLowerCase()}` : "Saldo indisponível"}</strong>
            <p>{api.openOrders} e-mail(s) aberto(s)</p>
            {revealedKeys[api.id] ? <div className={styles.otpRevealedKey}><code>{revealedKeys[api.id]}</code><button type="button" onClick={() => void navigator.clipboard.writeText(revealedKeys[api.id])}>Copiar</button></div> : null}
            <div className={styles.otpApiActions}>
              <button type="button" disabled={Boolean(busy)} onClick={() => void revealApi(api)}>{revealedKeys[api.id] ? "Ocultar chave" : "Ver chave"}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void mutate("set_enabled", { apiId: api.id, enabled: !api.enabled }, api.enabled ? "API pausada." : "API habilitada.")}>{api.enabled ? "Pausar" : "Habilitar"}</button>
              {api.openOrders > 0 ? <button type="button" disabled={Boolean(busy)} onClick={() => window.confirm(`Encerrar ${api.openOrders} e-mail(s) aberto(s) desta API?`) && void mutate("close_api_orders", { apiId: api.id }, "E-mails abertos encerrados.")}>Encerrar e-mails</button> : null}
              <button type="button" className={styles.otpDelete} disabled={Boolean(busy)} onClick={() => void deleteApi(api)}>Excluir</button>
            </div>
          </article>)}
          {!data.apis.length ? <p className={styles.otpEmpty}>Nenhuma API própria cadastrada para este usuário.</p> : null}
        </div>
      </div>

      <AdminOtpHistory key={historyVersion} accountUserId={target.accountUserId} workspaceOwnerUserId={target.workspaceOwnerUserId} />

      <details className={styles.otpLedger}>
        <summary>Histórico de saldo ({data.ledger.length})</summary>
        <div>{data.ledger.map(item => <article key={item.id}><span><strong>{item.summary}</strong><small>{dateLabel(item.at)} · saldo após: {item.balanceAfterLabel}</small></span><b className={item.amountCents < 0 ? styles.otpNegative : ""}>{item.amountLabel}</b></article>)}{!data.ledger.length ? <p className={styles.otpEmpty}>Nenhum ajuste de saldo registrado.</p> : null}</div>
      </details>
    </> : null}
  </section>;
}
