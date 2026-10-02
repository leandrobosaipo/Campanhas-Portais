# PI 91381 / AFL — auditoria separada de candidatos

Base: main 29a1e3a32bea9a42374ec9f070d14908ec1bcea2. Produção API observada: d2c2796184b25ddd3b0e98eea5c50ade651215b2. Worktree isolada; patches da raiz oficial não incorporados.

## Escopo autorizado

Registro e auditoria de candidatos existentes da inserção 3024, referência 08–16/09/2026; promoção dos mesmos bytes somente após checklist completo aprovado e readback. Preservar cinco originais de 17–21/09. Reconstruções mantêm historical_recovery, captura real em 01/10, referência histórica e historicalDisplayConfirmed:false. Aprovação técnica não atribui aprovação externa ou publicação contemporânea.

## Compatibilidade e gates

Candidatos e decisões ficam em registros separados, sem alterar evidências nem aparecer como audited. Job persistido, stage de captura, metadata local do runner, URL no prefixo do próprio job, hash e bytes reais precisam corresponder. Checklist existente permanece integral. Promoção requer revisão persistida, nova verificação de artefato/contrato, arquivo privado verificado do original, controle de concorrência e auditoria final canônica. Falha preserva candidato e restaura apenas a evidência afetada; sem restauração global de banco.

Antes de release: testes de falsificação/imutabilidade/hash/rollback e regressão de provenance, build API e painel, revisão Luna, CI SHA exato e merge normal. O workflow GitHub tem defeito conhecido de encaminhamento de credencial; não dispará-lo. O script oficial local já suportado pode reutilizar arquivo de credencial existente sem alterar segurança. Backup/restauração de teste, volumes versionados e rollback continuam obrigatórios.

Depois de release: primeiro um candidato como canário, verificar status/log/hash/arquivo e limite de proveniência; só então restantes. Revalidar 14 datas e cinco originais por URL/hash/metadados. Exportação oficial mode=pdf, uma imagem por página sem capa/texto, ordem 08–21/09. Download direto tem nome PI-91381-AFL-prints-auditados-comprimidos.pdf. Conferir 14 páginas reais, imagens e arquivo completo antes de compartilhar com o proprietário. Nenhum envio a cliente/grupo. WhatsApp pessoal depende de rota/destinatário confirmados pelo parent.

## Estado inicial verificado

08–16/09: nove evidências canônicas invalid_audit, nove candidatos corrigidos não promovidos. 17–21/09: cinco audited. Auditoria de regras passou sem erros (duas advertências de drafts Perrengue); 22 testes legados de proveniência passaram. Nenhuma evidência alterada nesta preparação.

## Instante de captura e etapa do job

O capturador chama `stampCaptureInstant()` depois da captura e só depois fecha `slot_captured` com outra leitura de relógio. No candidato de 11/09, o JSON registra 23:05:43.954Z e a etapa termina em 23:05:43.955Z (01/10 real). A correlação usa os limites início/fim da etapa persistida e do job, exige `reconstructedAt == capturedAt` do arquivo do runner e conserva o horário original sem arredondamento. Não aceita horário histórico, horário de recebimento como captura, nem timestamp fora da operação registrada.
