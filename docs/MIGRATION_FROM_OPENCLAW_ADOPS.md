# Migração — OpenClaw para Projeto Codex AdOps

## Data

2026-05-07

## Origem

```bash
/Users/leandrobosaipo/.openclaw/Campanhas-Portais
```

## Destino

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

## Estratégia

Foi feita cópia operacional limpa, sem apagar a origem.

Motivo:

- a operação em produção ainda podia depender de caminhos antigos em docs, scripts ou automações;
- apagar a origem seria destrutivo;
- o novo projeto precisa funcionar primeiro como fonte principal no Codex.

## Incluído

- Código do frontend.
- Código da API.
- Libs locais.
- Scripts de sync, AdRotate, prints e auditoria.
- Configuração `config/adrotate-sites.json`.
- Docs, PRDs, SPECS, HARNESS e runbooks.
- Operações Cloudflare/VPS/Telegram/WordPress.
- Arquivos `.env` locais.
- Histórico Git local copiado.

## Excluído

- `node_modules`
- `tmp`
- `tmp-playwright`
- `test-results`
- `.tmp-shots`
- relatórios pesados em `docs/harness-reports`
- caches de Wrangler

## Comando usado

```bash
rsync -a --delete \
  --exclude 'node_modules' \
  --exclude '*/node_modules' \
  --exclude '.wrangler/tmp' \
  --exclude 'tmp' \
  --exclude 'tmp-playwright' \
  --exclude 'test-results' \
  --exclude '.tmp-shots' \
  --exclude '.DS_Store' \
  --exclude 'docs/harness-reports' \
  --exclude 'scripts/docs/harness-reports' \
  /Users/leandrobosaipo/.openclaw/Campanhas-Portais/ \
  /Users/leandrobosaipo/Projetos/AdOps/
```

## Validações obrigatórias pós-migração

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
pnpm --dir scripts run audit:capture-rules-integrity
node --check scripts/src/capture-insertion-proof.cjs
```

## Próximo passo recomendado

Atualizar gradualmente docs e scripts que ainda citam:

```bash
/Users/leandrobosaipo/.openclaw/Campanhas-Portais
```

para:

```bash
/Users/leandrobosaipo/Projetos/AdOps
```

Não fazer substituição cega em arquivos de histórico. Priorizar runbooks vivos e scripts executáveis.
