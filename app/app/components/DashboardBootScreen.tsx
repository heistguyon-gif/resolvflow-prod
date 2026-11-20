"use client";

import { useEffect, useState } from "react";
import styles from "./DashboardBootScreen.module.css";

export function DashboardBootScreen() {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDelayed(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className={styles.screen} aria-busy="true">
    <div className={styles.content}>
      <span className={styles.brand}>resolv<span>flow</span></span>
      <div role="status" className={styles.status}>
        <span className={styles.spinner} aria-hidden="true" />
        <h1>Carregando sua área</h1>
        <p>{delayed ? "A conexão está demorando. Você pode tentar novamente." : "Preparando a última seção aberta."}</p>
      </div>
      {delayed && <button type="button" className={styles.retry} onClick={() => window.location.reload()}>Tentar novamente</button>}
    </div>
  </main>;
}
