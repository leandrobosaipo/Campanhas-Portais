# Agents - Relatorio mensal de evidencias AdOps

## Papel do agente

Atualizar o relatorio publico do mes corrente com dados reais do AdOps, sem mutar campanhas, insercoes, AdRotate ou planilha.

## Fluxo obrigatorio

1. Validar stack local e `scripts/package.json`.
2. Rodar `node --check`.
3. Rodar `audit:capture-rules-integrity`.
4. Gerar local com `ADOPS_REPORT_SKIP_PUBLISH=1`.
5. Conferir `docs/reports/<slug>/data.json`.
6. Validar Portainer:

```bash
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh status
bash /Users/leandrobosaipo/.agents/skills/portainer/portainer.sh endpoints
```

7. Publicar com `report:evidences-current-month`.
8. Validar HTTP 200 publico.

## Guardrails

- Nao expor `OPS_API_TOKEN`, `PORTAINER_API_KEY` ou headers.
- Nao usar `printGerado` como aprovacao de evidencia.
- Nao chamar rotas de mutacao.
- Usar exclusivamente a fonte mensal da API AdOps; nunca acessar a planilha diretamente nem usar fallback para a fonte ativa.
- Manter campanhas encerradas no documento mesmo quando a interface abrir filtrada em `Ativas`.
- Restaurar somente com evidências já armazenadas; não criar jobs de print.
- Antes das 18h e durante a rotina diária, retirar o dia corrente do corte de pendências.
- Nao tratar insercao futura como pendente.
- Nao tratar insercao sem publicacao no site como pendente de evidencia.
- Quando houver `pendente`, abrir o modal ou `data.json` e informar as datas exatas.
- Quando houver `erro`, informar status e issue retornada por `capture-proof/status`.
- Nao publicar fora do `sites-index`.
- Quando o portal mostrar o banner mas o AdOps marcar `sem publicação`, nao gere evidencia primeiro. Corrija metadata da insercao e regra publicada de captura, rode a integridade, e so entao gere retroativos.

## Quando houver divergencia

- Se API e HTML divergirem, confiar na API e regenerar.
- Se evidencia falhar, registrar como pendente ou erro. Nao aprovar manualmente.
- Se Portainer falhar, manter artefato local e registrar bloqueio.
