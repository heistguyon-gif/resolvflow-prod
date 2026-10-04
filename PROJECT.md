# resolvflow — contrato do projeto

Arquivo de handoff. Cole no início de um chat novo (Grok ou GPT) antes de pedir qualquer alteração.
Não é documentação da tela. É a trava para corrigir bug sem criar outro.

Atualizado em 23 de setembro de 2026.

## Como usar

Este arquivo sozinho não traz o código. No chat novo, anexe os dois: este `PROJECT.md` e o zip `resolvflow-fonte.zip`.

Primeira mensagem, nesta ordem:

1. Anexe o zip e este arquivo.
2. Escreva: descompacta o zip em `/tmp/nexoflow`, lê o `PROJECT.md` e para. Não publica e não altera nada até o próximo pedido.
3. No pedido seguinte, uma coisa só, com o resultado que tem que aparecer na tela.

O chat não publica nada além desse pedido. Se precisar de uma segunda mudança, para e pergunta.
Depois que a mudança for aceita, acrescenta uma linha na seção Histórico e apaga a pendência correspondente.

GPT entende as regras com este arquivo, mas não tem o código nem publica o site. Não peça para o GPT recriar o resolvflow do zero. Alteração no ar é no Grok, com o zip descompactado em `/tmp/nexoflow`.

Um chat novo aqui não herda o código deste chat. Sem o zip anexado, não existe o que editar.

## O que é

resolvflow é a operação de publicação de Instagram (Reels) do Lucas. O nome antigo era NexoFlow. Na tela o nome é resolvflow. Por baixo, worker, banco e vários arquivos ainda se chamam nexoflow. Não renomear isso a menos que o pedido seja explícito.

Site: https://resolvflow.online

Dono / admin da plataforma: lucasbgn.affiliate@gmail.com
Conta do Mayk, com conexão direta e ranking: maykikelvin09@gmail.com

## Cloudflare

Entrar no painel com a conta Cloudflare de lucasbgn.affiliate@gmail.com.

- Conta: `Lucasbgn.affiliate@gmail.com's Account`
- Account ID: `1362e620ba64694fb72091c2f7c9a0e2`
- Painel: https://dash.cloudflare.com/1362e620ba64694fb72091c2f7c9a0e2
- Worker `nexoflow-operacao-mk`: https://dash.cloudflare.com/1362e620ba64694fb72091c2f7c9a0e2/workers/services/view/nexoflow-operacao-mk
- Banco D1 `nexoflow-operacao-mk-db`: https://dash.cloudflare.com/1362e620ba64694fb72091c2f7c9a0e2/workers/d1
- ID do banco: `6cfe313e-129c-44b6-b5c2-7f95ab64ce28`, binding `DB`
- Mídia R2 `nexoflow-operacao-mk-media`: https://dash.cloudflare.com/1362e620ba64694fb72091c2f7c9a0e2/r2/overview
- Binding da mídia: `MEDIA`
- Cron do worker: todo minuto
- Config no código: `wrangler.jsonc`

O token de API que publica daqui fica só na máquina que faz o deploy (`CLOUDFLARE_API_TOKEN`). Não cola esse token no chat, no GPT nem neste arquivo. Quem for publicar neste ambiente usa o token que já está na máquina. Não criar outro. Não rodar `wrangler login`.

## Onde está a ferramenta

Copiar e editar só esta pasta, depois de descompactar o zip:

`/tmp/nexoflow`

É a cópia que vai para o ar. Não usar estas, estão velhas:

- `/workspace` (é outro app, o preview do App Builder)
- `/workspace/artifacts/nexoflow-full`
- `/workspace/artifacts/nexoflow-src`

Não rodar `npm run build` dentro de `/workspace`.

A tela que o Lucas usa é um pacote já compilado, não um fonte legível:

`/tmp/nexoflow/app/components/NexoFlowDashboard.tsx`

Mudança pequena de interface se faz nesse arquivo. Um parêntese errado quebra o build inteiro. Não reescrever o arquivo. Não deixar o build regenerar outro dashboard por cima sem conferir o que você tinha acabado de editar.

## Antes de mexer

1. Ler este arquivo.
2. Achar a menor mudança que produz o resultado pedido.
3. Dizer, numa frase, o que vai mudar. Se o Lucas não pediu o resto, não entra.
4. Publicar só isso.
5. Conferir no site (ou no banco, se for status) se o resultado apareceu.
6. Atualizar a seção Em aberto e o Histórico.

## Regras de trabalho

- Um pedido, uma mudança.
- Não “aproveitar” para deixar o sistema consistente.
- Não melhorar tela, texto, ritmo, fila, legenda, conexão, OTP, PIX ou ranking no mesmo passo.
- Não apagar conta do cofre.
- Não cancelar fila de publicação que já está marcada.
- Não criar comentário automático no Instagram.
- Não rodar migração de banco. O script `deploy:cloudflare` do package.json aplica migração. Não usar esse script.
- Publicar assim, a partir de `/tmp/nexoflow`:

```
npm run build && npx wrangler deploy
```

