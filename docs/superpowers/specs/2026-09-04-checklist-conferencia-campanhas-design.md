# Checklist de conferência das campanhas incompletas

## Objetivo

Adicionar ao relatório dinâmico oficial `/reports/adops-evidencias/` um checklist simples por campanha incompleta. O operador confirma o que recebeu e o que precisa ser corrigido; o sistema devolve uma orientação textual, sem alterar planilha, Drive, AdOps ou AdRotate.

## Escopo

- Mostrar o checklist somente em campanhas com mídia, cadastro, publicação ou evidência pendente, divergente ou bloqueada.
- Usar apenas dados já retornados pelas APIs operacionais do AdOps.
- Permitir respostas múltiplas e ajustes manuais durante a sessão do navegador.
- Gerar um resumo copiável com as correções e a ordem segura de execução.
- Não persistir respostas, editar fontes, vincular mídia, publicar anúncios ou iniciar jobs.

## Interface

Cada campanha incompleta recebe o botão `Conferir pendências`. O botão abre um modal com:

1. identificação da campanha, PI, portal, período e formato;
2. estado detectado automaticamente em planilha, Drive, AdOps, AdRotate e evidências;
3. caixas de seleção editáveis;
4. botão `Gerar orientação`;
5. texto final copiável.

Checklist disponível:

- Dados da PI conferidos.
- Portal correto.
- Período correto.
- Formato ou posição corretos.
- Mídia recebida.
- Arquivo correto localizado no Drive.
- Planilha precisa ser corrigida.
- Cadastro do AdOps precisa ser corrigido.
- Pronta para publicação.
- Precisa confirmar com a agência.

## Preenchimento automático

O relatório sugere o estado inicial com base na API, mas não transforma hipótese em confirmação:

- PI, portal, período e formato são marcados somente quando a identidade canônica estiver confirmada e sem divergência correspondente.
- `Mídia recebida` é marcada quando houver mídia vinculada no AdOps ou arquivo inequívoco no Drive.
- `Arquivo correto localizado no Drive` exige correspondência única de identidade e formato; candidatos ambíguos permanecem desmarcados.
- `Pronta para publicação` exige identidade, período, formato, mídia e grupo AdRotate válidos, além de ausência de bloqueios.
- Itens que dependem de decisão humana nunca são marcados automaticamente.

Ao lado de cada sugestão deve aparecer uma origem curta, como `Planilha`, `Drive`, `AdOps` ou `Verificação pública`.

## Orientação gerada

O texto será determinístico e organizado em quatro blocos:

- `Confirmado`: itens marcados como corretos.
- `Corrigir na planilha`: campos divergentes ou explicitamente indicados pelo operador.
- `Corrigir no AdOps`: mídia, formato, período, inserção ou relação AdRotate pendentes.
- `Antes de publicar`: bloqueios restantes e confirmações que dependem da agência.

Se `Pronta para publicação` estiver marcada sem que os requisitos mínimos estejam confirmados, o resumo apontará a contradição e manterá a campanha bloqueada. A orientação não afirmará que uma alteração foi executada.

## Estado e segurança

As respostas vivem somente em memória no navegador enquanto a página estiver aberta. Trocar filtros ou atualizar os dados pode descartar as respostas; a interface deve avisar isso. Nenhum valor será enviado para a API.

Links existentes para planilha, Drive, AdOps e portal poderão ser exibidos como atalhos, mas o formulário não acionará mutações.

## Tratamento de ausência e erro

- Campo ausente será apresentado como `Não informado`.
- Fonte indisponível será apresentada como `Não foi possível consultar`, sem assumir ausência do dado.
- Correspondência ambígua será apresentada como bloqueio de confirmação.
- Campanha duplicada ou substituída não receberá checklist próprio; será tratada pela seleção canônica do relatório.

## Validação

- Teste unitário das regras que transformam o estado operacional em sugestões.
- Teste unitário do texto gerado para campanha pronta, mídia ausente, Drive ambíguo e divergência de formato.
- Teste de interface para múltiplas respostas, aviso de sessão e cópia da orientação.
- Build do relatório e da API, se houver alteração de contrato.
- Validação no navegador autenticado usando campanhas reais incompletas, sem enviar mutações.
- Evidência visual do modal e do resumo gerado no relatório público.

## Critério de conclusão

A entrega estará concluída quando cada campanha incompleta puder gerar uma orientação coerente e copiável, baseada no estado vivo das fontes, e quando a validação de rede comprovar que o checklist não realizou requisições de escrita.
