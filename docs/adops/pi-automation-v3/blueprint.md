# Blueprint - Automacao AdOps PI v3

## Fluxo

Entrada -> normalizacao -> deduplicacao -> revisao de conflito -> aplicacao controlada -> captura retroativa -> auditoria -> Telegram

## Componentes

- Drive monitor: observa pasta de PIs e registra eventos.
- Intake manual: registra anexos recebidos por WhatsApp ou e-mail.
- Parser de PI: extrai campos de PDF/anexo com citacao de fonte.
- Reconciler: compara PI, pasta Drive, planilha, AdOps e AdRotate.
- Mutator: cria/atualiza apenas quando a deduplicacao esta limpa.
- Capture runner: gera evidencias retroativas.
- GIF audit normalizer: escolhe frame util so para o DOM da captura.
- Telegram notifier: envia identificacao e links das evidencias.

## Contratos de deduplicacao

- Evento Drive: `drive:<fileId>:<modifiedTime>`.
- Documento: `sha256` do PDF ou midia.
- Campanha: `piCodigo + cliente + agencia + campanha + competencia`.
- Insercao: `campanha + site + localFormato + periodo`.
- AdRotate: `site + groupId + adops_external_key/adops_insertion_id/media_basename`.

## Politica por fonte

- Drive: entrada preferencial para automacao.
- WhatsApp: operador salva o anexo na pasta da PI ou registra intake manual com evidencia.
- E-mail: PDF/anexo e fonte primaria, mas precisa virar documento de entrada rastreavel.
- Planilha: completa e confere, nao sobrescreve PI primaria.
- AdRotate: representa publicacao viva e evita duplicidade.

## Estados

- `observed`: fonte detectada.
- `parsed`: campos extraidos.
- `deduped`: vinculo encontrado ou criacao liberada.
- `needs_review`: conflito, campo ausente ou IA sem confianca/citacao suficiente.
- `applied`: alteracao feita no AdOps/AdRotate.
- `captured`: evidencia gerada.
- `audited`: evidencia passou na regra.
