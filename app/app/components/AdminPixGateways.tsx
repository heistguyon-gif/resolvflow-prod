"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { gatewayError, gatewayState, isPixAdmin, type GatewayCommand, type GatewayDTO, type GatewayStateDTO, type PixProvider } from "./pixGatewayPresentation";
import styles from "./AdminPixGateways.module.css";

const endpoint = "/api/admin/otp/pix-gateways";
type Editor = { kind: "create"; reuse?: GatewayDTO } | { kind: "revise"; row: GatewayDTO };
type Confirmation = { kind: "activate" | "archive" | "delete" | "deactivate"; row: GatewayDTO };
const providerName = (p: PixProvider) => p === "leztypay" ? "Lezty Pay" : p === "blackfy" ? "BlackFy" : "BravoPay";

function Modal({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="pix-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header><h2 id="pix-dialog-title">{title}</h2><button type="button" className={styles.secondary} onClick={close} disabled={busy} aria-label="Fechar formulário">Fechar</button></header>
    {children}
  </dialog>;
}

function GatewayEditor({ editor, state, busy, close, save }: { editor: Editor; state: GatewayStateDTO; busy: boolean; close: () => void; save: (command: GatewayCommand) => void }) {
  const row = editor.kind === "revise" ? editor.row : undefined;
  const [selectedProvider, setSelectedProvider] = useState<PixProvider>(row?.provider ?? (editor.kind === "create" ? editor.reuse?.provider : undefined) ?? state.providers[0].id);
  const [reuse, setReuse] = useState(editor.kind === "create" && !!editor.reuse);
  const legacy = state.gateways.find(item => item.origin === "legacy" && item.provider === selectedProvider && item.hasApiKey);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    const label = String(data.get("label") || "").trim();
    const apiKey = String(data.get("apiKey") || "").trim(), webhookSecret = String(data.get("webhookSecret") || "").trim();
    const base = { requestId: crypto.randomUUID(), expectedRevision: state.revision, label };
    const command: GatewayCommand = row ? { ...base, action: "revise", configId: row.id, ...(apiKey ? { apiKey } : {}), ...(webhookSecret ? { webhookSecret } : {}) }
      : { ...base, action: "create", provider: selectedProvider, ...(reuse && legacy ? { reuseLegacyKey: true } : { apiKey }), webhookSecret };
    form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ""; });
    save(command);
  }
  return <Modal title={row ? "Revisar configuração" : "Cadastrar gateway"} busy={busy} close={close}>
    <form onSubmit={submit} className={styles.form}>
      <p>{row ? "Salvar cria uma nova versão. A versão ativa só muda após sua confirmação na lista." : "Cadastre uma configuração nomeada. Ela só receberá novas cobranças depois de ser ativada."}</p>
      <label>Nome da configuração<input name="label" required maxLength={80} defaultValue={row?.label ?? (editor.kind === "create" && editor.reuse ? `${providerName(editor.reuse.provider)} principal` : "")} disabled={busy} placeholder="Ex.: BravoPay principal" /></label>
      <label>Provedor<select value={selectedProvider} disabled={busy || !!row} onChange={event => { setSelectedProvider(event.target.value as PixProvider); setReuse(false); }}>
        {state.providers.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      {!row && legacy ? <label className={styles.check}><input type="checkbox" checked={reuse} onChange={event => setReuse(event.target.checked)} disabled={busy} /><span>Reaproveitar a chave existente de {providerName(selectedProvider)}<small>A chave é copiada no servidor e não é exibida aqui.</small></span></label> : null}
      {!reuse || !legacy || row ? <label>{row ? "Nova chave da API (opcional)" : "Chave da API"}<input name="apiKey" type="password" required={!row} maxLength={8192} autoComplete="new-password" disabled={busy} spellCheck={false} /><small>{row ? "Deixe vazio para manter a credencial atual." : "Gravada com proteção no servidor. Não aparecerá na lista."}</small></label> : null}
      <label>{row ? "Novo segredo do webhook (opcional)" : "Segredo do webhook"}<input name="webhookSecret" type="password" required={!row} maxLength={8192} autoComplete="new-password" disabled={busy} spellCheck={false} /><small>{row ? "Deixe vazio para manter o segredo atual." : "Obrigatório, inclusive ao reaproveitar a chave existente."}</small></label>
      <p className={styles.note}>Salvar não verifica a conexão com o provedor. O endereço de webhook será gerado pelo servidor para esta versão.</p>
      <footer><button type="button" className={styles.secondary} disabled={busy} onClick={close}>Cancelar</button><button className={styles.primary} disabled={busy}>{busy ? "Salvando…" : row ? "Salvar nova versão" : "Salvar configuração"}</button></footer>
    </form>
  </Modal>;
}