- Testes de string da tela falham porque a tela é compilada. Não “consertar” esses testes. Se a mudança alterar um assert que existe de propósito (hoje o teto de 200 contas), atualizar só esse assert.
- Datas no banco vêm com `T` no meio. `datetime('now')` do SQLite usa espaço. Comparar com `replace(scheduled_for,'T',' ')`.

## Não mexer sem o Lucas pedir pelo nome

- Legenda e o caminho de publicação na Meta (formulário primeiro, depois json, depois query; 3 tentativas; se a legenda não confirmar, apaga o post e tenta de novo; na última, publica com o aviso conhecido).
- Conexão de contas. Admin e Mayk têm duas opções: conectar direto com o Instagram do navegador, ou fila de @. Os outros usuários não.
- OTP, Gmail, PIX, carteira, preço.
- Ranking. Só admin e Mayk.
- Painel de ritmo da fila (economia 12, normal 80, rápido 120). O cron publica com teto 120. O botão manual de jobs continua em 8.
- Isolamento entre a operação do admin e a do Mayk.
- Limite de 50 arquivos por campanha. Isso não é o limite de perfis.

## Regras de produto já fechadas

- “Mesmo intervalo para todas as contas” significa: todas as contas selecionadas publicam juntas naquele horário e só depois esperam o intervalo. Não é uma conta a cada N minutos.
- O modo que espalha uma conta por vez é outro, e só vale quando o Lucas escolhe distribuição, não quando escolhe o mesmo intervalo.
- Legenda vai junto com o vídeo. Erro ou nova tentativa é melhor do que postar sem legenda.
- Campanha agendada, ao abrir, mostra os perfis que entraram, o intervalo e a configuração da criação.
- Campanha que terminou deve poder aparecer como concluída. Não reabrir esse fluxo sem pedido.
- Falar com o Lucas em português, como produto. Sem caminho interno, sem nome de ferramenta, sem “sobe o servidor”, a menos que ele peça o mapa técnico. Este arquivo é a exceção: ele existe para o próximo chat.

## Mapa curto

| O que | Onde |
|---|---|
| Tela | `app/components/NexoFlowDashboard.tsx` (compilado) |
| Agendar campanha | `app/api/campaigns/[id]/schedule/route.ts` |
| Ver campanha | `app/api/campaigns/[id]/route.ts` e `app/components/CampaignAccounts.tsx` |
| Publicar de fato | `lib/queue-engine.ts`, cron em `worker/index.ts` |
| Ritmo | `lib/publish-pace.ts`, `app/api/admin/publishing/route.ts`, `app/components/PublishPace.tsx` |
| Legenda | `lib/captions.ts`, `lib/meta-api.ts` |
| Quem é admin / Mayk | `lib/auth.ts` |
| Título da aba | `app/layout.tsx` e `app/page.tsx` — já dizem resolvflow |

Teto de perfis hoje, ainda não é ilimitado:

- Na tela, `var ze=200`, e a seleção faz `.slice(0,ze)` nos dois seletores e ao abrir o agendamento.
- Na API, `accountIds` faz `.slice(0, 200)`.
- A gravação já é em lote (8 linhas por insert, 20 por batch). A busca de contas é em grupos de 80. Isso fica. O teto numérico é que sai, quando o Lucas mandar.

Status da campanha:

- Só `draft` e `paused` podem ser agendadas. Se já está `scheduled`, a API responde 409.
- A troca para `scheduled` acontece logo depois de inserir os posts, antes de somar `queueCount`. Se a campanha ainda está em rascunho e já tem posts, um novo agendamento só completa o status e não duplica a fila.

## Em aberto

- Tirar o teto de perfis no agendamento. Sem limite. Não trocar 200 por outro número.

Não fazer os dois no escuro no meio de outro pedido. Um de cada vez, quando ele pedir.

## Histórico

- 2026-09-29 — Templates de outras contas começa fechado. A conta admin sai do ranking que os outros usuários veem.
- 2026-09-29 — Na conta admin, Campanhas lista templates e campanhas das outras contas. Trazer para a minha conta cria um template só na operação admin. A fila e as contas de quem criou ficam onde estão.
- 2026-09-23 — Pacote `resolvflow-fonte.zip` refeito depois das alterações de tag e da sincronização. Não baixar o worker pelo painel da Cloudflare: lá só existe o site compilado. O zip é a cópia editável do que está no ar. Sem `node_modules`, sem pasta de build e sem senha.
- 2026-09-23 — Campanha «23/09 - Todos insta» estava em rascunho com a fila já gravada. Marcada como agendada. 352 posts pausados por isso voltaram para a fila. Não há repositório no GitHub.
- Antes disso, já no ar e que não se desfaz sem pedido: conexão em duas opções para admin e Mayk; legenda obrigatória com nova tentativa; publicação em onda (contas do mesmo horário juntas); painel de ritmo; tela da campanha mostra os perfis; teto de seleção subiu de 50 para 200, com gravação em lote. O Lucas não aceitou o 200 como resposta final. Ele quer sem limite.

## Manutenção

Este arquivo fica curto. Se passar de duas telas, corta explicação e deixa a decisão.
Não copiar segredo, token, senha ou chave para cá.
Quando uma pendência fechar, tira de Em aberto e deixa uma linha no Histórico.
