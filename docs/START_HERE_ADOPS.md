# AdOps — Comece aqui

> Estado: vigente
> Público: equipe operacional e agentes
> Última validação: 2026-08-17
> Release-base anterior em produção: b00779340442; confirmar o SHA da correção mensal no readback
> Fonte autoritativa: runtime público, OpenAPI e runbooks deste repositório

## Objetivo

Este é o índice canônico da operação AdOps. Use-o para localizar a instrução atual sem depender de conversas antigas ou da pasta histórica do OpenClaw.

Raiz oficial:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

A pasta `/Users/leandrobosaipo/.openclaw/Campanhas-Portais` é somente histórica.

## Ordem de leitura

| Necessidade | Documento | Tipo |
|---|---|---|
| Aprender o fluxo completo | `docs/runbook-nova-pi-evidencias.md` | Tutorial |
| Operar endpoints e jobs | `docs/adops/ops-api-runbook.md` | Referência |
| Atualizar o relatório mensal | `docs/adops/evidence-monthly-report/runbook.md` | How-to |
| Manter, publicar ou reverter a plataforma | `docs/adops/system/RUNBOOK.md` | How-to |
| Conhecer o estado confirmado | `docs/status-do-projeto.md` | Explicação |
| Diagnosticar regras de captura | `docs/adops/capture-config/README.md` | Referência |

## Fluxo canônico

```text
PI/PDF/e-mail/Drive
→ planilha
→ campanhas pendentes
→ deduplicação
→ campanha e inserção canônicas
→ mídia pública
→ AdRotate
→ cache e HTML público
→ print e auditoria
→ retroativos
→ relatório e ZIP
→ monitoramento
```

## Fontes de verdade

1. PDF ou e-mail da PI para identidade comercial.
2. Planilha operacional para portal, período e formato.
3. AdOps para campanha, inserção, mídia e estado operacional.
4. AdRotate e HTML público para comprovar publicação.
5. Drive para localizar documentos e mídia, sem inferir PI pelo nome.
6. WhatsApp apenas como contexto complementar.

Conflito de identidade bloqueia publicação. Não escolha PI, portal, período ou formato por semelhança textual.

## Serviços atuais

| Serviço | Função |
|---|---|
| `adops-api` | API canônica, banco e contratos privados |
| `adops-runner` | Sync, lotes, relatório, AdRotate e manutenção |
| `adops-runner-print-single` | Print individual e exportações de evidências |
| `adops-drive-pi-monitor-stack` | Credenciais Google e inventário do Drive |
| `adops-web` | Painel web |
| Worker `adops-api-public` | API pública, D1, fila e agendamento |
| PostgreSQL | Fonte operacional persistente |

Painel: `https://adops.codigo5.com.br`
API: `https://adops-api.codigo5.com.br`
Swagger: `https://adops-api.codigo5.com.br/api/docs`
Relatório: `https://sites.codigo5.com.br/reports/adops-evidencias-agosto-2026/`

## Regras que nunca podem ser puladas

- Consulte planilha, Drive e API AdOps antes de criar ou publicar.
- Use `campaign-operations/active` para o dia e `campaign-operations/evidence-monthly-source` para o mês. A fonte mensal inclui campanhas encerradas.
- Reutilize campanha, inserção ou anúncio compatível antes de criar outro.
- URL existente ou HTTP 200 não comprovam auditoria.
- Aceite somente evidência auditada, acessível e sem bloqueios.
- Captura é serial; exportações podem usar concorrência controlada.
- Empacotamento não captura, repara ou reaudita.
- Preserve o PNG canônico; comprima somente a cópia de entrega.
- Polling usa `/progress`; carregue o job completo apenas no final ou diagnóstico.
- Não exponha valores de tokens, cookies, headers ou arquivos `.env`.

## Diagnóstico inicial

```bash
curl -fsSL https://adops-api.codigo5.com.br/api/healthz
curl -fsSL https://adops-api.codigo5.com.br/api/ops/runtime-readiness
curl -fsSL 'https://adops-api.codigo5.com.br/api/campaign-operations/pending-publication?date=YYYY-MM-DD'
```

Na leitura de pendências, prefira `publicationStatus`; `resolutionStatus` permanece como alias compatível. `identityMode=authoritative_pi` confirma também a identidade comercial. `identityMode=operational_identity` pode deixar `publicationStatus=ready_for_publication` sem inventar PI, mas somente quando todos os gates operacionais são únicos e o preflight vivo passa. `commercialIdentityStatus=awaiting_authoritative_pi` continua bloqueando faturamento e ZIP por PI.

A rotina diária começa às 17h30 de Cuiabá com a sincronização da planilha e só depois reconcilia Drive, AdOps e publicação. Às 18h captura somente o dia corrente. Às 22h15 publica o relatório mensal completo. PI 9750/AFL e PI 14771/OMT já são as inserções canônicas `#1854` e `#1841`; nunca devem ser recriadas.

Uma campanha encerrada não aparece em `campaign-operations/active` depois do fim. Isso é correto para a captura diária, mas não para o relatório. Para auditoria mensal, use sempre a fonte mensal e procure também por PI, portal, campaign ID ou insertion ID.

Antes de alterar captura:

```bash
pnpm --dir scripts run audit:capture-rules-integrity
```

## Documentos históricos

Documentos sobre Swarm, EasyPanel, Contabo e a origem OpenClaw continuam disponíveis para auditoria histórica. Eles não vencem este índice, o OpenAPI vivo nem os runbooks marcados como `vigente`.