export function AdminPixGateways({ viewerEmail }: { viewerEmail?: string }) {
  if (!isPixAdmin(viewerEmail)) return null;
  return <GatewayWorkspace key={viewerEmail!.trim().toLowerCase()} />;
}

function GatewayWorkspace() {
  const [state, setState] = useState<GatewayStateDTO | null>(null);
  const [loading, setLoading] = useState(true), [stale, setStale] = useState(false), [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null), [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const pending = useRef<GatewayCommand | null>(null), inFlight = useRef(false), generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const deny = useCallback(() => { pending.current = null; setState(null); setDenied(true); setEditor(null); setConfirmation(null); setUncertain(false); }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const sequence = ++generation.current;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: request.signal });
      if (request.signal.aborted || sequence !== generation.current) return;
      if (response.status === 401 || response.status === 403) { deny(); return; }
      if (!response.ok) throw new Error("read_failed");
      const snapshot = gatewayState(await response.json());
      if (request.signal.aborted || sequence !== generation.current) return;
      setState(snapshot); setStale(false);
    } catch {
      if (!request.signal.aborted && sequence === generation.current) { setStale(true); setError("Não foi possível atualizar os gateways. Os últimos dados permanecem visíveis; alterações estão bloqueadas até atualizar."); }
    } finally { if (!request.signal.aborted && sequence === generation.current) setLoading(false); }
  }, [deny]);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); pending.current = null; }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);

  async function send(command: GatewayCommand) {
    if (inFlight.current) return;
    inFlight.current = true; pending.current = command;
    const sequence = ++generation.current;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(command), signal: request.signal });
      const payload: unknown = await response.json();
      if (request.signal.aborted || sequence !== generation.current) return;
      if (response.status === 401 || response.status === 403) { deny(); return; }
      if (!response.ok) {
        const code = payload && typeof payload === "object" && "code" in payload ? payload.code : undefined;
        if (response.status >= 500) throw new Error("uncertain");
        pending.current = null; setUncertain(false); setStale(true); setError(gatewayError(code)); setEditor(null); setConfirmation(null); return;
      }
      if (!payload || typeof payload !== "object" || !("state" in payload)) throw new Error("invalid_response");
      const next = gatewayState(payload.state);
      pending.current = null; setUncertain(false); setStale(false); setState(next); setEditor(null); setConfirmation(null);
      setNotice(command.action === "deactivate" ? "Novas cobranças suspensas." : command.action === "delete" ? "Cadastro sem uso excluído." : command.action === "activate" ? "Gateway selecionado para novas cobranças. As anteriores continuam na origem." : command.action === "archive" ? "Configuração arquivada. O histórico foi preservado." : "Configuração salva. A seleção ativa foi preservada; a conexão ainda não foi verificada.");
    } catch {
      if (!request.signal.aborted && sequence === generation.current) {
        setUncertain(true); setEditor(null); setConfirmation(null);
        setError("A confirmação não chegou. A alteração pode ter sido salva. Confira a mesma solicitação antes de fazer outra alteração.");
      }
    } finally { if (!request.signal.aborted && sequence === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  const disabled = loading || busy || stale || uncertain || !state;
  const active = state?.gateways.find(row => row.id === state.active?.configId);
  if (denied) return <p className={styles.error} role="alert">Esta configuração é exclusiva do administrador principal. Entre novamente com a conta autorizada.</p>;
  return <section className={styles.root} aria-labelledby="pix-gateways-title" aria-busy={loading || busy}>
    <header className={styles.heading}><div><span className={styles.eyebrow}>Administração · pagamentos</span><h1 id="pix-gateways-title">Gateways Pix</h1><p>Uma escolha para as novas cobranças.<br />As anteriores continuam no gateway de origem.</p></div><div className={styles.actions}><button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void load()}>{loading ? "Atualizando…" : "Atualizar lista"}</button><button type="button" className={styles.primary} disabled={disabled || !state?.providers.length} onClick={() => setEditor({ kind: "create" })}>Cadastrar configuração</button></div></header>
    {error ? <div className={styles.error} role="alert"><p>{error}</p>{uncertain ? <><p>A conferência usa a mesma identidade da alteração, sem criar outra solicitação.</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => { if (pending.current) void send(pending.current); }}>{busy ? "Conferindo…" : "Conferir mesma alteração"}</button></> : null}</div> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <div className={styles.activePanel}><span className={styles.activeIcon} aria-hidden="true">↗</span><div><span className={styles.eyebrow}>Ativo para novas cobranças</span><h2>{state ? active?.label ?? "Nenhum gateway selecionado" : "Carregando seleção…"}</h2><p>{active ? `${providerName(active.provider)} · versão ativa ${state!.active!.version}${active.origin === "legacy" ? " · configuração existente" : ""}` : "A seleção será apresentada conforme a configuração do servidor."}</p></div>{active ? <span className={styles.status}>Seleção atual</span> : null}</div>
    {state?.paused ? <p className={styles.notice}>Novas cobranças suspensas até selecionar um gateway. As cobranças existentes continuam em acompanhamento.</p> : null}
    <div className={styles.listHeading}><h2>Suas configurações <span>{state?.gateways.length ?? "—"}</span></h2><p>Credenciais protegidas · conexão não verificada</p></div>
    {!state ? <p className={styles.empty}>{loading ? "Carregando configurações…" : "Atualize a lista para continuar."}</p> : state.gateways.length === 0 ? <p className={styles.empty}>Nenhuma configuração cadastrada. Cadastre o primeiro gateway sem alterar a seleção ativa.</p> : <ul className={styles.list}>
      {state.gateways.map(row => {
        const current = state.active?.configId === row.id;
        const exact = current && state.active?.version === row.version;
        return <li key={row.id} className={styles.row} data-active={current}>
          <div className={styles.identity}><span className={styles.providerMark} aria-hidden="true">{row.provider === "leztypay" ? "L" : row.provider === "blackfy" ? "F" : "B"}</span><div><h3>{row.label}</h3><p>{providerName(row.provider)} · {row.origin === "legacy" ? "Existente" : `Versão ${row.version}`}</p></div></div>
          <div className={styles.configuration}><span className={styles.status}>{row.status === "archived" ? "Arquivada" : current ? `Ativa · versão ${state.active!.version}` : row.status === "incomplete" ? "Configuração incompleta" : "Disponível para selecionar"}</span>{current && !exact ? <p className={styles.versionNote}>Versão {row.version} salva, ainda não ativa.</p> : null}<dl><div><dt>Chave da API</dt><dd>{row.hasApiKey ? "Cadastrada" : "Não cadastrada"}</dd></div><div><dt>Segredo webhook</dt><dd>{row.hasWebhookSecret ? "Cadastrado" : "Não cadastrado"}</dd></div></dl></div>
          <div className={styles.rowActions}>
            {current ? <button type="button" className={styles.secondary} disabled={disabled} onClick={() => setConfirmation({ kind: "deactivate", row })}>Desativar</button> : null}
            {row.origin === "managed" && row.canDelete && !current ? <button type="button" className={styles.textButton} disabled={disabled} onClick={() => setConfirmation({ kind: "delete", row })}>Excluir cadastro</button> : null}
            {row.origin === "legacy" ? <>{(row.provider === "leztypay" || row.provider === "blackfy") && row.status === "configured" ? <button type="button" className={styles.primary} disabled={disabled || exact} onClick={() => setConfirmation({ kind: "activate", row })}>{exact ? "Versão ativa" : `Usar ${providerName(row.provider)}`}</button> : null}<span className={styles.muted}>Credenciais existentes não são exibidas.</span>{row.provider !== "blackfy" ? <button type="button" className={styles.secondary} disabled={disabled || !row.hasApiKey} onClick={() => setEditor({ kind: "create", reuse: row })}>Reaproveitar chave</button> : null}</> : <><button type="button" className={styles.primary} disabled={disabled || exact || row.status !== "configured" || !row.hasApiKey || !row.hasWebhookSecret} onClick={() => setConfirmation({ kind: "activate", row })}>{exact ? "Versão ativa" : `Usar versão ${row.version}`}</button><div><button type="button" className={styles.textButton} disabled={disabled || row.status === "archived"} onClick={() => setEditor({ kind: "revise", row })}>Revisar</button><button type="button" className={styles.textButton} disabled={disabled || current || row.status === "archived"} onClick={() => setConfirmation({ kind: "archive", row })}>Arquivar</button></div></>}
          </div>
          {row.webhookUrl ? <details className={styles.webhook}><summary>Webhook {row.origin === "managed" ? `da versão ${row.version}` : "existente"}</summary><p>Endereço gerado pelo servidor. Configure-o no painel privado do provedor com o segredo correspondente.</p><code>{row.webhookUrl}</code>{current && !exact ? <p>A versão {state.active!.version} permanece ativa com seu webhook anterior. Este endereço é da revisão {row.version}.</p> : null}</details> : null}
        </li>;
      })}
    </ul>}
    <p className={styles.footerNote}>Cadastrar ou revisar não ativa um gateway. O estado de configuração não comprova conexão, aprovação de cobranças ou conversão.</p>
    {editor && state ? <GatewayEditor key={editor.kind === "revise" ? editor.row.id : editor.reuse?.id ?? "new"} editor={editor} state={state} busy={busy} close={() => setEditor(null)} save={command => void send(command)} /> : null}
    {confirmation && state ? <Modal title={confirmation.kind === "delete" ? "Excluir cadastro sem uso" : confirmation.kind === "deactivate" ? "Suspender novas cobranças" : confirmation.kind === "activate" ? "Selecionar gateway" : "Arquivar configuração"} busy={busy} close={() => setConfirmation(null)}><div className={styles.form}><p>{confirmation.kind === "delete" ? "Este cadastro será removido definitivamente:" : confirmation.kind === "deactivate" ? "Nenhum gateway receberá novas cobranças após desativar:" : confirmation.kind === "activate" ? "Novas cobranças passarão a usar:" : "Esta configuração deixará de aceitar novas ativações:"}</p><div className={styles.confirmTarget}><strong>{confirmation.row.label}</strong><span>{providerName(confirmation.row.provider)} · versão {confirmation.row.version}</span></div><p>As cobranças anteriores e seu histórico permanecem no gateway e na versão de origem.</p><footer><button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void send({ requestId: crypto.randomUUID(), expectedRevision: state.revision, action: confirmation.kind, configId: confirmation.row.id, ...(confirmation.kind === "activate" ? { version: confirmation.row.version } : confirmation.kind === "deactivate" ? { confirmed: true, version: state.active?.version } : confirmation.kind === "delete" ? { confirmed: true } : {}) } as GatewayCommand)}>{busy ? "Confirmando…" : confirmation.kind === "delete" ? "Confirmar exclusão" : confirmation.kind === "deactivate" ? "Confirmar desativação" : confirmation.kind === "activate" ? "Usar para novas cobranças" : "Confirmar arquivamento"}</button></footer></div></Modal> : null}
  </section>;
}
