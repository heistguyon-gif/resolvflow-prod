# ResolvFlow: mudanças de 20/11/2026 (box, sem deploy e sem push)

Base: `b7f50c7 snapshot: live app ecb931f4 + landing 3876494c`. Conferi que essas fontes batem com o que está em produção hoje.
- `app/` = worker `nexoflow-operacao-mk` (resolvflow.online, top.resolvflow.online)
- `landing/` = worker `resolvflow-landing-variants-20261118` (config `wrangler.stage.jsonc`)

Nada foi publicado, nada foi enviado ao GitHub e nenhum estado da Cloudflare foi alterado. Só fiz leituras.

## Commits (um por item)

| # | Commit | O que muda |
|---|---|---|
| 0 | 5452887 | `.gitignore`: node_modules, dist, .wrangler, `.dev.vars*`, `.env*`, harness local |
| 1 | aab27ab | Rota interna do Pix dos planos **sem senha fixa**. Removi `PLAN_PIX_BRAVO_GATE` e os cabeçalhos/hostnames. O app agora exporta o entrypoint nomeado `PlanPixBravo`, que só pode ser chamado por service binding. O caminho público `/__internal*` e o host `plan-pix-bravo.internal` respondem 404. A landing passou a usar `entrypoint: "PlanPixBravo"`. |
| 2 | d478296 | Webhook BlackFy: o POST **já falhava fechado**. Agora confere o segredo primeiro, de forma explícita, e registra o motivo (`webhook_secret_missing`/`api_key_missing`) antes do 503. Entraram 5 testes de rota: sem segredo → 503, assinatura errada ou vencida → 401, válida → processa. |
| 3 | 48a0c2e | E-mail de suporte trocado para `backfasupport@gmail.com` em 9 arquivos. `rg -i medchatbot` → 0. Nenhum ponto ficou sem e-mail. |
| 4 | e922e39 | Termos e Privacidade neutros, versão 2026-11-20.1, sem "Rascunho", sem Lezty e sem "Lucas libera". Os dados legais estão numa **lista única marcada** (`data-fill-required`): nome/razão social, CPF/CNPJ, endereço e prazo de liberação. A trava `check:legal` foi removida a pedido do Lucas (20/11): os termos podem ir ao ar com esses campos ainda marcados como [PREENCHER]. |
| 5 | ab4d0ba | Tipagem: `LiveCheckoutDialog.tsx` (app + landing) com `api<T>()` e tipos das respostas. tsc: app 0 erros, landing 0 erros (eram 16). |
| 6 | bdffc1a | Teste da extensão agora espera `0.4.7`. |
| 7 | (sem commit) | Testes de operação: os arquivos não existem nas cópias (ver "Não consegui"). |
| 8 | (sem commit) | Limpeza legada: nenhum código provadamente morto. Lezty, BravoPay e BlackFy ainda têm pagamentos e rotas vivas. Workers e segredos listados abaixo para você decidir. |
| 9 | d128a9d | **PROPOSTA** de entregáveis dos 3 planos (Volume assistido, Volume dimensionado, Expansão anual), com os textos de antes e depois no relatório. Preços sem alteração. |
| M1 | 9f3fafa | **Apps Meta por usuário** (detalhes abaixo). Migração `drizzle/0047_user_meta_apps.sql` **não aplicada**. |
| M2 | d054864 | **Conectar contas lista só apps reais** cadastrados ou atribuídos ao usuário. Nada de MK 1/2/3, App 01, App Prado, App Teste nem WGB. Fica um estado vazio até o usuário cadastrar um app. |

Patches: `patches/` (`git format-patch b7f50c7..HEAD`).

## Apps Meta por usuário (M1)

- **Painel:** "Contas → Apps Meta" (`app/components/MetaAppsPanel.tsx`), com os botões "Cadastrar app", "Como criar o app" e "Tutorial e webhook" em cada app, além de Desativar/Reativar.
- **Cadastro:** pede nome de exibição, ID do app do Instagram e chave secreta. A chave secreta é cifrada com `TOKEN_ENCRYPTION_KEY` (AES-GCM, já existente) e nunca volta para a tela.
- **Verify token:** cada app recebe um verify token próprio (`rfv_` + 48 hex), também cifrado. Só owner e editor conseguem ver.
- **Contagem por app:**
  - **Perfis conectados:** conexões não arquivadas.
  - **Ativos:** status `connected` e token não vencido.
  - **Caídos:** status `error`, token vencido ou qualquer outro status.
