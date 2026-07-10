# Playbook - Fechamento GA4 mensal

Atualizado em: 2026-05-29

## Cenario A - Fechamento normal

1. Abrir Google Analytics.
2. Selecionar a propriedade do portal.
3. Ajustar periodo: `01/05/2026 - 31/05/2026`.
4. Conferir se o dominio do portal aparece na propriedade correta.
5. Exportar CSV da tela principal.
6. Tirar print com periodo visivel.
7. Salvar em `docs/reports/adops-ga4-maio-2026/evidencias/`.
8. Repetir para os 6 portais.
9. Preencher `data.json`.
10. Gerar `index.html`.

## Cenario B - Propriedade nao encontrada

1. Nao inventar numero.
2. Marcar portal como `lacuna`.
3. Salvar print da tela onde a propriedade nao foi encontrada, se isso nao expuser dado sensivel.
4. Registrar o que falta: acesso, propriedade, conta ou confirmacao de nome.

## Cenario C - GA mostra mais de uma propriedade parecida

1. Conferir dominio.
2. Conferir stream web.
3. Conferir se houve trafego em maio.
4. Usar somente a propriedade que bate com o portal.
5. Se ainda houver duvida, marcar `revisao` e nao fechar numero.

## Cenario D - Numero divergente de PDF antigo

1. Priorizar a UI do Google Analytics.
2. Guardar o PDF antigo apenas como referencia.
3. Registrar divergencia no relatorio.
4. Nao misturar fontes no total final.

