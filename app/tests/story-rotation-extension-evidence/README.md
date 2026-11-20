# Extensao 0.4.6 — inclinacao do adesivo de link

## Encerramento final apos correcao de geometria

36/36 testes PASS,0FAIL/0skip; node--check dos4entrypointsJS e lint dirigido dos mesmos+2arquivos de teste exit0. Job pane-node-f5faae49-21b8-4523-8b21-cb9ce6b611e6 encerrou exit0 com STORY_ROTATION_EXTENSION_GATES_PASS. FreezeSHA256 dde270e3693105b8ecdb719951dcf8ace6b61abf7b590c1ba321cc34082f23bf;8hashes de produto/testes/script e9fontes publicas preservadas conferidos depois dos gates, sem drift. Recibo/comandos/log SHA em review-ready.json, status rotation_extension_ready_for_independent_review. Produto encerrado para revisao independente e integracao do Admin; nenhuma pendencia de execucao de gate deste owner. Referencias abaixo a gates em andamento sao historicas e superadas por este recibo. Sem build integrado, QA visual/area de toque ou Meta real.

## Correcao apos revisao — dimensoes reais em escalas pequenas

Gate anterior34testes/sintaxe/lint encerrou exit0 (pane-node-2834e140-13d2-48b4-bad6-d618e164dbb7), mas a revisao posterior encontrou divergencia de altura abaixo. Esse gate NAO aprova o snapshot agora revisado. Novo freeze/rodada final atualizados em review-ready.json.

`linkSticker` herdava minheight.03, enquanto o render em70% gera76*.7/1920=.027708333333333335 e o ajuste de titulo longo pode reduzir ainda mais. Para giro NAOZERO o publicador agora usa width/height efetivamente retornados pelo renderer, sem clamp/inflacao e sem converter para bounding box. Valida tipos numericos finitos e dimensoes normalizadas(0,1] ANTES do upload; dados ausentes/invalidos falham sem efeito. Centro/sinal/angulo permanecem os mesmos. Story_link_stickers e tap_models recebem geometria identica; a forma legada de configure tambem conserva os valores. Giro0 deliberadamente mantem clamps antigos para compatibilidade0.4.4/5; nessa modalidade a antiga diferenca em minheight nao foi redefinida.

36 testes PASS apos correcao: dois novos casos cobrem±25 e0, escala70%, titulo40caracteres/medicao larga sintetica, dimensoes reais abaixo.03, igualdade dos metadados e recusas antes de qualquer fetch. Gates finais repetidos sobre novo hash, em andamento. Prova angular continua a mesma descrita abaixo: graus no SDK primario e radians/horario no Canvas normativo; nao ha prova real do sinal/area de toque no Instagram atual.

Owner b267. Implementacao exclusivamente em `C:/Users/LMM/projetos/resolvflow-alt/.wrangler/story-rotation-20261118-candidate`, base fornecida75aec3ca/manifest0.4.5. Sem editar outro candidato, raiz dirty, servidor/UI ou templates reais. Sem deploy, instalacao, Instagram real, credencial/config real ou nova tecnica de acesso.

## Contrato e fluxo

Template `stickerRotation` inteiro em graus[-180,180]; ausente corresponde0. Validacao local rejeita tipos/formas invalidos sem POST. O core entrega geometria interna `rotation` ao offscreen, que devolve centro/dimensoes/rotation ao publicador. Sem link nao envia campo/metadata de rotacao, nao desenha overlay e nao altera o fundo. Escolha de destaque continua independente e journal/recibos da0.4.5 preservados.

Desenho: primeiro imagem de fundo existente, sem transformacao. Dentro de save/restore do adesivo: translate para o centro, rotate(graus*PI/180), translate de volta. Texto, icone, caixa e sombra seguem essa transformacao. Dimensoes continuam as do retangulo antes da rotacao, nao AABB que distorceria a area. Centro e largura/altura sao compartilhados com story_link_stickers e tap_models; ambos recebem o MESMO angulo em graus. A forma legada de configureStory tambem conserva rotation, antes fixada0. Angulo0 nao adiciona transformacao ao Canvas e conserva geometria anterior.

