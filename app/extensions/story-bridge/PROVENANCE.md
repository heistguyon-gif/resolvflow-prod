# Origem do publicador

Publicador encontrado no computador do Lucas: `C:\Users\LMM\Downloads\resolvflow stories extensão.zip` (`background.js`), e renderização da HeavyStorys 0.4.7 em `C:\Users\LMM\Downloads\heavystorys-extension-0.4.7\content.js` / `sticker-metrics.js`.

O `publisher.js` reutiliza as chamadas existentes de upload, configuração de story e criação de destaque. Nenhum novo endpoint privado da Meta foi criado ou inferido. Foram removidos os listeners do botão/popup e o fallback que repetia automaticamente o POST de publicação após recusa HTTP; adicionados exports, checagem de identidade da sessão, checkpoints locais e timeout das mesmas chamadas.

O título do link segue a técnica existente: texto em maiúsculas desenhado na imagem; o sticker nativo de link usa a mesma posição/dimensões. A imagem é recortada ao centro em 1080×1920. As funções de desenho e as métricas vieram do código encontrado.

Cookies/CSRF/sessão do Instagram ficam neste perfil do navegador e só são usados nos hosts Instagram do publicador. Não são enviados à resolvflow, ao AdsPower ou a outro serviço. Os originais em Downloads não foram alterados.

O fluxo real precisa de validação em um perfil de teste: integração testada com mocks, sem publicação no Instagram nesta tarefa. Mudanças do Instagram podem tornar esse publicador incompatível; não existe garantia de publicação externa.
