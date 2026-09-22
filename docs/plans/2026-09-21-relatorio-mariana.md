# Pendências da Mariana — conferência de 21/09/2026

## Resumo simples

Ainda não está tudo resolvido. A correção de código está pronta e revisada, mas não foi publicada: o servidor está com espera elevada de disco, e a consulta para dimensionar o backup não terminou. A produção permanece em `977f5e9`.

- **3217 / Perrengue / Sanear — Inauguração / topo lateral / 17–22/09:** banner publicado. O print de 21/09 continua ausente. A regra que impedia a captura foi corrigida no código, ainda sem deploy.
- **41969 / ROO Notícias / Governo — Crime Ambiental / megabanner topo / 01–18/09:** o arquivo de 18/09 é uma reconstrução feita depois. Não foi encontrado um original comprovado nos logs consultados.
- **Águas Cuiabá:** não houve nova publicação. É necessário confirmar portal, posição e início e ter acesso à pasta correta; o cadastro antigo de julho não confirma a nova campanha de setembro/outubro.

## Prints antigos que precisam de conferência documental

Nas 44 datas abaixo, foram consultadas 281 tentativas pela API. Não foi encontrado original comprovado. As reconstruções permanecem preservadas. Fazer outra imagem hoje não comprova que o anúncio apareceu naquele dia.

| Portal | PI | Campanha | Datas questionadas de setembro |
|---|---|---|---|
| Perrengue | 17408 | Crime Ambiental | 13 a 17 |
| AFL | 14980 | Feminicídio | 15 e 16 |
| ROO Notícias | 41969 | Crime Ambiental | 18 |
| PNMT | 42061 | Dengue | 12 |
| PPMT | 41968 | Crime Ambiental | 16 |
| OMT | 42059 | Dengue | 15 |
| AFL | 3219 | Sanear — Inauguração | 13 a 15 |
| ROO Notícias | 3218 | Sanear — Inauguração | 13 a 15 |
| AFL | 91381 | C Display | 11 a 17 |
| AFL | 91381 | Prestação de Contas | 08 a 16 |
| ROO Notícias | 9773 | Queimadas | 14 a 17 |
| Perrengue | 9772 | Queimadas | 14 a 17 |
| AFL | 9774 | Queimadas | 15 a 17 |

Essa lista trata das 44 divergências de relógio investigadas, não afirma que todas as outras datas do mês estejam prontas. A consulta mais ampla encontrou 86 reconstruções; reconstrução não significa necessariamente erro visual, mas deve continuar identificada.

## O que foi corrigido no código

1. A captura do Perrengue aceita os dois espaços corretos lado a lado, sem aceitar anúncios duplicados, popup ou banners empilhados.
2. O relatório separa captura tecnicamente conferida de reconstrução que precisa de aceite.
3. A origem é vinculada ao arquivo publicado. Uma tentativa posterior não substitui a história do arquivo preservado.
4. A data apresentada vem do registro do servidor, não de texto informado na imagem.

Validação: 75 testes de contratos e relatório, teste DOM, teste PNG, typecheck e builds de API/painel. As 41 regras publicadas passaram, sem erros. Revisão independente concluída.

## O que falta

- **Operação técnica:** verificar capacidade do servidor, fazer backup com restauração de teste, publicar a correção, gerar somente capturas pendentes pela API e conferir os arquivos reais. Não foi iniciado novo job de captura nesta etapa.
- **Relatório público:** publicar a nova versão depois da API; a página atual ainda não contém essa correção.
- **Responsável pelo processo:** verificar se aceita reconstrução identificada ou se exige outro comprovante. Não retirar a faixa nem alterar horários para aparentar original.
- **Águas Cuiabá:** confirmar os dados comerciais indicados acima.

## Mensagem para copiar e enviar

Mariana, o banner da Sanear, PI 3217, já está no Perrengue, no topo lateral, de 17 a 22/09. Os prints ainda estão pendentes.

O print da PI 41969, ROO Notícias, do dia 18/09, foi reconstruído depois. Não encontrei o original daquele dia, então não vou te passar essa imagem como comprovante original.

Águas Cuiabá também continua pendente. Preciso confirmar o portal, a posição e a data de início. Ainda não está tudo resolvido; vou separar o que estiver pronto do que continuar faltando.

Mensagem preparada, não enviada.
