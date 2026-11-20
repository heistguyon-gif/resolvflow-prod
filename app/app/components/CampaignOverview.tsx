"use client";
import { useState } from "react";
import { CampaignActivity, campaignActivityTime, useActivitySnapshot, usePanelVisibility } from "./CampaignActivity";
import type { CampaignOverviewResponse, CampaignOverviewSummary } from "../../lib/campaign-management-types";
import type { Campaign } from "../lib/campaignUi";

export function CampaignOverviewCoverage({ summary }: { summary: CampaignOverviewSummary }) {
  return <div className="campaign-overview-coverage">
    {summary.warnings?.map(warning => <p className="campaign-feedback" key={warning} role="status">{warning}</p>)}
    {summary.metrics ? <dl className="campaign-review-facts">{(["views", "reach"] as const).map(key => {
      const metric = summary.metrics[key]; return <div key={key}><dt>{key === "views" ? "Visualizações conhecidas" : "Alcance somado por publicação"}</dt><dd>{metric.knownSum === null ? "Indisponível" : metric.knownSum.toLocaleString("pt-BR")}</dd><small>{metric.knownPosts} de {metric.eligiblePosts} posts com valor · {metric.unknownPosts} desconhecidos{metric.complete ? " · cobertura completa" : " · cobertura incompleta"}{metric.staleOrPartialPosts > 0 ? ` · ${metric.staleOrPartialPosts} com leitura parcial ou desatualizada` : ""}</small></div>;
    })}</dl> : <p>Métricas indisponíveis nesta consulta.</p>}
    <small>Alcance somado não representa pessoas únicas. Valores desconhecidos não são tratados como zero.</small>
  </div>;
}
export function CampaignOverview({ onManage }: { onManage: (campaignId: string) => void }) {
  const { root, visible } = usePanelVisibility(); const [page, setPage] = useState(1); const [selectedId, setSelectedId] = useState<string | null>(null);
  const snapshot = useActivitySnapshot<CampaignOverviewResponse>(`/api/campaigns/overview?${new URLSearchParams({ page: String(page), pageSize: "20" })}`, visible);
  const data = snapshot.data;
  const selectedRow = data?.campaigns.find(campaign => campaign.id === selectedId);
  const selectedSnapshot = useActivitySnapshot<{ campaign: Campaign }>(selectedId ? `/api/campaigns/${encodeURIComponent(selectedId)}` : "", visible && !!selectedId);
  const selectedDetail = selectedSnapshot.data?.campaign;
  const selectedName = selectedRow?.name || selectedDetail?.name || "Campanha selecionada";
  const outsideOverview = selectedDetail && !["scheduled", "running"].includes(selectedDetail.status);
  return <section ref={root} className="campaign-overview" aria-label="Visão geral das campanhas em andamento">
    <header className="campaign-overview-controls"><h2>Acompanhar campanhas</h2><button type="button" className="outline-button" disabled={snapshot.pending || !visible} onClick={snapshot.refresh}>{snapshot.pending ? "Consultando…" : "Atualizar visão geral"}</button></header>
    <p>Resumo de todas as campanhas em andamento deste workspace, independente dos filtros da lista. Os indicadores de espera e atraso podem se sobrepor.</p>
    {snapshot.error && <p className="campaign-feedback" role="status">{data ? "Dados desatualizados. " : "Consulta indisponível. "}{snapshot.error}</p>}
    {!data && !snapshot.error && <p role="status">Carregando visão geral…</p>}
    {data && <><p>Última consulta: {campaignActivityTime(data.fetchedAt, "America/Sao_Paulo")} · Consistência eventual.</p>
      <dl className="campaign-overview-summary">{([["campaignCount", "Campanhas em andamento"], ["distinctAccountCount", "Perfis únicos"], ["total", "Publicações"], ["published", "Publicadas"], ["failed", "Falhas"], ["blocked", "Bloqueadas"], ["waiting", "Aguardando"], ["delayed", "Atrasadas"]] as const).map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{data.summary[key].toLocaleString("pt-BR")}</dd></div>)}</dl>
      <CampaignOverviewCoverage summary={data.summary} />
      <div className="campaign-overview-list">{data.campaigns.map(campaign => <article className="campaign-overview-row" key={campaign.id}><button type="button" className="outline-button" aria-pressed={selectedId === campaign.id} onClick={() => setSelectedId(campaign.id)}>{campaign.name}</button><span>{campaign.summary.published}/{campaign.summary.total} publicadas · {campaign.summary.failed} falhas · {campaign.summary.blocked} bloqueios</span></article>)}</div>
      {!data.campaigns.length && <p>Nenhuma campanha em andamento nesta página.</p>}
      <nav className="campaign-overview-controls" aria-label="Páginas das campanhas em andamento"><span>Página {data.pagination.page} · {data.pagination.total} campanhas</span><button type="button" className="outline-button" disabled={page <= 1 || snapshot.pending} onClick={() => setPage(page - 1)}>Anterior</button><button type="button" className="outline-button" disabled={!data.pagination.hasMore || snapshot.pending} onClick={() => setPage(page + 1)}>Próxima</button></nav>
    </>}
    {selectedId && <div className="campaign-overview-detail"><header className="campaign-overview-controls"><h3>{selectedName}</h3><button type="button" className="outline-button" onClick={() => onManage(selectedId)}>Abrir detalhe da campanha</button><button type="button" className="text-button" onClick={() => setSelectedId(null)}>Fechar detalhamento</button></header>
      {selectedSnapshot.error && <p role="status">Não foi possível confirmar o estado atual da campanha. {selectedSnapshot.error}</p>}
      {!selectedRow && !outsideOverview && <p>Esta campanha não está na página atual da central. Isso não confirma exclusão ou conclusão.</p>}
      {outsideOverview && <p role="status">Esta campanha saiu das campanhas em andamento. {selectedDetail.status === "completed" ? "Histórico de conclusão disponível abaixo." : "Consulte o detalhe para verificar sua fase atual."}</p>}
      {selectedRow && <CampaignOverviewCoverage summary={selectedRow.summary} />}
      <CampaignActivity key={selectedId} campaignId={selectedId} mode={outsideOverview ? "report" : "monitor"} />
    </div>}
  </section>;
}
