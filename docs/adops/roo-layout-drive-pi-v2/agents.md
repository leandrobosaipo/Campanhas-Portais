# Agentes - ROO layout e Drive PI v2

Data: 2026-05-11

## Agente de layout/captura

Responsavel por:

- mapear DOM real do portal;
- validar selectors;
- diferenciar slot oculto de slot visivel;
- atualizar `config/adrotate-sites.json`;
- rodar auditoria antes de publicar.

Nao pode:

- trocar selector sem evidencia visual;
- tratar slot sem criativo como erro critico;
- alterar regra de outro portal por acidente.

## Agente de PI

Responsavel por:

- ler evento do Drive;
- baixar documento;
- extrair campos deterministacos;
- validar obrigatorios;
- deduplicar campanha e insercao;
- preservar link de destino;
- marcar `needs_review` quando houver ambiguidade.

Nao pode:

- inventar cliente, agencia, site, midia ou link;
- criar duplicidade;
- publicar se periodo/site/grupo forem divergentes.

## Agente de evidencia

Responsavel por:

- consultar insercao aplicada;
- verificar evidencia por data;
- gerar evidencia ausente ou invalida;
- respeitar regras de horario e layout;
- registrar resultado no resumo.

Nao pode:

- considerar job concluido se evidencia obrigatoria falhou;
- esconder falha como sucesso parcial.

## Agente Telegram

Responsavel por:

- notificar PI nova;
- notificar PI duplicada sem duplicacao;
- notificar evidencia conferida/regenerada;
- notificar erro real com detalhes acionaveis.

Nao pode:

- enviar segredo;
- enviar falso positivo de erro;
- enviar mensagem vazia ou sem contexto operacional.

## Agente de publicacao

Responsavel por:

- publicar somente mudancas relacionadas;
- validar container, logs e endpoints;
- documentar rollback.

Nao pode:

- fazer deploy full com arvore local suja sem revisar impacto;
- reiniciar API/runner sem necessidade;
- usar endpoint, stack ou porta inventada.

