"use client";

import { useEffect, useState } from "react";
import type { OtpPrimaryProvider, ProviderOverride } from "../../lib/otp-provider-policy";
import styles from "./AdminOtpProviderSettings.module.css";

type User = { id: string; email: string; displayName: string; status: string };
type Projection = { accountUserId: string; provider: OtpPrimaryProvider; source: "global" | "legacy" | "override"; selfSupply: boolean };
type Policy = { version: string | null; configured: boolean; globalProvider: OtpPrimaryProvider; overrides: ProviderOverride[]; users?: Projection[] };
const endpoint = "/api/admin/otp/provider-policy";
const label = (value: OtpPrimaryProvider) => value === "instacaster" ? "InstaCaster" : "OTPGmail";

async function json<T = unknown>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Não foi possível carregar a configuração.");
  return body;
}

/** Root integrates this component exclusively in the platform owner's view. API gates rendering too. */
export default function AdminOtpProviderSettings() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [global, setGlobal] = useState<OtpPrimaryProvider>("instacaster");
  const [batch, setBatch] = useState<OtpPrimaryProvider | "global">("global");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  function beginLoad() { setLoading(true); setError(""); }
  function refresh() { beginLoad(); setRevision(value => value + 1); }

  useEffect(() => {
    const controller = new AbortController();
    const options = { cache: "no-store" as const, signal: controller.signal };
    async function load() {
      const gate = await fetch(endpoint, options);
      if (gate.status === 401 || gate.status === 403) { setDenied(true); setPolicy(null); return; }
      await json(gate);
      const directory = await json<{ users: User[]; total: number }>(await fetch(`/api/admin/users?${new URLSearchParams({ q: query, page: String(page), pageSize: "25" })}`, options));
      const rows: User[] = directory.users;
      const suffix = rows.length ? `?${new URLSearchParams({ accountUserIds: JSON.stringify(rows.map(row => row.id)) })}` : "";
      const snapshot = await json<Policy>(await fetch(endpoint + suffix, options));
      if (controller.signal.aborted) return;
      setDenied(false); setPolicy(snapshot); setGlobal(snapshot.globalProvider); setUsers(rows); setTotal(directory.total);
    }
    load().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Falha ao carregar."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, page, revision]);

  async function save(change: Record<string, unknown>, success: string) {
    if (!policy || saving || loading) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: policy.version, ...change }) });
      if (response.status === 401 || response.status === 403) { setDenied(true); setPolicy(null); return; }
      if (response.status === 409) {
        const body = await response.json() as { error?: string };
        setNotice(body.error || "A configuração mudou. Revise os dados atualizados antes de salvar novamente.");
        refresh();
        return;
      }
      const updated = await json<Policy>(response);
      setPolicy(updated); setSelected([]); setConfirmClear(false); setNotice(success); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar. Atualize antes de tentar novamente."); }
    finally { setSaving(false); }
  }

  if (denied) return null;
  if (!policy) return <div className={styles.root} aria-busy={loading}>{error ? <><p role="alert">{error}</p><button onClick={refresh}>Tentar novamente</button></> : <p role="status">Carregando configuração…</p>}</div>;
  const busy = loading || saving;
  const eligible = users.filter(user => !policy.users?.find(row => row.accountUserId === user.id)?.selfSupply).map(user => user.id);
  const allPage = eligible.length > 0 && eligible.every(id => selected.includes(id));
  function toggle(id: string) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 100 ? [...current, id] : current);
  }
  function selectPage() {
    setSelected(current => allPage ? current.filter(id => !eligible.includes(id)) : [...new Set([...current, ...eligible])].slice(0, 100));
  }
  return <section className={styles.root} aria-label="Fornecedor principal Gmail" aria-busy={busy}>
    <header><div><h3>Fornecedor principal Gmail</h3><p>Escolha o fornecedor dos pedidos novos. O fornecedor alternativo continua disponível quando falta estoque. Pedidos já feitos continuam com o fornecedor de origem.</p></div><span className={styles.badge}>Exclusivo do proprietário</span></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.global}>
      <p><strong>Padrão atual: {label(policy.globalProvider)}</strong>{global !== policy.globalProvider ? " · A seleção abaixo ainda não foi salva." : ""}</p>
      <label>Novo padrão global<select value={global} disabled={busy} onChange={event => setGlobal(event.target.value as OtpPrimaryProvider)}><option value="instacaster">InstaCaster</option><option value="otpgmail">OTPGmail</option></select></label>
      <button className={styles.primary} disabled={busy} onClick={() => save({ globalProvider: global }, "Padrão global salvo. As exceções foram preservadas.")}>Salvar padrão global</button>
      <p>{policy.overrides.length} exceção(ões) preservada(s). {policy.configured ? "Trocar o padrão não altera essas escolhas." : "Ainda sem configuração: InstaCaster global e três exceções existentes na OTPGmail."}</p>
    </div>
    <div className={styles.clear}>
      <p>Para aplicar o padrão atual ({label(policy.globalProvider)}) a todos os usuários atendidos pela plataforma, remova explicitamente todas as exceções.</p>
      <label><input type="checkbox" checked={confirmClear} disabled={busy || !policy.overrides.length} onChange={event => setConfirmClear(event.target.checked)} />Remover todas as exceções existentes</label>
      <button disabled={busy || !confirmClear || !policy.overrides.length} onClick={() => save({ clearOverrides: true }, "Todas as exceções foram removidas. Os usuários seguem o padrão global.")}>Aplicar padrão atual a todos</button>
    </div>
    <p className={styles.help}>Contas com API própria continuam usando suas APIs e não são afetadas por esta configuração. Elas aparecem na lista, mas não entram nos lotes.</p>
    <form className={styles.search} onSubmit={event => { event.preventDefault(); if (query === search.trim() && page === 1) refresh(); else { beginLoad(); setQuery(search.trim()); setPage(1); } }}>
      <label>Procurar usuários<input type="search" value={search} maxLength={254} placeholder="Nome ou e-mail" disabled={saving} onChange={event => setSearch(event.target.value)} /></label><button disabled={busy}>Procurar</button>
    </form>
    <div className={styles.batch}>
      <label>Fornecedor do lote<select value={batch} disabled={busy} onChange={event => setBatch(event.target.value as typeof batch)}><option value="global">Seguir padrão global</option><option value="instacaster">InstaCaster</option><option value="otpgmail">OTPGmail</option></select></label>
      <button className={styles.primary} disabled={busy || !selected.length} onClick={() => save({ accountUserIds: selected, provider: batch }, "Fornecedor salvo para o lote selecionado.")}>Salvar lote ({selected.length}/100)</button>
      <button disabled={busy || !selected.length} onClick={() => setSelected([])}>Limpar seleção</button>
    </div>
    <p className={styles.help}>A seleção permanece ao mudar a página ou a busca, até 100 usuários por lote. “Seguir padrão global” remove a exceção individual.</p>
    <label className={styles.selectPage}><input type="checkbox" checked={allPage} disabled={busy || !eligible.length || !allPage && selected.length >= 100} onChange={selectPage} />Selecionar todos da página (até completar 100)</label>
    <ul className={styles.users}>{users.map(user => {
      const projection = policy.users?.find(row => row.accountUserId === user.id);
      return <li key={user.id}><label><input type="checkbox" aria-label={`Selecionar ${user.email}`} checked={selected.includes(user.id)} disabled={busy || projection?.selfSupply || !selected.includes(user.id) && selected.length >= 100} onChange={() => toggle(user.id)} /><span><strong>{user.displayName || user.email}</strong><small>{user.email} · {user.status === "active" ? "Ativo" : "Inativo"}</small></span></label><div><strong>{projection?.selfSupply ? "API própria" : projection ? label(projection.provider) : "Atualizando…"}</strong><small>{projection?.selfSupply ? "Não afetado" : projection?.source === "legacy" ? "Exceção existente" : projection?.source === "override" ? "Exceção individual" : "Segue padrão global"}</small></div></li>;
    })}</ul>
    {!users.length && <p>Nenhum usuário encontrado.</p>}
    <footer className={styles.pager}><span>Página {page} de {Math.max(1, Math.ceil(total / 25))} · {total} usuários</span><div><button disabled={busy || page <= 1} onClick={() => { beginLoad(); setPage(value => value - 1); }}>Anterior</button><button disabled={busy || page * 25 >= total} onClick={() => { beginLoad(); setPage(value => value + 1); }}>Próxima</button><button disabled={busy} onClick={refresh}>Atualizar</button></div></footer>
  </section>;
}
