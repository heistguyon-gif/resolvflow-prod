export function inviteFailurePresentation(code: string | null) {
  switch (code) {
    case "ambiguous_result": return { label: "Envio não confirmado", detail: "Confira se o convite aparece no App Meta antes de tentar novamente.", tone: "processing" };
    case "exact_not_found": return { label: "Perfil não encontrado", detail: "Confira o @ informado para este convite.", tone: "failed" };
    case "session_required": return { label: "Login do bot necessário", detail: "A sessão do Facebook usada pelo bot precisa de atenção.", tone: "failed" };
    case "app_mismatch": return { label: "App precisa de revisão", detail: "O app aberto pelo bot não corresponde ao app deste pedido.", tone: "failed" };
    case "meta_unavailable": return { label: "Meta indisponível", detail: "O bot não conseguiu acessar a etapa necessária na Meta.", tone: "failed" };
    default: return { label: "Convite não concluído", detail: "Confira o resultado no App Meta antes de tentar novamente.", tone: "failed" };
  }
}
