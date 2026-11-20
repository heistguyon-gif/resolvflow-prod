"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { actionKeys, actionLabels, isSetupDispatch, isSetupImage, isSetupSnapshot, jobLabels, readSetupIntent, sameSetupTarget, setupCanRetry, setupJobState, setupMessages, setupNeedsReview, setupTarget, stepLabels, type SetupActions, type SetupBrowser, type SetupDispatch, type SetupIntent, type SetupJob, type SetupReview, type SetupSnapshot, type SetupTarget } from "./profileSetupUi";
import styles from "./ProfileSetup.module.css";
import { confirmedInstagramUsername } from "./storyBrowserIdentity";

const endpoint = "/api/story-bridge/profile-setup";
const empty: SetupSnapshot = { browsers: [], dispatches: [], images: [], pollAfterMs: 5000 };
const errorLabels: Record<string, string> = {
  selection_required: "Selecione pelo menos um navegador.", selected_browsers_unavailable: "Um destinatário mudou de conta, sessão ou disponibilidade. Confira a seleção.",
  extension_update_required: "Atualize a extensão para usar bio e foto.", browser_busy: "Um navegador está executando outro comando. Aguarde o resultado antes de continuar.",
  idempotency_conflict: "O identificador desta solicitação já está em uso. Confira os resultados antes de continuar.", review_required: "Confira o perfil e confirme a revisão antes de repetir uma etapa incerta.",
  retry_unavailable: "Esta etapa já foi encaminhada ou não pode ser repetida. Atualize os resultados.", feature_disabled: "A configuração de bio e foto não está habilitada para este login.",
  invalid_input: "Revise a seleção, a bio e a foto antes de enviar.", image_size: "A foto deve ter até 8 MB.", image_type: "Envie uma foto PNG ou JPEG.",
};
class SetupError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
async function readResponse(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = record(body) && typeof body.code === "string" ? body.code : "";
    throw new SetupError(response.status === 401 ? "Sua sessão expirou. Entre novamente." : response.status === 403 ? "Esta ação não está disponível para seu login ou permissão." : errorLabels[code] || "Não foi possível concluir a solicitação. Tente novamente mais tarde.", response.status);
  }
  return body;
}
const identityLabel = (browser: SetupBrowser) => { const username = confirmedInstagramUsername(browser); return `Selecionar ${username ? `@${username}` : browser.label} para bio e foto. Instagram ID ${browser.instagramUserId || "indisponível"}`; };

type ProfileSetupSlots = { configuration: ReactNode; results: ReactNode; update: ReactNode };

