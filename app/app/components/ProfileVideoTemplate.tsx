"use client";

import { useEffect, useRef, useState } from "react";
import { createProfileHeader, prepareProfileAvatar, renderProfileBatch, profileSelectionKey, PROFILE_PHRASE, PROFILE_CTA, type ProfileAccount, type ProfileBatchState, type ProfileVideoIdentity, type ProfileVideoJob } from "../../lib/profile-video-template";
import { createProfileVideoRenderer } from "../../lib/profile-video-renderer";
import styles from "./ProfileVideoTemplate.module.css";

type Props = { files: File[]; contextKey: string; disabled: boolean; onState: (state: ProfileBatchState) => void; accounts?: ProfileAccount[]; individualLocked?: boolean };
type Draft = ProfileVideoIdentity & { avatar: Blob | null };
type Header = { draft: Draft; blob?: Blob; error?: string };
const FIXED_PHRASE = "Vc nunca mais ficará triste depois que seguir essa página 🤣";
const FIXED_CTA = "continuação nos stories";

function useLocalUrl(blob: Blob | undefined | null) {
  const [value, setValue] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // URL allocation/revocation belongs to an effect, not render (including SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return value?.blob === blob ? value?.url : undefined;
}

function OutputVideo({ file }: { file: File }) {
  const url = useLocalUrl(file);
  return <div className={styles.output}>
    <video src={url} controls preload="metadata" aria-label={`Vídeo gerado: ${file.name}`}>
      <track kind="captions" src="data:text/vtt,WEBVTT" label="Sem legendas" />
    </video>
    <a className="outline-button" href={url} download={file.name}>Baixar MP4</a>
  </div>;
}

export function ProfileVideoTemplate(props: Props) {
  return props.accounts ? <MultiProfileVideoTemplate {...props} accounts={props.accounts} /> : <SingleProfileVideoTemplate {...props} />;
}

