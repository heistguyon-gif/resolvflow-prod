"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CampaignDialog } from "./CampaignDialog";
import { campaignBulk, campaignMediaLabel, campaignMutation, campaignPhase, campaignPhaseLabels, campaignPrimaryLabel, retainCampaignSelection, toggleVisibleCampaigns,
  type Campaign, type CampaignBulkResult, type CampaignFetcher } from "../lib/campaignUi";

export function CampaignIcon({ name }: { name: "rename" | "duplicate" | "delete" }) {
  const paths = { rename: "M16 3l5 5-12 12-6 1 1-6L16 3zm-2 2l5 5", duplicate: "M9 9h12v12H9V9zM15 5V3H3v12h2", delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function CampaignDeleteConfirmation({ count, busy, onCancel, onConfirm, error, confirmBlocked = false, onInspect, returnFocusFallbackId }: {
  count: number; busy: boolean; onCancel: () => void; onConfirm: () => void;
  error?: string; confirmBlocked?: boolean; onInspect?: () => void;
  returnFocusFallbackId?: string;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <CampaignDialog className="campaign-confirm-dialog" titleId="campaign-delete-title" descriptionId="campaign-delete-description" busy={busy} onClose={onCancel} returnFocusFallbackId={returnFocusFallbackId} alert>
    <h3 id="campaign-delete-title">Excluir {count} {count === 1 ? "campanha" : "campanhas"}?</h3>
    <p id="campaign-delete-description">A exclusão interrompe os próximos envios. O histórico é preservado e as publicações do Instagram não são removidas. Um envio que já está em processamento pode finalizar.</p>
    {error && <p className="campaign-feedback" role="alert">{error}</p>}
    <div className="campaign-confirm-actions"><button ref={cancel} type="button" className="outline-button" disabled={busy} onClick={onCancel}>{error ? "Fechar detalhe" : "Cancelar"}</button>
      {error && onInspect && <button type="button" className="outline-button" disabled={busy} onClick={onInspect}>Conferir estado da campanha</button>}
      <button type="button" className="campaign-delete-button" disabled={busy || confirmBlocked} onClick={onConfirm}>{busy ? "Excluindo…" : "Confirmar exclusão"}</button></div>
  </CampaignDialog>;
}
export function CampaignDirectory({ campaigns, visibleCampaigns, workspaceKey, canEdit, onOpen, onChange, fetcher = fetch, focusReturnId, inventoryComplete = true, removedIds = [], externalFeedback, visualPreview = false }: {
  campaigns: Campaign[]; visibleCampaigns: Campaign[]; workspaceKey: string; canEdit: boolean; onOpen: (campaign: Campaign) => void;
  onChange: (result: { campaigns?: Campaign[]; removedIds?: string[] }) => void; fetcher?: CampaignFetcher;
  focusReturnId?: string;
  inventoryComplete?: boolean; removedIds?: string[]; externalFeedback?: string;
  visualPreview?: boolean;
}) {
  const generatedFocusId = useId(); const listFocusId = focusReturnId || generatedFocusId;
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionWorkspace, setSelectionWorkspace] = useState(workspaceKey);
  const campaignIds = [...campaigns.map(c => `${c.id}:${c.status}`), ...removedIds].sort().join("\u0000");
  const [previousCampaignIds, setPreviousCampaignIds] = useState(campaignIds);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [message, setMessage] = useState(""); const [results, setResults] = useState<CampaignBulkResult[]>([]);
  const selectAll = useRef<HTMLInputElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const renameTrigger = useRef<HTMLButtonElement | null>(null);
  const workspace = useRef(workspaceKey);
  const workspaceEpoch = useRef(0);
  const mounted = useRef(false);
  if (previousCampaignIds !== campaignIds) { setPreviousCampaignIds(campaignIds); setSelected(ids => inventoryComplete ? retainCampaignSelection(ids, campaigns) : ids.filter(id => !removedIds.includes(id) && !campaigns.some(c => c.id === id && c.status === "archived"))); }
  if (selectionWorkspace !== workspaceKey) { setSelectionWorkspace(workspaceKey); setSelected([]); setRename(null); setConfirmIds(null); setResults([]); setMessage(""); }
  // Invalidate at commit, before a settled POST can continue while passive cleanup is pending.
  useLayoutEffect(() => {
    workspace.current = workspaceKey; const committedEpoch = ++workspaceEpoch.current; mounted.current = true;
    return () => { mounted.current = false; workspaceEpoch.current = committedEpoch + 1; };
  }, [workspaceKey]);
  const renamingId = rename?.id;
  useEffect(() => { if (renamingId) renameInput.current?.focus(); else renameTrigger.current?.focus(); }, [renamingId]);
  const visibleIds = visibleCampaigns.map(c => c.id);
  const checked = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = !checked && visibleIds.some(id => selected.includes(id)); }, [checked, selected, visibleIds]);
  const run = async (action: "duplicate" | "delete", ids: string[]) => {
    if (!canEdit || lock.current || !ids.length) return;
    lock.current = true; setBusy(true); setMessage(""); setResults([]); const currentWorkspace = workspaceKey; const startedEpoch = workspaceEpoch.current;
    const isCurrent = () => mounted.current && workspace.current === currentWorkspace && workspaceEpoch.current === startedEpoch;
    try {
      const response = await campaignBulk(fetcher, action, ids, isCurrent);
      if (!isCurrent()) return;
      const successes = response.filter(result => result.ok);
      const removed = action === "delete" ? response.filter(result => result.ok || result.archived).map(result => result.id) : [];
      onChange({ campaigns: action === "duplicate" ? successes.flatMap(result => result.campaign ? [result.campaign] : []) : [], removedIds: removed });
      setSelected(current => current.filter(id => !successes.some(result => result.id === id) && !removed.includes(id)));
      setResults(response); setConfirmIds(null);
      setMessage(`${successes.length} de ${ids.length} ${action === "duplicate" ? "duplicadas como rascunho" : "excluídas"}. ${response.length - successes.length} com falha. Nenhuma operação será repetida automaticamente.`);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const saveName = async () => {
    if (!rename || !canEdit || lock.current) return;
    const name = rename.name.trim(); if (!name || name.length > 120) { setMessage("Use um nome de 1 a 120 caracteres."); return; }
    lock.current = true; setBusy(true); const currentWorkspace = workspaceKey;
    try {
      const result = await campaignMutation(fetcher, rename.id, "rename", { name });
      if (!mounted.current || workspace.current !== currentWorkspace) return;
      if (!result.campaign) throw new Error("A resposta não confirmou o novo nome.");
      onChange({ campaigns: [result.campaign] }); setRename(null); setMessage("Nome atualizado. A programação não foi alterada.");
    } catch (error) { if (mounted.current && workspace.current === currentWorkspace) setMessage(error instanceof Error ? error.message : "Não foi possível renomear."); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  return <div id={listFocusId} tabIndex={-1} role="region" aria-label="Lista de campanhas" className="campaign-directory" data-campaign-list-visual={visualPreview === true ? "preview" : undefined} aria-busy={busy}>
    {!inventoryComplete && campaigns.length >= 100 && <small className="campaign-row-meta">Exibindo até 100 campanhas recentes. Filtros e seleção usam as carregadas; consulte Acompanhar campanhas para a visão geral.</small>}
    {externalFeedback && <p className="campaign-feedback" role="status">{externalFeedback}</p>}
    {selected.some(id => !campaigns.some(c => c.id === id)) && <p className="campaign-feedback">Parte da seleção está fora da lista carregada. A seleção permanece até você limpá-la ou confirmar a remoção.</p>}
    {canEdit && <div className="campaign-list-toolbar"><label><input ref={selectAll} type="checkbox" checked={checked} disabled={busy || !visibleIds.length} onChange={() => setSelected(ids => toggleVisibleCampaigns(ids, visibleIds))} /> Selecionar campanhas visíveis ({visibleIds.length})</label></div>}
    {canEdit && selected.length > 0 && <div className="campaign-selection-toolbar"><strong className="campaign-selection-count">{selected.length} selecionadas</strong>
      <button type="button" className="outline-button" disabled={busy} onClick={() => void run("duplicate", selected)}>Duplicar seleção</button>
      <button type="button" className="campaign-delete-button" disabled={busy} onClick={() => setConfirmIds([...selected])}>Excluir seleção</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => setSelected([])}>Limpar seleção</button></div>}
    {message && <p className="campaign-feedback" role="status">{message}</p>}
    {results.length > 0 && <ul className="campaign-bulk-results">{results.map(result => <li key={result.id}>
      {campaigns.find(c => c.id === result.id)?.name || result.id}: {result.ok ? "Concluído" : result.error || "Falha"}
      {result.archived && !result.ok ? " O arquivamento foi registrado; a limpeza não foi confirmada." : ""}
      {result.warnings?.map(warning => <p key={warning}>{warning}</p>)}
      {result.archive?.warnings?.map(warning => <p key={warning}>{warning}</p>)}</li>)}</ul>}
    {confirmIds && <CampaignDeleteConfirmation count={confirmIds.length} busy={busy} returnFocusFallbackId={listFocusId} onCancel={() => setConfirmIds(null)} onConfirm={() => void run("delete", confirmIds)} />}
    <div className="campaign-list">{visibleCampaigns.map(campaign => {
      const phase = campaignPhase(campaign);
      const duplicateButton = canEdit ? <button type="button" className={`campaign-icon-button${visualPreview === true ? " campaign-duplicate-button" : ""}`} title={`Duplicar ${campaign.name} como rascunho`} aria-label={`Duplicar campanha ${campaign.name} como rascunho`} disabled={busy} onClick={() => void run("duplicate", [campaign.id])}><CampaignIcon name="duplicate" /></button> : null;
      return <article key={campaign.id} className="campaign-row" data-campaign-id={campaign.id} data-phase={phase} data-selected={selected.includes(campaign.id)}>
        {canEdit && <label className="campaign-row-check"><input type="checkbox" aria-label={`Selecionar campanha ${campaign.name}`} disabled={busy} checked={selected.includes(campaign.id)} onChange={() => setSelected(ids => ids.includes(campaign.id) ? ids.filter(id => id !== campaign.id) : [...ids, campaign.id])} /></label>}
        <div className="campaign-row-main"><div className="campaign-row-heading">
          {rename?.id === campaign.id ? <div className="campaign-inline-rename"><input ref={renameInput} aria-label={`Novo nome de ${campaign.name}`} maxLength={120} value={rename.name} disabled={busy} onChange={event => setRename({ ...rename, name: event.target.value })} onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); void saveName(); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) setRename(null); }
          }} /><button type="button" className="outline-button" disabled={busy} onClick={() => void saveName()}>Salvar</button><button type="button" className="text-button" disabled={busy} onClick={() => setRename(null)}>Cancelar</button></div>
            : <strong className="campaign-row-name">{campaign.name}</strong>}
          {canEdit && <><button type="button" className={`campaign-icon-button${visualPreview === true ? " campaign-rename-button" : ""}`} title={`Renomear ${campaign.name}`} aria-label={`Renomear campanha ${campaign.name}`} disabled={busy} onClick={event => { renameTrigger.current = event.currentTarget; setRename({ id: campaign.id, name: campaign.name }); }}><CampaignIcon name="rename" /></button>
            {visualPreview !== true && duplicateButton}</>}
        </div><small className="campaign-row-meta">{campaign.mediaCount} arquivo(s) · {campaignMediaLabel(campaign.mediaType)} · {campaign.status === "draft" ? "Ainda não agendada" : `${campaign.publishedCount ?? 0}/${campaign.totalAccounts ?? 0} publicações`}</small></div>
        <span className={`campaign-status ${phase}`}>{campaignPhaseLabels[phase] || phase}</span>
        {visualPreview === true && duplicateButton}
        <div className="campaign-row-actions"><button type="button" className="outline-button campaign-row-primary" disabled={busy || (phase === "draft" && !canEdit)} onClick={() => onOpen(campaign)}>{visualPreview === true && phase === "draft" ? "Configurar" : campaignPrimaryLabel(campaign)}</button></div>
        {canEdit && <button type="button" className="campaign-icon-button campaign-delete-button" title={`Excluir ${campaign.name}`} aria-label={`Excluir campanha ${campaign.name}`} disabled={busy} onClick={() => setConfirmIds([campaign.id])}><CampaignIcon name="delete" /></button>}
      </article>;
    })}</div>
    {!visibleCampaigns.length && <p className="campaign-feedback">Nenhuma campanha nestes filtros.</p>}
  </div>;
}
