"use client";

import { useEffect, useState } from "react";

type AccountRow = { id: string; username: string; published?: number; total?: number };
type CampaignShape = {
  id: string;
  publishedCount?: number;
  failedCount?: number;
  intervalMinutes?: number;
  distributionMode?: string;
  mediaOrder?: string;
  repeatCount?: number;
  respectDailyLimit?: boolean;
};

export function CampaignAccounts({ campaign }: { campaign: CampaignShape }) {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Não foi possível consultar os perfis desta campanha."); return response.json() as Promise<{ accounts?: AccountRow[] }>; })
      .then((data) => { if (!controller.signal.aborted) { setAccounts(Array.isArray(data.accounts) ? data.accounts : []); setError(""); } })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Consulta indisponível."); });
    return () => controller.abort();
  }, [campaign.id, campaign.publishedCount, campaign.failedCount]);
  const together = campaign.distributionMode !== "distribute";
  return (
    <>
    <div className="campaign-profile-block">
      <strong>Perfis selecionados{accounts ? ` · ${accounts.length}` : ""}</strong>
      <small>
        {together ? `Todas as contas juntas a cada ${campaign.intervalMinutes || 60} min` : `Uma conta a cada ${campaign.intervalMinutes || 60} min`}
        {" · "}
        {campaign.mediaOrder === "random" ? "Ordem aleatória" : "Ordem da fila"}
        {campaign.repeatCount ? ` · ${campaign.repeatCount} repetição(ões)` : ""}
        {campaign.respectDailyLimit === false ? " · permite agendar acima da quota informada" : " · respeita o limite diário"}
      </small>
      {error && <p role="status">{error}</p>}
      {accounts === null ? <small>{error ? "Perfis indisponíveis nesta consulta." : "Carregando os perfis desta campanha..."}</small> : accounts.length ? (
        <div className="campaign-profile-list">
          {accounts.map((account) => (
            <span key={account.id}>@{account.username}<small>{account.published || 0}/{account.total || 0}</small></span>
          ))}
        </div>
      ) : <small>Nenhum perfil vinculado a esta campanha.</small>}
    </div>
    </>
  );
}
