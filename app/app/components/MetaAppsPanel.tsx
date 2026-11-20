"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import styles from "./MetaAppsPanel.module.css";

export type MetaAppHealth = { total: number; active: number; down: number };
export type MetaAppSetupView = { redirectUri: string; webhookUrl: string; verifyToken: string | null; scopes: readonly string[] };
export type OwnMetaApp = { id: string; key: string; label: string; appId: string; status: string; createdAt: string; health: MetaAppHealth; setup: MetaAppSetupView };
export type MetaAppsResponse = { canManage: boolean; apps: OwnMetaApp[]; tutorial: { redirectUri: string; webhookUrlPattern: string; scopes: readonly string[] } };

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { credentials: "same-origin", cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar os apps Meta.");
  return payload;
}

export const META_APPS_CHANGED_EVENT = "resolvflow:meta-apps-changed";

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.copyRow}>
      <span>{label}</span><code>{value}</code>
      <button type="button" className="text-button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "Copiado" : "Copiar"}</button>
    </div>
  );
}

export function MetaAppTutorial({ redirectUri, webhookUrl, verifyToken, scopes }: { redirectUri: string; webhookUrl: string | null; verifyToken: string | null; scopes: readonly string[] }) {
  return (
    <div className={styles.tutorial}>
      <ol>
        <li>Acesse <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a>, clique em <strong>Criar app</strong> e escolha o caso de uso <strong>Gerenciar mensagens e conteúdo no Instagram</strong> (API do Instagram). Tipo de app: <strong>Empresa</strong>.</li>
        <li>No app criado, abra <strong>Casos de uso → API do Instagram → Configuração da API com login do Instagram</strong>. Copie o <strong>ID do app do Instagram</strong> e a <strong>Chave secreta do app do Instagram</strong>: são esses dois valores que você cadastra aqui (não use o ID do app do Facebook).</li>
        <li>Em <strong>Configurar login comercial do Instagram</strong>, adicione este URI de redirecionamento OAuth e salve:<CopyValue label="URI de redirecionamento" value={redirectUri} /></li>
        <li>Confirme que o app tem estas permissões (o ResolvFlow pede exatamente estas ao conectar um perfil):<ul>{scopes.map((scope) => <li key={scope}><code>{scope}</code></li>)}</ul></li>
        <li>Webhooks (opcional): em <strong>Configurar webhooks</strong>, informe a URL de callback e o token de verificação abaixo e clique em <strong>Verificar e salvar</strong>.{webhookUrl && verifyToken ? <><CopyValue label="URL de callback" value={webhookUrl} /><CopyValue label="Token de verificação" value={verifyToken} /></> : <p className={styles.muted}>A URL e o token aparecem aqui depois que o app é cadastrado.</p>}</li>
        <li>Enquanto o app estiver em <strong>modo de desenvolvimento</strong>, adicione cada perfil em <strong>Funções do app → Testadores do Instagram</strong> e aceite o convite no Instagram (Configurações → Apps e sites → Convites de testador). Para perfis de terceiros sem convite, o app precisa passar pela <strong>Análise do app</strong> da Meta com as permissões acima.</li>
        <li>Cadastre o app aqui e use <strong>Conectar contas</strong> escolhendo este app.</li>
      </ol>
    </div>
  );
}

