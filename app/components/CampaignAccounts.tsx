"use client";

import { useEffect, useState } from "react";

type AccountRow = { id: string; username: string; published?: number; total?: number };
type CampaignShape = {
  id: string;
  intervalMinutes?: number;
  distributionMode?: string;
  mediaOrder?: string;
  repeatCount?: number;
  respectDailyLimit?: boolean;
};

export function CampaignAccounts({ campaign }: { campaign: CampaignShape }) {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/campaigns/${campaign.id}`, { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data) => { if (!cancelled) setAccounts(Array.isArray(data.accounts) ? data.accounts : []); })
      .catch(() => { if (!cancelled) setAccounts([]); });
    return () => { cancelled = true; };
  }, [campaign.id]);
  const together = campaign.distributionMode !== "distribute";
  return (
    <div className="campaign-profile-block">
      <strong>Perfis selecionados{accounts ? ` · ${accounts.length}` : ""}</strong>
      <small>
        {together ? `Todas as contas juntas a cada ${campaign.intervalMinutes || 60} min` : `Uma conta a cada ${campaign.intervalMinutes || 60} min`}
        {" · "}
        {campaign.mediaOrder === "random" ? "Ordem aleatória" : "Ordem da fila"}
        {campaign.repeatCount ? ` · ${campaign.repeatCount} repetição(ões)` : ""}
        {campaign.respectDailyLimit === false ? " · sem travar no limite diário" : " · respeita o limite diário"}
      </small>
      {accounts === null ? <small>Carregando os perfis desta campanha...</small> : accounts.length ? (
        <div className="campaign-profile-list">
          {accounts.map((account) => (
            <span key={account.id}>@{account.username}<small>{account.published || 0}/{account.total || 0}</small></span>
          ))}
        </div>
      ) : <small>Nenhum perfil vinculado a esta campanha.</small>}
    </div>
  );
}
