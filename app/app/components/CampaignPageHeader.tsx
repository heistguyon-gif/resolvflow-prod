"use client";

import { CampaignHowItWorks } from "./CampaignHowItWorks";
import styles from "./CampaignPageHeader.module.css";

export type CampaignPageHeaderProps = {
  canCreate: boolean;
  publishingEnabled: boolean;
  onCreate: () => void;
  overviewOpen: boolean;
  onToggleOverview: () => void;
};

function HeaderIcon({ kind }: { kind: "campaign" | "overview" | "plus" }) {
  const paths = { campaign: "M3 11v2l14 5V6L3 11Zm14-5 4 2v8l-4 2M5 14l2 7h4l-2-6", overview: "M4 19V5m0 14h16M8 15l4-5 4 3 4-7", plus: "M12 5v14M5 12h14" };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

export function CampaignPageHeader({ canCreate, publishingEnabled, onCreate, overviewOpen, onToggleOverview }: CampaignPageHeaderProps) {
  return <header className={styles.header} data-campaign-page-header>
    <div className={styles.copy}>
      <span className={styles.eyebrow}><HeaderIcon kind="campaign" /> Automação multicanal</span>
      <h1>Campanhas</h1>
      <p className={styles.description}>Crie, organize e agende publicações com legenda opcional e sem comentários automáticos.</p>
      <CampaignHowItWorks />
    </div>
    <div className={styles.actions}>
      <button type="button" className={styles.overview} aria-expanded={overviewOpen} onClick={onToggleOverview}><HeaderIcon kind="overview" />{overviewOpen ? "Fechar visão geral" : "Acompanhar campanhas"}</button>
      <button type="button" className={styles.create} disabled={!canCreate} onClick={() => { if (canCreate) onCreate(); }}><HeaderIcon kind={publishingEnabled ? "plus" : "campaign"} />{canCreate ? publishingEnabled ? "Nova campanha" : "Novo rascunho" : "Somente leitura"}</button>
    </div>
  </header>;
}
