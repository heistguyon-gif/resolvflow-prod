# Publicação do push SharkBot

Este procedimento só deve ser executado após aprovação do Architect. A validação local não cria secrets, não publica Worker e não altera o D1 remoto.

## Secrets necessários

- `SHARKBOT_WEBHOOK_SECRET`: segredo HMAC já usado pelo webhook.
- `VAPID_PUBLIC_KEY`: chave pública gerada para Web Push.
- `VAPID_PRIVATE_KEY`: chave privada; nunca deve aparecer em arquivo, log, chat ou histórico do terminal.
- `VAPID_SUBJECT`: contato no formato `mailto:administrador@dominio` ou URL HTTPS.

`wrangler.jsonc` declara esses nomes como obrigatórios. Os valores não ficam no repositório.

## Ordem de publicação

1. Confirmar o bookmark atual do D1 com `npx wrangler d1 time-travel info DB` e registrar apenas o bookmark, nunca dados sensíveis.
2. Revisar a lista pendente com `npx wrangler d1 migrations list DB --remote`. Ela deve conter `0032_sharkbot_push.sql` e `0033_account_archive_dashboard_preferences.sql` na ordem correta.
3. Aplicar as migrations com `npx wrangler d1 migrations apply DB --remote`. O Wrangler aplica as migrations pendentes em ordem e cria backup antes da aplicação.
4. Gerar e enviar VAPID diretamente para uma versão não publicada, sem imprimir a chave privada:

   `node scripts/configure-vapid.mjs --apply --subject=mailto:administrador@dominio`

5. Executar novamente testes e build, depois `npx wrangler deploy`.
6. Fazer smoke test autenticado sem venda real:
   - abrir Integrações como administrador;
   - ativar notificações no PWA/dispositivo;
   - usar **Enviar teste**;
   - confirmar abertura da Resolve Flow ao tocar na notificação;
   - validar arquivamento/restauração de uma conta de teste;
   - alterar a dashboard no desktop e confirmar a mesma preferência no celular.

## Rollback

Se a migration ou o smoke test falhar, interromper novas ações, guardar os logs sem secrets e usar o bookmark registrado para planejar a restauração via D1 Time Travel. Não executar restauração sem autorização explícita.