Capabilities0.4.6 anuncia storyOptions1 e stickerRotation1 separadamente. Negociacao em erro400: atual ->0.4.5(storyOptions1 conservado) ->0.4.4(profile) ->perfil minimal ->heartbeat antigo sem capabilities. Outros erros nao repetem heartbeat como negociacao. Nenhum POST de negocio usa esse fallback. A exigencia de stickerRotation1 APENAS para selecionar link+giro nao-zero pertence ao servidor/coordenador; este owner nao editou selecao/API. Comando legado/zero e sem link continuam executaveis.

## Evidencia de unidade e sinal; limites

Fontes primarias efetivamente lidas por web, sem sessao/conta Instagram:

- [Codigo do proprio SDK instagram-private-api, InstaSticker](https://raw.githubusercontent.com/dilame/instagram-private-api/master/src/sticker-builder/stickers/insta-sticker.ts), metodo rotateDeg linhas29-31: atribui graus com modulo360; toJSON serializa a propriedade. [Builder do mesmo projeto](https://raw.githubusercontent.com/dilame/instagram-private-api/master/src/sticker-builder/sticker-builder.ts), linhas27-47: geometria vai serializada no pedido. Isso sustenta unidade em graus nesse contrato, e nao radianos. SDK de terceiros e evidencia primaria de sua propria implementacao, nao documentacao oficial Meta.
- [HTML Standard, Canvas rotate](https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-rotate), passos do metodo: angulo em radianos e sentido horario. A conversao e aplicada SOMENTE ao Canvas; wire preserva graus e sinal do contrato local.

Teste matricial demonstra +90 move o ponto direito do adesivo para baixo e -90 para cima, centro permanece fixo e matriz do fundo identidade. A escolha de preservar o sinal positivo no wire segue a convencao de geometria de tela e o contrato coordenado; nao foi demonstrada por resposta/operacao Instagram atual. Nao afirmar validacao real de area de toque, sentido aceito pelo endpoint atual ou sucesso externo. Sem nova coleta autenticada/POST ou invasao. Nenhum novo SDK foi incorporado ao produto.

## Testes e entrega

34 testes dirigidos PASS antes da rodada final:19regressoes adaptadas da0.4.5 e15novos. Matriz[-180,-90,-25,0,25,90,180], rejeicoes de tipo/faixa, centro/fundo, wire em graus e geometria identica/link+tap/forma legada, sessao, no-link+destaque independente, replay apenas de recibo, fallback0.4.5/4 e antigos, errosauth/rede sem fallback, permissoes iguais. ZIPupdateOnly montado em memoria no teste contem0.4.6 e fontes atuais, sem bridge-config; nenhum pacote real privado foi gerado ou distribuido.

Baseline do teste anterior foi adaptada LOCALMENTE: assets0.4.4 nao vieram na composicao; testes agora usam snapshot0.4.5 em before/ e verificam preservacao dos quatro modos em vez de alegar rejeicao0.4.4. Antes de editar foram salvos5arquivos do produto/hash e o teste original. Nova reproducao mostra0.4.5 ignorando giro nao-zero. Nenhum teste de outro owner ou candidato foi editado.

Produto: bridge-core.js,background.js,publisher.js,render.js,manifest.json. Testes: story-options-extension.test.mjs adaptado; story-rotation-extension.test.mjs novo; script story-rotation-extension-gates.ps1. Artefatos: extension-delta.patch,review-ready.json,tests.log e recibo do job. Gates finais em andamento. `node --check` e lint dirigidos; nenhum build global neste owner. Coordenador/Admin fazem revisao e integracao; mocks e matrizes nao sao screenshot/QA visual nem Meta real.
