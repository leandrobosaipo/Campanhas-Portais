# Tutorial — Nova PI, publicação e evidências

> Estado: vigente
> Público: operação humana e agentes
> Última validação: 2026-08-13
> Release-base: c71350e; política sem PDF validada no commit que contém este documento
> Fonte autoritativa: PI/PDF, planilha, API AdOps e portal público

## Resultado esperado

Ao terminar, a campanha possui identidade confirmada, inserção canônica, mídia pública, anúncio correto no AdRotate e evidências auditadas. Se faltar uma fonte autoritativa, o resultado é um blocker objetivo — nunca um cadastro inferido.

## 1. Auditar a entrada

Extraia:

- PI numérica;
- cliente e agência;
- campanha;
- portal;
- período;
- formato;
- mídia e dimensões;
- URL de destino.

Prioridade: PDF/e-mail da PI → planilha → AdOps → AdRotate/portal → Drive. O Drive pode provar que existe mídia candidata, mas o nome da pasta não cria uma PI.

Para pasta local:

```bash
bash /Users/leandrobosaipo/.codex/skills/adops-pi-sync/scripts/pi-folder-audit.sh "/caminho/da/pasta"
```

## 2. Sincronizar e consultar

```bash
pnpm --filter @workspace/scripts run sync:planilha
curl -fsSL 'https://adops-api.codigo5.com.br/api/campaign-operations/active?date=YYYY-MM-DD'
curl -fsSL 'https://adops-api.codigo5.com.br/api/campaign-operations/pending-publication?date=YYYY-MM-DD'
```

A fila pendente mostra somente campanhas que precisam de publicação ou evidência. Verifique fatos da planilha, Drive, AdOps e AdRotate antes de agir.

## 3. Decidir: criar, corrigir ou bloquear

| Situação | Decisão |
|---|---|
| Linha oficial e nenhuma campanha compatível | Criar campanha e inserção |
| Campanha já existe | Atualizar a entidade canônica |
| Inserção equivalente existe | Corrigir/vincular; não duplicar |
| Anúncio correto existe no grupo | Reutilizar e vincular |
| Mesma campanha sem PI confirmada | Bloquear agrupamento/publicação |
| PI/PDF ausente, identidade operacional única | Usar `identityMode=operational_identity`, manter `commercialIdentityStatus=awaiting_authoritative_pi` e liberar somente o preflight vivo de publicação |
| PDF presente, mas os campos comerciais estão divididos entre planilha e pasta | Usar `identityMode=sheet_drive_composite` somente quando PI, linha, campanha, inserção, portal, período, formato e pasta forem únicos; exigir um PDF, uma mídia compatível e um documento com exatamente um destino HTTPS |
| PI/PDF ausente e fonte ambígua | Manter `failed_retryable`; mídia candidata não vira “mídia ausente” e nenhuma entidade é criada |

Identidade da campanha não é apenas o nome. Use PI canônica, cliente, agência e competência. Inserção corresponde a campanha + portal + formato + período.

### Retomada automática sem duplicação

O job `campaign-publication-reconcile` reconsulta planilha, snapshot do Drive e AdOps às 17h30 de Cuiabá e após atualizações do Drive. Sem PDF, ele pode publicar somente quando competência, portal, campanha, período, formato, linha, pasta, mídia e destino formam uma correspondência operacional única. O runner relê as fontes, valida o binário e o destino HTTPS antes de mutar. A PI continua pendente para faturamento e ZIP por PI. Quando o PDF chegar, o fluxo completa a campanha e a inserção existentes, sem duplicar ou trocar o portal por semelhança de nome.

Quando o PDF existe, mas não contém texto extraível suficiente, a planilha continua sendo a fonte canônica de portal, PI, período e formato. O modo `sheet_drive_composite` só é liberado se planilha, AdOps, pasta e nome do PDF apontarem para a mesma PI e houver exatamente um PDF, uma mídia e um redirect. O runner baixa novamente os três arquivos, compara ID, tamanho e checksum, rejeita uma PI explícita divergente no PDF e publica apenas a inserção canônica existente.

Compare `009749` e `9749` como a mesma PI apenas quando ambos forem identificadores puramente numéricos. Preserve a grafia original para exibição e auditoria.

## 4. Atualizar entidades no lugar correto

- `clients`: razão social, CNPJ, contato e endereço.
- `agencies`: dados fiscais e contato.
- `sites`: dados institucionais e configuração do portal.
- `campaigns`: PI e vínculos com cliente/agência.
- `insertions`: portal, formato, período, `mediaUrl` e operação.

Não grave dados mestres apenas na campanha ou inserção.

## 5. Validar e publicar a mídia

Confirme o arquivo binário, não apenas o nome:

- MIME e assinatura;
- dimensões;
- conteúdo visual;
- compatibilidade com o formato;
- URL de destino.

Compare a URL no WordPress, AdRotate, AdOps e HTML público. Se o portal opera via Spaces/CDN, use o host público que realmente serve a peça. Perrengue pode usar domínio/CDN próprio; não force Spaces por regra geral.

Antes de criar anúncio, consulte a relação existente. Publique no grupo resolvido por `config/adrotate-sites.json`, limpe caches e reabra o slot público. Só marque `bannerPublicadoNoSite=true` depois da leitura pública.

No Perrengue, o rebuild headless pode aguardar publicações editoriais que já estavam na fila. O reconciliador identifica cada publish e rollback com um `reason` único e só aceita o health do próprio trigger. Não trate timeout local, anúncio no banco ou HTML isolado como conclusão: confronte AdOps, AdRotate, health do rebuild e consumidor público.

