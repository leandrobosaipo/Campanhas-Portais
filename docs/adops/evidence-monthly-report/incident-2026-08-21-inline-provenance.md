# Incidente de 21/08 — proveniência inline ausente

As inserções `#2692`, `#2693`, `#2712` e `#2713` possuíam arquivos acessíveis e mídia canônica correta, mas os logs antigos `inline-*` não gravaram `captureClass`, `sourceJobId` e `auditPolicyVersion`. A auditoria posterior tratou os registros como retroativos e exibiu quatro erros no relatório.

Os logs correlacionados terminaram `ok`, apontam exatamente para as URLs persistidas e foram capturados ainda em 21/08 no fuso `America/Cuiaba`. A correção reutiliza os arquivos, classifica os logs como `same_day_retry` e não altera a tabela nem a URL das evidências.

O fluxo de recuperação é `dryRun`, conferência dos blockers, `apply`, auditoria individual e atualização incremental do relatório. Qualquer divergência de inserção, período, mídia, arquivo, data ou gate visual bloqueia o item. Nesse caso, uma nova captura histórica precisa seguir integralmente o contrato retroativo.
