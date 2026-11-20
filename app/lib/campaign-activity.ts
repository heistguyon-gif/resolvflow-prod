import type { CampaignActivityPost, CampaignAttempt, CampaignDiagnosis } from "./campaign-activity-types";
import { parseMetaAttemptMessage, sanitizeMetaMessage } from "./meta-diagnostics";
import { PUBLISHED_CONTAINER_MESSAGE, PUBLICATION_RESPONSE_ID_MISSING_MESSAGE, PUBLICATION_CONFIRMATION_PENDING_MESSAGE, requiresPublicationReconciliation } from "./publication-recovery";

export type CampaignAttemptRecord = {
  id: string;
  stage: string;
  outcome: string;
  message: string | null;
  createdAt: string;
  metaErrorCode: string | null;
};

export function campaignActivityTimestamp(value: string): string;
export function campaignActivityTimestamp(value: string | null): string | null;
export function campaignActivityTimestamp(value: string | null): string | null {
  if (value === null) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) return `${value.replace(" ", "T")}Z`;
  return value;
}

export function campaignActivityMessage(message: string | null): string | null {
  if (!message) return null;
  return parseMetaAttemptMessage(message).message || null;
}

export function campaignActivityAttempt(record: CampaignAttemptRecord): CampaignAttempt {
  const parsed = parseMetaAttemptMessage(record.message, record.metaErrorCode);
  return {
    id: record.id,
    stage: sanitizeMetaMessage(record.stage) || "unknown",
    outcome: sanitizeMetaMessage(record.outcome) || "unknown",
    message: parsed.message || null,
    createdAt: campaignActivityTimestamp(record.createdAt),
    metaCode: parsed.meta.code == null ? null : String(parsed.meta.code),
    metaSubcode: parsed.meta.subcode ?? null,
    httpStatus: parsed.meta.status ?? null,
    requestId: parsed.meta.requestId ?? null,
    endpoint: parsed.meta.endpoint ?? null,
    usage: (parsed.meta.usage ?? []).map((usage) => ({ type: usage.type, callPercent: usage.callPercent ?? null, cpuPercent: usage.cpuPercent ?? null, timePercent: usage.timePercent ?? null, estimatedRecoveryMinutes: usage.estimatedRecoveryMinutes ?? null })),
    retryAfterSeconds: parsed.meta.retryAfterSeconds ?? null,
  };
}

type DiagnosisPost = Pick<CampaignActivityPost, "status" | "lastError" | "insightsError" | "insightsSyncedAt" | "scheduledFor" | "lastAttempt">;

