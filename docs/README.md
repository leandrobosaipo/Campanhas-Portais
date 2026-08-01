# AdOps - Hub operacional

Este diretorio e o indice central do AdOps em `/Users/leandrobosaipo/Projetos/AdOps`.

## Comece aqui

- [START_HERE_ADOPS.md](START_HERE_ADOPS.md) - leitura inicial e comandos principais.
- [PROJECT_MAP_ADOPS.md](PROJECT_MAP_ADOPS.md) - mapa tecnico do repositorio.
- [runbook-nova-pi-evidencias.md](runbook-nova-pi-evidencias.md) - passo a passo atual para cadastrar PI, sincronizar AdOps/AdRotate/planilha, gerar evidencias atuais/retroativas, auditar e entregar relatorio.
- [adops/system/](adops/system/) - hub canonico atual para arquitetura, contratos, migracao Portainer, harness e runbook.
- [adops/pi-automation-v3/](adops/pi-automation-v3/) - pacote oficial da automacao de PI, Drive, WhatsApp, e-mail, planilha, AdRotate e evidencias retroativas.
- [adops/campaign-input-resolution.md](adops/campaign-input-resolution.md) - referência e guias para variações de posições da planilha e estruturas de materiais no Drive.
- [adops/campaign-operations-api.md](adops/campaign-operations-api.md) - contrato read-only que cruza planilha, Drive, AdOps, AdRotate e evidências.

## Documento oficial atual

Use `adops/system/` para decisoes novas sobre arquitetura, infraestrutura, contratos e operacao geral:

- [System README](adops/system/README.md)
- [PRD](adops/system/PRD.md)
- [SDD](adops/system/SDD.md)
- [SPEC](adops/system/SPEC.md)
- [Contracts](adops/system/CONTRACTS.md)
- [Harness](adops/system/HARNESS.md)
- [Runbook](adops/system/RUNBOOK.md)
- [Playbook](adops/system/PLAYBOOK.md)
- [Prompts](adops/system/PROMPTS.md)

Use o pacote v3 para qualquer decisao nova especifica sobre intake de PI:

- [PRD](adops/pi-automation-v3/prd.md)
- [Blueprint](adops/pi-automation-v3/blueprint.md)
- [SDD](adops/pi-automation-v3/sdd.md)
- [Spec](adops/pi-automation-v3/spec.md)
- [Harness](adops/pi-automation-v3/harness.md)
- [Tests](adops/pi-automation-v3/tests.md)
- [Playbook](adops/pi-automation-v3/playbook.md)
- [Runbook](adops/pi-automation-v3/runbook.md)
- [Prompts](adops/pi-automation-v3/prompts.md)

Use o runbook operacional curto quando a pergunta for "onde esta cada coisa?" ou "como cadastro uma PI agora?":

- [Nova PI, evidencias atuais e retroativas](runbook-nova-pi-evidencias.md)

## Fontes antigas

Documentos v1/v2 continuam como historico e referencia de implementacao anterior. Eles nao devem ser apagados porque guardam contexto operacional, simulacoes e decisoes passadas.

- `docs/prd-pi-import-v1.md`
- `docs/spec-pi-import-v1.md`
- `docs/harness-pi-import-v1.md`
- `docs/harness-drive-pi-monitor-v1.md`
- `docs/drive-pi-credential-runbook.md`
- `docs/adops/roo-layout-drive-pi-v2/`

Quando houver divergencia, a ordem e:

1. PI em PDF/e-mail.
2. Pasta Drive da PI.
3. Planilha.
4. AdOps.
5. AdRotate/portal.
6. WhatsApp como evidencia operacional quando a midia chegou fora do Drive.
