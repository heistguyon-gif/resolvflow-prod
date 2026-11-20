"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./AdminStoriesManager.module.css";
import { storyWorkspaceSources } from "./storyWorkspaceSources";
import { AdminStoryBrowsers } from "./AdminStoryBrowsers";

type Target = { accountUserId: string; email: string; name: string; workspaceOwnerUserId: string; workspaceName: string; active: boolean; enabled: boolean; role: string };
type Template = { id: string; name: string; imageUrl: string; linkTitle: string; linkUrl: string; highlightName: string; createHighlight?: boolean };
const keyOf = (target: Target) => `${target.accountUserId}:${target.workspaceOwnerUserId}`;
class AdminStoryError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function read(response: Response) {
  const data = await response.json() as { error?: string; targets?: Target[]; templates?: Template[]; defaultSourceOwnerUserId?: string };
  if (!response.ok) throw new AdminStoryError(data.error || "Não foi possível concluir a solicitação.", response.status);
  return { targets: Array.isArray(data.targets) ? data.targets : [], templates: Array.isArray(data.templates) ? data.templates : [],
    defaultSourceOwnerUserId: typeof data.defaultSourceOwnerUserId === "string" ? data.defaultSourceOwnerUserId : "" };
}
export function AdminStoriesManager({ onOpenApps }: { onOpenApps: (workspace: string) => void }) {
  const [targets, setTargets] = useState<Target[]>([]), [selectedKey, setSelectedKey] = useState("");
  const [source, setSource] = useState("");
  const [principal, setPrincipal] = useState("");
  const [library, setLibrary] = useState<{ source: string; templates: Template[] }>({ source: "", templates: [] });
  const readingTemplates = !!source && library.source !== source;
  const templates = library.source === source ? library.templates : [];
  const [query, setQuery] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true), [pending, setPending] = useState("");
  const copyAttempt = useRef<{ source: string; template: string; target: string; requestId: string } | null>(null);
  const busy = useRef(false);
  const selected = targets.find(item => keyOf(item) === selectedKey);
  const owners = storyWorkspaceSources(targets, principal);
  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await read(await fetch("/api/admin/stories", { signal, cache: "no-store" }));
    const primary = data.defaultSourceOwnerUserId;
    setTargets(data.targets); setPrincipal(primary);
    setSource(current => current || (data.targets.some(item => item.workspaceOwnerUserId === primary) ? primary : storyWorkspaceSources(data.targets, primary)[0]?.workspaceOwnerUserId || ""));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return load(controller.signal); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    void fetch(`/api/admin/stories?workspace=${encodeURIComponent(source)}`, { signal: controller.signal, cache: "no-store" }).then(read)
      .then(data => { if (!controller.signal.aborted) setLibrary({ source, templates: data.templates }); })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setLibrary({ source, templates: [] }); } });
    return () => controller.abort();
  }, [source]);
  async function mutate(body: Record<string, unknown>, operation: string) {
    if (busy.current) return;
    busy.current = true; setPending(operation); setError(""); setNotice("");
    try {
      await read(await fetch("/api/admin/stories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
      if (operation === "access") await load();
      else copyAttempt.current = null;
      setNotice(operation === "access" ? "Permissão de Stories e destaques atualizada." : "Template copiado. Ele já está disponível na conta selecionada, sem publicar conteúdo.");
    } catch (e) { if (operation !== "access" && e instanceof AdminStoryError && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) copyAttempt.current = null; setError(e instanceof Error ? e.message : "Falha na solicitação. Tente novamente para conferir o mesmo envio."); }
    finally { busy.current = false; setPending(""); }
  }
  function copy(template: Template) {
    if (!selected || !selected.active || selected.workspaceOwnerUserId === source) return;
    const old = copyAttempt.current;
    if (old && (old.source !== source || old.template !== template.id || old.target !== selectedKey)) {
      setError("Confira ou repita o envio anterior antes de escolher outro destino. A resposta pode não ter sido recebida."); return;
    }
    const attempt = old || { source, template: template.id, target: selectedKey, requestId: crypto.randomUUID() };
    copyAttempt.current = attempt;
    void mutate({ action: "copy_template", accountUserId: selected.accountUserId, workspaceOwnerUserId: selected.workspaceOwnerUserId,
      sourceOwnerUserId: source, templateId: template.id, requestId: attempt.requestId }, template.id);
  }
  return <section className={styles.root}>
    <header className={styles.heading}><div><span className="panel-kicker">Controle de acesso e biblioteca</span><h1>Stories e destaques</h1><p>Libere usuários, distribua templates e gerencie os Apps Meta de cada operação.</p></div><span className={styles.count}>{targets.filter(item => item.enabled).length} acessos liberados</span></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.layout}>
      <section className={styles.users} aria-labelledby="story-users-title"><header><h2 id="story-users-title">Usuários</h2><p>Escolha quem recebe a funcionalidade.</p></header>
        <label className={styles.search}>Buscar usuário<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome, e-mail ou workspace" /></label>
        <div className={styles.userList}>{loading ? <p role="status">Carregando usuários…</p> : targets.filter(item => `${item.name} ${item.email} ${item.workspaceName}`.toLowerCase().includes(query.toLowerCase())).map(target => <button type="button" key={keyOf(target)} aria-pressed={selectedKey === keyOf(target)} onClick={() => { setSelectedKey(keyOf(target)); setNotice(""); }}><strong>{target.name || target.email}</strong><span>{target.email}</span><small>{target.workspaceName} · {target.active ? target.enabled || target.email === "lucasbgn.affiliate@gmail.com" ? "Liberado" : "Desabilitado" : "Inativo"}</small></button>)}</div>
      </section>
      <div className={styles.content}>
        <section className={styles.access} aria-labelledby="story-access-title"><div><span className="panel-kicker">Acesso à funcionalidade</span><h2 id="story-access-title">{selected?.name || "Selecione um usuário"}</h2><p>{selected ? `${selected.workspaceName} · ${selected.email}` : "O acesso é liberado por usuário e workspace."}</p></div>
          {selected && <><label className={styles.toggle}><input type="checkbox" checked={selected.enabled || selected.email === "lucasbgn.affiliate@gmail.com"} disabled={!!pending || !selected.active || selected.email === "lucasbgn.affiliate@gmail.com"} onChange={event => void mutate({ action: "access", accountUserId: selected.accountUserId, workspaceOwnerUserId: selected.workspaceOwnerUserId, enabled: event.target.checked }, "access")} />Habilitar Stories e destaques</label>
          <p>O usuário pode usar o pacote da própria conta ou os navegadores que você vincular pela extensão principal. Mantenha o Instagram conectado; a API do AdsPower não é necessária.</p>
          <button type="button" className="outline-button" onClick={() => onOpenApps(selected.workspaceOwnerUserId)}>Gerenciar Apps Meta deste usuário</button></>}
        </section>
        <AdminStoryBrowsers target={selected} principal={owners.find(item => item.workspaceOwnerUserId === principal)} destinations={owners} />
        <section className={styles.library} aria-labelledby="story-library-title"><header><div><span className="panel-kicker">Copiar templates entre contas</span><h2 id="story-library-title">Templates de Stories</h2></div><label>Conta de origem<select value={source} disabled={!!pending} onChange={event => setSource(event.target.value)}>{owners.map(target => <option key={target.workspaceOwnerUserId} value={target.workspaceOwnerUserId}>{target.workspaceOwnerUserId === principal ? `Minha conta principal · ${target.workspaceName}` : `${target.workspaceName} · ${target.email}`}</option>)}</select></label></header>
          <p>Escolha a conta onde o template foi salvo. Depois, selecione o usuário de destino à esquerda para copiar imagem, link, botão e destaque.</p>
          {readingTemplates ? <p role="status">Carregando biblioteca…</p> : !templates.length ? <div className={styles.empty}>Esta conta não tem templates de Stories. Confira a conta de origem selecionada.</div> : <div className={styles.templates}>{templates.map(template => <article key={template.id}><div className={styles.image}>{/* Authenticated images must use their original URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={template.imageUrl} alt={`Prévia de ${template.name}`} loading="lazy" /></div><div><h3>{template.name}</h3><p>{template.createHighlight === false ? "Sem destaque" : `Destaque: ${template.highlightName}`}</p><small>{template.linkUrl ? template.linkTitle : "Sem link"}</small><button type="button" disabled={!selected?.active || selected.workspaceOwnerUserId === source || !!pending} onClick={() => copy(template)}>{pending === template.id ? "Copiando…" : "Copiar para o usuário selecionado"}</button></div></article>)}</div>}
        </section>
      </div>
    </div>
  </section>;
}
