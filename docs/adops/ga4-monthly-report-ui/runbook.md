# Runbook - Executar fechamento GA4 pela pagina

Atualizado em: 2026-05-29

## Antes de abrir o GA

```bash
cd /Users/leandrobosaipo/Projetos/AdOps
mkdir -p docs/reports/adops-ga4-maio-2026/evidencias
```

## Coleta por portal

Para cada portal:

1. Abrir Google Analytics.
2. Selecionar a propriedade correta.
3. Definir periodo:

```text
01/05/2026 ate 31/05/2026
```

4. Conferir o dominio.
5. Exportar CSV.
6. Tirar print.
7. Salvar com nome padronizado.

Nomes:

```text
PERRENGUE-ga4-maio-2026.csv
PERRENGUE-ga4-maio-2026.png
OMT-ga4-maio-2026.csv
OMT-ga4-maio-2026.png
AFL-ga4-maio-2026.csv
AFL-ga4-maio-2026.png
PNMT-ga4-maio-2026.csv
PNMT-ga4-maio-2026.png
PPMT-ga4-maio-2026.csv
PPMT-ga4-maio-2026.png
ROO-ga4-maio-2026.csv
ROO-ga4-maio-2026.png
```

## Campos a preencher

Preencher `data.json` com:

- usuarios ativos;
- novos usuarios;
- sessoes;
- visualizacoes;
- visualizacoes por usuario;
- tempo medio de engajamento;
- taxa de engajamento;
- cidades principais, se coletado.

## Onde salvar

Simulacao ja criada:

```text
docs/reports/adops-ga4-maio-2026-simulacao/
```

Fechamento real de segunda:

```text
docs/reports/adops-ga4-maio-2026/
```

Se for publicar depois:

```text
https://sites.codigo5.com.br/reports/adops-ga4-maio-2026/
```

Publicacao so deve ocorrer depois de conferencia dos dados.

## Checklist curto

- [ ] 6 portais revisados.
- [ ] Periodo de maio visivel.
- [ ] Dominio conferido.
- [ ] CSV salvo.
- [ ] Print salvo.
- [ ] Numeros preenchidos sem chute.
- [ ] Lacunas marcadas como lacuna.
- [ ] HTML final revisado no navegador.

