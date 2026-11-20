"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { completeMailExport, type MailExportFilter, type MailExportRow } from "../../lib/cloud-mail-export-format";
import { mailCodeCount, type ReaderAccount } from "./cloudMailFilters";

async function exportJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new Error("Resposta de exportação inválida. Nenhum arquivo parcial foi gerado."); }
}

export function CloudMailExport({ accounts, selected, disabled = false, onBusyChange, scopeIds }: { accounts: ReaderAccount[]; selected: string[]; scopeIds?: string[]; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [mode, setMode] = useState("selected");
  const [format, setFormat] = useState<"resolvbot-json" | "original-txt">("resolvbot-json");
  const [filter, setFilter] = useState<MailExportFilter>("all");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [missingContext, setMissingContext] = useState<string | null>(null), [originalPicked, setOriginalPicked] = useState(false);
  const original = useRef<HTMLInputElement>(null), running = useRef(false);
  const controller = useRef<AbortController | null>(null), mounted = useRef(false);
  const selectionKey = JSON.stringify([accounts.map(row => row.id), selected, mode, filter, format]);
  const context = useRef(selectionKey);
  const needsOriginal = format === "original-txt" && missingContext === selectionKey;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); onBusyChange?.(false); }; }, [onBusyChange]);
  useLayoutEffect(() => { context.current = selectionKey; controller.current?.abort(); }, [selectionKey]);
  const selectedIds = new Set(selected);
  const candidates = mode === "selected" ? accounts.filter(row => selectedIds.has(row.id)) : accounts;
  const knownLow = candidates.filter(row => { const count = mailCodeCount(row); return count !== null && count < 5; }).length;
  const unknown = candidates.filter(row => mailCodeCount(row) === null).length;
  async function download() {
    if (running.current || disabled || (mode === "selected" && !selected.length) || (needsOriginal && !originalPicked)) return;
    running.current = true; setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    controller.current = new AbortController();
    const expectedContext = context.current;
    try {
      const file = format === "original-txt" ? original.current?.files?.[0] : undefined;
      if (file && file.size > 2_000_000) throw new Error("O TXT original excede 2 MB.");
      // Original passwords/recovery never enter a request or application storage.
      const originalText = file ? await file.text() : undefined;
      const response = await fetch("/api/own-emails/export", { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(60000)]), headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: scopeIds ? "selected" : mode, filter, format, ...(scopeIds || mode === "selected" ? { accountIds: mode === "selected" ? selected : scopeIds } : {}), localMerge: Boolean(file) }) });
      if (!mounted.current || expectedContext !== context.current) return;
      if (!response.ok) {
        const body = await exportJson(response) as { code?: string; error?: string };
        if (body.code === "original_required") setMissingContext(selectionKey);
        throw new Error(body.error || "Exportação indisponível. Nenhum arquivo foi gerado.");
      }
      let text: string;
      if (format === "resolvbot-json") {
        if (!response.headers.get("content-type")?.startsWith("application/json")) throw new Error("Resposta de pacote inválida.");
        const body = await exportJson(response) as { format?: string; version?: number; accounts?: unknown[] };
        if (body.format !== "resolvflow-mailboxes" || body.version !== 1 || !Array.isArray(body.accounts) || !body.accounts.length) throw new Error("Pacote inválido. Nenhum arquivo parcial foi gerado.");
        text = JSON.stringify(body, null, 2) + "\n";
      }
      else if (file) { const body = await exportJson(response) as { rows: MailExportRow[] }; text = completeMailExport(body.rows, originalText); }
      else {
        if (!response.headers.get("content-type")?.startsWith("text/plain")) throw new Error("Resposta inválida. Nenhum arquivo foi gerado.");
        text = await response.text();
        if (!text.trim()) throw new Error("Nenhuma caixa corresponde ao filtro.");
      }
      if (!mounted.current || expectedContext !== context.current || controller.current.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([text], { type: format === "resolvbot-json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = format === "resolvbot-json" ? "resolvbot-caixas-com-historico.json" : "hotmail-completo.txt"; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(format === "resolvbot-json" ? "Pacote Graph + histórico salvo preparado. A importação desse pacote exige atualização do Resolvbot; o Bot atual ainda não aceita este formato. Nenhuma consulta Microsoft foi feita." : "TXT original completo preparado. O arquivo contém credenciais: guarde-o com segurança. Nenhuma consulta Microsoft foi feita.");
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "Exportação indisponível. Nenhum arquivo foi gerado."); }
    finally { running.current = false; onBusyChange?.(false); if (mounted.current) setBusy(false); }
  }
  return <section aria-labelledby="mail-export-title">
    <h2 id="mail-export-title">Baixar caixas com acesso API e histórico</h2>
    <p>O pacote Resolvbot JSON v1 inclui acesso Graph atual e todo o histórico salvo no servidor, mesmo sem carregar as mensagens nesta aba. Não exige senha, recuperação ou TXT original e não consulta a Microsoft.</p>
    <p>O Bot atual ainda não importa esse pacote com histórico: o agente do Bot precisa atualizar o importador para o contrato v1. O formato antigo de três campos não inclui histórico.</p>
    <fieldset disabled={disabled || busy}><legend>Conteúdo do download</legend>
      <label>Caixas <select aria-label="Caixas para exportar" value={mode} onChange={event => { setMode(event.target.value); setMissingContext(null); setError(""); }}><option value="selected">Selecionadas ({selected.length})</option><option value="all">Todas as caixas cadastradas ({accounts.length}, incluindo arquivadas)</option></select></label>
      <p role="status">Escopo: {mode === "selected" ? `${selected.length} caixa(s) selecionada(s)` : `todas as ${accounts.length} caixas cadastradas`}. O servidor revalida seleção e filtro antes de baixar.</p>
      <label>Filtro de códigos <select value={filter} onChange={event => { setFilter(event.target.value as MailExportFilter); setMissingContext(null); setError(""); }}><option value="all">Todos os históricos</option><option value="under-five">Menos de 5 códigos conhecidos (0–4): {knownLow}</option><option value="unknown">Histórico desconhecido: {unknown}</option></select></label>
      <p>Contagem de mensagens distintas com código no histórico salvo; não é total de e-mails nem contagem vitalícia Microsoft. Desconhecido nunca é zero.</p>
      <label>Formato <select aria-label="Formato da exportação" value={format} onChange={event => { setFormat(event.target.value as "resolvbot-json" | "original-txt"); setMissingContext(null); setError(""); }}><option value="resolvbot-json">Resolvbot: Graph + histórico salvo (JSON v1)</option><option value="original-txt">Original: quatro/cinco campos (TXT, sem histórico)</option></select></label>
      {format === "original-txt" ? <><p>O TXT original usa senha/recuperação quando disponíveis. Legados podem exigir seu arquivo original, combinado apenas neste navegador, sem enviar senha adicional. Este TXT não é o pacote Resolvbot.</p><label>TXT original para completar legados (opcional) <input ref={original} type="file" accept=".txt,text/plain" onChange={() => { setOriginalPicked(Boolean(original.current?.files?.length)); setError(""); }}/></label></> : null}
      <button type="button" disabled={(mode === "selected" && !selected.length) || (needsOriginal && !originalPicked)} onClick={() => void download()}>{busy ? "Preparando arquivo…" : format === "resolvbot-json" ? "Baixar pacote Resolvbot (JSON)" : "Baixar TXT original completo"}</button>
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
  </section>;
}
