"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./AdminStoryBrowsers.module.css";

type Destination = { accountUserId: string; workspaceOwnerUserId: string; workspaceName: string; active: boolean; enabled: boolean };
type Browser = { id: string; sessionId: string; instagramUserId: string | null; instagramUsername?: string | null; label: string; available: boolean; lastSeenAt: string; assignedOwnerUserId: string };
type Binding = { workspaceOwnerUserId: string; accountUserId: string; targets: { browserId: string; sessionId: string; instagramUserId: string; assignedOwnerUserId: string }[] };
const endpoint = "/api/admin/stories/browsers";
async function read(response: Response) {
  const data = await response.json() as { browsers?: Browser[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível conferir o vínculo dos navegadores.");
  return data;
}
export function AdminStoryBrowsers({ target, principal, destinations }: { target?: Destination; principal?: Destination; destinations: Destination[] }) {
  const [browsers, setBrowsers] = useState<Browser[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState(""), [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState<{ body: Binding; name: string } | null>(null);
  const busy = useRef(false), alive = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await read(await fetch(endpoint, { cache: "no-store", signal }));
    if (alive.current) setBrowsers(Array.isArray(data.browsers) ? data.browsers : []);
  }, []);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal)).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; controller.abort(); };
  }, [load]);
  async function assign(destination?: Destination) {
    if (busy.current) return;
    const retry = attempt;
    if (!retry && (!destination?.active || !selected.length)) return;
    const proposal = retry || { name: destination!.workspaceName, body: { accountUserId: destination!.accountUserId, workspaceOwnerUserId: destination!.workspaceOwnerUserId,
      targets: browsers.filter(b => selected.includes(b.id) && b.instagramUserId).map(b => ({ browserId: b.id, sessionId: b.sessionId, instagramUserId: b.instagramUserId!, assignedOwnerUserId: b.assignedOwnerUserId })) } };
    if (!proposal.body.targets.length) return;
    busy.current = true; setPending(true); setError(""); setNotice(""); setAttempt(proposal);
    try {
      await read(await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proposal.body), signal: AbortSignal.timeout(20000) }));
      if (!alive.current) return;
      setAttempt(null); setSelected([]); setNotice(`Navegadores vinculados a ${proposal.name}. O vínculo permite receber comandos; não publica nem solicita convites sozinho.`);
      await load();
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Resposta não recebida. Confira a lista ou repita o mesmo vínculo."); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  const canAssign = target?.active && (target.enabled || target.workspaceOwnerUserId === principal?.workspaceOwnerUserId);
  return <section className={styles.root} aria-labelledby="master-extension-title">
    <header><div><span className="panel-kicker">Sua extensão nas outras contas</span><h2 id="master-extension-title">Navegadores da extensão principal</h2></div><button type="button" disabled={pending} onClick={() => { setError(""); void load().catch(e => setError(e.message)); }}>Atualizar navegadores</button></header>
    <p>Use o seu ZIP atual. Escolha os navegadores e vincule-os à conta desejada. A extensão de cada cliente continua limitada à própria conta.</p>
    <p><strong>Destino: {target?.workspaceName || "selecione um usuário à esquerda"}</strong>. Cada navegador atende uma conta por vez. Trocar o perfil do Instagram exige um novo vínculo. Comandos pendentes precisam terminar antes de mudar de conta.</p>
    {target && !canAssign && <p className={styles.warning}>Habilite Stories e destaques para este destino antes de vincular seus navegadores.</p>}
    {error && <p role="alert" className={styles.warning}>{error}</p>}{notice && <p role="status" className={styles.success}>{notice}</p>}
    <label className={styles.search}>Buscar navegador<input value={query} onChange={event => setQuery(event.target.value)} placeholder="@, nome ou Instagram ID" /></label>
    <fieldset disabled={pending || !!attempt}><legend>{selected.length} navegadores selecionados · até 100 por vínculo</legend>
      <div className={styles.list}>{loading ? <p role="status">Carregando navegadores…</p> : browsers.length ? browsers.filter(b => `${b.label} ${b.instagramUsername || ""} ${b.instagramUserId || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.available) - Number(a.available)).map(browser => <label key={browser.id} aria-label={`Selecionar navegador ${browser.instagramUsername || browser.label}`}><input type="checkbox" checked={selected.includes(browser.id)} disabled={!browser.instagramUserId || !selected.includes(browser.id) && selected.length >= 100} onChange={event => setSelected(current => event.target.checked ? [...current, browser.id] : current.filter(id => id !== browser.id))} /><span><strong>{browser.instagramUsername ? `@${browser.instagramUsername}` : browser.label}</strong><small>Instagram ID: {browser.instagramUserId || "não confirmado"}</small><small>Conta atual: {destinations.find(d => d.workspaceOwnerUserId === browser.assignedOwnerUserId)?.workspaceName || "Conta indisponível"} · {browser.available ? "Online" : "Sem sinal recente"}</small></span></label>) : <p>Abra os perfis com sua extensão principal instalada e o Instagram conectado para detectar os navegadores.</p>}</div>
    </fieldset>
    {attempt ? <div className={styles.actions}><p>Destino preservado: <strong>{attempt.name}</strong>. A resposta anterior pode não ter sido recebida; repetir mantém o mesmo destino.</p><button type="button" disabled={pending} onClick={() => void assign()}>{pending ? "Aplicando vínculo…" : "Conferir/repetir o mesmo vínculo"}</button><button type="button" disabled={pending} onClick={() => { void load().then(() => { setAttempt(null); setSelected([]); setNotice("Lista atualizada. Confira a conta atual dos navegadores antes de fazer outra alteração."); }).catch(e => setError(e.message)); }}>Conferir lista atual</button></div> : <div className={styles.actions}><button type="button" disabled={!canAssign || !selected.length || pending} onClick={() => void assign(target)}>Usar navegadores na conta selecionada</button><button type="button" disabled={!principal?.active || !selected.length || pending} onClick={() => void assign(principal)}>Devolver à minha conta principal</button><button type="button" disabled={!selected.length || pending} onClick={() => setSelected([])}>Limpar seleção</button></div>}
  </section>;
}
