# CONTRACTS - Módulos AdOps

## intake-pi

Entrada: PDF/e-mail/Drive/WhatsApp.

Saída: evento rastreável com estado `needs_review` quando faltar dado.

Regra: não criar campanha automaticamente quando PI estiver ambígua.

## campaigns-insertions

Entrada: campanha, cliente, agência, site, período, mídia e formato.

Saída: campanha/inserção idempotente.

Regra: `piCodigo + cliente + agência + competência + site + formato + período` não pode duplicar sem revisão.

## adrotate-sync

Entrada: site, grupo, anúncio, mídia e vínculo AdOps.

Saída: relação segura AdOps x AdRotate.

Regra: vincular anúncio existente antes de criar novo.

## capture-proof

Entrada: inserção, data alvo, regra publicada e mídia.

Saída: evidência auditável e log de captura.

Regra: capture rules publicadas são fonte runtime; drafts não devem afetar captura.

## ops-queue

Entrada: job protegido por operador ou cron.

Saída: status, progresso, logs e retry.

Regra: watchdog deve ser idempotente e deduplicado.

## telegram

Entrada: comando, evento ou resumo diário.

Saída: mensagem autorizada com prova de entrega.

Regra: não disparar em massa e não expor tokens/chat IDs.

## dashboard-read-model

Entrada: API de leitura.

Saída: métricas, listas e estados operacionais.

Regra: Pages/web 200 não significa sistema saudável; API, runner e banco precisam checks próprios.

## settings-master-data

Entrada: cliente, agência, site e aliases.

Saída: cadastro mestre validado.

Regra: merge/alias precisa histórico auditável.
