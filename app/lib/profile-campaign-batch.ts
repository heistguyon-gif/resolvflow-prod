import type { ProfileVariant } from "./profile-video-template";
import type { Campaign, ScheduleDraft } from "../app/lib/campaignUi";

export type ProfileCreationResult = {
  accountId: string; name: string; username?: string; status: "waiting" | "uploading" | "creating" | "created" | "uncertain" | "not_started";
  uploaded: number; total: number; campaign?: Campaign; error?: string;
};
export function profilePreparation(accountId: string, preparation: ScheduleDraft): ScheduleDraft {
  if (preparation.distributionMode !== "all_accounts" || preparation.intervalMode === "global_queue") throw new Error("Template por perfil: escolha todas as mídias para cada perfil e intervalo por perfil. Fila global/distribuição entre campanhas não são suportadas.");
  return { ...preparation, accountIds: [accountId], accountIntervals: { [accountId]: preparation.accountIntervals[accountId] ?? preparation.intervalMinutes } };
}
/** One invocation, one attempt per draft. No scheduler, cleanup DELETE or retry capability. */
export async function createProfileCampaignBatch(variants: readonly ProfileVariant[], options: {
  base: Record<string, unknown>; captions: readonly string[]; covers: readonly File[];
  isCurrent: () => boolean;
  upload: (file: File, accountId: string | null) => Promise<{ id: string }>;
  create: (payload: Record<string, unknown>) => Promise<Campaign>;
  onUpdate: (results: ProfileCreationResult[]) => void;
}) {
  const results: ProfileCreationResult[] = variants.map(variant => ({ accountId: variant.accountId, name: variant.name, username: variant.username, status: "waiting", uploaded: 0, total: variant.outputs.length + options.covers.length }));
  const emit = () => options.onUpdate(results.map(row => ({ ...row })));
  const current = () => { if (!options.isCurrent()) throw new Error("Workspace ou seleção alterados. Etapas restantes interrompidas; confira os resultados já enviados."); };
  emit();
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i], row = results[i];
    try {
      current(); row.status = "uploading"; emit();
      const mediaIds: string[] = [], coverIds: string[] = [];
      for (const file of variant.outputs) { current(); const uploaded = await options.upload(file, variant.accountId); mediaIds.push(uploaded.id); row.uploaded++; emit(); }
      for (const file of options.covers) { current(); const uploaded = await options.upload(file, null); coverIds.push(uploaded.id); row.uploaded++; emit(); }
      current(); row.status = "creating"; emit();
      const campaign = await options.create({ ...options.base, name: `${String(options.base.name || "Campanha").slice(0, 55)} · ${variant.username ? `@${variant.username}` : variant.name}`.slice(0, 120),
        mediaIds, mediaCaptions: Object.fromEntries(mediaIds.map((id, index) => [id, options.captions[index] || ""])), coverMediaIds: coverIds, coverMediaId: coverIds[0] || null });
      if (!campaign?.id || campaign.status !== "draft" || campaign.profileAccountId !== variant.accountId) throw new Error("Resposta não confirmou o rascunho vinculado. Confira a lista antes de repetir.");
      row.campaign = campaign; row.status = "created"; emit();
    } catch (error) {
      row.error = error instanceof Error ? error.message : "Não foi possível confirmar esta etapa.";
      row.status = row.status === "waiting" ? "not_started" : "uncertain";
      for (const later of results.slice(i + 1)) { later.status = "not_started"; later.error = "Não enviado após a interrupção anterior."; }
      emit(); break;
    }
  }
  return results;
}
