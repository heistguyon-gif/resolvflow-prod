"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import AdminUserOtpManager, { type AdminOtpTarget } from "./AdminUserOtpManager";
import AdminOtpHistory from "./AdminOtpHistory";
import AdminOtpMetrics from "./AdminOtpMetrics";
import AdminOtpReconciliation from "./AdminOtpReconciliation";
import AdminOtpProviderSettings from "./AdminOtpProviderSettings";
import styles from "./OwnerAdminOtpCenter.module.css";
import { formatAdminDateTime } from "../lib/adminDateTime";

type Settings = { priceCents: number; pricePriorityCents: number; priceRushCents: number; minDepositCents: number;
  supplierReady: boolean; pixReady: boolean; globalBalance: { state: string; balance?: string; currency?: string; checkedAt?: string };
  fallbackBalance?: { state: string; balance?: number; currency?: string; checkedAt?: string };
  canViewStock?: boolean;
  fallbackStock?: { total: number; warehouse2: number; checkedAt: string } | null; error?: string };
type Membership = { workspaceOwnerUserId: string; workspaceName: string; walletBalanceCents: number;
  billingMode: string; otpApisCount?: number; otpEnabledApisCount?: number; otpOpenOrders?: number; status: string };
type User = { id: string; displayName: string; email: string; status: string; memberships: Membership[] };
type Directory = { users: User[]; total: number; page: number; pageSize: number; error?: string };

const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const dollars = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value);

function balanceLabel(balance: Settings["globalBalance"]) {
  if (balance?.state === "ready" && balance.balance !== undefined && balance.balance.trim() !== "" && Number.isFinite(Number(balance.balance)) && balance.currency?.toUpperCase() === "USD") return dollars(Number(balance.balance));
  if (balance?.state === "invalid_key") return "Verifique a chave de acesso";
  if (balance?.state === "unconfigured") return "Não configurado";
  if (balance?.state === "insufficient_balance") return "Saldo insuficiente";
  return "Saldo indisponível";
}

