import styles from "./CampaignHowItWorks.module.css";

export function CampaignHowItWorks() {
  return <details className={styles.help}>
    <summary><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01" strokeLinecap="round" /></svg>Como funciona<svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
    <ol className={styles.steps}>
      <li><strong>Prepare o conteúdo.</strong> Adicione até 50 imagens ou vídeos e confira a prévia, a legenda e as variações.</li>
      <li><strong>Configure a campanha.</strong> Escolha perfis conectados, distribuição dos arquivos, ordem, intervalos e limites de publicação.</li>
      <li><strong>Revise e confirme.</strong> Confira a programação antes de confirmar o agendamento e a publicação. Abrir, salvar ou duplicar um rascunho não agenda envios.</li>
    </ol>
    <p>Use Acompanhar nas campanhas em andamento, Relatório nas concluídas ou Acompanhar campanhas para a visão geral.</p>
  </details>;
}
