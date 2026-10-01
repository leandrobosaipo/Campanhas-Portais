# Competência e downloads do relatório dinâmico

Alvo: https://sites.codigo5.com.br/reports/adops-evidencias/.
Base: main `de0744fd33f505b18eac24e19c0ec7547f1c6a27`; API operacional
`d2c2796184b25ddd3b0e98eea5c50ade651215b2`. Ambas preservam por ancestralidade
a release `a1e66fe007f878a9153a4c82260ca217f6d78e3d` e seus sete commits anteriores.

## Implementação e compatibilidade

1. Manter um único campo de competência visível no topo de todas as telas,
   com alvo de toque de 44 px. Preservar o relatório e os modais existentes.
2. Gravar competência explicitamente na URL, separada da busca; mudanças
   aplicadas criam histórico. Voltar/Avançar restauram filtros antes da consulta.
   Uma resposta vazia não remove o portal selecionado. O mês inicial continua
   calculado em America/Cuiaba; reload mantém a competência selecionada.
3. Identificar competência/filtros no estado vazio. Downloads individuais
   identificam data e uma captura; o ZIP identifica datas e quantidade conferida.
4. Usar a API assíncrona PI/site existente com `requiredDatesByInsertion` e
   `asOfDate`. O runner já restringe inserções e datas e não recupera capturas
   nesse fluxo. Manter autenticação, permissões, contratos e painel existentes.
5. Bloquear o ZIP quando existem dias sem captura tecnicamente aceita. A chave
   v2 usa SHA-256 do mês, corte, parâmetros e manifesto ordenado de evidências.
   O corte de meses encerrados é estável no último dia do mês; a resposta do job
   precisa corresponder às inserções solicitadas antes de oferecer o download.

## Reutilização e proveniência

Pedidos idênticos com a chave v2 podem reaproveitar jobs concluídos pela
deduplicação existente. Chaves antigas por mês/PI/portal não são reutilizadas:
não identificam datas nem versões dos arquivos. A API não oferece índice para
descobrir ou validar o escopo desses ZIPs legados. A UI só anuncia reutilização
quando o POST devolve `duplicate`; não promete descoberta do acervo antigo.
O ZIP existente da PI 9783 de 23–30/09 permanece preservado e foi verificado
separadamente. Um pacote de 23–29/09 não é apresentado como completo até 30/09.

Não se criam capturas para estes testes. Originais, reconstruções, datas reais,
datas representadas e auditoria continuam preservados. A aceitação técnica no
sistema não implica aprovação externa nem prova factual da veiculação passada.

## Gates e publicação

- Contratos locais: escopo, fonte alterada, cache estável, datas ausentes,
  resposta com inserções incorretas e credenciais cross-origin.
  A fixture de agenda do módulo mensal anterior fixa `ADOPS_REPORT_DATE` em
  04/09/2026, preservando a verificação de oito dias até 12/09 sem depender
  do relógio de execução; o código desse módulo permanece inalterado.
- Chrome isolado: 390/430/768/1366 px, campanha com oito dias, toque, overflow,
  filtros, histórico, reload, login e virada de mês às 04:00 UTC em Cuiabá.
  Esses testes não equivalem a Safari/iOS em aparelho físico.
- Revisão Luna, diff limpo, CI do SHA exato do PR e da main integrada.
- Publicar somente HTML pelo publicador canônico; não redeploy da API.
  O publicador faz troca atômica e mantém a pasta anterior como backup.
- Canary: leitura pública igual ao artefato; API saudável; fonte mensal viva;
  oito datas da PI 9783, PNG de 30/09 e ZIP existente com hashes preservados;
  sete evidências Perrengue e seis reconstruções OMT anteriores inalteradas.

## Rollback

Antes de publicar, registrar hash e backup do HTML atual. Se leitura pública,
login, competência ou canário falharem, restaurar esse HTML pelo mesmo
publicador e verificar HTTP/conteúdo. API, banco, storage e jobs não são
alterados nesta publicação; não reaplicar deploy de API para este rollback.
