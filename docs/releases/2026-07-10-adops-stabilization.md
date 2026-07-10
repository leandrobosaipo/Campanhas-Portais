# AdOps 2026-07-10 - Estabilização, Drive e CI/CD

## Resumo

Esta release transforma a branch operacional em uma baseline implantável pela `main`.

## Recursos

- OpenAPI como fonte dos schemas Zod e do cliente React.
- `pnpm run typecheck` obrigatório e limpo em API, painel e scripts.
- Snapshot transacional do Google Drive no PostgreSQL.
- Refresh idempotente pela fila operacional.
- Compatibilidade de `refreshDrive=true` sem credencial na API pública.
- Modo `legacy` para rollout e rollback; modo final `monitor`.
- CI para codegen, tipos, builds, Drive, captura, Compose e secrets.
- Deploy de imagens imutáveis pelo Portainer com backup e smoke público.

## API

```text
GET  /api/ops/drive-inventory/status
POST /api/ops/jobs/drive-inventory-refresh
GET  /api/campaign-operations/active?refreshDrive=true
```

O endpoint de campanhas inclui `snapshotStatus`, `snapshotAt`, `snapshotAgeSeconds`, `stale` e `refreshJobId`.

## Segurança

- A API pública não recebe conta de serviço, access token ou refresh token do Drive.
- O monitor permanece na rede Docker interna.
- O deploy exige CI verde e disparo manual no ambiente GitHub `production`; required reviewers e branch protection não estão disponíveis no plano atual do repositório privado.
- O job usa runner GitHub-hosted e recebe apenas as credenciais do Portainer pelo ambiente protegido. As demais variáveis são lidas do stack atual para um arquivo temporário removido ao final.
- Secrets não são registrados em logs, documentação ou artefatos.

## Rollout

1. Implantar com `DRIVE_INTEGRATION_MODE=legacy`.
2. Atualizar o snapshot e comparar com o índice legado.
3. Validar PDF, TXT, GIF, imagem e vídeo.
4. Alterar para `monitor`.
5. Remover a credencial do runner somente após o smoke final.

## Rollback

Reimplantar a tag anterior e definir `DRIVE_INTEGRATION_MODE=legacy`. A migração do inventário é aditiva.