export function SingleProfileVideoTemplate({ files, contextKey, disabled, onState }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", phrase: FIXED_PHRASE, cta: FIXED_CTA, avatar: null });
  const [header, setHeader] = useState<Header | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedOutput, setSelectedOutput] = useState(0);
  const [result, setResult] = useState<{ sources: File[]; draft: Draft; jobs: ProfileVideoJob[] } | null>(null);
  const [sourceFiles, setSourceFiles] = useState(files);
  // A source replacement invalidates only the render; manual identity and opt-in survive.
  // Conditional state adjustment is completed before children/effects commit.
  if (sourceFiles !== files) {
    setSourceFiles(files); setBusy(false); setResult(null); setSelectedOutput(0);
  }
  const abort = useRef<AbortController | null>(null);
  const photoVersion = useRef(0);
  const generation = useRef(0);
  const headerBlob = header?.draft === draft ? header.blob : undefined;
  const headerUrl = useLocalUrl(headerBlob);
  const sourceUrl = useLocalUrl(files[0]);
  const currentResult = result?.sources === files && result.draft === draft ? result : null;
  const complete = !!currentResult?.jobs.length && currentResult.jobs.length === files.length && currentResult.jobs.every(job => job.status === "done");
  const outputs = complete ? currentResult!.jobs.map(job => job.output!) : undefined;
  const allVideos = files.length > 0 && files.every(file => file instanceof File && file.type.startsWith("video/"));

  useEffect(() => {
    let active = true;
    if (!enabled) return;
    void (async () => {
      try {
        if (!draft.avatar) throw new Error("Selecione a foto e preencha o nome para preparar a prévia.");
        const blob = await createProfileHeader(draft, draft.avatar);
        if (active) setHeader({ draft, blob });
      } catch (error) {
        if (active) setHeader({ draft, error: error instanceof Error ? error.message : "Não foi possível preparar a prévia." });
      }
    })();
    return () => { active = false; };
  }, [draft, enabled]);

  useEffect(() => {
    onState({ enabled, busy, sources: files, contextKey, outputs: complete ? currentResult!.jobs.map(job => job.output!) : undefined });
  }, [enabled, busy, files, contextKey, complete, currentResult, onState]);
  useEffect(() => () => { abort.current?.abort(); generation.current++; }, [files, contextKey]);
  useEffect(() => () => { photoVersion.current++; }, []);

  function invalidate(nextEnabled = enabled) {
    generation.current++; abort.current?.abort(); setBusy(false); setResult(null); setSelectedOutput(0);
    onState({ enabled: nextEnabled, busy: false, sources: files, contextKey });
  }
  function edit(patch: Partial<Pick<Draft, "name" | "avatar">>) { invalidate(); setDraft(current => ({ ...current, ...patch })); }

  async function generate() {
    if (!headerBlob || !allVideos || busy || disabled) return;
    invalidate();
    const version = generation.current;
    const controller = new AbortController(); abort.current = controller;
    const renderer = createProfileVideoRenderer();
    setBusy(true); onState({ enabled: true, busy: true, sources: files, contextKey });
    try {
      await renderProfileBatch(files, headerBlob, renderer.render, controller.signal, jobs => {
        if (generation.current === version) setResult({ sources: files, draft, jobs });
      });
    } finally {
      renderer.dispose();
      if (generation.current === version) { abort.current = null; setBusy(false); }
    }
  }

  return <section className={`video-generator full-field ${enabled ? "enabled" : ""}`} aria-label="Template de perfil">
    <div className="video-generator-head">
      <span><span><strong>Template de perfil</strong><small>Uma foto e um nome para todos os vídeos do lote.</small></span></span>
      <label className="switch-control"><input type="checkbox" checked={enabled} disabled={disabled || busy} onChange={event => { invalidate(event.target.checked); setEnabled(event.target.checked); }} /><i /><b>{enabled ? "Ativado" : "Desativado"}</b></label>
    </div>
    {enabled && <>
      <p className={styles.note}>Identidade manual, sem associação automática às contas da campanha. A foto será recortada ao centro em círculo.</p>
      <div className={styles.grid}>
        <fieldset className={styles.fields} disabled={disabled || busy}>
          <legend>Identidade e mensagem do lote</legend>
          <label><span>Foto do perfil</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
            const file = event.target.files?.[0]; const version = ++photoVersion.current;
            edit({ avatar: null }); setPhotoError(""); setPhotoLoading(!!file);
            if (!file) return;
            try { const avatar = await prepareProfileAvatar(file); if (version === photoVersion.current) edit({ avatar }); }
            catch (error) { if (version === photoVersion.current) setPhotoError(error instanceof Error ? error.message : "Foto inválida."); }
            finally { if (version === photoVersion.current) setPhotoLoading(false); }
          }} /><small>PNG, JPEG ou WebP · até 5 MB e 12 megapixels</small></label>
          <label><span>Nome</span><input value={draft.name} maxLength={60} onChange={event => edit({ name: event.target.value })} placeholder="Nome que aparece no vídeo" /></label>
          <div><strong>Mensagem fixa em todos os vídeos</strong><p>{FIXED_PHRASE}</p><p><b>{FIXED_CTA}</b></p></div>
        </fieldset>
        <figure className={styles.preview}>
          <div className={styles.frame}>
            <div className={styles.header}>{headerUrl ? (
              // Local PNG must remain byte-identical to the layer passed to FFmpeg.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerUrl} alt="Prévia da faixa com foto, nome, frase e chamada" />
            ) : <span>Preencha os campos para ver a faixa</span>}</div>
            <video src={sourceUrl} muted playsInline preload="metadata" aria-label="Enquadramento do primeiro vídeo"><track kind="captions" src="data:text/vtt,WEBVTT" label="Sem legendas" /></video>
          </div>
          <figcaption>Prévia do primeiro vídeo · 720 × 1280<br />Vídeo ampliado com corte central para preencher a área abaixo da faixa.</figcaption>
        </figure>
      </div>
      <div className={styles.feedback} aria-live="polite">
        {photoLoading ? "Preparando foto…" : photoError || (header?.draft === draft ? header.error : "Preparando prévia…")}
        {!allVideos && <p>Este template aceita vídeos locais. Remova imagens deste lote ou desative o template para usar o fluxo de imagens.</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className="outline-button" disabled={disabled || busy || !allVideos || !headerBlob || photoLoading} onClick={() => void generate()}>{busy ? "Gerando vídeos…" : `Gerar ${files.length} vídeo${files.length === 1 ? "" : "s"} localmente`}</button>
        {busy && <button type="button" className="text-button" onClick={() => abort.current?.abort()}>Cancelar geração</button>}
        <small>Sequencial · áudio original mantido · nenhum envio nesta etapa</small>
      </div>
      {currentResult && <ol className={styles.jobs} aria-label="Resultado por vídeo" aria-live="polite">{currentResult.jobs.map(job => <li key={job.index}>
        <span><b>{String(job.index + 1).padStart(2, "0")}</b> {job.name}</span>
        <span>{({ waiting: "Aguardando", rendering: "Gerando", done: "Pronto", failed: "Falhou", cancelled: "Cancelado" })[job.status]}{job.status === "rendering" ? ` · ${Math.round(job.progress * 100)}%` : ""}</span>
        {job.status === "rendering" && <progress max={1} value={job.progress} aria-label={`Progresso de ${job.name}`} />}
        {job.error && <small role="alert">{job.error}</small>}
      </li>)}</ol>}
      {outputs ? <>
        <p className={styles.ready}>Os {outputs.length} vídeos estão prontos para a campanha. Confira o MP4 gerado antes de continuar.</p>
        <label className={styles.outputPicker}><span>Conferir vídeo gerado</span><select value={selectedOutput} onChange={event => setSelectedOutput(Number(event.target.value))}>{outputs.map((file, index) => <option key={index} value={index}>{index + 1}. {file.name}</option>)}</select></label>
        <OutputVideo file={outputs[selectedOutput] || outputs[0]} />
      </> : <p className={styles.note}>Gere o lote completo antes de salvar a campanha. Alterar campos, foto ou arquivos invalida os resultados anteriores. Em caso de falha, a nova geração só começa ao clicar novamente.</p>}
    </>}
  </section>;
}

