# Tutorial — Nova PI, publicação e evidências

> Estado: vigente
> Público: operação humana e agentes
> Última validação: 2026-08-13
> Release-base: 47e0dab
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
| PI/PDF ausente | Marcar `awaiting_authoritative_pi`; mídia candidata não vira “mídia ausente” |

Identidade da campanha não é apenas o nome. Use PI canônica, cliente, agência e competência. Inserção corresponde a campanha + portal + formato + período.

### Retomada automática sem duplicação

O job `campaign-publication-reconcile` reconsulta planilha, snapshot do Drive e AdOps às 17h30 de Cuiabá e após atualizações do Drive. Enquanto faltar PDF, ele conclui com blocker rastreável. Quando a fonte autoritativa chegar, só atualiza a campanha e a inserção esperadas se todos os campos coincidirem; não cria entidade por semelhança de nome.

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

Use `print-backfill` somente após publicação real. Datas críticas rodam em série, com captura concorrência 1. Para evidência inválida, refaça a data individual com `replace=true`; não sobrescreva evidência válida sem motivo.

Reconstrução histórica só é aceita quando a auditoria confirma que a prova representa o slot, mídia, data e contexto esperados. Caso contrário, registre blocker por portal, formato e data.

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
- RADAR/PERRENGUE `#1944`: GIF 670×90 e destino encontrados, mas publicação bloqueada sem PI/PDF.
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
