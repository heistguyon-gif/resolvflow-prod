"use client";

import { useId, useState } from "react";
import { publishedInstagramUrl, publishedQueueMetric, publishedQueueNotice, publishedQueueTime, type PublishedQueueRecord } from "./publishedQueuePresentation";
import styles from "./PublishedQueueItem.module.css";

export function PublishedQueueItem({ publication }: { publication: PublishedQueueRecord }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (publication.status !== "published") return null;

  const username = publication.username?.trim().replace(/^@+/, "");
  const handle = username ? "@" + username : "Conta não informada";
  const caption = publication.captionOverride?.trim() || "";
  const longCaption = caption.length > 180 || caption.split("\n").length > 3;
  const link = publishedInstagramUrl(publication.publishedPermalink);
  const published = publishedQueueTime(publication.publishedAt);
  const scheduled = publishedQueueTime(publication.scheduledFor);
  const synced = publishedQueueTime(publication.insightsSyncedAt);
  const views = publishedQueueMetric(publication.mediaViews, publication.insightsSyncedAt);
  const reach = publishedQueueMetric(publication.mediaReach, publication.insightsSyncedAt);
  const notice = publishedQueueNotice(publication.lastError);
  const insightsNotice = publishedQueueNotice(publication.insightsError);
  const format = publication.mediaType === "REELS" ? "Reel" : publication.mediaType === "IMAGE" ? "Imagem" : publication.mediaType === "STORIES" ? "Story" : "Publicação";
  const attempts = Number.isSafeInteger(publication.attemptCount) && publication.attemptCount! >= 0 ? publication.attemptCount : "—";
  const maxAttempts = Number.isSafeInteger(publication.maxAttempts) && publication.maxAttempts! >= 0 ? publication.maxAttempts : "—";

  return <article className={styles.item} aria-labelledby={id + "-account"}>
    <header className={styles.header}>
      <div className={styles.identity}>
        <div className={styles.accountLine}><h3 id={id + "-account"}>{handle}</h3><span className={styles.format}>{format}</span></div>
        <p className={styles.campaign}>{publication.campaignName || "Campanha não informada"}</p>
      </div>
      <div className={styles.publicationTime}>
        <span className={styles.published}>Publicada</span>
        {published ? <time dateTime={published.iso}>{published.label}</time> : <span>Horário de publicação não informado</span>}
      </div>
    </header>

    <div className={styles.body}>
      <section className={styles.caption} aria-labelledby={id + "-caption-label"}>
        <h4 id={id + "-caption-label"}>Legenda preparada</h4>
        {caption ? <>
          <p id={id + "-caption"} className={styles.captionText} data-expanded={expanded || !longCaption}>{caption}</p>
          {longCaption ? <button type="button" className={styles.expand} aria-expanded={expanded} aria-controls={id + "-caption"} onClick={() => setExpanded(value => !value)}>{expanded ? "Recolher legenda" : "Ver legenda completa"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button> : null}
        </> : <p className={styles.absent}>Nenhuma legenda preparada neste registro.</p>}
        {notice ? <p className={styles.notice}><span>Aviso da publicação</span>{notice}</p> : null}
      </section>

      <section className={styles.performance} aria-labelledby={id + "-metrics"}>
        <h4 id={id + "-metrics"}>Métricas da publicação</h4>
        <dl className={styles.metrics}>
          <div><dt>Visualizações</dt><dd>{views ?? "—"}</dd>{views === null ? <span>Não informadas</span> : null}</div>
          <div><dt>Alcance</dt><dd>{reach ?? "—"}</dd>{reach === null ? <span>Não informado</span> : null}</div>
        </dl>
        <p className={styles.sync}>{synced ? <>Última leitura completa<br/><time dateTime={synced.iso}>{synced.label}</time></> : "Sem leitura completa registrada."}</p>
        {insightsNotice ? <details className={styles.insightsNotice}><summary>Ver aviso das métricas</summary><p>{insightsNotice}</p></details> : null}
      </section>
    </div>

    <footer className={styles.footer}>
      <details className={styles.details}><summary>Dados da publicação</summary><dl>
        <div><dt>Agendado para</dt><dd>{scheduled ? <time dateTime={scheduled.iso}>{scheduled.label}</time> : "Não informado"}</dd></div>
        <div><dt>Tentativas registradas / limite</dt><dd>{attempts} / {maxAttempts}</dd></div>
        {publication.captionFallback ? <div><dt>Legenda</dt><dd>Registro de tratamento alternativo. Confira o texto no post publicado.</dd></div> : null}
      </dl></details>
      <div className={styles.action}>
        {link ? <a className={styles.open} href={link} target="_blank" rel="noopener noreferrer" aria-label={"Abrir publicação de " + handle + " no Instagram (nova aba)"}>Abrir publicação<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 4h6v6M20 4 9 15M10 4H4v16h16v-6"/></svg></a>
          : <><button type="button" className={styles.open} disabled aria-describedby={id + "-link-unavailable"}>Abrir publicação</button><p id={id + "-link-unavailable"}>Link público não disponível neste registro.</p></>}
      </div>
    </footer>
  </article>;
}
