"use client";

import { useEffect, useState } from "react";
import styles from "./AdminOtpHistory.module.css";

type HistoryItem = {
  id: string;
  email: string;
  userEmail: string | null;
  userName: string | null;
  workspaceName: string | null;
  workspaceOwnerUserId: string;
  supplierApiId: string | null;
  supplierApiName: string | null;
  status: "open" | "closed" | "hidden";
  price: string;
  codeCount: number;
  createdAt: string;
  updatedAt: string;
};
type HistoryPage = { items: HistoryItem[]; page: number; pageSize: number; hasMore: boolean; error?: string };

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminOtpHistory({ accountUserId, workspaceOwnerUserId }: { accountUserId?: string; workspaceOwnerUserId?: string }) {
  const [emailInput, setEmailInput] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setEmail(emailInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [emailInput]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), status });
    if (email) params.set("email", email);
    if (accountUserId) params.set("accountUserId", accountUserId);
    if (workspaceOwnerUserId) params.set("workspaceOwnerUserId", workspaceOwnerUserId);
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/otp/history?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as HistoryPage;
        if (!response.ok) throw new Error(body.error || "Histórico indisponível.");
        setData(body);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Histórico indisponível.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [accountUserId, workspaceOwnerUserId, page, email, status]);

  return <section className={styles.root} aria-label={accountUserId ? "Histórico Gmail OTP do usuário" : "Histórico global Gmail OTP"}>
    <header className={styles.header}><div><span className="panel-kicker">Pedidos persistidos</span><h3>Últimos Gmails gerados</h3>
      <p>Origem, situação e horários registrados. Valores do fornecedor aparecem sem conversão de moeda.</p></div></header>
    <div className={styles.filters}>
      <label>Usuário ou e-mail Gmail<input type="search" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} placeholder="Buscar e-mail" /></label>
      <label>Estado<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="all">Todos</option><option value="open">Abertos</option><option value="closed">Fechados</option><option value="hidden">Ocultos</option>
      </select></label>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {loading ? <p className={styles.empty} role="status">Carregando histórico…</p> : !error && !data?.items.length ? <p className={styles.empty}>Nenhum Gmail encontrado com estes filtros.</p> : null}
    {!loading && !error && data?.items.length ? <div className={styles.list}>
      {data.items.map((item) => <article className={styles.item} key={item.id}>
        <div className={styles.primary}><div><strong>{item.email}</strong><span>{item.userName || item.userEmail || "Usuário indisponível"}{item.userName && item.userEmail ? ` · ${item.userEmail}` : ""}</span></div>
          <b className={item.status === "open" ? styles.open : item.status === "hidden" ? styles.hidden : styles.closed}>
            {item.status === "open" ? "Aberto" : item.status === "hidden" ? "Oculto" : "Fechado"}</b></div>
        <div className={styles.meta}>
          <span><small>Workspace</small>{item.workspaceName || item.workspaceOwnerUserId}</span>
          <span><small>Origem</small>{item.supplierApiId ? `API própria · ${item.supplierApiName || "nome indisponível"}` : "Global/legado"}</span>
          <span><small>Criado</small><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></span>
          <span><small>Atualizado</small><time dateTime={item.updatedAt}>{dateLabel(item.updatedAt)}</time></span>
          {item.price ? <span><small>Preço informado pela API</small>{item.price} <em>moeda não informada</em></span> : null}
          {item.codeCount > 0 ? <span><small>Códigos recebidos</small>{item.codeCount}</span> : null}
        </div>
      </article>)}
    </div> : null}
    <footer className={styles.pager}><span>Página {page} · até {data?.pageSize || 20} por página</span><div>
      <button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button>
      <button type="button" disabled={loading || !data?.hasMore || page >= 100} onClick={() => setPage((value) => value + 1)}>Próxima</button>
    </div></footer>
  </section>;
}
