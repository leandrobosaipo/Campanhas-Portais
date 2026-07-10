# Playbook - PI Automation v3

## PI chegou pelo Drive

1. Confirmar PDF e midia na pasta da PI.
2. Rodar reconciliacao.
3. Conferir se campanha/insercao ja existem.
4. Vincular AdRotate quando o anuncio ja estiver publicado.
5. Gerar evidencias retroativas.
6. Enviar links no Telegram.

## PI chegou pelo WhatsApp

1. Salvar anexo na pasta da PI no Drive.
2. Registrar intake manual com origem WhatsApp.
3. Rodar deduplicacao antes de qualquer mutacao.
4. Se a midia era a parte faltante, atualizar a insercao existente.

## PI chegou por e-mail

1. Baixar PDF/anexo.
2. Registrar documento de entrada rastreavel.
3. Usar PDF/e-mail como fonte primaria.
4. Completar campos pela planilha somente quando nao houver conflito.

## Linha ja existe na planilha

1. Tratar planilha como fonte secundaria.
2. Comparar periodo, formato, cliente e site.
3. Se divergente, marcar `needs_review`.

## AdRotate ja tem anuncio

1. Nao criar novo anuncio.
2. Vincular anuncio vivo ao AdOps.
3. Conferir grupo/slot.
4. Limpar cache e capturar.

## GIF ruim no print

1. Confirmar que a midia publicada continua GIF.
2. Gerar captura com normalizador `capture-only`.
3. Validar `captureOnly=true` no metadata.
4. Se falhar `no_capture_only_gif_frame`, pedir nova midia ou revisar manualmente.
