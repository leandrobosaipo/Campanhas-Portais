# Plano — agência opcional na publicação operacional

## Problema

`validateDrivePiApplyFields` tratava `agenciaId` ausente como erro fatal, embora a campanha aceite vínculo nulo e a agência não determine portal, posição, período, mídia ou publicação.

## Implementação

1. API/runner: mover `agenciaId` de campo obrigatório para `commercialWarnings`, mantendo `missing_agenciaId` visível em `reviewReasons`.
2. Segurança: manter obrigatórios PI, campanha, competência, cliente e inserção completa; não inferir nem criar agência por aproximação.
3. Agente: extrair agência quando houver prova; se faltar, usar `null`, registrar `missingFields` e não bloquear sozinho.
4. Documentação: separar conclusão operacional de conclusão comercial; exigir agência antes de faturamento, pacote comercial ou envio à agência.
5. Validação: teste de regressão, preflight vivo da PI 17464, deploy, publicação, leitura pública e evidências retroativas auditadas.

## Rollback

Reverter o commit desta mudança e redeployar a release anterior. Nenhuma migração de banco é necessária.

## Correção derivada da validação viva

O primeiro publish resolveu a mídia, mas o checklist bloqueou `Segunda Dobra Lateral` com `group_not_resolved`. A planilha e a inserção canônica `3019` confirmam essa posição; foi adicionado o alias exato ao grupo 7 já existente, sem criar regra ou slot novo.