export function MetaAppsPanel({ canOperate, contextKey }: { canOperate: boolean; contextKey?: string }) {
  const [state, setState] = useState<MetaAppsResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [tutorialFor, setTutorialFor] = useState<OwnMetaApp | "generic" | null>(null);

  const load = useCallback(async () => {
    try { setState(await api<MetaAppsResponse>("/api/meta/apps")); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível ler os apps Meta."); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load, contextKey]);

  const canManage = Boolean(canOperate && state?.canManage);
  function changed(next: OwnMetaApp[]) {
    setState((current) => current ? { ...current, apps: next } : current);
    window.dispatchEvent(new Event(META_APPS_CHANGED_EVENT));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canManage) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const result = await api<{ id: string; apps: OwnMetaApp[] }>("/api/meta/apps", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: form.get("label"), appId: form.get("appId"), appSecret: form.get("appSecret") }) });
      changed(result.apps);
      setFormOpen(false);
      setTutorialFor(result.apps.find((app) => app.id === result.id) || null);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível cadastrar o app."); }
    finally { setBusy(false); }
  }

  async function toggle(app: OwnMetaApp) {
    if (busy || !canManage) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ apps: OwnMetaApp[] }>("/api/meta/apps", { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: app.id, status: app.status === "active" ? "disabled" : "active" }) });
      changed(result.apps);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível atualizar o app."); }
    finally { setBusy(false); }
  }

  const apps = state?.apps || [];
  const tutorial = tutorialFor === "generic" || tutorialFor === null ? null : tutorialFor;
  return (
    <section className={`panel ${styles.panel}`} id="apps-meta" aria-labelledby="apps-meta-title">
      <div className={styles.bar}>
        <div>
          <span className="panel-kicker">Seus apps</span>
          <h2 id="apps-meta-title">Apps Meta</h2>
          <p>Cadastre o seu próprio app da Meta para conectar perfis. A chave secreta fica cifrada e nunca é exibida de novo.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className="outline-button" onClick={() => setTutorialFor("generic")}>Como criar o app</button>
          <button type="button" className="primary-button" disabled={!canManage || busy} onClick={() => { setError(""); setFormOpen(true); }}>{canManage ? "Cadastrar app" : "Somente leitura"}</button>
        </div>
      </div>
      {error ? <p className="connect-queue-msg error" role="alert">{error}</p> : null}
      {!state && !error ? <p className="connect-queue-msg" role="status">Carregando apps…</p> : null}
      {state && !apps.length ? <div className={styles.empty} role="status">Nenhum app cadastrado ainda. Crie um app em developers.facebook.com (veja <button type="button" className="text-button" onClick={() => setTutorialFor("generic")}>o passo a passo</button>) e cadastre o ID e a chave secreta aqui para começar a conectar perfis.</div> : null}
      {apps.length ? (
        <div className={styles.list}>
          {apps.map((app) => (
            <article key={app.id} className={styles.card} aria-label={`App ${app.label}`}>
              <div className={styles.cardHead}><strong>{app.label}</strong><span className={`queue-status ${app.status === "active" ? "connected" : "pending"}`}>{app.status === "active" ? "Ativo" : "Desativado"}</span></div>
              <span className={styles.muted}>App ID {app.appId}</span>
              <dl className={styles.stats}>
                <div><dt>Perfis conectados</dt><dd>{app.health.total}</dd></div>
                <div><dt>Ativos</dt><dd>{app.health.active}</dd></div>
                <div className={styles.down}><dt>Caídos</dt><dd>{app.health.down}</dd></div>
              </dl>
              <div className={styles.actions}>
                <button type="button" className="outline-button" onClick={() => setTutorialFor(app)}>Tutorial e webhook</button>
                {canManage ? <button type="button" className="text-button" disabled={busy} onClick={() => void toggle(app)}>{app.status === "active" ? "Desativar" : "Reativar"}</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <p className={styles.muted}>“Caído” = perfil com erro de token/permissão na Meta ou token vencido; reconecte o perfil por este app. Perfis removidos do painel não entram na contagem.</p>

      {formOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setFormOpen(false)}>
          <div className={`import-modal ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="meta-app-form-title">
            <button type="button" className="modal-close" onClick={() => setFormOpen(false)} aria-label="Fechar">×</button>
            <h2 id="meta-app-form-title">Cadastrar app Meta</h2>
            <form className={styles.form} onSubmit={(event) => void submit(event)}>
              <label>Nome de exibição<input name="label" required minLength={2} maxLength={60} autoComplete="off" placeholder="Ex.: App principal" /></label>
              <label>ID do app do Instagram<input name="appId" required inputMode="numeric" pattern="[0-9]{6,25}" autoComplete="off" /></label>
              <label>Chave secreta do app do Instagram<input name="appSecret" required type="password" minLength={16} maxLength={128} autoComplete="off" /></label>
              <button type="submit" className="primary-button" disabled={busy}>{busy ? "Cadastrando…" : "Cadastrar"}</button>
            </form>
          </div>
        </div>
      ) : null}

      {tutorialFor ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTutorialFor(null)}>
          <div className={`import-modal ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="meta-app-tutorial-title">
            <button type="button" className="modal-close" onClick={() => setTutorialFor(null)} aria-label="Fechar">×</button>
            <h2 id="meta-app-tutorial-title">{tutorial ? `Configurar ${tutorial.label}` : "Como criar seu app na Meta"}</h2>
            <MetaAppTutorial
              redirectUri={tutorial?.setup.redirectUri || state?.tutorial.redirectUri || "https://resolvflow.online/api/meta/callback"}
              webhookUrl={tutorial?.setup.webhookUrl || null}
              verifyToken={tutorial?.setup.verifyToken || null}
              scopes={tutorial?.setup.scopes || state?.tutorial.scopes || []} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
