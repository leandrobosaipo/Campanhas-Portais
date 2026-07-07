# PRD - AdOps no Mac Mini Portainer

## Objetivo

Migrar o AdOps para o servidor pessoal Código5, reduzindo dependência de VPS/EasyPanel e Cloudflare compute sem interromper operação de campanhas, evidências, runner, Telegram, Drive PI e AdRotate.

## Critérios de sucesso

- API, runner, banco e painel funcionando no Mac Mini via Portainer.
- Cloudflare usado apenas para DNS, Tunnel e Access.
- Banco migrado com contagens iguais nas tabelas críticas.
- Worker/Pages/EasyPanel preservados como rollback por 72h.
- Documentação viva consolidada em `docs/adops/system/`.

## Fora de escopo nesta fase

- Desligar serviços legados sem janela de observação.
- Recriar o AdOps do zero.
- Migrar WordPress/AdRotate dos portais.
- Fazer disparo massivo de Telegram.

## Usuários

- Operador AdOps: precisa ver painel, evidências e fila.
- Operador técnico: precisa rodar deploy, rollback e diagnóstico.
- Agente Codex: precisa de contratos rígidos e comandos auditáveis.
