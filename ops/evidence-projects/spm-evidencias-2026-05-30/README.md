# Projeto SPM Evidencias 2026-05-30

Objetivo: gerar ZIPs completos com evidencias auditadas para as PIs pedidas pela Mariana.

## Etapas

1. Hoje: AFL / PI 14354 / Feminicidio.
2. Hoje as 15:00 Cuiaba: OMT PI 14414, Perrengue PI 15948, Perrengue PI 16091, PPMT PI 14357 e ROO PI 14355, usando evidencia final ate 2026-05-30.
3. Para cada insercao:
   - localizar o periodo real da insercao;
   - validar cada dia do periodo ate a data alvo;
   - regenerar evidencia faltante ou invalida;
   - revalidar auditoria;
   - baixar somente PNGs auditados;
   - montar ZIP em Downloads;
   - enviar ao Telegram quando configurado.

## Comandos

Rodar hoje:

```bash
node ops/evidence-projects/spm-evidencias-2026-05-30/run.mjs today
```

Rodar pacote agendado das 15h:

```bash
node ops/evidence-projects/spm-evidencias-2026-05-30/run.mjs scheduled-15h --telegram --telegram-evidences
```

Wrapper usado pelo LaunchAgent:

```bash
ops/evidence-projects/spm-evidencias-2026-05-30/run-scheduled-15h.sh
```