## 6. Gerar a evidência do dia

Antes da captura:

```bash
pnpm --dir scripts run audit:capture-rules-integrity
```

Dispare `print-single` pela API/fila e acompanhe:

```text
POST /api/ops/jobs/print-single
GET  /api/ops/jobs/{jobId}/progress
GET  /api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD
```

Aceite:

- `audited` ou `audited_best_effort`;
- evidência presente;
- URL acessível;
- `checklistValidation.approved=true`;
- nenhum blocking issue.

`queued`, `running` e `completed` descrevem o job, não a qualidade final. `skipped` pode significar que uma evidência válida já existia.

## 7. Gerar retroativos

Campanha encerrada não deve ser reativada para produzir evidência. Use backfill restrito à inserção e à data contratada. Para PI 14771/OMT (`campaignId=969`, `insertionId=1841`) e PI 9750/AFL (`campaignId=981`, `insertionId=1854`), a única data pendente confirmada em 17/08/2026 era 15/08/2026. Aceite o resultado somente com `audited` ou `audited_best_effort`, checklist aprovado, URL acessível e nenhum bloqueio.

O relatório mensal deve continuar mostrando a campanha depois do encerramento. O endpoint diário `campaign-operations/active` não serve para montar o histórico do mês; use `campaign-operations/evidence-monthly-source`.

Use `print-backfill` somente após publicação real. Datas críticas rodam em série, com captura concorrência 1. Para evidência inválida, refaça a data individual com `replace=true`; não sobrescreva evidência válida sem motivo.

Reconstrução histórica só é aceita quando a auditoria confirma que a prova representa o slot, mídia, data e contexto esperados. Caso contrário, registre blocker por portal, formato e data.

Quando um anúncio encerrado não aparece mais no HTML do AdRotate, o capturador pode usar a reconstrução auditada explicitamente habilitada no runner. Para OMT e AFL, ela consulta o WordPress REST com corte na data pedida, reescreve somente os cards de notícia visíveis e recria o slot apenas em uma âncora conhecida do tema. A mídia vem da `mediaUrl` canônica da inserção. Esse fallback não altera WordPress, AdRotate ou cache público. Falhe sem gerar evidência se a âncora não for única, houver menos de três notícias históricas, aparecer conteúdo posterior ao corte ou a identidade visual do banner divergir.

## 8. GIF e prova visual

O GIF original permanece publicado. A captura pode congelar um frame apenas no DOM de prova. Confirme:

- frame legível;
- ausência de branco, loader ou transição parcial;
- `gifChosenFrameIndex` registrado;
- frame dentro de `gifAllowedFrameRanges`, quando configurado.

O caso Energisa/PI 490711 ensinou que HTTP 200 e estado `audited` antigo não garantiam mensagem visual legível. A regra extraída foi validar o frame e reprovar `gif_frame_not_approved`.

## 9. Entregar evidências

Individual:

```text
GET /api/insertions/{id}/evidences/{date}/download
```

PI + portal:

```text
POST /api/pi-site-exports/jobs
GET  /api/pi-site-exports/jobs/{jobId}
GET  /api/pi-site-exports/jobs/{jobId}/download
```

Campanha completa:

```text
POST /api/campaign-evidence-exports/jobs
GET  /api/campaign-evidence-exports/jobs/{jobId}
GET  /api/campaign-evidence-exports/jobs/{jobId}/download
```

O ZIP completo usa descritor imutável assinado e contém JPEGs progressivos + `SHA256SUMS.txt`. Ele não captura nem reaudita, e o PNG original não é alterado.

## 10. Atualizar relatório e comunicar

O job `evidence-monthly-report` consulta a fonte agregada, reutiliza ZIPs por fingerprint, valida staging e publica atomicamente. Falha mantém a última versão válida. Envie Telegram somente quando solicitado e depois de validar o link/artefato real.

## Regras aprendidas

- Inserção canônica vem de `campaign-operations/active`; rascunhos duplicados não entram em backfill.
- Campanhas homônimas sem PI não são agrupadas.
- Drive pode retornar `candidate_found` com `documentStatus=missing`.
- `printGerado`, HTTP 200 e arquivo existente não substituem auditoria.
- Captura e empacotamento são responsabilidades separadas.
- Exportações usam concorrência até 3; browser/captura permanece serial.
- Polling usa `/progress`; respostas completas são para conclusão ou diagnóstico.

## Casos de referência

- `#1826`: rascunho duplicado excluído pela seleção canônica.
- RADAR/OMT PI 17190: publicada e com ZIP validado.
- RADAR/PERRENGUE `#1944`: caso de identidade operacional única; GIF 670×90 e destino podem liberar a veiculação após preflight, mas faturamento e ZIP por PI permanecem bloqueados até o PDF.
- Relatório/ZIP: deadlock removido ao separar o runner mensal do pool dedicado de exportações.

## Checklist final

- [ ] PI e identidade confirmadas.
- [ ] Planilha sincronizada.
- [ ] Campanha/inserção canônicas, sem duplicação.
- [ ] Mídia e destino validados.
- [ ] AdRotate e `mediaUrl` usam a URL pública correta.
- [ ] Cache limpo e banner confirmado no slot público.
- [ ] Evidências auditadas por data.
- [ ] Downloads/ZIP validados.
- [ ] Relatório atualizado ou blocker explícito.
