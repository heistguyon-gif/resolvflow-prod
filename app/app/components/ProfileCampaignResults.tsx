"use client";
import type { ProfileCreationResult } from "../../lib/profile-campaign-batch";
export function ProfileCampaignResults({ results, busy, onOpen, onNewBatch }: {
  results: ProfileCreationResult[]; busy: boolean; onOpen: (result: ProfileCreationResult) => void; onNewBatch: () => void;
}) {
  return <section className="composer-section" aria-label="Rascunhos por perfil">
    <h3>Resultados por perfil</h3>
    <p>Salvar cria rascunhos. Nenhuma publicação foi agendada. Abra cada rascunho para revisar e confirmar individualmente.</p>
    <ul aria-live="polite">{results.map(result => <li key={result.accountId}>
      <strong>{result.name}{result.username ? ` · @${result.username}` : ""}</strong> · {({ waiting: "Aguardando", uploading: `Enviando arquivos (${result.uploaded}/${result.total})`, creating: "Criando rascunho", created: "Rascunho criado", uncertain: "Resultado não confirmado — confira a lista antes de repetir", not_started: "Não enviado" })[result.status]}
      {result.campaign && <span> · {result.campaign.name} <button type="button" className="outline-button" disabled={busy} onClick={() => onOpen(result)}>Abrir e revisar rascunho</button></span>}
      {result.error && <p role="alert">{result.error}</p>}
    </li>)}</ul>
    {results.some(result => result.status === "uncertain") ? <p>O lote foi interrompido e não será reenviado. Os rascunhos confirmados permanecem acessíveis. Confira campanhas e uploads antes de preparar outro lote; não repita criações incertas.</p> : <button type="button" className="outline-button" disabled={busy} onClick={onNewBatch}>Preparar outro lote (limpar seleção local)</button>}
  </section>;
}
