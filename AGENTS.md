# AdOps — Instruções do Projeto Codex

Este projeto é a fonte operacional do AdOps fora do OpenClaw.

Raiz oficial:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

Origem histórica migrada:

```bash
/Users/leandrobosaipo/.openclaw/Campanhas-Portais
```

Não assuma que a pasta antiga é a fonte atual. Use a pasta deste projeto para código, documentação, scripts, `.env` locais e runbooks.

## Postura obrigatória

- Detectar contexto real antes de alterar.
- Reutilizar scripts existentes.
- Não inventar endpoints, variáveis, credenciais, PIs, dados de planilha ou configurações de AdRotate.
- Não expor tokens, secrets, headers de autorização ou credenciais.
- Preferir correção simples, auditável e reversível.
- Preservar operação em produção: nunca quebrar prints, planilha, AdRotate, Telegram ou Cloudflare por mudança não testada.
- Ao trabalhar com PI, a prioridade de fonte é: PDF/email da PI, depois planilha, depois AdOps, depois AdRotate.
- Em caso de divergência, registrar a divergência e corrigir sem duplicar anúncio, campanha ou inserção.
- Preservar separadamente o nome comercial da PI (`contractedPosition`) e a posição técnica do portal (`canonicalPosition`, `localFormatoNormalizado`, `adrotateGroupId`).
- No Perrengue: vídeo 60s é G06; banner lateral segunda dobra é G07; topo lateral é exclusivamente G10. A fonte canônica é `config/adrotate-sites.json`.
- Link descrito como direcionamento de banner não deve ser herdado por vídeo.

## Mapa rápido

- Visão inicial: `docs/START_HERE_ADOPS.md`
- Mapa técnico: `docs/PROJECT_MAP_ADOPS.md`
- Credenciais e `.env`: `docs/CREDENTIALS_AND_ENV_ADOPS.md`
- Migração OpenClaw -> Codex: `docs/MIGRATION_FROM_OPENCLAW_ADOPS.md`
- Base ampla do projeto: `docs/base-de-conhecimento-do-projeto.md`
- Status consolidado: `docs/status-do-projeto.md`
- Configuração de captura/auditoria: `docs/adops/capture-config/README.md`
- Inventário Perrengue G01-G14: `docs/adops/perrengue-position-inventory.md`
- Prints retroativos: `docs/prints-retroativos.md`
- Sincronização planilha/AdRotate: `docs/spec-reconcile-planilha-adrotate-v1.md`
- Telegram: `docs/fluxos-telegram-bot-adops.md`
- Cloudflare/VPS: `docs/operacao-pages-vps-2026-04-14.md`

## Fluxo para nova PI

1. Conferir PI/email/PDF e identificar campanha, cliente, agência, portal, posição, período, mídia e destino.
   - Ler todas as linhas da tabela de veiculação e todos os arquivos da pasta de mídia, inclusive `.txt`/Docs com links.
   - Relacionar cada linha a uma mídia por tipo e dimensão antes de alterar planilha, AdOps ou AdRotate.
2. Sincronizar planilha.
3. Verificar se campanha/inserção já existem no AdOps.
4. Verificar AdRotate do portal e evitar duplicidade.
5. Vincular anúncio existente ao AdOps quando já houver publicação.
6. Atualizar mídia e status no AdOps.
7. Limpar cache do portal.
8. Gerar prints obrigatórios, incluindo retroativos em aberto.
9. Validar auditoria por data.
10. Enviar resumo e prints no Telegram quando solicitado.

Ao editar a planilha operacional `.xlsm` no Drive:

- baixar novamente imediatamente antes da alteração;
- comparar revisão, `modifiedTime`, tamanho e estrutura ZIP;
- reaplicar apenas as células pretendidas sobre a revisão mais recente;
- publicar como nova versão do mesmo arquivo, preservando ID e nome;
- reler a revisão remota e manter a versão anterior recuperável.

## Comandos operacionais principais

Antes de mexer em captura, auditoria ou regra de print:

```bash
pnpm --dir scripts run audit:capture-rules-integrity
```

Sincronizar planilha localmente:

```bash
pnpm --filter @workspace/scripts run sync:planilha
```

Reconciliar planilha + AdRotate:

```bash
pnpm --filter @workspace/scripts run reconcile:planilha-adrotate
```

Gerar print por runner/API pública:

```bash
POST https://adops-api-public.leandro471.workers.dev/api/ops/jobs/print-single
```

Consultar status de evidência:

```bash
GET https://adops-api-public.leandro471.workers.dev/api/insertions/{id}/capture-proof/status?date=YYYY-MM-DD
```

## Entrega final obrigatória por PI + portal

Para qualquer entrega final de evidências, usar somente o fluxo assíncrono da API AdOps:

```text
POST /api/pi-site-exports/jobs
  mode=full-pdf
  variant=web
  Idempotency-Key=<chave estável>
GET /api/pi-site-exports/jobs/{jobId}
GET /api/pi-site-exports/jobs/{jobId}/download
```

- Não montar o pacote final manualmente quando a API estiver disponível.
- Não usar o endpoint síncrono para pacotes grandes.
- Preservar os PNGs auditados no storage; a compressão ocorre apenas na cópia de entrega.
- O ZIP final deve conter PDF, JPEGs progressivos independentes, auditoria, contact sheet e `SHA256SUMS.txt`.
- Antes de liberar: `status=completed`, páginas do PDF = JPEGs, zero PNG na cópia web, checksums válidos e amostragem visual com topbar/domínio/data/hora/banner visíveis.
- Contrato navegável: `https://adops-api.codigo5.com.br/api/docs`; OpenAPI: `https://adops-api.codigo5.com.br/api/openapi.json`.

## Gate obrigatório de captura/auditoria

Bloqueia publicação ou regeneração em lote se houver:

- Mais de uma regra publicada para o mesmo `siteSigla + groupId`.
- `slotSelector` igual apontando para grupos diferentes no mesmo site/página.
- Alias operacional igual em grupos diferentes do mesmo site.
- Divergência entre `config/adrotate-sites.json` e regras publicadas no painel/API.
- Campos inválidos: `scrollMode`, `proofStyle`, `slotSelector`.

## Serviços relacionados

- Painel público: `https://adops-campanhas-portais.pages.dev`
- API pública: `https://adops-api-public.leandro471.workers.dev`
- API privada/VPS: serviço `codigo5_adops-api`
- Runner/VPS: serviço `codigo5_adops-runner`
- Telegram bot: `ops/telegram-bot` e `ops/cloudflare-telegram-bot`
- WordPress/AdRotate multisite: `ops/wordpress/adrotate-adops.php`
- Configuração por portal/posição: `config/adrotate-sites.json`

## Segurança

- Arquivos `.env*` foram migrados e devem ficar com permissão `600`.
- Nunca colar valores de tokens no chat.
- Ao gerar relatório, mostrar apenas nomes de variáveis e status `presente/ausente`.
- Não commitar secrets sem pedido explícito e revisão.

## Validação mínima antes de concluir tarefa

Escolha os testes conforme a mudança:

```bash
node --check scripts/src/capture-insertion-proof.cjs
pnpm --dir scripts run audit:capture-rules-integrity
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/adops run build
```

Para tarefas operacionais, além dos comandos, validar no sistema vivo:

- status da inserção;
- relação AdOps x AdRotate;
- evidência por data;
- URL pública do print;
- auditoria sem issues;
- Telegram enviado, se solicitado.
