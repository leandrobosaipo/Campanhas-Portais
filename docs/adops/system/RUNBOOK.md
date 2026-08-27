# How-to — Produção, manutenção e rollback AdOps

> Estado: vigente
> Público: mantenedores e agentes operacionais
> Última validação: 2026-08-12
> Release: 47e0dab
> Fonte autoritativa: Portainer endpoint 3, runtime readiness, compose versionado e Worker publicado

## Topologia vigente

```text
painel web ───────┐
                  ├→ API Node/PostgreSQL
Worker público ───┘       │
                          ├→ runner geral
                          ├→ runner de prints/exportações
                          └→ monitor do Drive

relatórios → staging → sites-index → URL pública
```

| Componente | Responsabilidade |
|---|---|
| API | contratos, dados canônicos e materialização protegida |
| PostgreSQL | persistência operacional |
| Worker | API pública, D1, fila, cron e proxy controlado |
| runner geral | sync, backfill, reconciliação e relatório |
| runner de prints/exportações | browser serial e exportações concorrentes |
| Drive monitor | inventário e resolução de PI/mídia |
| sites-index | catálogo e relatórios diretos |
| Portainer | stacks, volumes, logs, deploy e rollback |

## Diagnóstico seguro

```bash
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh status
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh endpoints
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh ps --endpoint 3 --filter adops
curl -fsSL https://adops-api.codigo5.com.br/api/healthz
curl -fsSL https://adops-api.codigo5.com.br/api/ops/runtime-readiness
```

Consulte fila resumida e heartbeat antes dos logs. Runner ocupado não é runner parado. Job sem progresso por mais de um heartbeat exige inspeção; não reenvie automaticamente.

## Deploy versionado

1. Registre SHA ativo, imagens, stack e volumes.
2. Faça backup dos arquivos/volumes que serão substituídos.
3. Rode testes e builds do repositório.
4. Publique somente compose e volumes versionados pelo runbook real em `ops/portainer/adops-stack/`.
5. Releia a stack persistida no Portainer.
6. Confirme health, readiness, filas e consumidor público.
7. Registre SHA, destino e evidência de leitura.

Não use `docker cp` como release persistente. Um timeout do Portainer não prova falha: releia stack, task/container, imagem e health antes de decidir rollback.

## Worker

Publique pelo projeto e configuração versionados em `ops/cloudflare-public-api`. Use o script real do pacote/wrangler, valide o deployment id e leia uma rota pública e uma rota protegida. Nunca exponha secrets do Worker.

Referência datada de 2026-08-12: Worker `a6784158-c39c-4fe5-9222-ded850daadb6`, associado à release 47e0dab.

## Relatórios

O publicador gera staging, valida o conjunto e troca o diretório atomicamente. O catálogo ignora `visibility: "unlisted"`, mas o link direto continua acessível. O diretório anterior é o rollback.

## Incidentes

| Sintoma | Diagnóstico | Ação segura |
|---|---|---|
| API sem health | logs e PostgreSQL | restaurar imagem anterior se regressão confirmada |
| runner sem heartbeat | readiness, fila, container | reiniciar somente o alvo exato |
| jobs D1 ausentes da visão | conferir Worker e fonte da listagem | não duplicar job |
| POST 401 | contrato de autenticação e proxy | corrigir header no servidor, nunca no cliente público sem necessidade |
| ZIP parado | claim, runner dedicado e heartbeat | preservar descritor/fingerprint |
| relatório inválido | staging e validadores | manter versão pública anterior |
| Portainer timeout | reler estado persistido | só reverter se artefato ativo estiver incorreto |

## Rollback

- Aplicação: redeploy da imagem/tag anterior e compose compatível.
- Worker: publicar a versão anterior do código/configuração.
- Relatório: restaurar o backup completo do diretório, não arquivos isolados.
- Cron: restaurar a configuração anterior e confirmar próxima execução.
- Banco: migrações exigem plano coordenado; não remova volumes.

Depois do rollback, valide health, readiness, uma leitura AdOps, uma evidência e o consumidor público.

## Segurança

- arquivos `.env` com acesso restrito;
- relatórios mostram somente nome da variável e `presente/ausente`;
- tokens, cookies e headers nunca entram em Git, logs compartilhados ou HTML;
- mutações validam entrada, autenticação, idempotência e alvo exato.

Documentos de Swarm, EasyPanel e Contabo permanecem históricos. Não são fonte de deploy vigente.
