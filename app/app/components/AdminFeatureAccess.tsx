"use client";
import { useEffect, useState } from "react";
import styles from "./AdminFeatureAccess.module.css";
type Target = { accountUserId: string; workspaceOwnerUserId: string; email: string; name: string; workspaceName: string; active: boolean };
type Feature = { id: string; label: string; enabled: boolean; scope: string; configurable: boolean };
type Details = { target: Target; features: Feature[]; history: { requestId: string; enabled: boolean; at: string; actorEmail: string }[]; historySince: string };
const key = (t: Target) => `${t.workspaceOwnerUserId}|${t.accountUserId}`;
const scope = (value: string) => ({ all: "Todos os usuários", pilot: "Piloto da versão", principal: "Piloto principal", individual: "Liberação individual", off: "Não habilitado" }[value] || value);
export function AdminFeatureAccess() {
  const [targets, setTargets] = useState<Target[]>([]), [selected, setSelected] = useState(""), [query, setQuery] = useState("");
  const [details, setDetails] = useState<Details | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<boolean | null>(null), [retry, setRetry] = useState<{ target: string; enabled: boolean; requestId: string } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/admin/features", { cache: "no-store", signal: abort.signal }).then(async r => {
      const data = await r.json() as { targets: Target[]; error?: string }; if (!r.ok) throw new Error(data.error || "Não foi possível carregar os usuários.");
      setTargets(data.targets); const principal = data.targets.find(t => t.email.toLowerCase() === "lucasbgn.affiliate@gmail.com");
      setSelected(principal ? key(principal) : data.targets[0] ? key(data.targets[0]) : "");
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const target = targets.find(t => key(t) === selected); if (!target) return;
    const abort = new AbortController();
    void fetch(`/api/admin/features?${new URLSearchParams({ account: target.accountUserId, workspace: target.workspaceOwnerUserId })}`, { cache: "no-store", signal: abort.signal }).then(async r => {
      const data = await r.json() as Details & { error?: string }; if (!r.ok) throw new Error(data.error || "Não foi possível carregar os recursos."); setDetails(data);
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [selected, targets, revision]);
  async function save() {
    if (!details || confirm === null || busy) return;
    const enabled = confirm, target = selected;
    const requestId = retry?.target === target && retry.enabled === enabled ? retry.requestId : crypto.randomUUID();
    setRetry({ target, enabled, requestId }); setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/features", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: "gmailCentral", accountUserId: details.target.accountUserId, workspaceOwnerUserId: details.target.workspaceOwnerUserId, enabled, requestId }) });
      const data = await r.json() as { error?: string }; if (!r.ok) throw new Error(data.error || "Não foi possível salvar o acesso.");
      setRetry(null); setConfirm(null); setDetails(null); setRevision(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar. Você pode tentar novamente."); } finally { setBusy(false); }
  }
  return <section className={styles.root} aria-label="Recursos por usuário">
    <header><span className="eyebrow">Pilotos e liberações</span><h1>Recursos por usuário</h1><p>Veja o que está diferente em cada conta e libere a nova Central de Gmail quando quiser.</p></header>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.layout}><aside className={styles.panel}><label>Buscar conta<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, e-mail ou workspace" /></label>
      <div className={styles.users}>{targets.filter(t => `${t.name} ${t.email} ${t.workspaceName}`.toLowerCase().includes(query.toLowerCase())).map(t => <button key={key(t)} disabled={busy} aria-pressed={selected === key(t)} onClick={() => { if (selected !== key(t)) { setDetails(null); setConfirm(null); setError(""); setSelected(key(t)); } }}><strong>{t.name || t.email}</strong><small>{t.email}</small><span>{t.workspaceName}{!t.active ? " · Inativo" : ""}</span></button>)}</div></aside>
      <div className={styles.content}>{details ? <>
        <section className={styles.panel}><h2>{details.target.name || details.target.email}</h2><p>{details.target.email} · {details.target.workspaceName}</p><p>Permissões desta conta neste workspace. Administrador não recebe automaticamente os pilotos do proprietário.</p>
          <div className={styles.features}>{details.features.map(f => <article key={f.id}><div><strong>{f.label}</strong><small>{scope(f.scope)} · {f.enabled ? "Habilitado" : "Desabilitado"}</small></div>{f.configurable ? <button className="outline-button" disabled={busy || !details.target.active && !f.enabled} onClick={() => setConfirm(!f.enabled)}>{f.enabled ? "Voltar ao formato anterior" : "Habilitar nova Central"}</button> : f.id === "stories" ? <a href="/admin?view=stories">Gerenciar Stories</a> : null}</article>)}</div>
          {confirm !== null ? <div className={styles.confirm}><h3>{confirm ? "Habilitar nova Central de Gmail?" : "Voltar ao formato anterior?"}</h3><p>A alteração vale somente para {details.target.email} neste workspace, tanto na tela quanto nas próximas etapas de compra. Não altera saldo, preço, e-mails ou histórico. O usuário deve atualizar a página.</p><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Confirmar alteração"}</button> <button className="outline-button" disabled={busy} onClick={() => setConfirm(null)}>Voltar</button></div> : null}
        </section>
        <section className={styles.panel}><h2>Histórico de liberações</h2><p>{details.historySince}</p>{details.history.length ? <ol className={styles.history}>{[...details.history].reverse().map(h => <li key={h.requestId}><strong>{h.enabled ? "Nova Central habilitada" : "Formato anterior restaurado"}</strong><span>{new Date(h.at).toLocaleString("pt-BR")} · {h.actorEmail}</span></li>)}</ol> : <p>Nenhuma alteração individual registrada. A lista acima mostra as permissões atuais.</p>}</section>
      </> : <section className={styles.panel}><p role="status">{selected ? "Carregando recursos…" : "Nenhuma conta disponível."}</p></section>}</div>
    </div>
  </section>;
}