export function MultiProfileVideoTemplate({ files, contextKey, disabled, onState, accounts, individualLocked = false }: Props & { accounts: ProfileAccount[] }) {
  const [enabled, setEnabled] = useState(false);
  const [avatar, setAvatar] = useState<Blob | null>(null);
  const [nameMode, setNameMode] = useState<"common" | "individual">("common");
  const [commonName, setCommonName] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewAccount, setPreviewAccount] = useState("");
  const [selectedOutput, setSelectedOutput] = useState(0);
  const selectionKey = profileSelectionKey(accounts);
  const identityKey = JSON.stringify([contextKey, selectionKey, accounts.map(account => account.username), nameMode, commonName, edits]);
  type Headers = { key: string; avatar: Blob; values: Record<string, Blob>; error?: string };
  type Result = { key: string; avatar: Blob; sources: File[]; jobs: Record<string, ProfileVideoJob[]> };
  const [headers, setHeaders] = useState<Headers | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [inputs, setInputs] = useState({ files, identityKey });
  if (inputs.files !== files || inputs.identityKey !== identityKey) {
    setInputs({ files, identityKey }); setResult(null); setBusy(false); setReviewed(false); setSelectedOutput(0);
  }
  const controller = useRef<AbortController | null>(null);
  const photoVersion = useRef(0);
  const generation = useRef(0);
  const nameOf = (account: ProfileAccount) => nameMode === "common" ? commonName : edits[account.id] ?? suggestedProfileName(account);
  const individualBlocked = nameMode === "individual" && individualLocked;
  const renderAccounts = nameMode === "common" ? accounts.slice(0, 1) : accounts;
  const renderKey = (account: ProfileAccount) => nameMode === "common" ? "common" : account.id;
  const selected = accounts.find(account => account.id === previewAccount) || accounts[0];
  const currentHeaders = headers?.key === identityKey && headers.avatar === avatar ? headers : null;
  const currentResult = result?.key === identityKey && result.avatar === avatar && result.sources === files ? result : null;
  const complete = !!accounts.length && !!currentResult && renderAccounts.every(account => currentResult.jobs[renderKey(account)]?.length === files.length && currentResult.jobs[renderKey(account)].every(job => job.status === "done"));
  const validFiles = files.length > 0 && files.every(file => file instanceof File && file.type.startsWith("video/"));
  const headerUrl = useLocalUrl(selected ? currentHeaders?.values[renderKey(selected)] : null);
  const sourceUrl = useLocalUrl(files[0]);
  const selectedJobs = selected ? currentResult?.jobs[renderKey(selected)] : undefined;
  const outputs = selectedJobs?.filter(job => job.status === "done").map(job => job.output!);

  useEffect(() => {
    let active = true;
    if (!enabled || !avatar) return;
    void (async () => {
      const values: Record<string, Blob> = {};
      try {
        for (const account of renderAccounts) {
          values[renderKey(account)] = await createProfileHeader({ name: nameOf(account), phrase: PROFILE_PHRASE, cta: PROFILE_CTA }, avatar);
          if (!active) return;
        }
        if (active) setHeaders({ key: identityKey, avatar, values });
      } catch (error) { if (active) setHeaders({ key: identityKey, avatar, values, error: error instanceof Error ? error.message : "Revise os nomes dos perfis." }); }
    })();
    return () => { active = false; };
    // identityKey includes accounts, handles, saved names, mode and all edited names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, avatar, enabled]);
  useEffect(() => {
    onState({ enabled, busy, sources: files, contextKey, selectionKey, mode: nameMode,
      outputs: complete && reviewed && nameMode === "common" ? currentResult!.jobs.common.map(job => job.output!) : undefined,
      variants: complete && reviewed && nameMode === "individual" ? accounts.map(account => ({ accountId: account.id, name: nameOf(account), username: account.username, outputs: currentResult!.jobs[renderKey(account)].map(job => job.output!) })) : undefined });
    // Semantic keys avoid re-reporting because the parent made an equivalent account array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, busy, files, contextKey, identityKey, avatar, selectionKey, complete, reviewed, currentResult, onState]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, [files, identityKey, avatar]);
  useEffect(() => () => { photoVersion.current++; }, []);

  function invalidate(nextEnabled = enabled) {
    generation.current++; controller.current?.abort(); setBusy(false); setResult(null); setSelectedOutput(0);
    onState({ enabled: nextEnabled, busy: false, sources: files, contextKey, selectionKey, mode: nameMode });
  }
  function invalidateIdentity() { invalidate(); setHeaders(null); setReviewed(false); }
  async function generate() {
    if (busy || disabled || individualBlocked || !reviewed || !validFiles || !avatar || !accounts.length || !currentHeaders || currentHeaders.error) return;
    invalidate(); const version = generation.current;
    const active = new AbortController(); controller.current = active;
    const renderer = createProfileVideoRenderer(); const jobs: Record<string, ProfileVideoJob[]> = {};
    setBusy(true); onState({ enabled: true, busy: true, sources: files, contextKey, selectionKey, mode: nameMode });
    try {
      for (const account of renderAccounts) {
        if (active.signal.aborted) break;
        await renderProfileBatch(files, currentHeaders.values[renderKey(account)], renderer.render, active.signal, next => {
          jobs[renderKey(account)] = next;
          if (generation.current === version) setResult({ key: identityKey, avatar, sources: files, jobs: { ...jobs } });
        });
      }
    } finally { renderer.dispose(); if (generation.current === version) { controller.current = null; setBusy(false); } }
  }
  return <section className="video-generator full-field" aria-label="Template por perfil">
    <div className="video-generator-head"><span><strong>Template por perfil</strong><small>Mesmos vídeos e foto comum. Escolha um nome comum ou nomes individuais.</small></span><label className="switch-control"><input type="checkbox" checked={enabled} disabled={disabled || busy} onChange={event => { invalidate(event.target.checked); setEnabled(event.target.checked); }} /><i /><b>{enabled ? "Ativado" : "Desativado"}</b></label></div>
    {enabled && <>
      <p className={styles.note}>Selecione as contas na campanha abaixo. {nameMode === "common" ? "Nome comum cria uma única campanha com os mesmos vídeos para todas as contas selecionadas. Revise os perfis e horários na configuração antes de confirmar." : "Nomes individuais criam um rascunho vinculado por perfil, com confirmação individual posterior."} Apenas arquivos locais; para reutilizar a biblioteca, selecione seus downloads originais. Nenhum arroba será impresso.</p>
      <div className={styles.grid}>
        <fieldset className={styles.fields} disabled={disabled || busy}>
          <legend>Foto comum e nomes dos perfis</legend>
          <label>Foto comum<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
            const version = ++photoVersion.current, file = event.target.files?.[0]; invalidate(); setAvatar(null); setPhotoError(""); setPhotoLoading(!!file);
            if (!file) return;
            try { const photo = await prepareProfileAvatar(file); if (version === photoVersion.current) setAvatar(photo); }
            catch (error) { if (version === photoVersion.current) setPhotoError(error instanceof Error ? error.message : "Foto inválida."); }
            finally { if (version === photoVersion.current) setPhotoLoading(false); }
          }} /><small>PNG, JPEG ou WebP · até 5 MB e 12 megapixels · recorte circular central</small></label>
          {!accounts.length && <p>Selecione pelo menos uma conta conectada deste workspace.</p>}
          <label>Nome nos vídeos<select value={nameMode} onChange={event => { invalidateIdentity(); setNameMode(event.target.value === "individual" ? "individual" : "common"); }}><option value="common">Nome comum</option><option value="individual" disabled={individualLocked}>Nomes individuais</option></select></label>
          {individualBlocked && <p>Confira os resultados individuais já enviados. Você pode mudar para Nome comum sem apagar esses resultados.</p>}
          {nameMode === "common" ? <label><span>Nome comum</span><input value={commonName} maxLength={60} placeholder="Nome para todos os perfis, sem arroba" onChange={event => { invalidateIdentity(); setCommonName(event.target.value); }} /><small>Digite o nome que aparecerá em todos os vídeos de todas as contas selecionadas.</small></label> : accounts.map(account => <label key={account.id}><span>Nome no vídeo de @{account.username}</span><input value={nameOf(account)} maxLength={60} placeholder="Revise o nome público, sem arroba" onChange={event => { invalidateIdentity(); setEdits(current => ({ ...current, [account.id]: event.target.value })); }} /><small>Revise o nome salvo. Quando ele coincide com o usuário Instagram, o campo fica vazio.</small></label>)}
          <label><input type="checkbox" checked={reviewed} disabled={!accounts.length} onChange={event => { invalidate(); setReviewed(event.target.checked); }} />{nameMode === "common" ? "Revisei o nome comum para todas as contas selecionadas." : "Revisei os nomes de todas as contas selecionadas."}</label>
          <div><strong>Mensagem fixa</strong><p>{PROFILE_PHRASE}</p><p><b>{PROFILE_CTA}</b></p></div>
        </fieldset>
        <figure className={styles.preview}>
          <label>Prévia do perfil<select value={selected?.id || ""} onChange={event => { setPreviewAccount(event.target.value); setSelectedOutput(0); }}>{accounts.map(account => <option key={account.id} value={account.id}>@{account.username} · {nameOf(account) || "nome pendente"}</option>)}</select></label>
          <div className={styles.frame}><div className={styles.header}>{headerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerUrl} alt="Faixa do perfil selecionado, sem arroba" />
          ) : <span>Selecione a foto e revise os nomes</span>}</div><video src={sourceUrl} muted playsInline preload="metadata" aria-label="Enquadramento do vídeo"><track kind="captions" src="data:text/vtt,WEBVTT" label="Sem legendas" /></video></div>
          <figcaption>720 × 1280 · corte central para preencher a área do vídeo. A mesma faixa será usada na exportação.</figcaption>
        </figure>
      </div>
      <p className={styles.feedback} role="status">{photoLoading ? "Preparando foto…" : photoError || currentHeaders?.error || (!avatar ? "Selecione a foto comum." : !currentHeaders ? "Preparando prévias…" : "")}{!validFiles && " Selecione vídeos locais para este lote."}</p>
      <div className={styles.actions}><button type="button" className="outline-button" disabled={disabled || busy || individualBlocked || !reviewed || !validFiles || !accounts.length || !currentHeaders || !!currentHeaders.error || photoLoading} onClick={() => void generate()}>{busy ? "Gerando vídeos…" : `Gerar ${files.length * renderAccounts.length} vídeos para ${accounts.length} perfis`}</button>{busy && <button type="button" className="text-button" onClick={() => controller.current?.abort()}>Cancelar geração</button>}<small>{nameMode === "common" ? "Uma geração por vídeo, reutilizada em todos os perfis" : "Geração individual por perfil"} · sequencial · nenhum upload ou rascunho nesta etapa</small></div>
      {currentResult && <ol className={styles.jobs} aria-live="polite">{renderAccounts.flatMap(account => (currentResult.jobs[renderKey(account)] || []).map(job => <li key={`${renderKey(account)}:${job.index}`}><span>{nameMode === "common" ? "Todos os perfis" : `@${account.username}`} · {job.name}</span><span>{({ waiting: "Aguardando", rendering: "Gerando", done: "Pronto", failed: "Falhou", cancelled: "Cancelado" })[job.status]}</span>{job.status === "rendering" && <progress max={1} value={job.progress} aria-label={`Progresso ${nameMode === "common" ? "comum" : account.username} ${job.name}`} />}{job.error && <small role="alert">{job.error}</small>}</li>))}</ol>}
      {!!outputs?.length && <><label className={styles.outputPicker}>Conferir saída do perfil selecionado<select value={selectedOutput} onChange={event => setSelectedOutput(Number(event.target.value))}>{outputs.map((file, index) => <option key={index} value={index}>{index + 1}. {file.name}</option>)}</select></label><OutputVideo file={outputs[selectedOutput] || outputs[0]} /></>}
      <p className={styles.note}>{complete ? nameMode === "common" ? "Vídeos prontos. Continue para configurar uma campanha com todas as contas selecionadas." : "Render completo. Confira os MP4 de cada perfil antes de criar os rascunhos." : "Alterar arquivos, foto, nomes, contas ou workspace invalida o lote. É preciso concluir a geração antes de salvar."} Upload, criação e programação são etapas separadas; salvar não agenda.</p>
    </>}
  </section>;
}

function suggestedProfileName(account: ProfileAccount) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[@＠]/g, "");
  const name = account.displayName ?? "";
  return normalize(name) === normalize(account.username) ? "" : name;
}
