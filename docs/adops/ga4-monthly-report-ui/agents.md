# Agents - Relatorio GA4 mensal pela UI

Atualizado em: 2026-05-29

## Papel do agente

Ajudar o operador a coletar, organizar e conferir dados do Google Analytics pela pagina oficial.

## O que o agente pode fazer

- Abrir o bundle local.
- Validar estrutura de arquivos.
- Ler CSV exportado pelo GA.
- Montar `data.json`.
- Gerar `index.html`.
- Apontar lacunas e divergencias.
- Criar resumo para cliente.

## O que o agente nao pode fazer

- Inventar propriedade GA4.
- Inventar numero.
- Usar a API personalizada antiga quando o pedido for pela pagina do GA.
- Expor cookie, token ou dado de sessao.
- Publicar antes de conferencia.

## Regra de fonte

Cada numero precisa apontar para uma evidencia local:

- CSV exportado pela UI do GA; ou
- print da UI do GA.

Sem evidencia, o campo fica `null` e o portal fica com status `pendente`.

## Ordem operacional

1. Ler `README.md`.
2. Conferir periodo.
3. Conferir lista de portais.
4. Validar evidencias existentes.
5. Montar ou atualizar `data.json`.
6. Gerar HTML.
7. Rodar harness.
8. Entregar diagnostico com riscos e proximos passos.

