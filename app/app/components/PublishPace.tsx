"use client";

import { useEffect, useState } from "react";

type Pace = "economy" | "normal" | "fast";
type AccountRow = { username: string; used: number; total: number; remaining: number; due: number; pending: number };
type Snapshot = {
  pace: Pace;
  dueNow: number;
  pending: number;
  quota: { used: number; total: number; remaining: number };
  accounts: AccountRow[];
  scheduler: { status: string; lastError: string | null; lastCompletedAt: string | null; lastRun: { published?: number; retried?: number; failed?: number; found?: number; timedOut?: boolean } | null };
};

const OPTIONS: Array<{ id: Pace; label: string; hint: string }> = [
  { id: "economy", label: "Economia", hint: "até 12 juntas" },
  { id: "normal", label: "Normal", hint: "até 80 juntas" },
  { id: "fast", label: "Rápido", hint: "todas juntas" },
];

export function PublishPace() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    const response = await fetch("/api/admin/publishing", { credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      setHidden(true);
      return;
    }
    const payload = await response.json().catch(() => ({})) as Snapshot & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Não foi possível ler as requests.");
    setData(payload);
  }

  useEffect(() => {
    load().catch(() => setHidden(true));
  }, []);

  async function save(pace: Pace) {
    if (!data || busy || data.pace === pace) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/publishing", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ pace }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o ritmo.");
      await load();
      setNote(pace === "economy" ? "Economia ligada. Ondas menores, para poupar request." : pace === "fast" ? "Rápido. Todas as contas da mesma onda saem juntas." : "Normal. A onda inteira sai junta.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Não foi possível salvar o ritmo.");
    } finally {
      setBusy(false);
    }
  }

  if (hidden || !data) return null;
  const run = data.scheduler.lastRun;
  return (
    <section className="panel publish-pace">
      <div className="publish-pace-bar">
        <div>
          <span className="panel-kicker">Admin · limite da Meta</span>
          <h2>Requests de publicação</h2>
        </div>
        <button type="button" className="outline-button compact-button" disabled={busy} onClick={() => load().catch((error) => setNote(error instanceof Error ? error.message : "Falha ao atualizar."))}>Atualizar</button>
      </div>
      <p className="publish-pace-lead">No mesmo intervalo, todas as contas da onda saem juntas. O ritmo só limita o tamanho dessa onda. Abrir este painel não consulta a Meta de novo.</p>
      <div className="publish-pace-stats">
        <article><strong>{data.dueNow}</strong><small>na hora de sair</small></article>
        <article><strong>{data.pending}</strong><small>ainda na fila</small></article>
        <article><strong>{data.quota.remaining}</strong><small>de {data.quota.total} requests restantes</small></article>
        <article><strong>{data.quota.used}</strong><small>já usadas no dia</small></article>
      </div>
      <div className="publish-pace-options" role="group" aria-label="Ritmo da fila">
        {OPTIONS.map((option) => (
          <button key={option.id} type="button" className={data.pace === option.id ? "active" : ""} aria-pressed={data.pace === option.id} disabled={busy} onClick={() => save(option.id)}>
            <b>{option.label}</b>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>
      <p className="publish-pace-run">
        Último ciclo {data.scheduler.status === "healthy" ? "ok" : data.scheduler.status}
        {run ? ` · ${run.published || 0} publicadas, ${run.retried || 0} retentativas, ${run.failed || 0} falhas` : ""}
        {data.scheduler.lastError ? ` · ${data.scheduler.lastError}` : ""}
      </p>
      {note ? <p className="publish-pace-note">{note}</p> : null}
      {data.accounts.length ? (
        <div className="publish-pace-table">
          {data.accounts.filter((account) => account.due > 0 || account.remaining <= 5).slice(0, 12).map((account) => (
            <div key={account.username}>
              <strong>@{account.username}</strong>
              <span>{account.remaining} restantes</span>
              <small>{account.used}/{account.total} · {account.due} atrasadas</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