export function ProfileSetup({ scopeKey, role, renderLayout }: { scopeKey: string; role: "owner" | "editor" | "viewer"; renderLayout?: (slots: ProfileSetupSlots) => ReactNode }) {
  const id = useId();
  const [data, setData] = useState<SetupSnapshot>(empty);
  const [loaded, setLoaded] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [targets, setTargets] = useState<SetupTarget[]>([]);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bio, setBio] = useState("");
  const [photoEnabled, setPhotoEnabled] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [review, setReview] = useState<SetupReview | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [uncertain, setUncertain] = useState<SetupIntent | null>(null);
  const [pending, setPending] = useState<"upload" | "send" | "update" | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const live = useRef(false);
  const busy = useRef(false);
  const epoch = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const frozen = useRef(false);
  const storageKey = `resolvflow:profile-setup:${scopeKey}`;
  const canEdit = role !== "viewer" && !forbidden;
  const locked = !!pending || !!review || !!uncertain || !storageReady;
  const actions: SetupActions = { ...(bioEnabled && bio.trim() ? { bio: { text: bio } } : {}), ...(photoEnabled ? { photo: { imageId: "pending-upload" } } : {}) };
  const available = data.browsers.filter(browser => setupTarget(browser, actions));
  const rows = [...data.browsers.filter(browser => setupTarget(browser, actions)), ...data.browsers.filter(browser => !setupTarget(browser, actions))];
  const shownTargets = uncertain?.review.targets || review?.targets || targets;
  const bioLength = [...bio].length;

  const refresh = useCallback(async () => {
    if (readController.current || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    readController.current = controller;
    const version = epoch.current;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const body = await readResponse(await fetch(endpoint, { signal: controller.signal, cache: "no-store" }));
      if (!isSetupSnapshot(body)) throw new Error("A lista de perfis é inválida.");
      if (!live.current || version !== epoch.current) return;
      setData(body); setLoaded(true); setFresh(true); setReadError("");
      if (!frozen.current) setTargets(previous => previous.filter(target => body.browsers.some(browser => sameSetupTarget(browser, target) && setupTarget(browser, {}))));
    } catch (cause) {
      if (!live.current || version !== epoch.current) return;
      setFresh(false);
      setReadError(cause instanceof SetupError ? cause.message : "Não foi possível atualizar os navegadores e resultados de bio e foto.");
      if (cause instanceof SetupError && [401, 403].includes(cause.status)) {
        setForbidden(true); setTargets([]); setUncertain(null);
        try { sessionStorage.removeItem(storageKey); } catch { /* Storage can be unavailable. */ }
      }
    } finally {
      window.clearTimeout(timeout);
      if (readController.current === controller) readController.current = null;
    }
  }, [storageKey]);

  useEffect(() => {
    live.current = true;
    ++epoch.current;
    // Read browser storage after hydration; controls stay locked until this callback completes.
    const restoreTimer = window.setTimeout(() => {
      if (!live.current) return;
      let restored: SetupIntent | null = null;
      try { restored = readSetupIntent(sessionStorage.getItem(storageKey), scopeKey); } catch { /* Memory-only retry remains available. */ }
      frozen.current = !!restored;
      setUncertain(restored); setStorageReady(true);
      void refresh();
    }, 0);
    const onVisible = () => { if (document.visibilityState === "visible") { setFresh(false); void refresh(); } };
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      live.current = false;
      readController.current?.abort(); writeController.current?.abort();
      window.clearInterval(timer); window.clearTimeout(restoreTimer);
      document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible);
    };
  }, [refresh, scopeKey, storageKey]);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  async function downloadUpdate() {
    if (role !== "owner" || forbidden || busy.current || locked) return;
    busy.current = true; setPending("update"); setError("");
    const controller = new AbortController(); writeController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${endpoint}/update`, { signal: controller.signal, cache: "no-store", redirect: "error" });
      if (!response.ok) await readResponse(response);
      if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/zip") throw new Error("Pacote de atualização inválido. Nenhum arquivo foi baixado.");
      const blob = await response.blob();
      const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) throw new Error("Pacote de atualização inválido. Nenhum arquivo foi baixado.");
      if (!live.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="?(story-bridge-update-[\w.-]+\.zip)"?/i)?.[1] || "story-bridge-update.zip";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Pacote de atualização baixado. Sobreponha os arquivos de código na mesma pasta da extensão e recarregue a mesma extensão. Preserve a configuração e a instalação atuais.");
    } catch (cause) {
      if (!live.current) return;
      if (cause instanceof SetupError && [401, 403].includes(cause.status)) setForbidden(true);
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Não foi possível baixar a atualização. Tente novamente mais tarde.");
    } finally {
      window.clearTimeout(timeout); busy.current = false;
      if (live.current) setPending(null);
    }
  }

  function choosePhoto(file: File | undefined) {
    if (!file) { setPhoto(null); setPhotoUrl(""); return; }
    if (!["image/png", "image/jpeg"].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
      setError("Escolha uma foto PNG ou JPEG de até 8 MB."); setPhoto(null); setPhotoUrl(""); return;
    }
    setError(""); setPhoto(file); setPhotoUrl(URL.createObjectURL(file));
  }
  function releaseReview() {
    if (busy.current) return;
    frozen.current = false; setReview(null); setReviewed(false);
    setTargets(previous => previous.filter(target => data.browsers.some(browser => sameSetupTarget(browser, target) && setupTarget(browser, {}))));
  }
  async function prepareReview() {
    if (busy.current || locked || !canEdit || !fresh) return;
    setError("");
    if (bioEnabled && bioLength > 150) { setError("A bio excedeu o limite de 150 caracteres."); return; }
    if (!Object.keys(actions).length) { setError("Escolha uma ação e preencha o conteúdo. Bio vazia mantém a bio atual."); return; }
    if (photoEnabled && !photo) { setError("Escolha uma foto PNG ou JPEG de até 8 MB."); return; }
    if (!targets.length || targets.length > 100 || targets.some(target => !available.some(browser => sameSetupTarget(browser, target)))) { setError("Selecione de 1 a 100 navegadores disponíveis para as ações escolhidas."); return; }
    busy.current = true; frozen.current = true;
    const snapshot: SetupReview = { actions: structuredClone(actions), targets: targets.map(target => { const browser = data.browsers.find(browser => sameSetupTarget(browser, target))!; const username = confirmedInstagramUsername(browser); return { ...target, label: username ? `@${username}` : browser.label }; }) };
    const controller = new AbortController(); writeController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      if (photoEnabled && photo) {
        setPending("upload");
        const form = new FormData(); form.append("image", photo);
        const body = await readResponse(await fetch(`${endpoint}/images`, { method: "POST", body: form, signal: controller.signal }));
        if (!record(body) || !isSetupImage(body.image)) throw new Error("Foto não confirmada.");
        snapshot.actions.photo = { imageId: body.image.id }; snapshot.photoUrl = body.image.imageUrl; snapshot.photoName = photo.name;
      }
      if (live.current) { setReview(snapshot); setReviewed(false); }
    } catch (cause) {
      if (live.current) setError(cause instanceof SetupError ? cause.message : "Não foi possível preparar a foto. Nenhum comando de perfil foi enviado.");
      frozen.current = false;
    } finally {
      window.clearTimeout(timeout); busy.current = false;
      if (live.current) setPending(null);
    }
  }

  function prepareRetry(dispatch: SetupDispatch, job: SetupJob) {
    if (busy.current || locked || !canEdit || !fresh || !setupCanRetry(dispatch, job)) return;
    const browser = data.browsers.find(browser => sameSetupTarget(browser, job));
    if (!browser || !setupTarget(browser, dispatch.actions)) return;
    const image = data.images.find(image => image.id === dispatch.actions.photo?.imageId);
    frozen.current = true; setReviewed(false); setError("");
    setReview({ actions: structuredClone(dispatch.actions), targets: [{ browserId: job.browserId, sessionId: job.sessionId, instagramUserId: job.instagramUserId, label: job.label }], ...(image ? { photoUrl: image.imageUrl } : {}), retry: { dispatchId: dispatch.id, jobId: job.id, requiresReview: setupNeedsReview(job) } });
  }

  async function send(intent: SetupIntent) {
    if (busy.current || !canEdit) return;
    busy.current = true; frozen.current = true; setPending("send"); setError("");
    // Save exactly this request before transmission. A restored intent never submits itself.
    try { sessionStorage.setItem(storageKey, JSON.stringify({ scopeKey, intent })); } catch { setNotice("Mantenha esta aba aberta para consultar a mesma solicitação se a conexão cair."); }
    const controller = new AbortController(); writeController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const body = await readResponse(await fetch(intent.kind === "retry" ? `${endpoint}/retry` : endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": intent.payload.requestId }, body: JSON.stringify(intent.payload), signal: controller.signal }));
      if (!record(body) || !isSetupDispatch(body.dispatch) || body.dispatch.requestId !== intent.payload.requestId || body.dispatch.jobs.length !== intent.payload.targets.length || !body.dispatch.jobs.every(job => intent.payload.targets.some(target => sameSetupTarget({ id: job.browserId, sessionId: job.sessionId, instagramUserId: job.instagramUserId, label: job.label, available: true }, target)))) throw new Error("Recebimento não confirmado.");
      if (!live.current) return;
      const dispatch = body.dispatch;
      ++epoch.current; readController.current?.abort(); readController.current = null;
      setData(previous => ({ ...previous, dispatches: [dispatch, ...previous.dispatches.filter(item => item.id !== dispatch.id)] }));
      setUncertain(null); setReview(null); setReviewed(false); frozen.current = false;
      setNotice("Solicitação de bio e foto registrada somente para os destinatários revisados. Acompanhe cada etapa abaixo.");
      try { sessionStorage.removeItem(storageKey); } catch { /* The acknowledged request is safe to replay. */ }
      void refresh();
    } catch (cause) {
      if (!live.current) return;
      const definitive = cause instanceof SetupError && cause.status >= 400 && cause.status < 500;
      if (definitive) {
        frozen.current = false; setReview(null); setUncertain(null);
        try { sessionStorage.removeItem(storageKey); } catch { /* No command was accepted. */ }
        if ([401, 403].includes(cause.status)) setForbidden(true);
      } else { setUncertain(intent); setReview(null); }
      setError(cause instanceof SetupError ? cause.message : "O recebimento da solicitação não foi confirmado. Confira os resultados antes de consultar a mesma solicitação.");
    } finally {
      window.clearTimeout(timeout); busy.current = false;
      if (live.current) setPending(null);
    }
  }
  function confirmReview() {
    if (!review || busy.current || !canEdit || (review.retry?.requiresReview && !reviewed)) return;
    const targets = review.targets.map(({ browserId, sessionId, instagramUserId }) => ({ browserId, sessionId, instagramUserId }));
    const requestId = crypto.randomUUID();
    const intent: SetupIntent = review.retry
      ? { kind: "retry", payload: { requestId, dispatchId: review.retry.dispatchId, targets: targets.map(target => ({ ...target, jobId: review.retry!.jobId })), reviewedUncertain: reviewed }, review }
      : { kind: "create", payload: { requestId, targets, actions: structuredClone(review.actions) }, review };
    void send(intent);
  }

  const update = <div className={`${styles.root} ${styles.extensionPanel}`} data-profile-extension><h3>Atualização para bio e foto</h3><p>Preserve a instalação e a configuração atuais. Extraia o pacote sobrepondo somente os arquivos de código na mesma pasta e recarregue a mesma extensão. Este pacote não renova a credencial.</p>{role === "owner" ? <button type="button" disabled={forbidden || locked} onClick={() => void downloadUpdate()}>{pending === "update" ? "Baixando atualização…" : "Baixar atualização da extensão"}</button> : <p>Peça ao proprietário para baixar o pacote de atualização.</p>}</div>;
  const configuration = <section className={styles.root} aria-labelledby={`${id}-title`} data-profile-setup>
    <header className={styles.heading}><div><span className={styles.eyebrow}>Configurar contas · prévia de melhorias</span><h2 id={`${id}-title`}>Bio e foto de perfil</h2><p>Atualize os perfis selecionados com o mesmo conteúdo. Escolha o que deseja alterar e revise antes de enviar.</p></div><span className={styles.pilot}>Piloto</span></header>
    <p className={styles.help}>Altere só a bio, só a foto ou ambas. Nenhuma ação desta seção publica Stories ou destaques.</p>
    {!canEdit && <p className={styles.warning}>Modo somente leitura. É necessária permissão de editor para configurar perfis.</p>}
    {readError && <div role="alert" className={styles.warning}>{readError} <button type="button" onClick={() => void refresh()}>Atualizar bio e foto</button></div>}
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.grid}>
      <div className={styles.content}>
        <fieldset disabled={!canEdit || locked} className={styles.fields}><legend>1. Conteúdo do lote</legend>
          <label className={styles.choice}><input type="checkbox" checked={bioEnabled} onChange={event => setBioEnabled(event.target.checked)} />Atualizar bio</label>
          {bioEnabled && <div className={styles.field}><label htmlFor={`${id}-bio`}>Nova bio</label><textarea id={`${id}-bio`} rows={4} value={bio} aria-invalid={bioLength > 150} aria-describedby={`${id}-bio-help`} onChange={event => setBio(event.target.value)} /><div id={`${id}-bio-help`} className={styles.fieldFoot}><span>Vazia: mantém a bio atual. As quebras de linha são preservadas.</span><span className={bioLength > 150 ? styles.invalid : undefined}>{bioLength}/150</span></div></div>}
          <label className={styles.choice}><input type="checkbox" checked={photoEnabled} onChange={event => setPhotoEnabled(event.target.checked)} />Atualizar foto de perfil</label>
          {photoEnabled && <div className={styles.field}><label htmlFor={`${id}-photo`}>Nova foto de perfil</label><input id={`${id}-photo`} type="file" accept="image/png,image/jpeg" onChange={event => choosePhoto(event.target.files?.[0])} aria-describedby={`${id}-photo-help`} /><p id={`${id}-photo-help`} className={styles.help}>PNG ou JPEG, até 8 MB. Prévia com recorte circular central; confira o enquadramento final no Instagram.</p>{photo && photoUrl && <div className={styles.photoRow}><ProfilePhoto src={photoUrl} alt="Prévia da nova foto de perfil" /><span>{photo.name}</span></div>}</div>}
        </fieldset>
      </div>
      <div className={styles.recipients}><fieldset disabled={!canEdit || locked || !fresh} className={styles.fields}><legend>2. Destinatários de bio e foto</legend><p className={styles.help}>Confira o Instagram ID. Nenhum perfil é selecionado automaticamente.</p>
        <div className={styles.tools}><button type="button" disabled={!available.length} onClick={() => setTargets(available.slice(0, 100).map(browser => setupTarget(browser, actions)!))}>Selecionar disponíveis</button><button type="button" disabled={!targets.length} onClick={() => setTargets([])}>Limpar seleção</button></div>
        <p className={styles.counter} aria-live="polite">{shownTargets.length} selecionados de {available.length} disponíveis para bio e foto</p>
        <ul className={styles.browserList}>{rows.map(browser => {
          const target = setupTarget(browser, actions);
          const username = confirmedInstagramUsername(browser);
          const checked = shownTargets.some(item => sameSetupTarget(browser, item));
          return <li key={browser.id}><label className={styles.browser}><input type="checkbox" aria-label={identityLabel(browser)} checked={checked} disabled={!target} onChange={event => { if (!target) return; setTargets(previous => event.target.checked ? previous.length < 100 ? [...previous.filter(item => item.browserId !== target.browserId), target] : previous : previous.filter(item => item.browserId !== target.browserId)); }} /><span><strong>{username ? `@${username}` : browser.label}</strong><span>{username ? browser.label : "@ não informado pela extensão"}</span><span>Instagram ID: {browser.instagramUserId || "indisponível"}</span><span>{browser.capabilities?.profileSetup !== 1 ? "Atualize a extensão para usar bio e foto" : !browser.available ? "Indisponível" : target ? "Disponível" : "Extensão sem suporte à ação escolhida"}</span>{browser.lastSeenAt && <span>Último sinal: {new Date(browser.lastSeenAt).toLocaleString("pt-BR")}</span>}</span></label></li>;
        })}</ul>{loaded && !data.browsers.length && <p className={styles.help}>Abra os perfis com a extensão atualizada e o Instagram conectado.</p>}
      </fieldset><button className={styles.primary} type="button" disabled={!canEdit || locked || !fresh || !targets.length || !Object.keys(actions).length || bioEnabled && bioLength > 150} onClick={() => void prepareReview()}>{pending === "upload" ? "Preparando foto…" : "Revisar bio e foto"}</button></div>
    </div>
    {uncertain && <div className={styles.warning} role="alert"><strong>Recebimento de bio e foto não confirmado</strong><p>A revisão está preservada. Consultar reutiliza exatamente o mesmo conteúdo, identificador e destinatários, mesmo se a lista mudar.</p><ul>{uncertain.review.targets.map(target => <li key={target.browserId}>{target.label} · Instagram ID {target.instagramUserId}</li>)}</ul><button type="button" disabled={!canEdit || !!pending} onClick={() => void send(uncertain)}>{pending === "send" ? "Consultando…" : "Consultar mesma solicitação de bio e foto"}</button></div>}
    {review && <SetupReviewDialog review={review} pending={!!pending} reviewed={reviewed} onReviewed={setReviewed} onCancel={releaseReview} onConfirm={confirmReview} />}
  </section>;
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A bounded scroll region needs an explicit keyboard target across browsers.
  const results = <section className={`${styles.root} ${styles.results}`} aria-labelledby={`${id}-results-title`} data-profile-results><h3 id={`${id}-results-title`}>Resultados de bio e foto</h3>{!data.dispatches.length && <p className={styles.help}>As solicitações e confirmações por etapa aparecerão aqui.</p>}<div className={styles.historyList} role="region" aria-label="Solicitações de bio e foto" tabIndex={0}>{data.dispatches.map(dispatch => <section className={styles.dispatch} key={dispatch.id} aria-label={`Solicitação de bio e foto de ${new Date(dispatch.createdAt).toLocaleString("pt-BR")}`}><div className={styles.dispatchHeading}><strong>{actionKeys.filter(key => dispatch.actions[key]).map(key => actionLabels[key]).join(" + ")}</strong><time dateTime={dispatch.createdAt}>{new Date(dispatch.createdAt).toLocaleString("pt-BR")}</time></div>{dispatch.jobs.map(job => {
      const browser = data.browsers.find(browser => sameSetupTarget(browser, job));
      return <article className={styles.job} key={job.id}><div><strong>{job.label}</strong><p className={styles.help}>Instagram ID {job.instagramUserId}</p><span className={styles.status} data-status={setupJobState(dispatch, job)}>{jobLabels[setupJobState(dispatch, job)]}</span></div><ul className={styles.steps}>{actionKeys.filter(key => dispatch.actions[key]).map(key => <li key={key}><strong>{actionLabels[key]}</strong><span>{job.steps[key] ? stepLabels[job.steps[key]!.status] : "Não executado"}</span><p>{setupMessages[job.steps[key]?.message || ""] || "Acompanhe a confirmação desta etapa no perfil."}</p></li>)}</ul>{setupCanRetry(dispatch, job) && <button type="button" disabled={!canEdit || locked || !fresh || !browser || !setupTarget(browser, dispatch.actions)} onClick={() => prepareRetry(dispatch, job)}>Revisar etapas não confirmadas</button>}</article>;
    })}</section>)}</div></section>;
  return renderLayout ? renderLayout({ configuration, results, update }) : <>{update}{configuration}{results}</>;
}

function SetupReviewDialog({ review, pending, reviewed, onReviewed, onCancel, onConfirm }: { review: SetupReview; pending: boolean; reviewed: boolean; onReviewed: (value: boolean) => void; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
    const first = nodes[0]; const last = nodes.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  }}>
    <h2 id={`${id}-title`}>Revisar bio e foto</h2><p>Somente os perfis abaixo receberão as ações revisadas.</p>
    <ul className={styles.reviewTargets}>{review.targets.map(target => <li key={target.browserId}><strong>{target.label}</strong><span>Instagram ID {target.instagramUserId}</span></li>)}</ul>
    {review.actions.bio && <div className={styles.reviewContent}><h3>Bio</h3><p className={styles.bioPreview}>{review.actions.bio.text || "Manter bio atual"}</p></div>}
    {review.actions.photo && <div className={styles.reviewContent}><h3>Foto de perfil</h3>{review.photoUrl && <ProfilePhoto src={review.photoUrl} alt="Foto de perfil na revisão" />}<p>{review.photoName || "Foto da solicitação original"}</p><p className={styles.help}>A confirmação da foto precisa ser conferida no Instagram. Se o resultado ficar incerto, confira o perfil antes de repetir.</p></div>}
    {review.retry && <p className={styles.warning}>Serão repetidas somente etapas não confirmadas. Etapas confirmadas serão preservadas.</p>}
    {review.retry?.requiresReview && <label className={styles.choice}><input type="checkbox" checked={reviewed} disabled={pending} onChange={event => onReviewed(event.target.checked)} />Conferi este perfil no Instagram e quero repetir as etapas não confirmadas.</label>}
    <div className={styles.dialogActions}><button type="button" disabled={pending} onClick={onCancel}>Voltar à edição</button><button type="button" className={styles.primary} disabled={pending || !!review.retry?.requiresReview && !reviewed} onClick={onConfirm}>{pending ? "Enviando…" : "Confirmar bio e foto"}</button></div>
  </dialog>;
}

function ProfilePhoto({ src, alt }: { src: string; alt: string }) {
  // Local blobs and authenticated private previews must bypass image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} className={styles.avatar} alt={alt} />;
}
