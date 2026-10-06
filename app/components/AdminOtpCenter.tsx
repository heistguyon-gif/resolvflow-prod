"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import AdminUserOtpManager, { type AdminOtpTarget } from "./AdminUserOtpManager";
import AdminOtpHistory from "./AdminOtpHistory";
import AdminOtpMetrics from "./AdminOtpMetrics";
import styles from "./AdminOtpCenter.module.css";
import { formatAdminDateTime } from "../lib/adminDateTime";

type Settings = { priceCents: number; pricePriorityCents: number; priceRushCents: number; minDepositCents: number;
  supplierReady: boolean; pixReady: boolean; globalBalance: { state: string; balance?: string; currency?: string; checkedAt?: string }; error?: string };
type Membership = { workspaceOwnerUserId: string; workspaceName: string; walletBalanceCents: number;
  billingMode: string; otpApisCount?: number; otpEnabledApisCount?: number; otpOpenOrders?: number; status: string };
type User = { id: string; displayName: string; email: string; status: string; memberships: Membership[] };
type Directory = { users: User[]; total: number; page: number; pageSize: number; error?: string };

const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export function AdminOtpCenter({ from, to }: { from: string; to: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [prices, setPrices] = useState({ normal: "", priority: "", rush: "", deposit: "" });
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

  const loadSettings = useCallback(async (refreshBalance = false) => {
    setBalanceLoading(true);
    try {
      const response = await fetch(`/api/otp/settings${refreshBalance ? "?refreshBalance=1" : ""}`, { cache: "no-store" });
      const body = await response.json() as Settings;
      if (!response.ok) throw new Error(body.error || "Configurações indisponíveis.");
      setSettings(body);
      setPrices({ normal: reais(body.priceCents), priority: reais(body.pricePriorityCents),
        rush: reais(body.priceRushCents), deposit: reais(body.minDepositCents) });
      setSettingsError("");
    } catch (reason) { setSettingsError(reason instanceof Error ? reason.message : "Configurações indisponíveis."); }
    finally { setBalanceLoading(false); }
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
    event.preventDefault(); setSettingsBusy(true); setSettingsError(""); setNotice("");
    try {
      const response = await fetch("/api/otp/settings", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ priceReais: prices.normal, pricePriorityReais: prices.priority,
          priceRushReais: prices.rush, minDepositReais: prices.deposit,
          supplierKey: supplierKey.trim() || undefined }) });
      const body = await response.json() as Settings;
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      setSupplierKey(""); setNotice("Configurações globais atualizadas.");
      await loadSettings(true);
    } catch (reason) { setSettingsError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { setSettingsBusy(false); }
  }

  const pages = Math.max(1, Math.ceil((directory?.total || 0) / (directory?.pageSize || 24)));
  return <section className={styles.root} aria-label="Administração global do Gmail OTP">
    <div className={styles.intro}><span className="panel-kicker">Configuração da plataforma</span><h2>Gestão do serviço</h2>
      <p>Preços e fornecedor globais, carteiras e APIs próprias por usuário. As operações usam as regras atuais do Gmail OTP.</p></div>
    {settingsError ? <p className={styles.error} role="alert">{settingsError}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <section className={styles.global} aria-label="Configurações globais">
      <header><div><span className="panel-kicker">Escopo global</span><h3>Preços e credenciais</h3></div>
        <div className={styles.readiness}><span>Fornecedor: <b>{settings?.supplierReady ? "Configurado" : "Pendente"}</b></span>
          <span>PIX: <b>{settings?.pixReady ? "Configurado" : "Pendente"}</b></span></div></header>
      {settings ? <div className={styles.globalBalance} aria-live="polite">
        <div><small>Saldo da API global de Gmail OTP</small><strong>{settings.globalBalance?.state === "ready"
          ? `${settings.globalBalance.balance} ${settings.globalBalance.currency || "(moeda não informada)"}`
          : settings.globalBalance?.state === "not_reported" ? "Saldo não informado"
          : settings.globalBalance?.state === "invalid_key" ? "Chave inválida"
          : settings.globalBalance?.state === "insufficient_balance" ? "Saldo insuficiente"
          : settings.globalBalance?.state === "unconfigured" ? "API não configurada" : "Consulta indisponível"}</strong>
          <small>{settings.globalBalance?.checkedAt ? `Consultado em ${formatAdminDateTime(settings.globalBalance.checkedAt, "horário indisponível")}` : "Saldo externo da plataforma; não é a carteira dos usuários."}</small></div>
        <button type="button" onClick={() => void loadSettings(true)} disabled={settingsBusy || balanceLoading}>{balanceLoading ? "Consultando..." : "Atualizar saldo"}</button>
      </div> : null}
      {!settings ? <p className={styles.empty}>Carregando configurações...</p> : <form onSubmit={saveSettings}>
        <div className={styles.priceGrid}>
          <label>Normal (R$)<input value={prices.normal} onChange={(event) => setPrices((current) => ({ ...current, normal: event.target.value }))} inputMode="decimal" required /></label>
          <label>30s (R$)<input value={prices.priority} onChange={(event) => setPrices((current) => ({ ...current, priority: event.target.value }))} inputMode="decimal" required /></label>
          <label>Na hora (R$)<input value={prices.rush} onChange={(event) => setPrices((current) => ({ ...current, rush: event.target.value }))} inputMode="decimal" required /></label>
          <label>Depósito mínimo PIX (R$)<input value={prices.deposit} onChange={(event) => setPrices((current) => ({ ...current, deposit: event.target.value }))} inputMode="decimal" required /></label>
        </div>
        <details className={styles.secrets}><summary>Atualizar credenciais globais</summary><div>
          <label>Chave global do fornecedor<input type="password" autoComplete="new-password" value={supplierKey} onChange={(event) => setSupplierKey(event.target.value)} placeholder="Vazio mantém a chave atual" /></label>
        </div></details>
        <button type="submit" disabled={settingsBusy}>{settingsBusy ? "Salvando..." : "Salvar configurações globais"}</button>
      </form>}
    </section>
    <AdminOtpMetrics from={from} to={to} />
    <AdminOtpHistory />
    <section className={styles.directory} aria-label="Usuários e workspaces Gmail OTP"><header><div><span className="panel-kicker">Consulta individual</span><h3>Usuários e workspaces</h3>
      <p>Selecione um destino para ver modo, saldo, pedidos abertos e estado de cada API.</p></div><label>Buscar usuário<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou e-mail" /></label></header>
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
