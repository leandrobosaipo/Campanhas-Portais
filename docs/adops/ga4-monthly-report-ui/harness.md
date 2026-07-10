# Harness - Validar pacote GA4 mensal

Atualizado em: 2026-05-29

## Validacao de arquivos

```bash
test -f docs/reports/adops-ga4-maio-2026/index.html
test -f docs/reports/adops-ga4-maio-2026/data.json
test -f docs/reports/adops-ga4-maio-2026/report.json
test -d docs/reports/adops-ga4-maio-2026/evidencias
```

## Validacao de JSON

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/reports/adops-ga4-maio-2026/data.json','utf8')); console.log('data ok')"
node -e "JSON.parse(require('fs').readFileSync('docs/reports/adops-ga4-maio-2026/report.json','utf8')); console.log('report ok')"
```

## Validacao de simulacao

```bash
test -f docs/reports/adops-ga4-maio-2026-simulacao/index.html
test -f docs/reports/adops-ga4-maio-2026-simulacao/data.json
test -f docs/reports/adops-ga4-maio-2026-simulacao/report.json
```

## Gates de aceite

- Existem 6 portais em `data.json`.
- Nenhuma metrica final esta preenchida sem evidencia.
- `period.start` e `period.end` batem com maio/2026.
- HTML nao contem token, cookie, header ou email sensivel.
- HTML deixa claro o que e dado real e o que e lacuna.

## Comando de sanidade simples

```bash
node - <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('docs/reports/adops-ga4-maio-2026-simulacao/data.json', 'utf8'));
if (data.portals.length !== 6) throw new Error('esperado 6 portais');
if (data.period.start !== '2026-05-01') throw new Error('inicio errado');
if (data.period.end !== '2026-05-31') throw new Error('fim errado');
console.log('simulacao ok');
NODE
```

