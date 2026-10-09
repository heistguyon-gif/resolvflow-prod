# Contrato assumido do agente de convite

O script do agente não está presente nesta worktree. Compatibilidade exata depende da revisão do script por Lucas.

`POST /api/meta/invite-agent`, `Authorization: Bearer <META_INVITE_AGENT_TOKEN>` e JSON:

- Claim: `{ "action": "claim", "metaAppKey": "workspace:{id do registro}" }`. A resposta só traz um job dessa chave. Outra chave, chave ausente ou chave legada responde `{ "job": null }`. Lease de 2 minutos. Um @ com falha não volta sozinho para a fila.
- Complete: `{ "action": "complete", "id", "claimToken", "result": "sent" | "already_present" | "failed", "errorCode"?: "exact_not_found" | "meta_unavailable" | "session_required" | "ambiguous_result" | "app_mismatch" | "other" }`. Resposta `{ "completed": true, "status": "invited" | "failed" }`.

Somente `sent` e `already_present` liberam a etapa de aceite pelo usuário. Falhas ficam registradas e não são retomadas automaticamente. Claims expirados podem ser retomados quando os controles ainda permitem o bot.