export function diagnoseCampaignPost(post: DiagnosisPost, now: string, originalConnectionError: string | null = null): CampaignDiagnosis {
  const diagnosis = (category: string, title: string, explanation: string, action: string | null, severity: CampaignDiagnosis["severity"]): CampaignDiagnosis => ({ category, title, explanation, action, severity });
  const active = ["pending", "retry", "container_created", "processing"].includes(post.status);
  const retryAction = (action: string) => active ? action : "Não há nova tentativa automática para este item. Revise o motivo antes de usar os controles da campanha ou solicite revisão ao suporte.";
  const error = campaignActivityMessage(post.lastError);
  if (error === PUBLICATION_CONFIRMATION_PENDING_MESSAGE) {
    return diagnosis("publication_reconciliation", "Aguardando confirmação da Meta", "O envio foi iniciado, mas sua resposta final não foi confirmada. A ferramenta consulta o contêiner salvo, sem repetir a publicação. Uma demora ou falha de comunicação não significa que o vídeo deixou de ser publicado.", "Acompanhe as consultas nas etapas do pedido. Se a confirmação permanecer indisponível após as consultas automáticas, solicite revisão ao suporte.", "warning");
  }
  if (error === PUBLICATION_RESPONSE_ID_MISSING_MESSAGE) {
    return diagnosis("publication_reconciliation", "Confirmação de publicação pendente", "A resposta de publicação não informou o identificador final e ainda não há confirmação pela consulta do contêiner. O envio foi pausado para evitar duplicação; nenhum novo envio será feito durante a reconciliação.", "Solicite a conferência desta publicação ao suporte.", "warning");
  }
  if (error === PUBLISHED_CONTAINER_MESSAGE) {
    return diagnosis("publication_reconciliation", "Confirmação em conferência", "Este registro legado aguarda reconciliação. Não há identificador final recuperado, e o marcador antigo sozinho não comprova a confirmação da publicação pela Meta. O item está protegido contra novo envio.", "Solicite a reconciliação desta publicação ao suporte.", "warning");
  }
  if (requiresPublicationReconciliation({ lastError: error })) {
    if (post.status === "published") {
      const timeoutObserved = post.lastAttempt?.metaCode === "504" || post.lastAttempt?.httpStatus === 504;
      return diagnosis("publication_reconciliation", "Publicado; identificador pendente", `A Meta confirmou pelo contêiner que este post foi publicado. ${timeoutObserved ? "Houve timeout aguardando resposta; a publicação foi confirmada na consulta seguinte. " : ""}O identificador da publicação ainda não foi recuperado; sem ele, as métricas não podem ser consultadas. O horário registrado indica quando a confirmação foi obtida. O item está protegido contra novo envio.`, "Solicite a reconciliação desta publicação ao suporte.", "warning");
    }
    return diagnosis("publication_reconciliation", "Publicação confirmada; conferência necessária", `A Meta confirmou pelo contêiner que este post foi publicado, mas o identificador ainda não foi recuperado. ${post.status === "paused" ? "O item permanece pausado para reconciliação" : "O item aguarda reconciliação"} e está protegido contra novo envio.`, "Solicite a reconciliação desta publicação ao suporte.", "warning");
  }
  if (post.status === "published") {
    if (post.insightsError) return diagnosis("insights_unavailable", "Publicado; indicadores indisponíveis", "A publicação foi confirmada, mas a última leitura de indicadores não foi concluída.", "Confira o aviso dos indicadores e a conexão do perfil.", "warning");
    if (error?.startsWith("Publicação confirmada; atualizando indicadores.")) return diagnosis("summary_pending", "Publicado; atualizando indicadores", "A publicação foi confirmada. Os indicadores internos ainda aguardam atualização.", null, "info");
    if (error) return diagnosis("published_warning", "Publicado com aviso", "A publicação foi confirmada. Há um aviso posterior ao envio; ele não significa que o post falhou.", "Confira o aviso desta publicação.", "warning");
    if (!post.insightsSyncedAt) return diagnosis("insights_pending", "Publicado; aguardando indicadores", "Ainda não há uma leitura de indicadores registrada para este post.", null, "info");
    return diagnosis("published", "Publicado", "A publicação foi confirmada e possui indicadores sincronizados.", null, "info");
  }
  if (post.status === "cancelled") return diagnosis("cancelled", "Cancelado", "Este item foi encerrado e não será enviado pela fila.", null, "info");
  if (post.status === "paused") return diagnosis("paused", "Pausado", error || "Este item está pausado.", null, error ? "warning" : "info");

  const relevantAttempt = post.lastAttempt && ["retry", "failed", "error"].includes(post.lastAttempt.outcome) ? post.lastAttempt : null;
  const code = relevantAttempt?.metaCode;
  const subcode = relevantAttempt?.metaSubcode;
  const detail = error || campaignActivityMessage(originalConnectionError) || relevantAttempt?.message || "";
  if (code === "25" && subcode === 2207050) {
    return diagnosis("account_restricted", "Conta restrita pela Meta", "A tentativa registrou uma restrição da conta. O registro não informa um prazo de liberação.", "Abra o Instagram deste perfil e confira os avisos ou solicitações de verificação.", "error");
  }
  if (code === "4" && subcode === 2207051) {
    return diagnosis("activity_blocked", "Atividade bloqueada pela Meta", "A Meta bloqueou esta atividade. O registro não identifica a causa nem garante quando o bloqueio será removido.", "Acompanhe os avisos do perfil e procure o suporte se o bloqueio persistir.", "warning");
  }
  if (["10", "200"].includes(code || "") && /permission|permiss[ãa]o|permiss[oõ]es|scope/i.test(detail)) {
    return diagnosis("permission_review", "Permissão do app precisa de revisão", "A Meta recusou uma permissão necessária nesta tentativa. O acesso do app precisa ser conferido.", "Procure o suporte ou o administrador do app Meta para revisar as permissões.", "error");
  }
  if (/limite diário informado.*ultrapassado/i.test(detail)) {
    return diagnosis("quota_precheck", "Última quota impediu o agendamento", "A pré-verificação local usou a última quota registrada. Este aviso não comprova que a Meta esteja bloqueando a conta agora.", retryAction("Confira a quota do perfil e o horário da última sincronização."), "warning");
  }
  if (code === "9" && subcode === 2207042) {
    return diagnosis("publishing_quota", "Limite de publicações informado pela Meta", "A tentativa registrou o código 9 com subcódigo 2207042, indicando o limite de publicações. A liberação não tem horário confirmado neste registro.", retryAction("Aguarde a próxima tentativa e confira a quota e sua última sincronização no perfil."), "warning");
  }
  if (code === "190" || /precisa ser renovada|reconect|error validating.*token|login.*challenge|log in to www\.instagram\.com|checkpoint|session.*expired/i.test(detail)) {
    return diagnosis("connection_required", "Conexão precisa de atenção", "A Meta não autorizou esta tentativa ou pediu confirmação de acesso ao perfil.", "Entre no Instagram, resolva eventuais avisos e reconecte o perfil em Integrações.", "error");
  }
  if (code === "9" || relevantAttempt?.httpStatus === 429 || ["4", "17", "32", "613"].includes(code || "") || /too many actions|rate limit|request limit|try again later/i.test(detail)) {
    return diagnosis("limited_unknown", "Ações limitadas pela Meta", "A Meta limitou esta tentativa. O registro não comprova quota de publicações, alcance do bloqueio (conta ou app) ou horário de liberação.", retryAction("Aguarde a próxima tentativa registrada. Não é necessário recriar a campanha por este erro."), "warning");
  }
  if (code === "504" || /não respondeu|timeout|timed out|cloudflare/i.test(detail)) {
    return diagnosis("meta_unavailable", "Resposta da Meta indisponível", "A tentativa não recebeu uma resposta válida dentro do prazo. Este registro sozinho não confirma se houve publicação.", retryAction("Acompanhe a próxima tentativa ou a conferência da publicação."), "warning");
  }
  if (/Stories de imagem aceitam apenas JPG|formato|dimensões|invalid.*(media|image|video)/i.test(detail)) {
    return diagnosis("invalid_media", "Arquivo precisa de revisão", detail, "Confira o formato e as dimensões do arquivo.", "error");
  }
  if (post.status === "failed" || post.status === "blocked") {
    return diagnosis(post.status, post.status === "blocked" ? "Publicação bloqueada" : "Falha na publicação", detail || "Não há um motivo detalhado registrado para este item.", "Confira o último erro, as tentativas e a conexão do perfil.", "error");
  }
  if (error) return diagnosis("waiting", "Aguardando nova tentativa", error, "Acompanhe o horário da próxima tentativa e o motivo registrado.", "warning");
  if (post.lastAttempt?.stage === "container_status" && post.lastAttempt.outcome === "waiting") return diagnosis("media_processing", "Mídia em processamento", "A Meta ainda estava processando o arquivo na última conferência.", null, "info");
  if (post.status === "processing") return diagnosis("processing", "Em processamento", "A fila está processando este item.", null, "info");
  if (post.scheduledFor < now) return diagnosis("delayed", "Horário agendado ultrapassado", "O item ainda não foi confirmado como publicado. Não há um motivo detalhado registrado nesta tentativa.", "Acompanhe o próximo horário de tentativa.", "info");
  return diagnosis("scheduled", "Agendado", "O item aguarda o horário de processamento da fila.", null, "info");
}
