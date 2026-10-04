"use client";

import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type LibraryItem = {
  id: string;
  name: string;
  status: string;
  mediaType: string;
  mediaCount: number;
  ownerLabel: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  template: "Template",
  draft: "Rascunho",
  scheduled: "Agendada",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Encerrada",
};

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "Não foi possível concluir a ação."), { status: response.status });
  return body;
}

export function AdminCampaignLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const payload = await api("/api/admin/campaign-templates");
      setAllowed(true);
      setItems(payload.items || []);
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      if (status === 401 || status === 403) { setAllowed(false); setItems([]); return; }
      setAllowed(true);
      setItems([]);
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar as outras contas.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (items || []).filter((item) => !term || `${item.name} ${item.ownerLabel} ${item.status}`.toLowerCase().includes(term));
  }, [items, query]);
  if (!allowed) return null;
  const bring = async (item: LibraryItem) => {
    setBusy(item.id); setMessage("");
    try {
      const payload = await api("/api/admin/campaign-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceCampaignId: item.id }),
      });
      setMessage(`“${payload.template?.name || item.name}” entrou na sua conta. Em Nova campanha, escolha esse template.`);
      document.querySelector<HTMLButtonElement>('button[title="Campanhas"]')?.click();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível trazer o template.");
    } finally {
      setBusy(null);
    }
  };
  return <details className="panel admin-template-library"><summary><span><b>Templates de outras contas</b><small>A cópia fica na sua conta. A fila e as contas de quem criou continuam separadas.</small></span><em>{items?.length || 0}</em></summary><div className="admin-template-library-content">{message ? <p className="admin-template-library-message" role="status">{message}</p> : null}<header><strong>Campanhas e templates</strong><input aria-label="Buscar campanha de outra conta" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome ou e-mail" /></header><div className="admin-template-library-list">{visible.map((item) => <article key={item.id}><span><b>{item.name}</b><small>{item.ownerLabel} · {STATUS_LABEL[item.status] || item.status} · {item.mediaCount} arquivo(s) · {item.mediaType}</small></span><button type="button" className="primary-button compact-button" disabled={busy === item.id} onClick={() => void bring(item)}>Trazer para a minha conta</button></article>)}{!visible.length ? <p>Nenhuma campanha encontrada.</p> : null}</div></div></details>;
}

export function mountAdminCampaignLibrary() {
  if (typeof document === "undefined") return;
  const scope = globalThis as typeof globalThis & { __resolvflowAdminCampaignLibrary?: boolean };
  if (scope.__resolvflowAdminCampaignLibrary) return;
  scope.__resolvflowAdminCampaignLibrary = true;
  const mount = () => {
    const page = document.querySelector(".automation-page");
    if (!page || page.querySelector(".admin-template-library-host")) return;
    const host = document.createElement("div");
    host.className = "admin-template-library-host";
    const heading = page.querySelector(".page-heading");
    if (heading) heading.insertAdjacentElement("afterend", host);
    else page.prepend(host);
    createRoot(host).render(<AdminCampaignLibrary />);
  };
  queueMicrotask(mount);
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
}
