"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CampaignActivity, campaignActivityTime, createCampaignActivityPoller, useActivitySnapshot, usePanelVisibility } from "./CampaignActivity";
import type { CampaignActivityResponse } from "../../lib/campaign-activity-types";
import { CampaignDialog } from "./CampaignDialog";
import { CampaignDeleteConfirmation } from "./CampaignDirectory";
import type { ProfileReleasePreview } from "../../lib/profile-draft-release";
import { campaignAccountQueueCount, campaignArchiveFeedback, campaignMutation, campaignPhase, campaignPhaseLabels, campaignProfileQueueGroups, campaignRequest, campaignVariations, initialSchedule, loadCampaignDetail, parseCampaignProfileQueues, scheduleEffectiveRhythm, schedulePayload, scheduleStoredFields, scheduleValidation, selectCampaignAccountsWithoutQueue,
  type Campaign, type CampaignAccount, type CampaignFetcher, type CampaignMedia, type CampaignProfileQueues, type ScheduleDraft } from "../lib/campaignUi";

type Content = { name: string; caption: string; captionVariations: string[]; hashtags: string; shareToFeed: boolean };
const contentOf = (campaign: Campaign): Content => ({ name: campaign.name, caption: campaign.caption || "", captionVariations: campaignVariations(campaign.captionVariations), hashtags: campaign.hashtags || "", shareToFeed: !!campaign.shareToFeed });
export function CampaignProfilePicker({ campaignId, accounts, selected, disabled, onSelection, onFeedback, fetcher = fetch }: {
  campaignId: string; accounts: CampaignAccount[]; selected: string[]; disabled: boolean;
  onSelection: (ids: string[]) => void; onFeedback: (message: string) => void; fetcher?: CampaignFetcher;
}) {
  const { root: rootRef, visible } = usePanelVisibility();
  const [snapshot, setSnapshot] = useState<{ key: string; data: CampaignProfileQueues | null; error: string | null; pending: boolean }>({ key: campaignId, data: null, error: null, pending: false });
  const poller = useRef<ReturnType<typeof createCampaignActivityPoller<CampaignProfileQueues>> | null>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const displacedFocusRef = useRef<{ key: string; id: string; node: Element } | null>(null);
  const profileInputsRef = useRef(new Map<string, HTMLInputElement>());
  useLayoutEffect(() => {
    // A user's new focus/interaction takes precedence over a queued snapshot commit.
    const cancelRestore = () => { displacedFocusRef.current = null; };
    document.addEventListener("focusin", cancelRestore, true);
    document.addEventListener("pointerdown", cancelRestore, true);
    document.addEventListener("keydown", cancelRestore, true);
    return () => {
      cancelRestore();
      document.removeEventListener("focusin", cancelRestore, true);
      document.removeEventListener("pointerdown", cancelRestore, true);
      document.removeEventListener("keydown", cancelRestore, true);
    };
  }, [campaignId]);
  // Commit-time cleanup blocks even a fetch implementation that ignores abort after a remount/workspace change.
  useLayoutEffect(() => {
    if (!visible) return;
    const rememberProfileFocus = () => {
      const active = document.activeElement;
      if (active && rootRef.current?.contains(active) && active.matches('input[type="checkbox"][data-account-id]')) {
        displacedFocusRef.current = { key: campaignId, id: active.getAttribute("data-account-id")!, node: active };
      } else {
        const displaced = displacedFocusRef.current;
        // A pending GET may finish after props removed the focused profile and left focus on body.
        if (active !== document.body || !rootRef.current?.isConnected || !displaced || displaced.key !== campaignId || displaced.node.isConnected) displacedFocusRef.current = null;
      }
    };
    const active = createCampaignActivityPoller<CampaignProfileQueues>({
      url: "/api/campaigns/profile-queues", intervalMs: 45_000,
      isVisible: () => document.visibilityState === "visible",
      fetcher: async (_url, init) => {
        const response = await fetcher("/api/campaigns/profile-queues", init);
        if (!response.ok) throw new Error(`Não foi possível atualizar as filas (HTTP ${response.status}).`);
        const data = parseCampaignProfileQueues(await response.json());
        return Response.json(data);
      },
      onSnapshot: data => { rememberProfileFocus(); setSnapshot({ key: campaignId, data, error: null, pending: false }); },
      onError: error => { rememberProfileFocus(); setSnapshot(current => ({ key: campaignId, data: current.key === campaignId ? current.data : null, error, pending: false })); },
      onPending: pending => setSnapshot(current => current.key === campaignId ? { ...current, pending } : { key: campaignId, data: null, error: null, pending }),
    });
    poller.current = active; active.start();
    return () => { active.stop(); if (poller.current === active) poller.current = null; };
  }, [campaignId, fetcher, visible, rootRef]);
  useLayoutEffect(() => {
    const displaced = displacedFocusRef.current;
    const root = rootRef.current;
    if (!displaced) return;
    if (displaced.key !== campaignId || !root?.isConnected || displaced.node.isConnected || document.activeElement !== document.body) { displacedFocusRef.current = null; return; }
    const input = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-account-id]')).find(node => node.getAttribute("data-account-id") === displaced.id && node.isConnected && !node.disabled);
    const refresh = refreshRef.current;
    const target = input || (refresh?.isConnected && !refresh.disabled ? refresh : null);
    if (!target) return; // Keep the intent until a future commit enables a safe destination.
    target.focus({ preventScroll: true });
    if (document.activeElement === target) displacedFocusRef.current = null;
  });
  const data = snapshot.key === campaignId ? snapshot.data : null;
  const error = snapshot.key === campaignId ? snapshot.error : null;
  const pending = snapshot.key === campaignId && snapshot.pending;
  const fresh = visible && !!data && !error && !pending;
  const counts = data ? new Map(data.accounts.map(account => [account.id, account.queueCount])) : null;
  const eligible = accounts.filter(account => account.connectionStatus === "Conectada" && account.lifecycle !== "caida");
  const profiles = eligible.map(account => ({ ...account, queueCount: counts ? counts.get(account.id) ?? null : campaignAccountQueueCount(account) }));
  const groups = campaignProfileQueueGroups(profiles);
  const selectEmpty = () => {
    if (disabled || !fresh) return;
    const result = selectCampaignAccountsWithoutQueue(selected, profiles);
    onSelection(result.ids);
    onFeedback(`${result.added} perfis sem fila adicionados à seleção.${result.omitted ? ` ${result.omitted} não adicionados: limite de 200 perfis. As escolhas anteriores foram mantidas.` : ""} Nenhuma publicação foi agendada.`);
  };
  return <fieldset ref={element => { rootRef.current = element; }} className="campaign-profile-picker full-field" aria-busy={pending}>
    <legend>Perfis conectados · {selected.length} selecionados (máximo 200)</legend>
    <div className="campaign-profile-actions">
      <button type="button" className="outline-button" disabled={disabled || !fresh || !groups.empty.length} onClick={selectEmpty}>Selecionar sem fila</button>
      <button type="button" className="text-button" disabled={disabled} onClick={() => { if (disabled) return; onSelection(selected.length ? [] : eligible.slice(0, 200).map(account => account.id)); }}>{selected.length ? "Limpar seleção" : "Selecionar perfis disponíveis"}</button>
      <button ref={refreshRef} type="button" className="outline-button" disabled={pending || !visible} onClick={() => { void poller.current?.refresh(); }}>Atualizar filas</button>
    </div>
    <p className="campaign-row-meta" role="status">{pending ? "Atualizando filas… Seleção automática indisponível durante a consulta." : error ? `${error} Contagens anteriores desatualizadas; selecione manualmente ou atualize as filas.` : !fresh ? "Contagens desatualizadas ou indisponíveis até consultar as filas. A seleção manual continua disponível." : `Filas consultadas às ${campaignActivityTime(data!.fetchedAt, "America/Sao_Paulo")}. Atualização a cada 45s enquanto visível.`} Selecionar perfis não agenda publicações.</p>
    <div className="campaign-profile-groups">{([['empty', 'Sem fila'], ['queued', 'Com publicações na fila'], ['unknown', 'Fila indisponível']] as const).map(([group, title]) => groups[group].length > 0 && <section className="campaign-profile-group" data-queue-group={group} key={group} aria-label={title}>
      <h4>{title} · {groups[group].length}{group !== "unknown" && !fresh ? " · desatualizado" : ""}</h4>
      <div className="campaign-profile-options">{groups[group].map(account => <label key={account.id}>
        <input type="checkbox" data-account-id={account.id} ref={node => {
          const previous = profileInputsRef.current.get(account.id);
          if (node) profileInputsRef.current.set(account.id, node);
          else {
            // React detaches refs before removing the focused DOM node, including eligibility-only prop changes.
            if (previous && document.activeElement === previous && rootRef.current?.contains(previous)) displacedFocusRef.current = { key: campaignId, id: account.id, node: previous };
            profileInputsRef.current.delete(account.id);
          }
        }} disabled={disabled || (!selected.includes(account.id) && selected.length >= 200)} checked={selected.includes(account.id)} onChange={() => { if (disabled || (!selected.includes(account.id) && selected.length >= 200)) return; onSelection(selected.includes(account.id) ? selected.filter(id => id !== account.id) : [...selected, account.id]); }} />
        <span className="campaign-profile-identity"><strong>@{account.username}</strong>{account.model && <small>{account.model}</small>}</span>
        <span className="campaign-profile-queue-count">{campaignAccountQueueCount(account) === null ? "Fila indisponível" : `${account.queueCount} na fila${!fresh ? " · desatualizado" : ""}`}</span>
      </label>)}</div>
    </section>)}</div>
    {!eligible.length && <p>Nenhum perfil conectado disponível. A confirmação permanece indisponível.</p>}
  </fieldset>;
}
export function CampaignExecutionSummary({ campaignId, report }: { campaignId: string; report: boolean }) {
  const { root, visible } = usePanelVisibility();
  const snapshot = useActivitySnapshot<CampaignActivityResponse>(`/api/campaigns/${encodeURIComponent(campaignId)}/activity?state=all&pageSize=1`, visible, !report);
  const data = snapshot.data;
  return <section ref={root} className="campaign-detail-summary" aria-label="Resumo da execução">
    {snapshot.error && <p role="status">{data ? "Dados desatualizados. " : "Consulta indisponível. "}{snapshot.error}</p>}
    {!data && !snapshot.error && <p role="status">Carregando resumo…</p>}
    {data && <><p>Última consulta: {campaignActivityTime(data.fetchedAt, data.campaign.timezone)}</p><dl className="campaign-review-facts">
      {([["total", "Publicações"], ["published", "Publicadas"], ["failed", "Falhas"], ["blocked", "Bloqueadas"], ["waiting", "Aguardando"], ["delayed", "Atrasadas"]] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{data.summary[key]}</dd></div>)}</dl>
      <p>Espera e atraso podem se sobrepor. {report ? "Conclusão não significa sucesso de todos os posts." : "O resumo acompanha o progresso enquanto visível."}</p>
      <details><summary>Perfis da campanha · {data.accounts.length}</summary>{data.accounts.map(account => <p key={account.id}>@{account.username}: {account.published}/{account.total} publicadas · {account.failed} falhas · {account.blocked} bloqueios</p>)}</details>
    </>}
    <button type="button" className="outline-button" disabled={snapshot.pending || !visible} onClick={snapshot.refresh}>Atualizar resumo</button>
  </section>;
}
export function CampaignWorkbench({ campaign: campaignInput, preparation, accounts, canEdit, publishingEnabled, onClose, onChanged, onRemoved, onQueue, fetcher = fetch, returnFocusFallbackId, availabilityError, onRefreshDetail, onTemplateCreated }: {
  campaign: Campaign; accounts: CampaignAccount[]; canEdit: boolean; publishingEnabled: boolean; onClose: () => void;
  onChanged: (campaign?: Campaign) => void; onRemoved: (id: string, feedback?: string) => void; onQueue?: (id: string) => void; fetcher?: CampaignFetcher;
  preparation?: ScheduleDraft | null;
  returnFocusFallbackId?: string;
  availabilityError?: string; onRefreshDetail?: () => void; onTemplateCreated?: (template: Campaign) => void;
}) {
  const [campaign, setCampaign] = useState(campaignInput);
  const [previousInput, setPreviousInput] = useState(campaignInput);
  const latestInput = useRef(campaignInput); const inputRevision = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const id = useId(); const phase = campaignPhase(campaign);
  const mode = phase === "draft" ? "configure" : phase === "completed" ? "report" : phase === "running" || phase === "scheduled" ? "monitor" : "manage";
  const [tab, setTab] = useState<"summary" | "activity" | "settings">("summary");
  const activeTab = mode === "report" && tab === "settings" ? "summary" : tab;
  const [step, setStep] = useState<"content" | "schedule" | "review">("content");
  const [content, setContent] = useState<Content>(() => contentOf(campaign));
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => preparation || initialSchedule(campaign));
  const scheduleBaseline = useRef(schedule);
  const [media, setMedia] = useState<CampaignMedia[] | null>(null);
  const [profileRelease, setProfileRelease] = useState<ProfileReleasePreview | null>(null);
  const releaseAttempt = useRef<{ operationId: string; snapshot: string } | null>(null);
  const releasePending = useRef<{ invalidated: boolean } | null>(null);
  const [loadError, setLoadError] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const lock = useRef(false); const mounted = useRef(true);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [confirmationFailure, setConfirmationFailure] = useState<{ message: string; archived: boolean } | null>(null);
  const confirmationFailed = useRef(false);
  const [appliedReadPending, setAppliedReadPending] = useState(false); const appliedReadBlocked = useRef(false);
  const [appliedOutcomeKnown, setAppliedOutcomeKnown] = useState(false);
  const [renaming, setRenaming] = useState(false); const [renameName, setRenameName] = useState(campaign.name);
  const renameInput = useRef<HTMLInputElement>(null);
  const initialPreparation = useRef(preparation);
  const [variationCount, setVariationCount] = useState(6);
  const mutationBlocked = busy || !hydrated || !canEdit || !!availabilityError || appliedReadPending || phase === "archived" || !!confirmationFailure;
  const readOnlyPhase = useRef(mode === "report");
  useLayoutEffect(() => () => {
    if (releasePending.current) { releasePending.current.invalidated = true; releasePending.current = null; lock.current = false; setBusy(false); }
  }, [campaignInput.id]);
  useEffect(() => { readOnlyPhase.current = mode === "report" || phase === "archived"; }, [mode, phase]);
  if (previousInput !== campaignInput) { latestInput.current = campaignInput; inputRevision.current++; setPreviousInput(campaignInput); setCampaign(current => ({ ...current, ...campaignInput })); }
  useEffect(() => { if (renaming) renameInput.current?.focus(); }, [renaming]);
  useEffect(() => {
    mounted.current = true; const controller = new AbortController();
    const startedRevision = inputRevision.current; const startingContent = contentOf(latestInput.current); const startingSchedule = scheduleBaseline.current;
    loadCampaignDetail(fetcher, campaignInput.id, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          // A dashboard read delivered after this GET started owns its newer fields/status.
          const hydratedCampaign = inputRevision.current === startedRevision ? data.campaign : { ...data.campaign, ...latestInput.current };
          hydratedCampaign.profileAccountId = data.campaign.profileAccountId;
          const initial = { ...(initialPreparation.current || initialSchedule(hydratedCampaign)) };
          if (data.campaign.profileAccountId) initial.accountIds = [data.campaign.profileAccountId];
          scheduleBaseline.current = initial;
          setCampaign(hydratedCampaign);
          setContent(current => JSON.stringify(current) === JSON.stringify(startingContent) ? contentOf(hydratedCampaign) : current);
          setSchedule(current => current === startingSchedule ? initial : current);
          setMedia(data.media || []); setHydrated(true);
          setProfileRelease((data as typeof data & { profileRelease?: ProfileReleasePreview | null }).profileRelease || null);
        }
      })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Não foi possível consultar os arquivos."); });
    return () => { mounted.current = false; controller.abort(); };
  }, [campaignInput.id, fetcher, hydrationAttempt]);
  const available = accounts.filter(account => account.connectionStatus === "Conectada" && account.lifecycle !== "caida" && (!campaign.profileAccountId || account.id === campaign.profileAccountId));
  const setScheduleField = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => setSchedule(current => ({ ...current, [key]: value }));
  const openConfirmation = (action: string) => {
    if (!canEdit || !hydrated || lock.current || confirmationFailed.current || availabilityError || appliedReadBlocked.current || phase === "archived") return;
    setConfirmationFailure(null); setConfirm(action);
  };
  const dismissConfirmation = () => {
    if (lock.current) return;
    if (confirmationFailure) {
      if (confirmationFailure.archived) onRemoved(campaign.id, confirmationFailure.message);
      onClose(); // Reopening always hydrates before another mutation is available.
    } else setConfirm(null);
  };
  const inspectConfirmationResult = async () => {
    if (!confirmationFailure || lock.current) return;
    if (confirmationFailure.archived) { onRemoved(campaign.id, confirmationFailure.message); onClose(); return; }
    lock.current = true; setBusy(true);
    try {
      const detail = await loadCampaignDetail(fetcher, campaign.id);
      if (!mounted.current) return;
      if (detail.campaign.status === "archived") { onRemoved(campaign.id); onClose(); return; }
      setCampaign(detail.campaign); onChanged(detail.campaign);
      setMedia(detail.media || []); setProfileRelease((detail as typeof detail & { profileRelease?: ProfileReleasePreview | null }).profileRelease || null);
      confirmationFailed.current = false; setConfirmationFailure(null); setConfirm(null);
      setMessage("Estado consultado. Confira a campanha antes de escolher uma nova ação. Nenhuma operação foi repetida.");
    } catch (error) {
      if (mounted.current) setConfirmationFailure(current => current && ({ ...current, message: `${current.message} Não foi possível conferir o estado: ${error instanceof Error ? error.message : "consulta indisponível"}` }));
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const readAppliedState = async (successMessage: string, confirmed = true, inspection = false, isCurrent = () => mounted.current) => {
    try {
      const detail = await loadCampaignDetail(fetcher, campaign.id);
      if (!isCurrent()) return;
      setCampaign(detail.campaign); onChanged(detail.campaign); appliedReadBlocked.current = false; setAppliedReadPending(false); setMessage(successMessage);
      setMedia(detail.media || []); setProfileRelease((detail as typeof detail & { profileRelease?: ProfileReleasePreview | null }).profileRelease || null);
      return detail.campaign;
    } catch (error) {
      if (isCurrent()) { appliedReadBlocked.current = true; setAppliedReadPending(true); setAppliedOutcomeKnown(confirmed); setMessage(`${inspection ? "" : `${successMessage} `}${confirmed ? "Operação aplicada; o estado ainda não foi atualizado" : "Resultado não confirmado; não foi possível consultar o estado"}: ${error instanceof Error ? error.message : "consulta indisponível"}. Não repita a operação. Use Conferir estado da campanha.`); }
    }
  };
  const close = () => {
    if (busy) return;
    const dirty = JSON.stringify(content) !== JSON.stringify(contentOf(campaign)) || (mode === "configure" && (!!initialPreparation.current || schedule.accountIds.length > 0 || schedule.intervalMode !== "per_account_shared" || Object.keys(schedule.accountIntervals).length > 0 || JSON.stringify(schedule) !== JSON.stringify(scheduleBaseline.current)));
    if (dirty) setConfirm("leave"); else onClose();
  };
  const releaseBinding = async () => {
    if (mutationBlocked || lock.current || confirm !== "release_profile_binding" || !profileRelease || !campaign.profileAccountId) return;
    const preview = profileRelease; const campaignId = campaign.id;
    if (releaseAttempt.current && releaseAttempt.current.snapshot !== preview.snapshot) releaseAttempt.current = null;
    const attempt = releaseAttempt.current ||= { operationId: crypto.randomUUID(), snapshot: preview.snapshot };
    const pending = { invalidated: false }; releasePending.current = pending;
    const current = () => mounted.current && !pending.invalidated && latestInput.current.id === campaignId;
    lock.current = true; setBusy(true); setMessage(`Copiando ${preview.count} vídeos. Mantenha esta janela aberta; nenhuma publicação será agendada.`);
    try {
      const response = await campaignRequest<{ released: boolean; operationId: string; campaignId: string }>(fetcher, `/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH", headers: { "content-type": "application/json", "x-profile-workspace": preview.workspaceOwnerUserId },
        body: JSON.stringify({ action: "release_profile_binding", ...attempt, confirm: true }),
      });
      if (!current()) return;
      if (!response.released || response.operationId !== attempt.operationId || response.campaignId !== campaignId) throw new Error("Resposta sem confirmação da conversão.");
      setProfileRelease(null); setConfirm(null);
      await readAppliedState("Rascunho liberado. Os mesmos vídeos e a capa foram preservados. Selecione os perfis e revise a programação; nenhum envio foi agendado.", true, false, current);
    } catch (error) {
      if (!current()) return;
      const feedback = `${error instanceof Error ? error.message : "Não foi possível confirmar a cópia."} Operação ${attempt.operationId}. Confira o estado; não repita automaticamente. Os originais permanecem preservados.`;
      setMessage(feedback); confirmationFailed.current = true; setConfirmationFailure({ message: feedback, archived: false });
    } finally {
      if (releasePending.current === pending) { releasePending.current = null; lock.current = false; if (current()) setBusy(false); }
    }
  };
  const execute = async (action: string) => {
    if (!canEdit || !hydrated || lock.current || confirmationFailed.current || availabilityError || appliedReadBlocked.current || phase === "archived") return;
    if ((action === "save" || action === "variations") && readOnlyPhase.current) return;
    if (action === "resume" && !publishingEnabled) return;
    lock.current = true; setBusy(true); setMessage("");
    let scheduleAttempted = false;
    try {
      if (action === "save" || action === "schedule") {
        if (!content.name.trim()) throw new Error("Informe o nome da campanha.");
        if (action === "schedule" && (mode !== "configure" || step !== "review" || !publishingEnabled)) throw new Error("Revise a programação antes de confirmar.");
        if (action === "schedule") {
          if (campaign.profileAccountId && (schedule.accountIds.length !== 1 || schedule.accountIds[0] !== campaign.profileAccountId || schedule.distributionMode === "distribute" || schedule.intervalMode === "global_queue")) throw new Error("Esta campanha aceita somente o perfil vinculado e intervalo por perfil. Não há fila global entre campanhas.");
          const validation = scheduleValidation(schedule); if (validation) throw new Error(validation);
          if (schedule.accountIds.some(accountId => !available.some(account => account.id === accountId))) throw new Error("Há um perfil que deixou de estar conectado. Revise a seleção.");
        }
        const stored = mode === "configure" ? scheduleStoredFields(schedule, campaign.timezone) : {};
        const updated = await campaignMutation(fetcher, campaign.id, "update", { ...content, ...stored, name: content.name.trim() });
        if (!mounted.current) return;
        if (action === "save") {
          const success = mode === "configure" ? "Conteúdo e opções suportadas salvos em rascunho. Perfis, início e aplicação do intervalo permanecem nesta sessão; nenhum envio foi ativado." : "Conteúdo salvo para os posts elegíveis. Publicações concluídas não foram alteradas.";
          const saved = await readAppliedState(`${success}${updated.warnings?.length ? ` Avisos: ${updated.warnings.join(" ")}` : ""}`);
          if (saved && mode === "configure") scheduleBaseline.current = { ...scheduleBaseline.current, stopAt: schedule.stopAt, intervalMinutes: schedule.intervalMinutes, repeatCount: schedule.repeatCount, distributionMode: schedule.distributionMode, mediaOrder: schedule.mediaOrder, respectDailyLimit: schedule.respectDailyLimit };
        } else {
          setMessage("Conteúdo salvo. Confirmando a programação…");
          scheduleAttempted = true;
          const response = await campaignRequest<{ queued: number; blocked: number; resumed?: boolean; windowLimited?: boolean }>(fetcher, `/api/campaigns/${encodeURIComponent(campaign.id)}/schedule`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(schedulePayload(schedule)),
          });
          if (!mounted.current) return;
          if (![response.queued, response.blocked].every(value => Number.isInteger(value) && value >= 0)) throw new Error("A resposta não confirmou a programação. Confira o estado antes de repetir.");
          await readAppliedState(response.resumed ? "Fila existente retomada; nenhum novo lote foi criado." : `Programação confirmada: ${response.queued} na fila; ${response.blocked} bloqueadas.${response.windowLimited ? " A janela limitou o volume." : ""}`);
          setStep("content");
        }
      } else if (action === "variations") {
        if (!content.caption.trim()) throw new Error("Escreva a legenda base para gerar variações.");
        const response = await campaignRequest<{ variations: string[] }>(fetcher, "/api/captions/variations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: content.caption, count: variationCount }) });
        if (mounted.current) setContent(current => ({ ...current, captionVariations: response.variations }));
      } else {
        const response = await campaignMutation(fetcher, campaign.id, action, action === "rename" ? { name: renameName.trim() } : {});
        if (!mounted.current) return;
        if (action === "delete") { onRemoved(campaign.id, campaignArchiveFeedback(response)); onClose(); return; }
        if (action === "duplicate") {
          if (!response.duplicate || response.duplicate.status !== "draft") throw new Error("A resposta não confirmou uma cópia em rascunho. Consulte a lista antes de repetir.");
          onChanged(response.duplicate); setMessage(`“${response.duplicate.name}” salva em rascunho, sem publicar.`);
        } else if (action === "rename") {
          if (!response.campaign) throw new Error("A resposta não confirmou o novo nome.");
          onChanged(response.campaign); setContent(current => ({ ...current, name: response.campaign!.name })); setRenaming(false); setMessage("Nome atualizado.");
        } else if (action === "create_template") {
          onTemplateCreated?.(response.template!); setMessage(`Template “${response.template!.name}” criado a partir desta campanha. Nenhum post foi enviado.${response.warnings?.length ? ` Avisos: ${response.warnings.join(" ")}` : ""}`);
        } else {
          setConfirm(null);
          await readAppliedState(`${action === "pause" ? "Campanha pausada." : action === "resume" ? "Retomada confirmada." : "Próximos posts encerrados."}${response.warnings?.length ? ` Avisos: ${response.warnings.join(" ")}` : ""}`);
        }
      }
      setConfirm(null);
    } catch (error) {
      if (mounted.current) {
        const partial = !!(error && typeof error === "object" && "archived" in error && error.archived);
        const feedback = `${error instanceof Error ? error.message : "Não foi possível concluir."}${action === "schedule" ? " O conteúdo pode estar salvo. Confira o estado da campanha antes de confirmar novamente; a programação não será repetida automaticamente." : ""}${partial ? " Arquivamento registrado, limpeza incompleta. O histórico permanece preservado." : ""}`;
        setMessage(feedback);
        if (scheduleAttempted) { appliedReadBlocked.current = true; setAppliedReadPending(true); setAppliedOutcomeKnown(false); }
        if (["pause", "resume", "cancel", "delete"].includes(action)) {
          confirmationFailed.current = true;
          setConfirmationFailure({ archived: partial, message: `${feedback} ${partial ? "A exclusão já foi registrada." : "O resultado da operação não foi confirmado; ela pode ter sido aplicada."} Confira o estado antes de uma nova ação. Nenhuma operação será repetida automaticamente.` });
        } else if (partial) onRemoved(campaign.id);
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const contentForm = <div className="campaign-form-fields form-grid">
    {profileRelease && campaign.profileAccountId && phase === "draft" && <section className="full-field">
      <p>Este rascunho pode ser liberado para usar os mesmos {profileRelease.count} vídeos em todos os perfis selecionados. A capa e o nome da campanha serão mantidos.</p>
      <button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => openConfirmation("release_profile_binding")}>Liberar vídeos para outros perfis</button>
    </section>}
    <label className="full-field">Nome da campanha<input required maxLength={120} value={content.name} disabled={mutationBlocked} onChange={event => setContent({ ...content, name: event.target.value })} /></label>
    <details className="campaign-preview-list full-field"><summary>Arquivos da campanha · {campaign.mediaCount}</summary>
      {/* eslint-disable-next-line @next/next/no-img-element -- Existing stored campaign assets; no image optimizer is configured. */}
      {loadError ? <p role="status">{loadError}</p> : media === null ? <p>Carregando arquivos…</p> : media.filter(item => item.purpose === "content").map(item => <div key={item.id}><strong>{item.fileName}</strong>{item.contentType.startsWith("image/") ? <img src={item.publicUrl} alt={`Prévia de ${item.fileName}`} width={108} height={82} loading="lazy" /> : item.contentType.startsWith("video/") ? <video src={item.publicUrl} aria-label={`Prévia de ${item.fileName}`} width={108} height={82} preload="metadata" muted controls playsInline /> : null}{item.caption?.trim() && <p>Legenda própria: {item.caption}</p>}</div>)}
    </details>
    <label className="full-field">{mode === "configure" ? "Legenda · opcional" : "Legenda dos próximos posts · opcional"}<textarea rows={5} maxLength={10000} value={content.caption} disabled={mutationBlocked} onChange={event => setContent({ ...content, caption: event.target.value })} /><small>A legenda própria do arquivo prevalece; depois vêm variações e legenda geral. Hashtags são acrescentadas. Só não há legenda se todos esses campos estiverem vazios. Nenhum comentário automático é enviado.</small></label>
    <div className="campaign-variations full-field"><h3>Variações da legenda</h3>
      <label>Quantidade para gerar<input type="number" min={1} max={20} value={variationCount} disabled={mutationBlocked} onChange={event => setVariationCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} /></label>
      <button type="button" className="outline-button" disabled={mutationBlocked || !content.caption.trim()} onClick={() => void execute("variations")}>Gerar variações com IA</button>
      <button type="button" className="text-button" disabled={mutationBlocked} onClick={() => setContent({ ...content, captionVariations: [...content.captionVariations, content.caption] })}>Adicionar manualmente</button>
      {content.captionVariations.map((variation, index) => <label key={index}>Variação {index + 1}<textarea rows={3} maxLength={2200} value={variation} disabled={mutationBlocked} onChange={event => setContent({ ...content, captionVariations: content.captionVariations.map((v, i) => i === index ? event.target.value : v) })} /><button type="button" className="text-button" disabled={mutationBlocked} onClick={() => setContent({ ...content, captionVariations: content.captionVariations.filter((_, i) => i !== index) })}>Remover variação {index + 1}</button></label>)}
    </div>
    <label className="full-field">Hashtags<input maxLength={1000} value={content.hashtags} disabled={mutationBlocked} onChange={event => setContent({ ...content, hashtags: event.target.value })} /></label>
    {campaign.mediaType === "REELS" && <label>Grade principal<select disabled={mutationBlocked} value={content.shareToFeed ? "feed" : "reels"} onChange={event => setContent({ ...content, shareToFeed: event.target.value === "feed" })}><option value="reels">Só aba Reels</option><option value="feed">Reels + grade principal</option></select></label>}
  </div>;
  const scheduleForm = <div className="campaign-form-fields form-grid">
    {campaign.profileAccountId && <p className="full-field">Vídeos vinculados a um único perfil, inclusive após reabrir. Cada campanha exige confirmação individual. Distribuição e fila global entre campanhas não são suportadas.</p>}
    <CampaignProfilePicker key={campaign.id} campaignId={campaign.id} accounts={available} selected={schedule.accountIds} disabled={mutationBlocked || !!campaign.profileAccountId} onSelection={ids => setScheduleField("accountIds", ids)} onFeedback={setMessage} fetcher={fetcher} />
    <label>Postar em<select value={schedule.distributionMode} disabled={mutationBlocked} onChange={event => setSchedule(current => ({ ...current, distributionMode: event.target.value as ScheduleDraft["distributionMode"], intervalMode: event.target.value === "distribute" ? "global_queue" : current.intervalMode }))}><option value="all_accounts">Todas as contas selecionadas</option><option value="distribute" disabled={!!campaign.profileAccountId}>Uma conta de cada vez</option></select></label>
    <label>Ordem dos arquivos<select value={schedule.mediaOrder} disabled={mutationBlocked} onChange={event => setScheduleField("mediaOrder", event.target.value as ScheduleDraft["mediaOrder"])}><option value="random">Aleatória por conta</option><option value="sequential">Ordem enviada</option></select></label>
    <label>Repetir cada mídia<input type="number" min={1} max={10} value={schedule.repeatCount} disabled={mutationBlocked} onChange={event => setScheduleField("repeatCount", Number(event.target.value))} /></label>
    <label>Aplicação do intervalo<select value={schedule.distributionMode === "distribute" ? "global_queue" : schedule.intervalMode} disabled={mutationBlocked || schedule.distributionMode === "distribute"} onChange={event => setScheduleField("intervalMode", event.target.value as ScheduleDraft["intervalMode"])}><option value="per_account_shared">Mesmo intervalo por perfil</option><option value="per_account_custom">Intervalo por perfil</option><option value="global_queue" disabled={!!campaign.profileAccountId}>Intervalo global da fila</option></select></label>
    <label>Início<input type="datetime-local" value={schedule.startAt} disabled={mutationBlocked} onChange={event => setScheduleField("startAt", event.target.value)} /></label>
    <label>Fim · opcional<input type="datetime-local" min={schedule.startAt} value={schedule.stopAt} disabled={mutationBlocked} onChange={event => setScheduleField("stopAt", event.target.value)} /></label>
    <label>Intervalo padrão · minutos<input type="number" min={5} max={1440} value={schedule.intervalMinutes} disabled={mutationBlocked} onChange={event => setScheduleField("intervalMinutes", Number(event.target.value))} /></label>
    <label>Limite diário<select value={schedule.respectDailyLimit ? "respect" : "force"} disabled={mutationBlocked} onChange={event => setScheduleField("respectDailyLimit", event.target.value === "respect")}><option value="respect">Respeitar limite Meta</option><option value="force">Forçar limite Meta</option></select><small>A Meta pode recusar publicações acima do limite.</small></label>
    {schedule.intervalMode === "per_account_custom" && schedule.distributionMode !== "distribute" && schedule.accountIds.map(accountId => <label key={accountId}>Intervalo de @{available.find(account => account.id === accountId)?.username || "perfil indisponível"}<input type="number" min={5} max={1440} disabled={mutationBlocked} value={schedule.accountIntervals[accountId] ?? schedule.intervalMinutes} onChange={event => setScheduleField("accountIntervals", { ...schedule.accountIntervals, [accountId]: Number(event.target.value) })} /></label>)}
    <p className="full-field">Horários preenchidos no fuso deste dispositivo; a revisão apresenta o fuso da campanha. Distribuir usa intervalo global. A janela final pode limitar o volume.</p>
  </div>;
  const rhythm = scheduleEffectiveRhythm(schedule);
  return <CampaignDialog titleId={`${id}-title`} className="campaign-workbench campaign-modal" busy={busy} onClose={close} returnFocusFallbackId={returnFocusFallbackId}>
    <div data-mode={mode} data-step={mode === "configure" ? step : undefined}>
      <header className="campaign-workbench-header"><div><h2 id={`${id}-title`} tabIndex={-1}>{mode === "configure" ? "Configurar campanha" : mode === "report" ? "Relatório da campanha" : mode === "monitor" ? "Acompanhar campanha" : "Gerenciar campanha"}</h2><p>{campaign.name} · {campaignPhaseLabels[phase] || phase}</p></div><button type="button" className="outline-button" disabled={busy} onClick={close} aria-label="Fechar detalhe da campanha">Fechar</button></header>
      <p className="campaign-feedback" role="status">{message}</p>
      {(loadError || availabilityError) && <p className="campaign-feedback" role="alert">{loadError || availabilityError} Nenhuma alteração será enviada sem uma consulta válida do detalhe completo.<button type="button" className="outline-button" disabled={busy} onClick={() => { if (loadError) { setLoadError(""); setHydrationAttempt(attempt => attempt + 1); } onRefreshDetail?.(); }}>Consultar detalhe novamente</button></p>}
      {appliedReadPending && <button type="button" className="outline-button" disabled={busy} onClick={async () => { if (lock.current) return; lock.current = true; setBusy(true); try { await readAppliedState("Estado atualizado. Confira a campanha antes de outra ação.", appliedOutcomeKnown, true); } finally { lock.current = false; if (mounted.current) setBusy(false); } }}>Conferir estado da campanha</button>}
      {mode === "report" && JSON.stringify(content) !== JSON.stringify(contentOf(campaign)) && <p className="campaign-feedback" role="alert">A campanha foi concluída enquanto havia edição local. Essa edição não foi enviada; o relatório permanece somente leitura.</p>}
      {!hydrated && !loadError && <p role="status">Carregando o conteúdo completo da campanha…</p>}
      {mode !== "report" && canEdit && <div className="campaign-detail-actions">
        <button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => { setRenameName(campaign.name); setRenaming(true); }}>Renomear</button>
        <button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => void execute("duplicate")}>Duplicar como rascunho</button>
        <button type="button" className="campaign-delete-button" disabled={mutationBlocked} onClick={() => openConfirmation("delete")}>Excluir campanha</button>
        {(phase === "running" || phase === "completed") && <button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => void execute("create_template")}>Criar template</button>}
      </div>}
      {mode === "report" && canEdit && <details className="campaign-detail-actions"><summary>Ações da campanha</summary><button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => { setRenameName(campaign.name); setRenaming(true); }}>Renomear</button><button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => void execute("duplicate")}>Duplicar como rascunho</button><button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => void execute("create_template")}>Criar template</button><button type="button" className="campaign-delete-button" disabled={mutationBlocked} onClick={() => openConfirmation("delete")}>Excluir campanha</button></details>}
      {renaming && <div className="campaign-inline-rename"><label>Novo nome<input ref={renameInput} value={renameName} maxLength={120} disabled={busy || !hydrated} onChange={event => setRenameName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void execute("rename"); } if (event.key === "Escape") { event.stopPropagation(); if (!busy) setRenaming(false); } }} /></label><button type="button" disabled={busy || !hydrated || !renameName.trim()} onClick={() => void execute("rename")}>Salvar nome</button><button type="button" disabled={busy || !hydrated} onClick={() => setRenaming(false)}>Cancelar</button></div>}
      {mode === "configure" ? <>
        <nav className="campaign-step-nav" aria-label="Etapas de configuração"><span aria-current={step === "content" ? "step" : undefined}>1. Conteúdo</span><span aria-current={step === "schedule" ? "step" : undefined}>2. Perfis e programação</span><span aria-current={step === "review" ? "step" : undefined}>3. Revisar e confirmar</span></nav>
        <form className="campaign-settings-form" onSubmit={event => event.preventDefault()}>
          {step === "content" ? contentForm : step === "schedule" ? scheduleForm : <section className="campaign-review"><h3>Confira antes de confirmar</h3>
            <dl className="campaign-review-facts"><div><dt>Campanha</dt><dd>{content.name}</dd></div><div><dt>Perfis</dt><dd>{schedule.accountIds.map(accountId => `@${available.find(account => account.id === accountId)?.username || "Perfil indisponível"}`).join(", ")}</dd></div>
              <div><dt>Arquivos / repetições</dt><dd>{campaign.mediaCount} / {schedule.repeatCount}</dd></div><div><dt>Volume antes do limite de janela</dt><dd>{campaign.mediaCount * schedule.repeatCount * (schedule.distributionMode === "all_accounts" ? schedule.accountIds.length : 1)} publicações previstas</dd></div>
              <div><dt>Início</dt><dd>{campaignActivityTime(new Date(schedule.startAt).toISOString(), campaign.timezone || "America/Sao_Paulo")}</dd></div><div><dt>Fim</dt><dd>{schedule.stopAt ? campaignActivityTime(new Date(schedule.stopAt).toISOString(), campaign.timezone || "America/Sao_Paulo") : "Sem fim definido"}</dd></div>
              <div><dt>Distribuição / ordem</dt><dd>{schedule.distributionMode === "all_accounts" ? "Todas as contas" : "Uma conta de cada vez"} · {schedule.mediaOrder === "random" ? "Aleatória" : "Ordem enviada"}</dd></div><div><dt>Ritmo</dt><dd>{rhythm.mode === "custom" ? <>Intervalo por perfil<ul>{rhythm.profiles.map(profile => <li key={profile.id}>@{available.find(account => account.id === profile.id)?.username || "Perfil indisponível"}: {profile.intervalMinutes} min</li>)}</ul></> : <>{rhythm.intervalMinutes} min · {rhythm.mode === "global" ? "Fila global" : "Mesmo intervalo por perfil"}</>}</dd></div>
              <div><dt>Limite Meta</dt><dd>{schedule.respectDailyLimit ? "respeita limite Meta" : "força limite Meta"}</dd></div><div><dt>Legenda</dt><dd>{content.caption || "Sem legenda"} · {content.captionVariations.length} variações</dd></div></dl>
            {media?.filter(item => item.purpose === "content" && item.caption?.trim()).map(item => <div key={item.id} className="campaign-review-media"><strong>{item.fileName} · legenda própria</strong><p>{item.caption}</p></div>)}
            <p>Legendas próprias dos arquivos substituem variações e legenda geral; as hashtags {content.hashtags ? `“${content.hashtags}”` : "(vazias)"} são acrescentadas. Textos finais são limitados a 2.200 caracteres.</p>
            <p>A confirmação cria a programação de futuros envios. O volume efetivo depende da janela e dos limites disponíveis; bloqueios serão informados após a confirmação.</p>
          </section>}
          <p className="campaign-row-meta">Salvar rascunho guarda conteúdo, distribuição, ordem, intervalo, repetições, limite Meta e fim. Perfis, início e aplicação do intervalo ficam nesta sessão até confirmar a publicação.</p>
          <div className="campaign-sticky-actions"><button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => void execute("save")}>Salvar rascunho</button>
            {step !== "content" && <button type="button" className="outline-button" disabled={busy || !hydrated} onClick={() => setStep(step === "review" ? "schedule" : "content")}>Voltar</button>}
            {step !== "review" ? <button type="button" className="primary-button" disabled={mutationBlocked} onClick={() => { const error = step === "content" ? !content.name.trim() && "Informe o nome da campanha." : scheduleValidation(schedule); if (error) setMessage(error); else { setMessage(""); setStep(step === "content" ? "schedule" : "review"); } }}>{step === "content" ? "Próximo: programação" : "Revisar campanha"}</button>
              : <button type="button" className="primary-button" disabled={mutationBlocked || !publishingEnabled} onClick={() => void execute("schedule")}>{busy ? "Confirmando…" : publishingEnabled ? "Confirmar agendamento e publicação" : "Publicação desligada"}</button>}
          </div>
        </form>
      </> : <>
        <nav className="campaign-detail-tabs" aria-label="Seções da campanha">{(["summary", "activity", ...(mode === "report" ? [] : ["settings"])] as const).map(value => <button key={value} type="button" className="outline-button" aria-pressed={activeTab === value} disabled={busy || !hydrated} onClick={() => setTab(value as typeof tab)}>{value === "summary" ? "Resumo" : value === "activity" ? mode === "report" ? "Histórico" : "Atividade" : "Configurações"}</button>)}</nav>
        {mode !== "report" && canEdit && <div className="campaign-detail-actions">
          {campaign.status === "scheduled" && <button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => openConfirmation("pause")}>Pausar campanha</button>}
          {campaign.status === "paused" && <button type="button" className="outline-button" disabled={mutationBlocked || !publishingEnabled} onClick={() => openConfirmation("resume")}>{publishingEnabled ? "Retomar campanha" : "Retomada desligada"}</button>}
          {["scheduled", "paused"].includes(campaign.status) && <button type="button" className="campaign-delete-button" disabled={mutationBlocked} onClick={() => openConfirmation("cancel")}>Encerrar próximos posts</button>}
          {onQueue && <button type="button" className="outline-button" disabled={mutationBlocked} onClick={() => onQueue(campaign.id)}>Gerenciar/reagendar publicações na fila</button>}
        </div>}
        <section className="campaign-detail-panel">{activeTab === "summary" ? <CampaignExecutionSummary key={campaign.id} campaignId={campaign.id} report={mode === "report"} /> : activeTab === "activity" ? <CampaignActivity key={campaign.id} campaignId={campaign.id} mode={mode === "report" ? "report" : "monitor"} /> : <form className="campaign-settings-form" onSubmit={event => { event.preventDefault(); void execute("save"); }}>{contentForm}<div className="campaign-sticky-actions"><button type="submit" className="primary-button" disabled={mutationBlocked}>Salvar alterações</button></div></form>}</section>
      </>}
    </div>
    {confirm === "delete" && <CampaignDeleteConfirmation count={1} busy={busy} error={confirmationFailure?.message} confirmBlocked={!hydrated || !!confirmationFailure} onInspect={confirmationFailure?.archived ? undefined : () => void inspectConfirmationResult()} returnFocusFallbackId={`${id}-title`} onCancel={dismissConfirmation} onConfirm={() => void execute("delete")} />}
    {confirm && confirm !== "delete" && <CampaignDialog titleId={`${id}-confirm`} className="campaign-confirm-dialog" busy={busy} onClose={dismissConfirmation} returnFocusFallbackId={`${id}-title`} alert>
      <h3 id={`${id}-confirm`}>{confirm === "release_profile_binding" ? "Liberar este rascunho para outros perfis?" : confirm === "leave" ? "Sair da configuração?" : confirm === "pause" ? "Pausar próximos envios?" : confirm === "resume" ? "Retomar a campanha?" : "Encerrar próximos posts?"}</h3>
      <p>{confirm === "release_profile_binding" ? `Serão copiadas ${profileRelease?.count ?? 5} mídias de “${campaign.name}” (${profileRelease ? (profileRelease.bytes / 1024 / 1024).toFixed(1) : "—"} MB), sem alterar os originais ou a capa. O ID e o nome deste rascunho serão mantidos. Nenhum envio será agendado.` : confirm === "leave" ? "Alterações não salvas e opções de programação desta sessão serão descartadas. Nenhum envio será ativado." : confirm === "resume" ? "Os posts elegíveis voltam à fila e horários vencidos podem ser deslocados. Confirme somente se deseja retomar." : confirm === "pause" ? "Interrompe os posts elegíveis futuros. Publicações já em processamento podem finalizar." : "Cancela definitivamente o restante elegível. Os posts publicados são preservados."}</p>
      {confirm === "release_profile_binding" && <p>Nome impresso: não registrado nos metadados destes vídeos. Confira as prévias; a cópia não altera nomes ou fotos já gravados na imagem e não presume que sejam iguais.</p>}
      {confirmationFailure && <p className="campaign-feedback" role="alert">{confirmationFailure.message}</p>}
      <div className="campaign-confirm-actions"><button type="button" className="outline-button" disabled={busy} onClick={dismissConfirmation}>{confirmationFailure ? "Fechar detalhe" : "Voltar"}</button>
        {confirmationFailure && <button type="button" className="outline-button" disabled={busy} onClick={() => void inspectConfirmationResult()}>Conferir estado da campanha</button>}
        <button type="button" className="primary-button" disabled={busy || !!confirmationFailure || (confirm !== "leave" && (!hydrated || !canEdit || (confirm === "release_profile_binding" && !profileRelease) || (confirm === "resume" && !publishingEnabled)))} onClick={() => confirm === "leave" ? onClose() : confirm === "release_profile_binding" ? void releaseBinding() : void execute(confirm)}>Confirmar {confirm === "release_profile_binding" ? "cópia e liberação" : confirm === "leave" ? "saída" : confirm === "pause" ? "pausa" : confirm === "resume" ? "retomada" : "encerramento"}</button></div>
    </CampaignDialog>}
  </CampaignDialog>;
}