- **Tutorial (pt-BR):** mostra o redirect `https://resolvflow.online/api/meta/callback` e o webhook `https://resolvflow.online/api/meta/webhook/<id do app>`, com o verify token do app.
  - Escopos tirados do código: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`.
- **API `/api/meta/apps`:**
  - GET: viewer.
  - POST e PATCH: editor.
  - Tudo restrito ao workspace da sessão. Um workspace não vê nem altera o app de outro. Apps do catálogo do admin não podem ser alterados por aqui.
- **Webhook `/api/meta/webhook/<id>`:**
  - GET responde o desafio `hub.challenge` só com o token certo (403 com token errado, 404 se o app não existe ou está desativado).
  - POST exige `X-Hub-Signature-256` válido (401 sem ele). Por enquanto só registra o evento e não processa.
- **Publicação:** um app cadastrado vira uma linha `meta_apps` (key `workspace:<id>`). Assim, OAuth, publicação e refresh usam o app do próprio usuário sem mudança extra.
- **Testes novos:** 18. Rodam em SQLite real com a DDL de produção e a migração 0047.

## Conectar contas só com apps reais (M2) e impacto

- **O que mudou:**
  - `GET /api/meta/connect-queue` lista só `meta_apps` ativos atribuídos ao usuário.
  - `GET /api/meta/connect` e o POST manual da fila recusam com 403 qualquer app de ambiente.
  - A tela mostra "Nenhum app Meta cadastrado ainda…", com link para "Apps Meta", e atualiza a lista sozinha quando um app é cadastrado.
- **Conexões existentes não mudam.** Publicação e refresh continuam por `resolveMetaAppForStoredKey`, que não foi alterado.
- **Impacto:** quem usa os apps de ambiente **não consegue conectar nem reconectar perfis** até cadastrar o próprio app. Pelo D1, conexões `connected` por app de ambiente:

  | App | Conexões `connected` |
  |---|---|
  | prado | 94 |
  | leandro | 5 |
  | default | 4 |
  | operation_2 | 3 |
  | operation_3 ("MK 1") | 0 (67 com erro) |

  Pedidos antigos na fila que ainda apontam para um app de ambiente também não conectam mais.
- **Apps reais atribuídos pelo admin continuam aparecendo.** São 49 apps de clientes, com 582 conexões ativas. Escondê-los também é uma linha de código, mas bloquearia esses clientes.
- **Não alterei:**
  - `/api/meta/status`: só rótulos e contagem.
  - Callback OAuth: só aceita states criados pelo connect.
  - Convite por bot: já usa só apps atribuídos.

## Verificação final

| Projeto | Typecheck | Lint | Build | Testes |
|---|---|---|---|---|
| app | 0 erros | 2 erros + 2 avisos, todos antigos e em arquivos que não mexi (`NexoFlowDashboard.prebuild.tsx`, `PublishPace.tsx`) | ok | 31 arquivos, **303/303** |
| landing | 0 erros | 0 | ok | 37 testes: 35 ok, 1 pulado, 1 falha de ambiente (`package.test`, que precisa da pasta irmã `landing-checkout-20261118-candidate`, só existente no seu PC) |

- **app:** o script `npm test` aponta para `tests/nexoflow.test.mjs`, que não existe na cópia. Rodei `node --test tests/*.test.mjs`.
- **Varredura de segredos nos commits:** nenhum valor encontrado. Nenhum `.dev.vars` ou `.env` versionado.

## Plano de deploy (não executado)

Siga esta ordem:
1. **Migração D1 antes de tudo (BLOQUEIO).**
   - O schema novo lê as colunas novas de `meta_apps`.
   - Se o app subir antes, a leitura de apps do catálogo quebra. Isso derruba publicação e refresh das 582 conexões e o cadastro de apps pelo admin.
   - Copie `app/drizzle/0047_user_meta_apps.sql` para a pasta `drizzle/` real (em produção a última é a 0046) e rode:
     ```
     npx wrangler d1 migrations apply nexoflow-operacao-mk-db --remote
     ```
2. **Segredos:** nenhum segredo novo é necessário. Conferi só os nomes: `TOKEN_ENCRYPTION_KEY`, `EYT_*` e `BLACKFY_*` já existem no app.
3. **App:**
   ```
   cd app && npm run build && npx wrangler deploy
   ```
   - Do instante em que o app sobe até a landing subir, a criação de Pix dos planos comerciais na landing falha, porque o caminho antigo agora dá 404.
   - Para zero janela, faça em 3 passos: app mantendo o caminho antigo → landing → app removendo o caminho antigo.
4. **Landing, logo em seguida:**
   ```
   cd landing && npm run build && npx wrangler deploy --config wrangler.stage.jsonc
   ```
   - Se subir antes de preencher os campos legais, as páginas vão ao ar com os campos marcados em branco.
   - Os scripts `deploy-pilot`/`compose-release` vão falhar na checagem de hash antiga. Use o wrangler direto.

**Caminho de deploy a partir do box:** não existe. O wrangler não está logado e não há token de API. Precisa ser feito do seu PC (ou com `wrangler login`).

## Ação do Lucas

1. **Rotacionar as chaves da BlackFy** e gravá-las no worker `nexoflow-operacao-mk`, iguais ao painel da BlackFy:
   ```
   npx wrangler secret put BLACKFY_API_KEY --name nexoflow-operacao-mk
   npx wrangler secret put BLACKFY_WEBHOOK_SECRET --name nexoflow-operacao-mk
   ```
2. **Preencher os campos legais:** nome/razão social, CPF/CNPJ, endereço e prazo de liberação em `landing/publish-stage/termos/index.html`.
3. **Revisar os compromissos escritos nos Termos:** resposta em 5 dias, reembolso em 7 dias via Pix. Considere subir `TERMS_VERSION` num deploy coordenado de app + landing.
4. **Aprovar os textos dos 3 planos.**
5. **Aplicar a migração 0047 e fazer o deploy**, na ordem do plano acima.
6. **Na Meta, para cada cliente que for usar o próprio app** (developers.facebook.com → app → Instagram → API setup with Instagram login):
   - Redirect `https://resolvflow.online/api/meta/callback`.
   - Webhook e verify token mostrados no painel.
   - Os 3 escopos.
   - Adicionar os testadores ou publicar o app.
7. **Prado e os outros workspaces em app de ambiente:** cadastrar ou atribuir um app real antes do deploy do M2, senão não conseguem conectar perfis novos.
8. **Excluir workers antigos (se aprovar).** Data e hora do último deploy em UTC-3:

   | Worker | Último deploy | Comando |
   |---|---|---|
   | iasl-checkout-bravopay-staging | 18/09 15:26 | `npx wrangler delete --name iasl-checkout-bravopay-staging` (primeiro, porque usa os dois abaixo) |
   | iasl-dashboard-staging | 18/09 10:42 | `npx wrangler delete --name iasl-dashboard-staging` |
   | iasl-upsell-bravopay-staging | 18/09 10:45 | `npx wrangler delete --name iasl-upsell-bravopay-staging` |
   | resolvflow-landing-preview-20261106 | 06/11 19:38 | `npx wrangler delete --name resolvflow-landing-preview-20261106` |

   Para revisar depois: `nexoflow-teste` (teste.resolvflow.online), `nexoflow-scheduler`, `resolvbot-mail-diagnostics`, `resolvbot-standalone-control`.
   Segredos: os de Lezty/BravoPay continuam em uso. Não remova.
9. **Trazer do seu PC** (`C:\Users\LMM\projetos\resolvflow-alt`) a pasta `drizzle/` (0000–0046), `tests/nexoflow.test.mjs` e os 12 testes de operação: `otp-*` ×10, `connection-list` e `admin-otp-metrics`.
10. **`git push`**, quando aprovar.

## Não consegui

- **Rodar os testes de operação:** os 12 arquivos e a pasta `drizzle/` não existem nas cópias.
- **O `package.test` da landing:** depende de uma pasta irmã que só existe no seu PC.
- **Remover código legado:** nada é provadamente morto. Os últimos pagamentos foram: Lezty em 18/11, BravoPay em 01/10, BlackFy com 1 registro.
- **Processar os eventos do webhook Meta:** por enquanto ele só valida e registra. Não existia nenhum consumidor no código.
- **Deploy:** não fiz, conforme instruído. Também não há credencial no box.