export function OwnerAdminOtpCenter({ from, to }: { from: string; to: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [deposit, setDeposit] = useState("");
  const [supplierKey, setSupplierKey] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AdminOtpTarget | null>(null);
  const [exchange, setExchange] = useState<{ vndPerUsd: number; updatedAt: string } | null>(null);
  const busy = useRef(false);
  const depositEdited = useRef(false);

  const loadSettings = useCallback(async (refreshBalance = false) => {
    setBalanceLoading(true);
    const quote = fetch("/api/admin/otp/exchange", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Cotação indisponível");
      const body = await response.json() as { vndPerUsd: number; updatedAt: string };
      setExchange(Number.isFinite(body.vndPerUsd) && body.vndPerUsd > 0 ? body : null);
    }).catch(() => setExchange(null));
    try {
      const response = await fetch(`/api/otp/settings${refreshBalance ? "?refreshBalance=1" : ""}`, { cache: "no-store" });
      const body = await response.json() as Settings;
      if (!response.ok) throw new Error(body.error || "Configurações indisponíveis.");
      setSettings(body);
      if (!depositEdited.current) setDeposit(reais(body.minDepositCents));
      setSettingsError("");
    } catch (reason) { setSettingsError(reason instanceof Error ? reason.message : "Configurações indisponíveis."); }
    finally { await quote; setBalanceLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadSettings(), 0); return () => window.clearTimeout(timer); }, [loadSettings]);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: search, page: String(page), from, to });
        const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as Directory;
        if (!response.ok) throw new Error(body.error || "Usuários indisponíveis.");
        setDirectory(body); setDirectoryError("");
      } catch (reason) { if (!controller.signal.aborted) setDirectoryError(reason instanceof Error ? reason.message : "Usuários indisponíveis."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, page, from, to]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (busy.current) return; busy.current = true; setSettingsBusy(true); setSettingsError(""); setNotice("");
    try {
      const response = await fetch("/api/otp/settings", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ minDepositReais: deposit,
          supplierKey: supplierKey.trim() || undefined }) });
      const body = await response.json() as Settings;
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      setSupplierKey(""); depositEdited.current = false; setNotice("Configurações salvas.");
      await loadSettings(true);
    } catch (reason) { setSettingsError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { busy.current = false; setSettingsBusy(false); }
  }

  const pages = Math.max(1, Math.ceil((directory?.total || 0) / (directory?.pageSize || 24)));
  return <section className={styles.root} aria-label="Administração global do Gmail OTP">
    {settingsError ? <p className={styles.error} role="alert">{settingsError}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <section className={styles.global} aria-label="Fornecedores">
      <header><h2>Fornecedores</h2><button className={styles.refresh} type="button" onClick={() => void loadSettings(true)} disabled={settingsBusy || balanceLoading}>{balanceLoading ? "Atualizando..." : "Atualizar saldos"}</button></header>
      <div className={styles.suppliers}>
      {settings ? <div className={styles.globalBalance} aria-live="polite">
        <div><h3>InstaCaster</h3><small>Saldo disponível em dólar</small><strong>{balanceLabel(settings.globalBalance)}</strong>
          <small>{settings.globalBalance?.checkedAt ? `Atualizado em ${formatAdminDateTime(settings.globalBalance.checkedAt, "horário indisponível")}` : "Aguardando consulta de saldo"}</small></div>
      </div> : null}
      {settings ? <div className={styles.globalBalance} aria-live="polite">
        <div><h3>OTPGmail</h3><small>Saldo aproximado em dólar</small><strong>{settings.fallbackBalance?.state === "ready"
          ? exchange && typeof settings.fallbackBalance.balance === "number" && Number.isFinite(settings.fallbackBalance.balance) && settings.fallbackBalance.currency === "VND" ? dollars(settings.fallbackBalance.balance / exchange.vndPerUsd) : "Conversão indisponível"
          : settings.fallbackBalance?.state === "unconfigured" ? "Não configurado" : "Saldo indisponível"}</strong>
          <small>{settings.fallbackBalance?.checkedAt ? `Atualizado em ${formatAdminDateTime(settings.fallbackBalance.checkedAt, "horário indisponível")}` : "Aguardando consulta de saldo"}</small>
          {exchange ? <small>Câmbio de {formatAdminDateTime(exchange.updatedAt)} · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a></small> : <small>A conversão depende da cotação disponível.</small>}</div>
        {settings.canViewStock ? <div className={styles.stock}><span>Gmails disponíveis para Instagram</span><b>{settings.fallbackStock ? settings.fallbackStock.total.toLocaleString("pt-BR") : "Indisponível"}</b>
          <small>{settings.fallbackStock ? `${settings.fallbackStock.warehouse2.toLocaleString("pt-BR")} no armazém 2 · ${formatAdminDateTime(settings.fallbackStock.checkedAt)}` : "Não foi possível consultar o estoque."}</small></div> : null}
      </div> : null}
      </div>
      {!settings ? <p className={styles.empty}>{balanceLoading ? "Carregando fornecedores..." : "Não foi possível carregar os fornecedores. Tente atualizar os saldos."}</p> : null}
    </section>
    <AdminOtpProviderSettings />
    <section className={styles.global} aria-label="Cobrança e configurações">
      <header><h2>Cobrança e configurações</h2>{settings ? <span className={styles.badge}>PIX {settings.pixReady ? "configurado" : "não configurado"}</span> : null}</header>
      {settings ? <form onSubmit={saveSettings}>
        <div className={styles.priceGrid}>
          <div className={styles.price}><small>Preço para o cliente</small><strong>{money(settings.priceCents)}</strong><span>por pedido entregue</span></div>
          <label>Depósito mínimo via PIX (R$)<input value={deposit} onChange={(event) => { depositEdited.current = true; setDeposit(event.target.value); }} inputMode="decimal" required disabled={settingsBusy} /></label>
        </div>
        <details className={styles.secrets}><summary>Chave de acesso do InstaCaster</summary><div>
          <label>Nova chave de acesso<input type="password" autoComplete="new-password" value={supplierKey} onChange={(event) => setSupplierKey(event.target.value)} placeholder="Deixe vazio para manter a chave atual" disabled={settingsBusy} /></label>
        </div></details>
        <button type="submit" disabled={settingsBusy}>{settingsBusy ? "Salvando..." : "Salvar configurações"}</button>
      </form> : <p className={styles.empty}>Configurações ainda não carregadas.</p>}
    </section>
    <AdminOtpMetrics from={from} to={to} ownerUi />
    <AdminOtpHistory ownerUi />
    <AdminOtpReconciliation />
    <section className={styles.directory} aria-label="Usuários e workspaces Gmail OTP"><header><div><h3>Carteiras dos usuários</h3>
      <p>Selecione uma pessoa para consultar saldo, pedidos e fornecedores.</p></div><label>Buscar usuário<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou e-mail" /></label></header>
      {directoryError ? <p className={styles.error} role="alert">{directoryError}</p> : null}
      {loading ? <p className={styles.empty}>Carregando usuários...</p> : directory?.users.length ? <div className={styles.userList}>
        {directory.users.flatMap((user) => user.memberships.map((membership) => <button type="button" key={`${user.id}:${membership.workspaceOwnerUserId}`}
          className={target?.accountUserId === user.id && target.workspaceOwnerUserId === membership.workspaceOwnerUserId ? styles.selected : ""}
          onClick={() => setTarget({ accountUserId: user.id, workspaceOwnerUserId: membership.workspaceOwnerUserId,
            email: user.email, displayName: user.displayName, workspaceName: membership.workspaceName })}>
          <span><strong>{user.displayName}</strong><small>{user.email} · {membership.workspaceName}</small></span>
          <span><b>{membership.billingMode === "supplier" ? "APIs próprias" : money(membership.walletBalanceCents)}</b>
            <small>{membership.otpEnabledApisCount || 0}/{membership.otpApisCount || 0} APIs ativas · {membership.otpOpenOrders || 0} e-mails abertos</small></span>
        </button>))}</div> : <p className={styles.empty}>Nenhum usuário ou workspace com estes filtros.</p>}
      <footer className={styles.pager}><span>{directory?.total || 0} usuários · página {page} de {pages}</span><div>
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button>
        <button type="button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></footer>
    </section>
    {target ? <AdminUserOtpManager key={`${target.accountUserId}:${target.workspaceOwnerUserId}`} target={target} onClose={() => setTarget(null)} /> : null}
  </section>;
}
