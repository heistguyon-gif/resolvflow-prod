export const PUBLISHED_CONTAINER_MESSAGE = "A Meta confirmou que este contêiner já foi publicado, mas não informou o ID da publicação. A fila foi pausada para reconciliação; nenhum novo envio será feito.";
export const PUBLICATION_ID_PENDING_MESSAGE = "Publicação confirmada pela Meta; identificador final pendente. Os indicadores estão indisponíveis até recuperar o identificador. Nenhum novo envio será feito.";
export const PUBLICATION_SUMMARY_PENDING = "Publicação confirmada; atualizando indicadores. ";
export const PUBLICATION_RESPONSE_ID_MISSING_MESSAGE = "A resposta de publicação da Meta não informou o identificador final. A confirmação do contêiner ainda está pendente; a fila foi pausada para reconciliação e nenhum novo envio será feito.";
export const PUBLICATION_CONFIRMATION_PENDING_MESSAGE = "A resposta final do envio não foi confirmada. A ferramenta consulta o contêiner na Meta para verificar a publicação, sem reenviar o vídeo. Se a confirmação continuar indisponível, este item permanece protegido contra duplicação.";
export const PROTECTED_PUBLICATION_MESSAGES: readonly string[] = Object.freeze([
  PUBLISHED_CONTAINER_MESSAGE,
  PUBLICATION_ID_PENDING_MESSAGE,
  `${PUBLICATION_SUMMARY_PENDING}${PUBLICATION_ID_PENDING_MESSAGE}`,
  PUBLICATION_RESPONSE_ID_MISSING_MESSAGE,
  PUBLICATION_CONFIRMATION_PENDING_MESSAGE,
]);

// Keep this guard independent of status so cancellation cannot erase protection.
export function requiresPublicationReconciliation(post: { lastError?: string | null }) {
  return PROTECTED_PUBLICATION_MESSAGES.includes(post.lastError || "");
}
