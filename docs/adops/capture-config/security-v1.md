# Security v1 — Configuração de Captura/Auditoria

## Controles
- Token operacional obrigatório nas mutações.
- RBAC por header `x-adops-role`:
  - `viewer`: leitura
  - `operator`: draft/validate
  - `admin`: publish/rollback

## Sanitização
- `slotSelector` e `contextSelector` com allowlist de caracteres e limite de tamanho.
- `articleFallbackUrl` obrigatório em `https` e validado.
- `auditConfig` com limite de payload.

## Rate limit
- Limites por rota de mutação/validação/publicação.
- Resposta `429` com erro padronizado.
- Circuit breaker de validação para evitar exaustão de runtime.

## Auditoria
- Eventos de publicação/rollback em tabela dedicada.
- Versionamento imutável em `capture_rule_versions`.
- Logs com redaction de credenciais.
- Sampling de logs em rotas quentes para reduzir I/O.

## Fallback
- Em falha de infraestrutura de configuração, runtime usa fallback local.
- Fallback não altera regras publicadas.
