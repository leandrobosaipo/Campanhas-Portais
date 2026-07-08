# Base de Conhecimento do Projeto

## Objetivo deste documento

Consolidar tudo o que o projeto aprendeu até aqui sobre:

- operação da agência
- estrutura dos dados
- regras de negócio
- comportamento das PIs
- decisões já tomadas no produto
- pontos ainda abertos para validação com o cliente

Este documento deve servir como memória de projeto para:

- produto
- desenvolvimento
- implantação
- operação
- automação futura

## 1. Contexto operacional confirmado

O controle atual da agência nasce em múltiplos canais:

- e-mail
- WhatsApp
- planilha manual

O sistema precisa substituir a planilha como ferramenta principal de gestão operacional, sem perder a flexibilidade manual.

## 2. Fontes de verdade já analisadas

### Planilha histórica

A planilha histórica confirmou:

- organização por competência mensal
- blocos por site dentro de cada aba
- múltiplas inserções por campanha
- uso recorrente de mesmos clientes, agências, formatos e sites
- presença de grafias inconsistentes em cadastros

Competências históricas analisadas:

- `JULHO/2025`
- `AGOSTO/2025`
- `SETEMBRO/2025`
- `OUTUBRO/2025`
- `NOVEMBRO/2025`
- `DEZEMBRO/2025`
- `JANEIRO/2026`
- `FEVEREIRO/2026`
- `MARÇO/2026`
- `ABRIL/2026`

### PIs modelo analisadas

Documentos lidos:

- `/Users/leandrobosaipo/Downloads/PI-modelo/PI 89011 - SITE PERRENGUE MATO GROSSO  CUIABA -31-03-2026_175152_206-6583.pdf`
- `/Users/leandrobosaipo/Downloads/PI-modelo/SECOM - Programa Fila Zero Na Cirurgia - Site Perrengue MT - PI 14028 - Aceite.pdf`

Essas PIs foram tratadas como referência real de operação.

### Nova fonte operacional consolidada

Além da extração estática em Markdown, o projeto agora também lê a planilha mais recente via `.xlsx` para sincronização incremental durante a implantação.

## 2.1. Limite atual deliberado

Nesta fase do projeto:

- o AdOps já gerencia inserções
- já sincroniza com planilha
- já concilia com AdRotate
- já gera e audita prints

Mas ainda **não** monitora e-mails automaticamente.

Essa próxima fase foi apenas planejada e documentada em:

- [plano-integracao-email-pi-adrotate.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plano-integracao-email-pi-adrotate.md)

Motivo:

- ainda falta validar o documento-modelo final
- ainda falta decidir credenciais e estratégia de múltiplas caixas por portal

Isso revelou uma diferença importante entre:

- `competência da aba`
- `período real da inserção`

Essa diferença é crítica porque algumas linhas aparecem em uma aba mensal, mas o período da inserção está totalmente contido em outro mês.

## 3. Estrutura operacional já confirmada

### Entidade principal

A entidade operacional principal do sistema é a `inserção`.

Motivo:

- uma campanha pode gerar várias inserções
- uma PI pode gerar várias inserções
- uma mesma campanha pode ter vários sites
- uma mesma campanha pode ter vários formatos
- uma mesma campanha pode ter períodos diferentes por linha

### Hierarquia operacional

Hierarquia mais fiel ao negócio:

1. `PI / Demanda`
2. `Campanha`
3. `Inserções`
4. `Evidências`

## 4. Regras de status já confirmadas

### Legado da planilha

- `V` = `concluído`
- `processo enviado?` = `publicado no site`
- `processo realizado?` = `enviado para agência/cliente`
- `docs enviados?` = etapa posterior ao envio principal

### Fluxo operacional normalizado

1. `aguardando_publicacao`
2. `publicado_no_site`
3. `aguardando_print`
4. `print_gerado`
5. `enviado_para_agencia`
6. `docs_enviados`
7. `concluido`

## 5. Regras de prazo já confirmadas

- `print` é obrigatório para toda inserção
- `print` só atrasa se não for registrado dentro do próprio período da inserção
- `envio para agência` atrasa em `D+1` após o fim do período
- `docs enviados` atrasa em `D+1` após o fim do período
- `cadastro interno` foi definido como `D+1` do recebimento ou, na ausência desse campo, `D+1` do início do período

## 5.1. Regra aprendida sobre print do dia

O sistema agora considera três estados operacionais diferentes para a captura do dia:

- `pronto para gerar`
- `print salvo`
- `print auditado`

Conclusões confirmadas:

- se o print do dia já existe e a URL responde corretamente, o botão deve indicar `print auditado`
- o sistema não deve sobrescrever automaticamente um print válido já salvo no mesmo dia
- para substituir o print do dia, a equipe precisa primeiro excluir a evidência antiga ou salvar manualmente outro link

## 6. Competência e navegação padrão

Ficou definido que:

- dashboard deve abrir na competência corrente
- campanhas devem abrir filtradas na competência corrente
- inserções devem abrir filtradas na competência corrente

Motivo:

- esse é o recorte operacional mais usado
- reduz cliques no dia a dia

## 6.1. Regra aprendida sobre competência x período

O projeto aprendeu que existem três cenários diferentes:

1. a inserção pertence claramente à mesma competência da aba
2. a inserção cruza meses
3. a inserção aparece em uma aba, mas o período inteiro está em outro mês

Exemplo real encontrado:

- `ATUALIZAÇÃO SUS`
  - linha `08/04 - 30/04` continua em `ABRIL/2026`
  - linha `01/05 - 07/05` não pode continuar em `ABRIL/2026`; ela foi corrigida para `MAIO/2026`

Conclusão operacional:

- a competência da aba não pode ser aplicada cegamente a todas as linhas
- quando a linha estiver totalmente em outro mês, a competência operacional da inserção deve seguir o período real
- quando a linha cruza meses, ainda existe regra de negócio a confirmar com a operação

Estado atual do projeto:

- erros reais de parse de data: `0`
- divergências ainda abertas de competência cruzando meses: `5`

Essas divergências restantes não são bugs técnicos de data; são casos que precisam de regra de negócio validada.

## 7. Regras visuais e de consistência

Ficou consolidado no projeto que:

- cores de status devem ser globais
- classes de badge devem ser globais
- nomenclaturas operacionais devem ser globais
- regras de cobertura de print devem ser globais
- classificação de mídia deve ser global

Isso já está refletido na configuração:

- [adops-config.ts](/Users/leandrobosaipo/Projetos/AdOps/artifacts/adops/src/lib/adops-config.ts)

## 7.1. Perfis operacionais parametrizados

O projeto passou a ter uma camada global para resolver requisitos por:

- agência
- cliente

## 7.2. Configuração global por portal para captura e auditoria

Ficou consolidado que print e auditoria **não** podem assumir o mesmo comportamento para todos os sites.

Cada portal pode divergir em:

- seletor de data/hora
- layout da home
- posição do banner
- página usada para validação
- presença de consentimento de cookies
- tempo necessário para GIF ou lazy-load
- necessidade de `trim` da viewport
- necessidade de inset do banner validado

Essas regras passaram a viver em:

- [adrotate-sites.json](/Users/leandrobosaipo/Projetos/AdOps/config/adrotate-sites.json)

Regras já parametrizadas:

- `pageDateSelectors`
- `auditConfig`
- `auditOverrides`
- `consentConfig`
- `adminBaseUrl`

### Regra aprendida sobre consentimento de cookie

A automação de fechamento de consentimento não pode clicar genericamente em qualquer botão com texto como:

- `continuar`
- `ok`
- `prosseguir`

Motivo:

- isso pode abrir matéria ou navegar para outra página

### Regra aprendida sobre anúncios expirados no AdRotate

O AdRotate pode preencher o slot com um banner-modelo quando o anúncio da campanha expira.

Isso muda a leitura operacional do gerador de prints:

- placeholder do tipo `ANUNCIE AQUI` não deve ser tratado como “criativo sumiu sem explicação”
- se a data capturada já estiver fora do período da inserção, o erro correto é:
  - anúncio expirado + AdRotate exibindo placeholder
- para esses casos, a orientação correta é:
  - gerar print retroativo dentro do período
  - ou revisar o vínculo histórico do anúncio no admin

Caso real consolidado:

- `AFL / inserção 863 / ad 20`
- o grupo interno `14` ainda contém o anúncio real e o anúncio-modelo
- porém o anúncio histórico ficou sem schedule funcional no AdRotate
- resultado prático:
  - o preview retroativo serve apenas o placeholder
  - o gerador deve acusar problema histórico do AdRotate, não falha genérica da captura

Atualização posterior do mesmo caso:

- o anúncio `20` foi reparado no banco com:
  - `group 14 -> schedule 34`
  - `type` reativado para teste
- o plugin AdRotate também foi ajustado para:
  - permitir `expired` no SQL quando o preview retroativo estiver ativo
  - excluir `fallback_model = 1` da seleção principal, deixando-o só para fallback

Mesmo assim, nas matérias retroativas testadas da AFL:

- o grupo `.g.g-14` não apareceu no HTML das matérias
- a data retroativa apareceu corretamente no portal

Conclusão refinada:

- o caso `863` não depende mais só do AdRotate
- também existe uma camada de template/página interna da AFL onde o slot interno não está sendo renderizado nas matérias retroativas testadas

## 2026-04-13 — AFL 863 corrigido no AdRotate retroativo

- O diagnóstico final do `AFL / inserção 863 / ad 20 / grupo 14` mostrou que o problema principal não era mais o tema nem o widget:
  - a sidebar `single-post-banner` estava ativa
  - o bloco `<!-- wp:adrotate/group {"group_id":"14"} /-->` estava presente
  - o preview retroativo válido (`data-preview-active="1"`) continuava devolvendo `<!-- Há banners, eles são deficientes ou nenhum qualificado para este local! -->`
- A causa raiz foi uma customização anterior no `adrotate-output.php` que tentou colocar `function_exists('cod5_adops_preview_active')` dentro da string SQL.
- Isso é inválido para MySQL e faz o AdRotate parecer “sem anúncios qualificados”, mesmo quando o `ad 20` e o `schedule 34` estão corretos.
- A correção certa ficou assim:
  - montar a condição de tipos (`active`, `2days`, `7days`, e `expired` em preview) em PHP
  - interpolar a variável pronta na SQL
  - manter `fallback_model != 1` fora da seleção principal
- Depois da correção:
  - o `adrotate_group(14)` na AFL voltou a renderizar o `ad 20`
  - o HTML retroativo da matéria voltou a entregar `.g.g-14` com o GIF `728x90.gif`
  - a captura técnica do `863` voltou a gerar `finalPng`, `slotPng` e `meta.json` corretamente
- Evidência técnica local:
  - `/Users/leandrobosaipo/Projetos/AdOps/tmp/generated-prints/2026-04-10/863/2026-04-10-proof.png`
  - `/Users/leandrobosaipo/Projetos/AdOps/tmp/generated-prints/2026-04-10/863/2026-04-10-meta.json`
- Estado residual:
  - o criativo certo passou a renderizar e o retroativo voltou a funcionar
  - a auditoria visual da AFL ainda ficou em `4/5` imagens da viewport nesse caso, então o gargalo restante é carregamento tardio de uma thumb da matéria, não o banner interno
- A mesma correção de `adrotate-output.php` foi sincronizada para:
  - `AFL`
  - `OMT`
  - `PNMT`
  - `PPMT`
  - `ROO`
  - `PERRENGUE`
- Hash alinhado do arquivo corrigido:
  - `a2e15bb13f70a0289f69217a48f7dad5`

### Regra aprendida sobre páginas internas

Quando a inserção é de `INTERNO DE NOTICIAS` ou equivalente:

- a moldura do navegador precisa mostrar a URL real da matéria capturada
- não pode continuar exibindo apenas o domínio da home
- o gerador deve tentar mais de uma matéria candidata quando necessário
- a primeira matéria da home nem sempre contém o slot ou o criativo correto

Varredura validada em `ABRIL/2026`:

- `863 / AFL` -> falha histórica por placeholder do AdRotate
- `869 / PERRENGUE` -> captura ok
- `1181 / PERRENGUE` -> captura ok

Conclusão:

- no recorte atual, o problema não é global do formato `INTERNO DE NOTICIAS`
- ele está isolado no histórico do `AFL / 863`

Regra correta:

- só tentar clicar em elementos dentro de overlays realmente marcados como `cookie`, `consent` ou `privacidade`

Caso real que consolidou essa regra:

- `ROO / inserção 858`

### Regra aprendida sobre banners visíveis

O card `Banner validado` só deve aparecer quando o slot **não** estiver suficientemente visível na viewport principal.

Se o banner já estiver totalmente visível:

- usar `viewport_only`
- não duplicar o anúncio no rodapé

## 7.3. Navegador e moldura do print

O sistema de print agora precisa parecer mais próximo de um desktop real.

Itens reforçados na moldura:

- botões de navegação
- aba com fechar
- barra de endereço com cadeado
- ícones de ação no topo

Isso não substitui o navegador real, mas reduz a sensação de print “falso”.

## 7.4. Relação AdRotate para anúncios expirados

A relação da inserção com o AdRotate não pode depender só do anúncio estar público no site naquele momento.

Motivo:

- retroativos do mês precisam encontrar anúncios já expirados

Regra nova:

- a tela da inserção deve mostrar também `anúncio histórico no admin` quando existir vínculo no AdRotate, mesmo que o site público já não exiba mais a peça

Casos reais corrigidos:

- `OMT / inserção 857 / ad 77`
- `AFL / inserção 863 / ad 20`

## 7.5. Persistência de filtros no AdOps

As páginas operacionais passaram a persistir a última busca/filtro no navegador para reduzir retrabalho.

Isso já foi aplicado em:

- dashboard
- campanhas
- inserções

Regra de produto consolidada:

- ao voltar para a lista, a pessoa deve reencontrar o último recorte usado
- combinação `agência + cliente`

Arquivo-base:

- [adops-requirements.ts](/Users/leandrobosaipo/Projetos/AdOps/artifacts/adops/src/lib/adops-requirements.ts)

Perfis já parametrizados:

- `Padrão AdOps`
- `DMD`
- `ZF`
- `Genius`
- `Renca`
- `Renca + SECOM`

O objetivo dessa camada é evitar que:

- uma PI nova quebre regras antigas
- prazo fique hardcoded em tela
- checklist documental fique espalhado por componente

Regras que agora saem desse perfil:

- prazo de envio para agência
- prazo de docs
- exigência de print diário
- exigência de aceite formal
- exigência de NF detalhada
- exigência de art. 299
- necessidade de Analytics
- necessidade de preservar janelas separadas da PI

Conclusão operacional:

- cadastro
- detalhe da inserção
- lista de inserções
- dashboard

devem sempre consultar o mesmo perfil, e não inventar regras localmente.

## 8. Sites confirmados

Sites confirmados no histórico e já utilizados no sistema:

- `PERRENGUE`
- `OMT`
- `ROO`
- `PPMT`
- `PNMT`
- `AFL`

## 8.1. Regra importante aprendida sobre períodos por site

O projeto confirmou que o mesmo tema de campanha pode ter períodos diferentes por portal.

Exemplo real em `ABRIL/2026` para `FEMINICIDIO`:

- `ROO`: `03/04/2026` a `24/04/2026`
- `AFL`: `03/04/2026` a `29/04/2026`
- `PERRENGUE`: `03/04/2026` a `18/04/2026`
- `PPMT`: `06/04/2026` a `24/04/2026`
- `OMT`: `09/04/2026` a `18/04/2026`

Conclusão operacional:

- não dá para assumir um único período por campanha
- a verdade operacional é sempre `inserção por site + formato + período`
- divergências aparentes entre portais podem estar corretas e não significam bug

Outro caso confirmado:

- `FTD` em `AFL` está correto na planilha e no AdRotate como `01/04/2026` a `10/04/2026`
- o problema real não era período; era ausência de sincronização da mídia do grupo interno do AdRotate

## 8.2. Mapeamento administrativo real dos grupos AdRotate

O projeto confirmou por `wp-cli + db query` que os grupos internos variam por portal e não podem ser inferidos só pelo HTML público.

Mapeamentos confirmados:

- `OMT`
  - `INTERNO DE NOTICIAS` -> grupo `9`
- `AFL`
  - `INTERNO DE NOTICIAS` -> grupo `14`
- `PNMT`
  - `INTERNO DE NOTICIAS` -> grupo `14`
- `PPMT`
  - `INTERNO DE NOTICIAS` -> grupo `14`
- `ROO`
  - `INTERNO DE NOTICIAS` -> grupo `8`
- `PERRENGUE`
  - `INTERNO DE NOTICIAS` -> grupo `11`

Conclusão técnica:

- a conciliação `AdOps <-> AdRotate` precisa usar o mapeamento administrativo por site
- para mídia interna, confiar só no preview público do HTML não é suficiente
- o sync seguro precisa consultar o banco do AdRotate por `grupo + título + PI`

## 8.3. Estado validado em 2026-04-09

Após rodar a reconciliação `Planilha + AdRotate`:

- correções seguras de período aplicáveis: `0`
- atualizações seguras de mídia aplicadas: `13`
- em `ABRIL/2026`, todas as inserções de banner com relação segura ao AdRotate ficaram com `mediaUrl`
- as únicas inserções de `ABRIL/2026` ainda sem mídia são de `Instagram`, o que é esperado porque não vêm do AdRotate

Arquivo de apoio:

- [reconcile-planilha-adrotate-2026-04-09.md](/Users/leandrobosaipo/Projetos/AdOps/docs/reconcile-planilha-adrotate-2026-04-09.md)

## 9. Agências e clientes com necessidade de gestão forte

### Agências

As agências não podem mais ser apenas `nome + ativo`.

Campos já considerados necessários:

- nome
- razão social
- CNPJ
- telefone
- WhatsApp
- e-mail principal
- e-mail de faturamento
- endereço
- cidade
- UF
- CEP
- prazo de pagamento
- prazo de envio de documentos
- desconto padrão
- instruções de faturamento

Flags operacionais:

- exige aceite formal
- exige NF detalhada
- exige declaração art. 299
- exige comprovante assinado
- exige print diário

### Clientes

Clientes ainda têm gestão mais simples, mas o projeto já aprendeu que:

- alguns clientes alteram regras da agência
- no futuro será necessário tratar `agência + cliente` como perfil operacional específico

## 10. O que as PIs ensinaram sobre o produto

### PI 89011

Ensinou que o sistema precisa suportar:

- `projeto`
- `plano`
- `planilha`
- `produto`
- `peça`
- `formato detalhado`
- grade diária contínua
- documentação reforçada
- `print diário`

### PI 14028

Ensinou que o sistema precisa suportar:

- `projeto`
- `praça`
- `condição de pagamento`
- `faturamento direto cliente`
- `código da peça`
- bonificação
- mais de uma linha operacional dentro da mesma PI
- regra documental que muda por agência ou cliente

## 11. O que a sincronização mais recente ensinou

### Sobre erros de data

O projeto identificou e corrigiu problemas reais de parse histórico:

- anos com 2 dígitos
- datas com hora acoplada (`00:00:00`)
- linhas antigas com ano abreviado misturado com ano completo

Depois das correções:

- `invalidDates = 0`

### Sobre divergência de competência

O diagnóstico agora separa:

- erro técnico de parse
- divergência de regra de competência

Casos ainda em validação de regra:

- períodos como `26/12 - 22/01`
- períodos como `19/11 - 18/12`
- períodos como `14/01 - 13/02`

Esses casos sugerem que talvez a competência deva seguir:

- início do período
- mês de fechamento
- ou a própria aba da planilha

Isso ainda precisa de confirmação operacional.

## 12. O que o projeto já sabe sobre sincronização paralela

Durante a implantação, o sistema precisa rodar em paralelo com a planilha.

Aprendizados consolidados:

- a planilha continua sendo a origem operacional temporária
- o AdOps precisa sincronizar incrementalmente e não só por importação full
- a sincronização deve ser reexecutável
- a sincronização deve emitir diagnóstico
- a sincronização precisa separar:
  - dados novos
  - dados atualizados
  - avisos
  - casos ambíguos

Capacidades já prontas:

- sincronização incremental do `.xlsx`
- preview da sincronização sem gravar
- diagnóstico de datas
- diagnóstico de competência
- separação entre correção segura e revisão manual de competência
- conciliação inicial com AdRotate
- leitura pública do que o site está exibindo agora
- geração de prints do dia em lote
- auditoria de prints gerados

## 12.1. O que a implantação ensinou sobre competência

Depois da sincronização incremental e das correções seguras aplicadas:

- `invalidDates = 0`
- `competenciaMismatch = 2`

Os dois casos restantes são:

- `VACINA - PREF CUIABÁ`
- `LINGUAGEM ALMT`

Esses casos não devem ser resolvidos com simples troca de competência da campanha.

Aprendizado consolidado:

- quando a campanha tem mais de uma inserção em meses diferentes, a correção correta tende a ser `desdobrar campanha` ou tratar a competência por linha
- corrigir a competência da campanha inteira nesse caso seria perigoso

## 13. O que o projeto já sabe sobre prova de veiculação

O print correto para operação não é o recorte do banner isolado.

O padrão validado é:

- primeira dobra do site completo
- com moldura visual de desktop
- com data e hora em `pt-BR`
- com nome de arquivo rico

Esse nome de arquivo deve carregar:

- site
- campanha
- cliente
- PI
- data
- posição

Também ficou validado que:

- o print pode ser gerado sem IA
- a comparação com o criativo esperado pode ser feita pelo nome do arquivo da mídia
- o sistema precisa auditar se todos os prints do dia foram gerados e armazenados com URL válida

## 14. O que o projeto já sabe sobre conciliação AdOps x AdRotate

Agora o sistema já consegue conciliar por três camadas:

1. `planilha`
2. `AdOps planejado`
3. `site público exibido`

Aprendizados importantes:

- a leitura pública do site funciona bem para verificar:
  - grupo
  - id do anúncio
  - nome do arquivo da mídia
  - URL da página onde o anúncio aparece
- isso já cobre:
  - topo
  - topo lateral
  - vídeo/lateral
  - interno de notícias

Exemplos já validados publicamente:

- grupo `1` com `Ad 119`, `114`, `116`, `115`
- grupo `11` com `Ad 118`

Limite atual conhecido:

- a leitura pública mostra o que está visível no site, mas não substitui a leitura administrativa completa do AdRotate quando for necessário revisar todos os anúncios ativos/inativos do banco

## 15. O que o projeto aprendeu sobre reaproveitamento de mídia

Durante a implantação, surgiram inserções equivalentes sem `mediaUrl`, mesmo já existindo anúncio confirmado no site ou outra inserção equivalente com mídia.

Exemplos validados:

- `1180` (`FILA ZERO`)
  - passou a herdar a mídia `programa_fila_zero_cirurgia_825x120.gif`
  - match público com `Ad 116`
- `1181` (`FTD`)
  - passou a usar a mídia `728x90-pva-1.gif`
  - match público com `Ad 118`

Aprendizado consolidado:

- quando houver mesma campanha, mesma competência, mesmo site e mesmo grupo AdRotate, é possível reaproveitar a mídia de forma segura
- isso é especialmente útil em duplicidades operacionais da implantação
- o sistema agora expõe a relação `Inserção -> Grupo -> Ad -> Mídia -> Página`

## 11. Regras por agência já aprendidas

### DMD

Até aqui, a base indica:

- pacote documental mais rígido
- NF detalhada
- declaração art. 299
- comprovante assinado
- prints diários em JPG

### Renca

Até aqui, a base indica:

- aceite formal
- comprovante assinado
- docs em `D+1 útil`
- faturamento pode ser `direto cliente`

## 12. Regras que parecem mudar por agência + cliente

Caso observado:

- `Renca + SECOM`

Sinais observados:

- faturamento direto cliente
- aceite formal
- prazo documental específico
- bonificação destacada

Conclusão:

No futuro, o projeto deve suportar perfis por:

- `agência`
- `agência + cliente`

## 13. Fluxo de cadastro ideal já validado

Fluxo mais fiel à operação:

1. escolher modo de entrada
2. preencher cabeçalho da PI
3. montar grade de inserções
4. usar ações em lote
5. revisar antes de salvar

Modos de entrada já validados:

- nova PI
- duplicar PI anterior
- usar preset
- continuar rascunho

## 14. O que já foi implementado no produto

### Dados reais

- histórico da planilha importado localmente
- base demo removida
- campanhas reais carregadas
- inserções reais carregadas

### Operação

- dashboard
- campanhas
- inserções
- detalhe da inserção
- evidências por dia
- wizard de campanha por PI
- configurações de tabelas mestre

### PIs reais absorvidas

Antes de cadastrar as PIs modelo, foi feita checagem de duplicidade.

Resultado:

- PI `89011` já existia como campanha `626`
- PI `14028` já existia como campanha `623`

Decisão:

- enriquecer campanhas existentes
- não criar campanhas duplicadas

### Estado final dessas PIs

PI `89011`:

- campanha `626`
- enriquecida com:
  - `projeto`
  - `plano`
  - `planilha`
  - `produto`
  - `praça`
- inserção normalizada para `BANNER INTERNO NOTICIAS`

PI `14028`:

- campanha `623`
- enriquecida com:
  - `projeto`
  - `produto`
  - `praça`
  - `condição de pagamento`
  - `faturamento tipo = cliente`
- desdobrada em 3 inserções:
  - `03/04 a 14/04` `MEGABANNER TOPO`
  - `15/04 a 18/04` `MEGABANNER TOPO`
  - `15/04 a 18/04` `INSTAGRAM`

## 15. Premissas ainda abertas

### Coluna `B.` da PI 14028

Leitura atual:

- inserção separada provisória

Ainda precisa confirmar com o cliente:

- se é bonificação
- se é reforço pago
- se é categoria específica da linha
- se vira linha separada ou atributo da linha

### Cliente da PI 14028

O documento aponta `SECOM`, mas a campanha histórica importada está vinculada a `Governo do Estado`.

Isso indica necessidade de:

- revisão da tabela mestre de clientes
- possível normalização futura

## 16. Diretriz para importação e automação

Durante implantação:

- manter o processo manual mais fácil
- sincronizar sem uso de token
- usar parser determinístico quando possível
- usar IA só como exceção

## 17. O que não deve ser perdido

Mesmo quando houver automação futura, o sistema deve preservar:

- arquivo original
- parse bruto
- revisão humana
- histórico de lote
- trilha de auditoria

## 18. Documentos relacionados

- PRD principal: [PRD-dashboard-operacional.md](/Users/leandrobosaipo/Projetos/AdOps/docs/PRD-dashboard-operacional.md)
- análise das PIs: [analise-pis-modelo.md](/Users/leandrobosaipo/Projetos/AdOps/docs/analise-pis-modelo.md)
- modelo por agência + cliente: [modelo-perfil-agencia-cliente.md](/Users/leandrobosaipo/Projetos/AdOps/docs/modelo-perfil-agencia-cliente.md)
- automação futura: [automacao-captura-pi.md](/Users/leandrobosaipo/Projetos/AdOps/docs/automacao-captura-pi.md)
- plano de formulários: [plano-formularios-cadastro.md](/Users/leandrobosaipo/Projetos/AdOps/docs/plano-formularios-cadastro.md)

## 17. O que o projeto aprendeu sobre multisite em 2026-04-08

- a documentação do `Perrengue + AdRotate` já existia, mas ainda estava concentrada no caso do Perrengue
- os outros portais do servidor `facilnam` também usam `AdRotate 5.17.2-c5.7`
- os outros portais também usam `WP Rocket` e `Redis Cache`
- o contrato técnico do AdOps precisa ser pensado por `site`, e não só por `local/formato`
- a numeração de grupos AdRotate muda por site
- a estrutura de tema também muda por site:
  - `OMT` usa `omt-theme`
  - `AFL`, `PNMT`, `PPMT`, `ROO` usam `tailpress`
- por isso, o mapeamento de captura, conciliação e sincronização não pode continuar hardcoded para `PERRENGUE`
- o projeto agora passa a usar um catálogo multisite em `config/adrotate-sites.json`
- a central de sincronização passa a ser orientada por `competência + site`
- o próximo passo operacional correto para os outros sites é confirmar os grupos administrativos no banco do AdRotate e só depois aplicar rename/sync em lote


## 8.4 Operação atual de prints do dia
- Existe geração em lote para os prints do dia no AdOps.
- O lote considera apenas inserções elegíveis no dia consultado.
- Critérios atuais de elegibilidade:
  - competência do recorte, quando informada
  - período atual contém a data alvo
  - inserção com `mediaUrl`
  - inserção vinculável a um grupo AdRotate conhecido
- Também existe auditoria para conferir:
  - se a evidência do dia foi criada
  - se a URL salva responde corretamente
  - se faltou gerar algum print

## 8.5 Configurações operacionais dos sites centralizadas no AdOps
- O cadastro dos sites agora guarda informações operacionais para as rotinas:
  - domínio e URL pública
  - SSH host, porta e usuário
  - caminhos WordPress e WP-CLI
  - zone ID conhecido quando disponível
  - bucket/path das evidências
  - workspace de manutenção
  - notas de deploy e limpeza de cache
- Os seis sites ativos já foram preenchidos no banco local.

## 8.6 Estratégia de implantação
- O frontend está sendo preparado para Cloudflare Pages.
- A API permanece separada nesta fase, porque ainda executa rotinas Node/Playwright/SSH.
- O subdomínio alvo do produto é `adops.codigo5.com.br`.

## 8.6.1 Aprendizado de Cloudflare Pages em 2026-04-13
- O AdOps local pode voltar com os comandos esperados:
  - frontend em `localhost:4175`
  - API em `127.0.0.1:4011`
- O frontend compila limpo como SPA estática para `artifacts/adops/dist/public`.
- Foi criado um projeto de Pages de homologação na conta Código5:
  - `adops-campanhas-portais`
  - base `adops-campanhas-portais.pages.dev`
- O fluxo de Direct Upload do Pages foi validado só parcialmente nesta sessão:
  - `upload-token` funcionou
  - `check-missing` funcionou
  - `upsert-hashes` funcionou
  - `pages/assets/upload` respondeu `500 Worker threw exception`
- Conclusão operacional:
  - o gargalo da sessão não foi build do frontend
  - o gargalo também não foi criação do projeto
  - o bloqueio ficou no upload final dos assets do Pages e, em paralelo, na ausência de uma API pública do AdOps
- Regra que não pode ser esquecida:
  - Cloudflare Pages, nesta arquitetura do projeto, hospeda o frontend
  - não substitui sozinho a API, o PostgreSQL, o storage de evidências nem os jobs de Playwright/SSH
- A migração real para rodar sem a máquina local precisa de 4 peças separadas:
  - frontend em Pages
  - API pública
  - banco gerenciado
  - runner de prints fora do Pages


## 8.7 Regra de captura da primeira dobra
- Para evidência semi-automática, não basta encontrar o criativo correto no slot.
- A captura precisa esperar a primeira dobra ficar visualmente carregada, inclusive imagens visíveis fora do banner.
- Isso ficou evidente no caso do `ROO`, em que o banner correto era encontrado, mas o print completo podia sair antes do carregamento visual da home.
- A rotina atual agora espera:
  - `networkidle` quando possível
  - imagens visíveis da primeira dobra carregadas
  - imagens do slot carregadas
  - elementos com `background-image` carregados na primeira dobra
- Ainda assim, banners GIF podem mostrar um frame inicial visualmente mais simples; isso não significa falha de carregamento por si só.

## 8.8 Regra de print auditado e substituição manual
- Se já existir evidência válida no dia e a URL responder corretamente, o estado operacional correto é `Print auditado`.
- Esse estado deve bloquear a captura automática normal e remover a sensação visual de pendência na lista e na tela interna.
- O sistema não deve sobrescrever automaticamente um print válido do mesmo dia.
- Quando houver necessidade de refazer a captura, a operação correta é `Substituir print de hoje`, com confirmação explícita.
- A substituição manual atualiza a evidência do mesmo dia sem exigir exclusão prévia manual.

## 8.9 Seletores duplicados do AdRotate
- Em alguns portais, o mesmo grupo AdRotate pode aparecer duas vezes no HTML, normalmente por variantes desktop/mobile ou containers alternativos.
- Nesses casos, o Playwright entra em erro de `strict mode violation` se a captura usar o seletor bruto do grupo.
- A rotina de print agora resolve isso escolhendo automaticamente o slot visível e mais relevante antes de:
  - procurar o criativo correto
  - fazer scroll
  - gerar o screenshot do slot e do contexto
- Auditoria pública rodada em `2026-04-10` encontrou duplicidade visível em:
  - `OMT`: grupo `9`
  - `AFL`: grupo `1`
  - `PNMT`: grupo `1`
  - `PPMT`: grupo `1`
- Relatório salvo em:
  - [adrotate-duplicate-groups-audit-2026-04-10.md](/Users/leandrobosaipo/Projetos/AdOps/docs/adrotate-duplicate-groups-audit-2026-04-10.md)

## 8.10 Prints retroativos
- O requisito real da prova não é só mostrar o banner correto.
- A prova ideal também precisa reconstruir:
  - a primeira dobra do site
  - as notícias visíveis naquele momento
  - a data/hora coerente com a veiculação
- O AdOps agora aceita `captureAt` na captura individual e em lote.
- O gerador de prints já sabe anexar `adops_preview_at` à URL capturada.
- Perrengue local e OMT local receberam um mu-plugin `cod5-adops-retro-preview.php` para:
  - interpretar a data/hora simulada
  - limitar queries de posts ao que já estava publicado até aquele momento
  - fornecer um timestamp reutilizável para tema e AdRotate
- O AdRotate local de Perrengue e OMT foi ajustado para usar o tempo simulado no frontend.
- O cabeçalho local de Perrengue e OMT foi ajustado para mostrar a data/hora simulada e parar de avançar quando a pré-visualização retroativa estiver ativa.
- O primeiro rollout público no `Perrengue` mostrou que o Cloudflare podia devolver página em cache mesmo com a query do preview.
- A solução aplicada no gerador foi usar a origem direta apenas no modo retroativo, mantendo o domínio público no request.
- Caso validado: `Perrengue / inserção 860 / 2026-04-06 10:30`.
- O print final confirmou:
  - data retroativa correta no topo do site
  - banner correto
  - notícias coerentes com o momento simulado
- A tela da inserção passou a permitir `Apagar evidência` por dia para liberar uma nova captura retroativa.
- O sistema ganhou a ação `Retroativos vencidos`, que gera apenas os dias passados ainda sem print válido.
- Os retroativos vencidos e os próximos prints automáticos distribuem o horário automaticamente na janela `18:00 <= captureAt < 22:00`, variando por inserção e dia. O contrato atual está formalizado em PRD, SPEC, HARNESS e RUNBOOK próprios:
  - `docs/prd-capture-time-window-v1.md`
  - `docs/spec-capture-time-window-v1.md`
  - `docs/harness-capture-time-window-v1.md`
  - `docs/runbook-capture-time-window-v1.md`
- Limitação atual:
  - os domínios `.test` usados para validar localmente estavam com erro de conexão ao banco nesta sessão
  - por isso a validação visual completa do preview local ficou pendente
  - `OMT` ainda não teve a validação pública concluída nesta rodada

## 2026-04-10 — rollout retroativo multisite

- O teste que parecia ser `PMT` na verdade era `PPMT` (`portalpantanalmt.com`).
- O preview retroativo foi replicado para `OMT`, `AFL`, `PNMT`, `PPMT` e `ROO`.
- `OMT` nao bastava patchar PHP: o tema tinha um relogio JavaScript proprio em `parts/header-datestamp.php` que reescrevia a data com `new Date()`.
- A correcao definitiva do `OMT` foi voltar o carimbo para renderizacao server-side, sem JS local tentando atualizar a hora.
- Num segundo ajuste publico do `OMT`, tambem foi preciso trocar `date_i18n()` por `wp_date( ..., wp_timezone() )` no helper do tema, porque a pagina mostrava `22:57` quando a simulacao correta era `18:57` em Cuiaba.
- Validacao visual dos testes retroativos em `2026-04-09 19:10`:
  - `OMT`: data retroativa correta e primeira dobra coerente.
  - `AFL`: data retroativa correta e primeira dobra coerente.
  - `PNMT`: data retroativa correta e primeira dobra coerente; houve um `ERR_NETWORK_CHANGED` transitorio no primeiro teste, mas o rerun passou.
  - `PPMT`: data retroativa correta; a posicao `HOME 1` pode ficar abaixo da primeira dobra neste tema.
  - `ROO`: data retroativa correta; a posicao `HOME 1` tambem pode ficar abaixo da primeira dobra neste tema.
- O problema restante para `PPMT` e `ROO` nao e de data retroativa nem de Cloudflare. E um problema de enquadramento da prova da posicao em layouts onde o banner alvo fica abaixo da dobra.
- A API ganhou uma pre-visualizacao dos retroativos vencidos em `GET /api/insertions/capture-proof/backfill-overdue/preview`.
- A UI ganhou:
  - pre-visualizacao dos dias faltando antes de rodar o lote
  - filtro `Filtrar dias faltando` na lista de insercoes
  - relatorio visual no dashboard e na fila operacional mostrando quais insercoes ainda precisam de retroativos
- O script de rollout multisite foi ajustado para tratar `omt-theme` de forma propria durante futuras replicacoes.
- Foi encontrado um segundo problema no `OMT`: os destaques da home podiam repetir noticia atual mesmo com a data retroativa correta.
- A causa nao era AdRotate nem Cloudflare. Era o cache editorial da home em `class-homepage.php`, que reaproveitava IDs atuais.
- A correcao definitiva foi desligar leitura e escrita de transient da homepage durante `cod5_adops_preview_active()`.
- O mesmo risco existe nos portais `tailpress`, que usam pool cacheado em `src/Homepage.php`.
- A mesma blindagem foi replicada em `AFL`, `PNMT`, `PPMT` e `ROO`.

## 2026-04-10 — auditoria forte de print retroativo

- A captura passou a salvar metadados de auditoria por dia em `tmp/generated-prints/<data>/<insercao>/...-meta.json`.
- O audit agora confere:
  - `requestedCaptureAt`
  - horario do desktop renderizado na moldura
  - horario exibido pelo site
  - carregamento das imagens da primeira dobra
  - carregamento das imagens do slot do anuncio
  - carregamento de backgrounds visiveis
  - carregamento de videos e posters visiveis
- O status da API agora pode virar `invalid_audit` mesmo quando a URL do print responde `200`.
- Caso revalidado: `OMT / insercao 857 / 2026-04-07 18:57`
  - `desktopMatches = true`
  - `pageMatches = true`
  - `visualsOk = true`
  - `status = audited`
- Ao refazer manualmente um print do mesmo dia, a evidencia agora recebe uma URL versionada com `?v=...` para evitar que o navegador ou CDN continue mostrando a imagem antiga em cache.
- A UI da insercao agora detalha a auditoria por dia:
  - hora da moldura
  - hora do site
  - contagem de imagens da viewport
  - contagem de imagens do slot
  - contagem de backgrounds
  - contagem de videos/posters
  - lista de regras que falharam quando houver `invalid_audit`
- A lista de insercoes agora expoe um resumo rapido da auditoria por linha, com acesso direto ao detalhe da falha.
- Foi criada a fila `Falhas de Prints` para reunir evidencias `invalid_audit` e `invalid_url` por insercao e data.
- Foi confirmado um novo aprendizado importante: em portais com preview assinado, o print "de hoje" tambem precisa usar `captureAt` efetivo no modo preview, e nao somente os retroativos. Se a captura do dia usar a home publica cacheada, a hora do site pode vir congelada e divergir da moldura do desktop.
- A leitura da data/hora do site passou a ser configurada por dominio em `adrotate-sites.json`, via `pageDateSelectors`.
- A auditoria do backend nao compara mais apenas substring literal de data: ela entende datas em formato numerico (`10/04/2026`) e por extenso (`10 de abril de 2026`).
- Ficou regra oficial que auditoria e captura precisam ser parametrizadas por portal:
  - tema e template podem divergir
  - seletores de data podem divergir
  - o enquadramento do contexto pode divergir
  - a prova de video pode precisar de ajustes visuais proprios sem assumir que Perrengue vale igual para OMT, AFL, PNMT, PPMT ou ROO
- O caso que consolidou essa regra foi `OMT / insercao 859 / 2026-04-10`, onde a hora do site aparecia `10:56:20` enquanto a moldura estava em `15:00` por causa de cache publico. Depois do ajuste, ambos passaram a refletir o mesmo `captureAt`.

- 2026-04-10: publicação da campanha HANSENIASE / ALMT no Perrengue.
  - banner já estava publicado e foi sincronizado com o AdOps (inserção 1192 / ad 120).
  - vídeo foi comprimido localmente, publicado no CDN do Perrengue e criado como anúncio 122 no grupo 6.
  - no Perrengue, vídeos precisam do CDN + ACL pública + content-type correto.
  - o AdRotate converte `\n` literais em `n` na saída do HTML por causa de `stripslashes()`, então bannercode de vídeo deve ser salvo sem `\n`.
  - cache de página do WP Rocket pode manter HTML quebrado e exigir limpeza física do diretório de cache além do purge na Cloudflare.
  - para provas de `VIDEO`, não basta mostrar o player carregado: a captura ideal deve mostrar controles aparentes e barra de progresso visível, como se o cursor estivesse sobre o vídeo.
  - o gerador Playwright passou a:
    - localizar o `video` dentro do anúncio validado
    - ativar `controls`
    - tentar `play()` em mute
    - avançar alguns segundos ou aguardar progresso real
    - mover o mouse para o centro do player imediatamente antes do screenshot
    - variar o tempo do player por captura, para evitar que todas as provas de video parecam congeladas no mesmo segundo
  - o caso que consolidou essa regra foi `HANSENIASE / ALMT / insercao 1193`.
  - a API passou a devolver `playerProofOk` e um bloco `playerProof` separado da auditoria visual geral.
  - a UI passou a mostrar selos dedicados:
    - `Video com controles visiveis` na pagina da insercao
    - `Video com controles` na lista de insercoes
  - em `2026-04-11`, o caso `1193` mostrou que uma thumb da primeira dobra podia falhar mesmo com HTML correto no portal.
  - o HTML publico da noticia vinha com `data-lazy-src` valido apontando para um `.avif` no CDN, entao a divergencia nao indicou conteudo errado do site.
  - a leitura mais provavel e de corrida de lazy-load/decodificacao no browser automatizado, nao de cache editorial quebrado.

## 2026-04-11 - AVIF fallback multisite
- Problema observado: thumbs em `.avif` podem falhar no site, no compartilhamento externo e na captura automatizada.
- Decisão: tratar na origem do WordPress, sem IA, gerando fallback `webp` e `jpg` no upload.
- Implementação: MU-plugin `cod5-avif-fallback.php` publicado em todos os portais.
- O plugin agora oferece:
  - geração automática no upload
  - geração de `webp` para a imagem destacada em formatos raster suportados
  - criação/reaproveitamento de attachment companheiro `image/webp`
  - troca do `_thumbnail_id` do post para o attachment `webp`
  - reparo de posts antigos
  - simulação/correção na edição do post
  - WP-CLI `wp cod5 avif doctor|audit_post|repair_post`
- Conhecimento importante: cada portal pode ter tema/template diferente, mas o fallback AVIF foi desenhado para ser independente de tema.
- Conhecimento importante: no Perrengue, os arquivos vivem em storage/CDN remoto; por isso a URL pública do fallback não pode assumir apenas `wp_upload_dir()['baseurl']`.
- Conhecimento importante: cache de página e plugins de otimização de imagem/SEO podem continuar servindo HTML antigo mesmo depois do fallback já existir no storage.

- Correção crítica em 2026-04-11: o primeiro patch do fallback AVIF entrou em recursão ao usar `wp_get_original_image_url()`/`wp_get_attachment_url()` dentro do próprio filtro de URL do attachment. Isso podia quebrar home e telas do admin, inclusive a lista de posts. A solução final passou a derivar a URL pública pelo `guid` do attachment ou pelo `_wp_attached_file`, sem chamar APIs filtradas.
- Ajuste em 2026-04-11: os botões do box `COD5 AVIF Fallback` no editor passaram a usar feedback por query string no redirect, e não mais transient. Isso evita a sensação de “só atualizou a página” em cenários com cache/admin redirects.
- Ajuste em 2026-04-11: no post `333155` do Perrengue, o destaque passou a apontar para o attachment `333320` com mime `image/webp`, mantendo vínculo com o attachment-fonte `333156`.
- Ajuste em 2026-04-11: quando o destaque atual já é o attachment `webp`, a box do editor precisa resolver o attachment-fonte por `_cod5_webp_source_attachment_id` para continuar mostrando o log correto das URLs geradas.
- Ajuste em 2026-04-11: no Perrengue, o `guid` do attachment não representa a URL pública real do storage. A resolução do fallback agora prioriza `wp_get_attachment_url()` com o filtro local temporariamente desligado, evitando cair no host errado.
- Ajuste em 2026-04-11: o attachment companheiro `webp` também passou a expor a URL pública correta do CDN, corrigindo links quebrados na box do editor e no uso por SEO/social.
- `config/adrotate-sites.json` passou a ser a fonte única por portal para:
  - `adminBaseUrl` do AdRotate no wp-admin
  - `pageDateSelectors`
  - `formatMappings`
  - regras de prova e auditoria (`auditConfig` + `auditOverrides`)
- A tela de inserção deve mostrar a posição operacional do banner a partir do mapping do portal, e não só o número do grupo.
- Na relação com AdRotate, o link principal do anúncio deve abrir o admin (`admin.php?page=adrotate&view=edit&ad=<id>`). O link para a página real continua útil, mas é secundário.
- Para `HOME 1` e outras posições em que o slot fica mais abaixo, o print pode usar `proofStyle = viewport_with_slot_inset` e `viewportTrimBottomPx` por portal para evitar prova poluída com repetição do banner no rodapé da viewport.
- O inset `Banner validado` não deve ser aplicado cegamente. Se o slot já estiver majoritariamente visível na viewport principal, o gerador precisa rebaixar para `viewport_only` para evitar banner duplicado no rodapé da prova.
- Em 11/04/2026 foi confirmado `drift` real no AdRotate entre portais:
  - `Perrengue`: `5.17.2-c5.8`
  - demais portais (`OMT`, `AFL`, `PNMT`, `PPMT`, `ROO`): `5.17.2-c5.7`
- Além do header de versão, o hash do `adrotate.php` também diverge. Portanto, para administração segura, o projeto deve tratar:
  - `Version:` como sinal humano
  - hash do arquivo principal como sinal técnico
  - changelog por revisão `c5.x` como trilha operacional
- Documento específico criado:
  - [versionamento-plugins-portais.md](/Users/leandrobosaipo/Projetos/AdOps/docs/versionamento-plugins-portais.md)
- Para GIF/banner animado, a configuração por portal agora pode exigir `animatedBannerDelayMs` antes da captura para fugir do primeiro frame vazio.
- O metadata do print agora registra `positionLabel`, `pageLabel`, `adminBaseUrl` e `auditConfig` usados no portal durante a captura.
- Em 12/04/2026 o `drift` foi resolvido nos plugins gerenciados do multisite:
  - `AdRotate`: `5.17.2-c5.8` e md5 `de33005b77388a69f1af659b27a14c3b` nos 6 portais
  - `cod5-avif-fallback.php`: `1.0.0` e md5 `3850c9c17ba2fa3efa077d0f1d85dc76` nos 6 portais
  - `cod5-adops-retro-preview.php`: `1.0.1` e md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee` nos 6 portais
- O `cod5-adops-retro-preview.php` do Perrengue estava com variante antiga, ainda sem todos os fallbacks de segredo dos demais portais e sem `Version:` no header. A correção consolidou que MU-plugin operacional também precisa de versionamento explícito e rollout multisite, não só o AdRotate.
- Em 12/04/2026 foi revalidado o recorte de `ABRIL/2026` por portal:
  - `20/20` inserções planejadas com grupo AdRotate resolvido
  - `20/20` inserções planejadas com `mediaUrl`
  - no diagnóstico correto por competência, não restaram lacunas de mídia nem de grupo em abril
- O endpoint `relation` confirmou `plannedSelf` nas 20 inserções de abril. A ausência de `exactLiveMatches` em leitura pública do momento não deve ser lida automaticamente como quebra, porque depende:
  - da data atual em relação ao período da inserção
  - do formato ser `home` ou `interno`
  - do que está público naquele instante
- Em 12/04/2026 a auditoria de prints do dia para `ABRIL/2026` retornou `17` elegíveis e `17` faltando em `2026-04-12`. Isso não indica falha de sincronização; apenas confirma que a rodada de prints do dia ainda não havia sido executada.
- Foi criado o script operacional:
  - `pnpm --filter @workspace/scripts run audit:wordpress-managed-versions`
  para auditar `AdRotate`, `cod5-avif-fallback.php` e `cod5-adops-retro-preview.php` com versão e hash por portal.

## 2026-04-13 - Consolidação de auditoria por inserção e pacote exportável
- O período exibido na lista de inserções e na página interna da inserção deve sair da mesma origem:
  - `periodoOriginal` como forma compacta preferencial
  - `periodoInicio` / `periodoFim` como base longa
- Foi criado um helper único no frontend para evitar divergência visual entre lista e detalhe.
- A API das inserções agora devolve `auditSummary` por inserção, com:
  - total de datas auditadas
  - total aprovado
  - total com `invalid_audit`
  - total com `invalid_url`
  - datas problemáticas com suas regras de falha
- A lista de inserções passou a mostrar um resumo operacional com emoji:
  - `🟢 aprovadas`
  - `🔴 reprovadas`
- A lista também ganhou ação para:
  - apagar só as evidências inválidas
  - regerar automaticamente as datas com falha
  - preservar o restante da inserção sem apagar evidências boas
- A rotina de correção reaproveita, quando existir, o `requestedCaptureAt` salvo na metadata do print; se não houver e a data for retroativa, usa a mesma lógica padronizada de horário entre 18h e 20h.
- A página da inserção agora pode exportar um pacote `.zip` com:
  - todas as evidências baixadas
  - `relatorio-auditoria.txt` detalhado
- O relatório textual inclui:
  - metadados da inserção
  - URLs
  - status de auditoria
  - horário da moldura
  - horário do site
  - métricas visuais
  - falhas por regra

## 2026-04-13 - Fase 1 da refatoração para Cloudflare
- A migração deste projeto para Cloudflare precisa começar separando lógica pura de runtime local. Tentar publicar o projeto inteiro direto em Pages mascara o problema, mas não resolve a dependência da máquina.
- Foi criado `artifacts/api-server/src/lib/capture-audit.ts` para centralizar regras puras de:
  - parse de datas
  - iteração de dias
  - construção de `captureAt`
  - leitura semântica de data/hora da página
  - avaliação do metadata da captura
- Foi criado `artifacts/api-server/src/lib/local-capture-runtime.ts` para concentrar dependências locais ainda existentes:
  - script `capture-insertion-proof.cjs`
  - `.env.digitalocean-spaces`
  - pasta `tmp/generated-prints`
  - `child_process`
- Foi criado `artifacts/api-server/src/lib/print-runner-contract.ts` para definir o contrato futuro do executor de prints. Isso permite evoluir da API local para Queue/Worker/runner dedicado sem mudar o significado dos jobs.
- `routes/insertions.ts` deixou de carregar helpers duplicados inline para auditoria/captura e passou a consumir os módulos extraídos.
- Aprendizado importante: nesta arquitetura, o primeiro corte certo não é “Cloudflare Pages”, e sim “porta clara entre API e runner”. O Pages depende disso para operar sem a máquina local.
- Em 2026-04-13, a Fase 1 avançou do simples isolamento de helpers para a introdução de uma porta real de execução de prints. Isso é importante porque o backend agora já fala com `PrintRunnerPort`, e não com o script local diretamente nas rotas principais.
- Foi criada a implementação `local-print-runner.ts`, que mantém compatibilidade com o fluxo atual, mas prepara a troca futura por Queue/Worker/runner remoto.
- Aprendizado importante: manter `runNow(...)` e `enqueue/get(...)` no mesmo contrato ajuda a migrar rotas síncronas e assíncronas na mesma direção arquitetural, sem abrir dois modelos diferentes de execução.
- Os jobs de print não devem mais ficar só em memória local. Em 2026-04-13 foi criada a tabela `print_jobs`, e o runner local passou a persistir status, itens e metadados.
- O frontend público em Pages só fica realmente preparado para API separada quando as telas deixam de usar `fetch("/api/..." )` cru. Em 2026-04-13 foi criado `artifacts/adops/src/lib/api-base.ts` e as chamadas manuais passaram a usar helper centralizado.
- O Cloudflare Pages já está publicando o frontend em produção nesta sessão, com URL funcional:
  - `https://adops-campanhas-portais.pages.dev`
  - deployment validado: `https://e5337cff.adops-campanhas-portais.pages.dev`
- O gargalo que resta para sair da máquina local não é mais o frontend. É:
  - API pública
  - banco acessível fora do local
  - runner de prints fora do local
- No Pages, deixar `/api/...` cair no fallback da SPA produz um falso sucesso `200 text/html`. Se o cliente HTTP não exigir JSON para essas rotas, a UI pode quebrar com erros como `.map is not a function`. Em 2026-04-13 o `customFetch` foi ajustado para tratar chamadas `/api` como JSON obrigatório.


## Cloudflare - Snapshot publico com concorrencia limitada
- Ao exportar snapshot para o Worker, nao disparar todas as requisicoes do AdOps em paralelo.
- Rotas como `relation`, `capture-proof/status` e `planned` podem voltar `null` sob excesso de concorrencia, gerando API publica inconsistente.
- O padrao seguro atual e usar `mapLimit(...)` no exportador de snapshot.
- Tambem registrar que o `SyncCenter` precisa usar `apiUrl(...)`/`apiFetch(...)`; `fetch('/api/...')` puro quebra no Pages quando a API publica esta em outro host.

## Cloudflare - build publico precisa de VITE_API_BASE_URL
- O frontend do Pages pode abrir normalmente mesmo quando foi buildado sem `VITE_API_BASE_URL`, mas nesse caso ele volta a buscar `/api` no proprio host do Pages.
- Sintomas tipicos: dashboard sem numeros, listas vazias, detalhe de insercao como `não encontrada` e modo publico sem banner.
- Regra operacional: toda publicacao do frontend no Pages precisa rebuildar com `VITE_API_BASE_URL=https://adops-api-public.leandro471.workers.dev` (ou a URL publica equivalente da API).

## Cloudflare - paginas publicas precisam de modo readonly explicito
- Nao basta publicar a API publica e o frontend no Pages. Paginas como `Nova campanha`, `Configuracoes` e `Detalhe da campanha` precisam declarar explicitamente o modo readonly.
- Sem isso, a pessoa ve botoes de salvar/editar/exportar e entende que a operacao ja foi migrada, mesmo quando a camada publica ainda e somente leitura.
- Tambem registrar que erros pequenos de runtime no bundle publico, como helper visual nao importado (`cn`), podem deixar a tela totalmente branca enquanto a API segue saudavel. Depois de cada deploy publico, validar ao menos: dashboard, campanhas, detalhe, nova campanha, configuracoes, insercoes e sincronizacao.

## Cloudflare - sair do local exige trilho operacional antes do runner final
- Antes de migrar a execucao de prints, publicar primeiro a infraestrutura operacional:
  - D1 para estado dos jobs
  - Queue para pipeline
  - API protegida para disparo
  - endpoints de runner (`claim-next`, `complete`, `fail`)
- Em 2026-04-14 isso passou a rodar no Worker `adops-api-public`.
- O `SyncCenter` publico tambem ja mostra esses jobs, o que ajuda a validar a migracao sem depender so de `curl`.
- Segredo operacional (`OPS_API_TOKEN`) ficou configurado como secret do Worker; nao expor esse valor no frontend publico nem em documentacao compartilhada.


## Cloudflare - modo publico pode operar com token sem embutir segredo no bundle

- Para religar a UI publica antes da autenticacao completa, o caminho mais seguro foi aceitar um token de operador digitado pelo usuario e salvo apenas no `localStorage` do navegador.
- Isso permite que o Pages continue publico para leitura, mas ganhe operacao protegida sem embutir o Bearer token no build.
- O primeiro corte religado foi:
  - `sync-planilha`
  - `print-batch`
  - `print-backfill`
- O primeiro requisito operacional encontrado no runner remoto foi claro: o host que executa `sync-planilha` precisa receber `DATABASE_URL`, alem do token do Worker.


## Cloudflare - diferenca entre "operando no Pages" e "100% fora do local"
- O projeto ja pode operar parcialmente no Pages com leitura publica, jobs protegidos e token de operador no navegador.
- Isso ainda nao significa que o sistema inteiro saiu da maquina.
- O criterio correto para considerar a migracao fechada e:
  - runner remoto hospedado permanentemente
  - API principal do AdOps fora do localhost
  - acoes por insercao individual religadas no Pages
  - executor final de print fora do runtime local


## Cloudflare - migracao precisa de plano por fase com criterio de pronto
- Depois do gap analysis, o passo correto e transformar a migracao em plano tecnico executavel.
- Cada fase precisa ter:
  - objetivo
  - tarefas implementaveis
  - testes
  - criterio de pronto
  - riscos
- Isso evita a sensacao de que o projeto esta “quase pronto” quando ainda faltam pecas estruturais, como runner permanente e API principal fora do localhost.


## VPS Contabo - ganhos de conhecimento da rodada 2026-04-14
- A publicacao no VPS funcionou melhor usando a mesma infraestrutura do outro projeto no Easypanel:
  - API principal no Swarm
  - runner remoto no Swarm
  - banco dedicado no PostgreSQL compartilhado
- O projeto ainda tinha caminhos absolutos da maquina local em varios pontos criticos:
  - runtime de captura
  - sync
  - leitura de config de site
  - scripts de reconciliacao
- A reconciliacao ampla pulava o Perrengue explicitamente, entao o portal ficou com `mediaUrl` zerado mesmo com anuncios validos no admin.
- O WordPress funcional para WP-CLI do Perrengue no servidor e:
  - `/home/perrengu/public_html/wp`
  - e nao os caminhos anteriores com `/web/wp`
- No VPS, os dados de abril mostraram que o gargalo do Perrengue nao era mais “todos os banners”, e sim:
  - 3 linhas de Instagram que nao entram no fluxo de print
  - 1 video sem `image` administrativa, resolvido por fallback do live preview
- O runtime final de print precisa de duas compatibilidades ao mesmo tempo:
  - pacote Node `playwright`
  - imagem base `mcr.microsoft.com/playwright` na mesma versao
- Quando o pacote subiu para `1.59.1`, a imagem base tambem precisou subir para `v1.59.1-noble`. Sem isso, o browser nao abre mesmo com o pacote instalado.


## VPS + Cloudflare — ganhos de conhecimento da rodada 2026-04-14 (fase live proxy)
- O passo decisivo para sair do snapshot foi alinhar primeiro a base remota com o banco local real; sem isso, o Pages abriria detalhes que o VPS nao conhecia.
- Expor a API do VPS na internet sem token nao era aceitavel; a solução segura foi publicar a porta `4011` com `ADOPS_INTERNAL_API_TOKEN`, deixando o Worker falar com ela usando um token separado do token de operador da UI.
- O Worker nao aceitou origin por IP puro neste caso (`error code 1003`), mas funcionou normalmente com hostname `sslip.io` apontando para a mesma VPS.
- O token de operador do navegador e o token interno Worker⇄VPS nao devem ser o mesmo. O primeiro protege a borda publica; o segundo protege o origin do VPS.
- Depois que o Worker entrou em `cloudflare-public-live-proxy`, a UI deixou de ser somente leitura, mas as mutações ainda precisavam herdar o token de operador automaticamente. Resolver isso em `apiFetch` foi melhor do que remendar cada botão.
- Quando a API ganhou autenticação interna, o executor de prints hospedado precisou aprender a mandar esse token também; sem isso, o fluxo quebrava com `401` ao buscar a inserção.
- Os próximos erros do executor hospedado ficaram claros e pequenos: `python` ausente (resolver com `python3`) e `zip` ausente (resolver na imagem), o que mostra que a cadeia Pages → Worker → VPS → API → script já estava funcional o bastante para expor bugs reais de runtime.
- A rota de ZIP hospedada falhou por bug de código (`execFileAsync is not defined`), não por limitação da VPS.

## Pages + VPS - ganhos de conhecimento da rodada 2026-04-14 (suite publica)
- Para validar o painel publico no VPS, a suite precisou separar teste de estrutura da tela e teste de dado/operacao. Misturar os dois gerou falso negativo em momentos de hidratacao (`Carregando...`).
- A lista de insercoes no Pages nao falhava por falta de dado; o falso negativo vinha do teste procurando heading errada e dados antes do fim da hidratacao.
- O relatorio tecnico mais util para esta migracao ficou assim:
  - paginas e filtros validados visualmente
  - APIs publicas validadas com IDs reais (`840`, `857`)
  - acoes protegidas validadas por criacao real de jobs no Worker
  - exportacao de ZIP validada pelo content-type `application/zip`
- O caminho mais seguro para homologar o Pages e testar via Worker/API publica tudo que cria ou movimenta estado, e deixar a UI provar estrutura, navegacao e disponibilidade de botoes/filtros.
- A varredura por `localhost`, `campanhas_portais_local` e caminhos absolutos mostrou que os residuos locais restantes hoje estao concentrados em:
  - tooling de deploy/auditoria
  - fallbacks de desenvolvimento
  - snapshot readonly mantido como contingencia
  e nao mais no fluxo principal homologado do painel publico.
- O fluxo que ainda merece refatoracao arquitetural e o print individual sincrono (`/api/insertions/:id/capture-proof`). Na borda publica, o desenho mais confiavel passa a ser job assíncrono (`print-single`) em vez de request longa atravessando Worker.

## Pages + VPS - detalhes publicos e client gerado precisam compartilhar a mesma base de API
- Nao basta centralizar `apiFetch` em `VITE_API_BASE_URL`; paginas que usam o client gerado por Orval (`@workspace/api-client-react`) tambem precisam receber a mesma base em runtime via `setBaseUrl`, senao as rotas de detalhe continuam batendo em `/api/...` no proprio host do Pages.
- Em builds publicas, a defesa mais segura e usar duas camadas: `VITE_API_BASE_URL` quando fornecida e fallback automatico para a Worker publica quando o hostname for `adops-campanhas-portais.pages.dev`.
- O token de operador salvo no navegador tambem precisa ser registrado no client gerado se quisermos religar mutacoes protegidas no Pages sem remendos tela por tela.
- A suite publica precisa testar nao so listagens e dashboards, mas tambem paginas de detalhe; foi isso que revelou que `CampaignDetail` e `InsertionDetail` ainda nao consumiam a base viva da API.
- Estado consolidado apos esta rodada: `22/22` testes aprovados no ambiente publico Pages + VPS.
- Para a operacao diaria, separar claramente a rotina de gestor e a rotina de administrador reduz erro operacional: gestor olha dashboard, jobs e insercoes; administrador olha health, runner, API e logs da VPS.

## 2026-04-15 - Tabelas mestre hospedadas e serializacao de datas

- Problema observado: no ambiente hospedado, a tela de `Configuracoes` e filtros que dependem de `clients`, `agencies` e `sites` podem aparentar bug de UI quando, na verdade, a API principal devolve `createdAt` como `Date` e o contrato gerado espera `string`.
- Sintoma real encontrado:
  - `clients` e `agencies` quebravam em producao antes da serializacao com `toISOString()`
  - `sites` ainda quebrava depois, e isso esvaziava o select de site na lista de insercoes, dando a impressao de que o filtro nao tinha sido migrado
- Regra consolidada:
  - toda rota hospedada de tabela mestre que passa por `@workspace/api-zod` deve serializar datas explicitamente antes do `parse`
  - isso vale para listagem, get por id, create e patch
- Impacto operacional:
  - quando o catalogo de `sites` falha, o filtro por site da tela de insercoes continua no frontend, mas fica vazio
  - em manutencoes futuras, sempre validar `/api/clients`, `/api/agencies` e `/api/sites` no ambiente hospedado antes de concluir que o problema esta na UI
- O melhor critério de “ambiente bom” deixou de ser impressao visual isolada e passou a ser combinacao de: Pages abre, API publica responde, detalhe carrega dados reais, jobs avancam e a suite `Pages + VPS` fecha sem falhas.
- A frente de Analytics deve nascer como servico da API, nao como regra espalhada no frontend. O painel pode pedir o relatorio, mas a API precisa decidir periodo, dimensao e integracao com a automacao existente com base na PI/insercao.

## 2026-04-15 - Retroativo por insercao no Pages precisa falar com o job operacional, nao com a rota legada

- Problema observado: a tela publica de detalhe da insercao mostrava corretamente a previa de retroativos faltando, mas ao clicar para gerar o lote respondia `Forneca um Bearer token valido para acoes operacionais.`
- Causa real:
  - a interface de detalhe ainda chamava a rota legado `POST /api/insertions/capture-proof/backfill-overdue/jobs`
  - no Worker publico, essa rota ainda estava tratada como acao protegida/legada, enquanto o desenho novo ja usava `ops_jobs` + queue + runner remoto
- Regra consolidada:
  - no Pages publico, retroativo por insercao deve ser aceito como job assíncrono na borda e enfileirado como `print-backfill`
  - o lote amplo de retroativos por recorte continua protegido; o atalho sem Bearer vale apenas para a acao focada da propria insercao
- Compatibilidade importante:
  - para nao quebrar a UI ja publicada, o Worker pode religar a rota legado so como fachada para o job operacional novo
  - o acompanhamento em `GET /api/insertions/capture-proof/backfill-overdue/jobs/:id` precisa devolver o formato esperado pela tela, mesmo quando a origem real for `ops_jobs`
- Licao de manutencao:
  - quando uma tela publica mostrar leitura correta mas falhar so na mutacao, comparar se ela ja migrou para a camada operacional nova do Cloudflare
  - a melhor pista e verificar se a tela ainda chama uma rota legado de `insertions/...` em vez de uma criacao/consulta de job operacional

## 2026-04-15 - Auditoria da AFL em pagina interna precisa tolerar uma thumb tardia na primeira dobra

- Problema observado: a insercao `863` da `AFL`, em `INTERNO DE NOTICIAS`, podia mostrar o banner correto e a hora correta, mas ainda cair em `Auditoria com divergencia` por `4/5` imagens da primeira dobra.
- Leitura consolidada da rodada:
  - o proprio historico do projeto ja marcava esse caso como ruido residual de carregamento tardio de thumb, e nao mais erro do banner interno
  - a configuracao do portal/posicao estava sem `auditOverrides`, entao herdava a regra mais rigida possivel: `viewportImagesLoaded === viewportImagesTotal`
- Regra consolidada:
  - para `AFL / INTERNO DE NOTICIAS`, a auditoria pode tolerar `1` imagem faltando na primeira dobra quando o slot do anuncio, a data/hora e o restante dos visuais estiverem corretos
  - essa tolerancia precisa ficar parametrizada em `config/adrotate-sites.json`, e nao hardcoded na UI
- Implementacao segura:
  - usar `auditOverrides.allowViewportImageMisses = 1` na posicao interna da AFL
  - aumentar levemente o `postVisualWaitMs` dessa posicao para reduzir falso negativo antes de aceitar a tolerancia
  - a avaliacao da auditoria deve usar a configuracao viva do portal/posicao como fallback, mesmo para metadata antiga ja salva
- Licao de manutencao:
  - `visualAudit.ok` bruto da captura nao deve ser tratado como verdade absoluta; a decisao final precisa passar pela regra operacional do portal
  - em portais `tailpress`, paginas internas podem ter uma thumb secundaria atrasando sem comprometer a prova do banner

## 2026-04-15 - Analytics precisa oferecer tres janelas de periodo no detalhe da insercao

- Pedido operacional consolidado:
  - o relatorio de Analytics nao deve ficar preso somente ao periodo da PI
  - o painel precisa oferecer tres opcoes:
    - periodo da PI
    - mes completo da competencia
    - periodo customizado
- Regra consolidada:
  - o frontend pode escolher a modalidade, mas a API continua sendo a fonte da verdade do intervalo final enviado ao job
  - `GET /api/analytics/insertions/:id/requirements` deve expor as opcoes de periodo junto com suas datas resolvidas
  - `POST /api/analytics/jobs/request-report` deve aceitar `periodMode` e, no caso customizado, `customPeriodStart` e `customPeriodEnd`
- Licao de manutencao:
  - a opcao de mes completo deve usar primeiro a `competencia` da insercao; se ela faltar, pode cair para o mes de `periodoInicio`
  - quando a competencia ainda estiver no mes atual, o fim do `full_month` deve ser limitado a hoje em Cuiaba, porque o provedor real do relatorio nao aceita datas futuras
  - a tela de detalhe deve inicializar no modo `periodo da PI`, mas manter o ultimo modo escolhido na sessao enquanto o usuario estiver naquela insercao

## 2026-04-15 - Na AFL retroativa a auditoria precisa validar data e hora completas, nao so a hora

- Problema observado:
  - no tema `tailpress` da `AFL`, o preview retroativo ja mostra o carimbo em `dd/mm/aaaa hh:mm`
  - mesmo assim, uma comparacao fraca so por `HH:mm` ainda deixa passar caso com dia errado e mesma hora
- Regra consolidada:
  - quando existir `requestedCaptureAt`, a auditoria precisa validar a data e a hora completas tanto na moldura quanto no texto do site
  - o formato operacional esperado para esse carimbo e `dd/mm/aaaa hh:mm`
- Licao de manutencao:
  - antes de mexer no tema de novo, validar se o portal ja esta correto e se o falso negativo vem da auditoria
- no caso da `AFL`, o ajuste principal ficou no backend de auditoria; o script de rollout multisite continua so como reforco de padrao para futuros updates

## 2026-04-16 - Analytics customizado pode falhar na UI com erro generico mesmo quando a API publica esta saudavel

- Problema observado:
  - na insercao `1181`, o usuario reportou `Failed to fetch` ao pedir relatorio de Analytics com periodo customizado
  - o erro na interface nao trazia detalhe suficiente para separar falha de rede/CORS de erro real da API
- Verificacao objetiva desta rodada:
  - `POST /api/analytics/jobs/request-report` com `periodMode=custom` respondeu `202` normalmente pela API publica
  - o preflight `OPTIONS` tambem respondeu com `Access-Control-Allow-Methods` e `Access-Control-Allow-Headers` corretos
  - `GET /api/analytics/insertions/1181/requirements` devolveu corretamente as tres opcoes de periodo: `pi`, `full_month` e `custom`
- Leitura consolidada:
  - quando a UI mostra `Failed to fetch` nesse fluxo, a causa mais provavel passa a ser camada de frontend/deploy/cache do Pages ou falha de rede do navegador, e nao a regra da API de Analytics
  - a interface precisa trocar o erro cru do browser por uma mensagem orientada a diagnostico operacional
- Regra de manutencao:
  - no pedido de Analytics, se o `fetch` cair em `TypeError`, mostrar mensagem explicita de falha de rede/CORS/deploy, incluindo o recorte customizado quando aplicavel
  - antes de depurar a API, validar primeiro o endpoint publico com `POST` direto e o `OPTIONS` de preflight

## 2026-04-16 - Preview da sincronizacao da planilha em producao depende do toolchain operacional do container, nao so do build da API

- Problema observado:
  - a tela publica `Sincronizacao > Preview planilha` respondia `spawn /app/node_modules/.bin/tsx ENOENT`
  - depois de religar o `tsx`, a mesma rota passou a falhar por tentar ler um caminho absoluto de maquina local: `/Users/leandrobosaipo/Projetos/AdOps/docs/pi-9042026-texto`
- Causa real consolidada:
  - a rota `GET /api/sync/planilha/preview` executa `scripts/src/sync-planilha-latest.ts` via `tsx`; no runtime do VPS, o container estava instalando dependencias em modo de producao cedo demais e podia nao ter o binario onde a rota esperava
  - alem disso, a inferencia de CNPJ/perfil de cliente em `pi-client-cnpj.ts` ainda carregava uma pasta por caminho absoluto de desenvolvimento local, quebrando fora da maquina do Leandro
- Regra consolidada:
  - o preview/sync da planilha em producao deve resolver o binario `tsx` por candidatos reais do projeto (`ADOPS_TSX_BIN`, `node_modules/.bin/tsx`, `scripts/node_modules/.bin/tsx`) e nao assumir um unico path fixo
  - qualquer referencia de arquivo auxiliar usada pelo script de sync precisa ser relativa a `ADOPS_PROJECT_ROOT` e ter fallback seguro se a pasta nao existir
- Licao de manutencao:
  - quando uma rota operacional da API executa script TypeScript em runtime, o checklist de deploy deve incluir o toolchain necessario dentro do container, nao so o artefato `dist`
  - se o erro de preview mudar de `ENOENT` para uma excecao de script depois do primeiro deploy, isso normalmente indica que a rota voltou a executar e o proximo gargalo esta no proprio script

## 2026-04-16 - Sincronizacao da planilha precisa normalizar formato e tolerar campanhas duplicadas para nao recriar insercoes

- Problema observado:
  - havia caso real de duplicidade historica no `OMT` em que a mesma insercao existia em dobro porque o formato variava apenas em caixa: `MEGABANNER HOME 1` vs `Megabanner Home 1`
  - a sincronizacao antiga comparava `localFormatoNormalizado` por igualdade literal e podia nao reconhecer um registro ja existente
  - tambem pode haver mais de uma campanha com a mesma identidade logica (`nome + PI + cliente + agencia + site`), o que empurra o importador a criar mais uma insercao se ele olhar so uma campanha
- Regra consolidada:
  - o importador deve comparar formatos sempre por `normalizeFormato(...)`
  - quando houver campanhas duplicadas com a mesma identidade, o sync deve reaproveitar a campanha canonica mais antiga, avisar em `warnings` e procurar insercoes em todos os `campaignIds` candidatos antes de criar uma nova
- Licao de manutencao:
  - se aparecer suspeita de insercao duplicada em `OMT` ou outro portal, revisar primeiro se a duplicidade veio de variacao textual de formato/local ou de campanhas duplicadas criadas em rodadas anteriores
  - a saida do sync precisa continuar expondo `warnings` operacionais porque eles viram o melhor rastreio para entender por que o importador atualizou um registro antigo em vez de criar outro

## 2026-04-16 - Criacao de anuncios nao pode confiar so no WhatsApp quando a planilha oficial diverge de site e formato

- Problema observado nesta rodada:
  - o WhatsApp apontava `MICHEL TELO - ENERGISA` como algo de `Home do Roo Noticias` / `LATERAL` com criativo `300x250`
  - a planilha oficial sincronizada trouxe a mesma campanha como `PERRENGUE`, com duas insercoes: `MEGABANNER TOPO` e `VIDEO`
  - para `IPTU 2026`, a planilha trouxe duas insercoes distintas: `AFL` (`PI 89229`) e `PERRENGUE` (`PI 89242`), enquanto o WhatsApp so entregou um criativo `728x90 interno de noticias`
- Regra consolidada:
  - a planilha continua sendo a fonte de verdade para `site`, `periodo`, `PI` e `formato`
  - o WhatsApp entra como complemento operacional de criativo, redirect e urgencia, mas nao deve sozinho redefinir o portal/formato do anuncio sem reconciliar com a planilha
- Licao de manutencao:
  - antes de criar anuncio novo no AdRotate, validar se `planned` no AdOps e a conversa do WhatsApp apontam para o mesmo `siteSigla + formato + PI`
  - se houver divergencia, o certo e segurar a publicacao e pedir confirmacao humana, porque o risco deixa de ser tecnico e passa a ser de veiculacao errada em portal errado

## 2026-04-16 - Nem todo anuncio novo precisa ser criado do zero; alguns ja existem ativos no portal e so faltam ser vinculados ao AdOps

- Caso observado nesta rodada:
  - na `AFL`, a insercao nova `1199` (`IPTU 2026`, `PI 89229- PREF PVA`, `INTERNO DE NOTICIAS`) ja tinha um anuncio ativo no grupo `14` com imagem publicada e redirect correto, mas ainda sem `adops_insertion_id`, `adops_campaign_id`, `adops_external_key` e `adops_media_basename` certos
  - no `PERRENGUE`, a insercao nova `1203` (`IPTU 2026`, `PI 89242- PREF PVA`, `INTERNO DE NOTICIAS`) tambem ja tinha anuncio ativo no grupo `11` em situacao parecida
- Regra consolidada:
  - antes de sair criando anuncio novo por SQL/admin, rodar `wp adrotate adops inspect --group=<id>` para ver se ja existe uma peca ativa ou prepublicada aguardando apenas o vinculo
  - quando o anuncio ja existe e esta publicando a criativa certa, o caminho mais seguro e completar o vinculo com `wp adrotate adops link <ad-id> --insertion=... --campaign=... --pi=... --external-key=... --media-basename=... --apply`
- Licao de manutencao:
  - o `inspect` do plugin virou a checagem inicial obrigatoria para grupos com insercao nova sincronizada
  - isso reduz risco de duplicar anuncio no portal e preserva o que o operacional ja publicou manualmente no WordPress

## 2026-04-16 - Seguir a planilha como prioridade pode transformar o problema de publicacao em falta objetiva de midia

- Caso observado:
  - ao priorizar a planilha, `MICHEL TELO - ENERGISA` deixou de ser um caso de `ROO / LATERAL 300x250` e passou a ser `PERRENGUE`, com duas insercoes oficiais: `MEGABANNER TOPO` e `VIDEO`
  - a unica criativa recebida na pasta/WhatsApp desta rodada para essa campanha foi `300x250-entenda-sua-conta.gif`, que nao atende nenhum dos dois formatos oficiais da planilha
- Regra consolidada:
  - se a planilha aponta `MEGABANNER TOPO` e `VIDEO`, nao se deve improvisar publicacao com uma criativa `300x250` so porque ela chegou primeiro no WhatsApp
  - nesses casos, o sync do AdOps pode e deve criar a insercao planejada, mas a criacao/publicacao do anuncio no portal fica bloqueada ate chegar a midia correspondente ao formato oficial
- Licao de manutencao:
  - separar claramente `sincronizacao de insercao` de `publicacao de anuncio`
  - uma insercao nova pode estar correta no AdOps e continuar com `mediaUrl = null` legitimamente ate o operacional entregar o arquivo certo para o formato correto

## 2026-04-16 - O backend de insercoes ja aceitava `mediaUrl` na rota, mas o contrato Zod/OpenAPI descartava o campo

- Problema observado:
  - ao tentar sincronizar manualmente a `mediaUrl` das insercoes `1199` e `1203`, a rota `PATCH /api/insertions/:id` respondia normalmente, mas o valor continuava `null`
  - no codigo da rota, `parsed.data.mediaUrl` ja era tratado, mas o schema `UpdateInsertionBody` nao expunha `mediaUrl`
- Causa real:
  - o `safeParse` do `UpdateInsertionBody` removia `mediaUrl` do payload antes da montagem de `updateData`
  - isso deixava a rota com “cara de pronta”, mas sem efeito real para esse campo
- Regra consolidada:
  - quando um campo parece aceito pela rota mas nao persiste, comparar sempre o handler com o contrato em `lib/api-zod/src/generated/api.ts` e com o `openapi.yaml`
  - para `insertions`, `mediaUrl` precisa existir em `openapi`, no schema Zod gerado e no tipo TS gerado; se faltar em uma dessas camadas, o patch fica inconsistente

## 2026-04-16 - `print-single` por insercao no Pages publico deve virar job remoto sem exigir token

- Problema observado:
  - na tela publica de insercao, o botao `Gerar print` ainda barrava o usuario com a mensagem `Cole o token de operador neste navegador para gerar o print pelo Cloudflare.`
  - o runner remoto ja suportava `print-single`, mas a UI e o Worker publico ainda tratavam a captura individual como acao protegida
- Causa real:
  - o frontend fazia um bloqueio antecipado quando `isCloudflarePublic && !hasToken`
  - o Worker publico so abria excecao sem token para `print-backfill` por insercao, enquanto `POST /api/insertions/:id/capture-proof` continuava caindo na camada `notSupported(...)`
- Regra consolidada:
  - `print-single` por insercao e uma acao publica segura o suficiente para virar fachada de job remoto no Cloudflare, assim como o retroativo por insercao
  - a rota correta para o Pages publico e `POST /api/insertions/:id/capture-proof`, que deve criar um job `print-single` com `source = cloudflare-pages-public`
  - lotes amplos, `fix-invalid` e outras rotinas de manutencao continuam atras do Bearer token em `/api/ops/...`
- Evidencia validada:
  - `POST /api/insertions/1199/capture-proof` sem token respondeu `202`
  - o job `9b3bae46-4dd5-46e0-b3ad-d2a72078bc74` saiu de `queued` para `completed`
  - a captura gerou a evidencia `AFL_IPTU2026_PREFPVA_PI89229_2026-04-16_INTERNODENOTICIAS.png`

## 2026-04-16 - Na AFL interna a auditoria final nao pode depender cegamente de `visualAudit.ok`

- Problema observado:
  - a insercao `1199` da `AFL`, em `INTERNO DE NOTICIAS`, aparecia com `Hora da moldura` e `Hora do site` corretas, slot `1/1` carregado e viewport `3/4`, mas ainda caia em `invalid_audit`
  - o payload publico mostrava `issues: []`, o que indicava que a regra de tolerancia do portal estava sendo lida, mas o `ok` final continuava falso
- Causa real:
  - `evaluateCaptureMetadata()` ainda exigia `visualAudit.ok === true`
  - esse campo vinha salvo na metadata da captura com a regra antiga mais rigida, enquanto a AFL ja tinha `auditOverrides.allowViewportImageMisses = 1`
  - na pratica, a auditoria recalculava `viewportImagesOk = true`, mas era derrubada por um booleano historico gravado antes do ajuste operacional
- Regra consolidada:
  - a decisao final da auditoria precisa usar os contadores reais (`viewportImagesLoaded/Total`, `slotImagesLoaded/Total`, backgrounds, videos) e a configuracao viva do portal/formato
  - `visualAudit.ok` deve ser tratado no maximo como sinal auxiliar da captura, nao como criterio final quando o backend ja reavalia a metadata com overrides atuais
- Evidencia validada:
  - antes do patch, `GET /api/insertions/1199/capture-proof/status?date=2026-04-16` retornava `status = invalid_audit` com `issues = []`
  - depois do patch e do deploy no VPS, a mesma rota passou a retornar `status = audited`

## 2026-04-16 - O periodo errado no PDF de Analytics era sobrescrita de arquivo no Spaces, nao erro de periodo no AdOps

- Problema observado:
  - na insercao `865`, o painel mostrava o periodo correto do job (`pi`, `full_month` ou `custom`), mas o PDF baixado podia abrir com outro periodo
  - a lista de relatorios acumulava varios jobs diferentes apontando para URLs quase iguais do Spaces
- Causa real:
  - o AdOps estava enviando para o runner o periodo certo
  - o gerador GA4 publicava os PDFs com nome generico por site/competencia, como `Perrengue Cidade Abril 26 - Analytics.pdf`
  - quando um novo job era concluido, ele sobrescrevia o arquivo anterior no mesmo caminho do Spaces; o metadata do job continuava correto, mas o binario baixado ja era de outra execucao
- Regra consolidada:
  - cada job de Analytics precisa publicar com nome unico por execucao, incluindo no minimo `site`, `campanha`, `cliente`, `PI`, `periodo` e um timestamp compacto
  - o runner remoto deve passar esse nome explicitamente para o gerador, em vez de depender do template generico do `.env`
  - a origem do problema deve ser diagnosticada primeiro no storage/publicacao, nao na tela do AdOps, quando o periodo do card esta certo e o PDF esta errado
- Evidencia validada:
  - um novo job `pi` da insercao `865` foi concluido com `downloadUrl = .../PERRENGUE_FILA_ZERO_GOVERNO_DO_ESTADO_PI_14028_2026_04_03_2026_04_14_ANALYTICS_20260416-150824.pdf`
  - esse arquivo novo deixou de sobrescrever os PDFs antigos e passou a carregar o periodo correto do job

## 2026-04-16 - A exportacao ZIP da insercao precisa anexar todos os relatorios de Analytics concluidos, nao apenas o mais recente

- Problema observado:
  - o pacote `ZIP + TXT` anexava so um PDF de Analytics, mesmo quando a insercao ja tinha varios relatorios concluidos
  - isso escondia historico util de `pi`, `full_month` e testes customizados
- Regra consolidada:
  - a pasta `02-ANALYTICS/` do ZIP deve incluir todos os relatorios concluidos com `downloadUrl`, cada um com nome de exportacao estavel e unico
  - o `00-LEIA-ME.txt` deve registrar que os anexos de Analytics foram incluidos e qual periodo cada arquivo representa
- Evidencia validada:
  - o ZIP da insercao `865` passou a sair com:
    - `02-ANALYTICS/perrenguemt-ga4_pi_2026-04-03_2026-04-14_2026-04-16-14-49-55.pdf`
    - `02-ANALYTICS/perrenguemt-ga4_full_month_2026-04-01_2026-04-16_2026-04-16-14-50-08.pdf`
    - `02-ANALYTICS/perrenguemt-ga4_pi_2026-04-03_2026-04-14_2026-04-16-15-08-16.pdf`

## 2026-04-16 - A lista de relatorios de Analytics precisa expor `createdAt`, `fileName` e permitir exclusao operacional

- Problema observado:
  - a tela da insercao mostrava varios relatorios anexados, mas sem informar quando cada um foi gerado
  - tambem nao havia acao de exclusao para limpar testes ou PDFs antigos sobrescritos
- Regra consolidada:
  - a API publica de relatorios deve devolver `createdAt`, `periodMode`, `fileName`, `campaignName`, `clientName` e `piCodigo`
  - a UI da insercao deve mostrar esses campos no card e oferecer `Excluir` por relatorio
  - a exclusao deve atuar no job de Analytics correspondente, para a lista refletir o estado real do D1/Cloudflare
- Evidencia validada:
  - a tela publicada da insercao `865` passou a mostrar `Gerado em`, `modo`, `Arquivo` e o botao `Excluir`
  - `DELETE /api/analytics/reports/5511b063-5a77-4ed6-98b6-d5e0987c88bf` respondeu `{ ok: true }` e o relatorio saiu da lista publica em seguida

## 2026-04-16 - O fluxo publico de `print-single` precisa expor progresso de fila/runner e distinguir `skipped` de falha

- Problema observado:
  - na insercao `860`, o dia `2026-04-15` ainda aparecia como pendente e a UI passava a impressao de que a captura exigia token ou tinha falhado
  - o job publico era criado com sucesso no Worker, mas enquanto ficava em `queue_received` a mensagem visual ainda era generica demais
  - quando um segundo disparo acontecia, o runner respondia `skipped` porque a evidencia do dia ja existia, mas isso podia ser lido como erro operacional
- Causa real:
  - o backend/runner do `print-single` publico estava correto; o problema era o feedback da interface
  - a UI tratava estados intermediarios (`queued`, `ready_for_runner`, `running`) com mensagem unica e nao mostrava `stage`/`note`
  - a conclusao com `execution.skipped = true` nao era diferenciada de uma conclusao normal
- Regra consolidada:
  - o detalhe da insercao deve mostrar progresso remoto do job com base em `status`, `result.stage`, `result.note` e `runnerId`
  - `queue_received` deve ser apresentado como fila recebida/aguardando execucao, nao como falha
  - `execution.skipped = true` deve virar mensagem explicita de "print do dia ja existe", nao erro
  - o erro final deve priorizar `payload.error`, `payload.result.error`, `execution.error` e `execution.reason`, nessa ordem
- Evidencia validada:
  - `POST /api/insertions/860/capture-proof` sem token respondeu `202` com job `b5e10e56-617b-414c-9001-c7a599270e78`
  - o job concluiu com `capture.status = ok` e criou a evidencia `PERRENGUE_IPTU2026_PREFCBA_PI13877_2026-04-15_MEGA_TOPO.png`
  - um segundo job (`9038fa9f-ae01-4c60-ba72-1f2059dd9e7f`) concluiu com `execution.skipped = true` e `reason = "Print do dia já existe e não será sobrescrito automaticamente."`
## 2026-04-16 — Configurações de agência e mídia/live match de inserção

- A tabela `agencies` já pode estar enriquecida no PostgreSQL enquanto a UI de `Configurações` continua parecendo vazia. Quando isso acontecer, o problema pode estar no contrato publicado de `Agency` (`openapi`/`api-zod`/`api-client-react`) ainda devolvendo só `id`, `nome`, `ativo` e `createdAt`. Nessa situação, o frontend de `Settings` não é a causa principal: ele já espera `razaoSocial`, `cnpj`, contatos e regras operacionais.
- O vínculo correto do modelo operacional continua sendo:
  - `campaigns`: identidade da campanha/PI e vínculo com `clienteId` e `agenciaId`
  - `insertions`: realidade operacional por `siteId + formato + período`, sempre filha da campanha
  - `sites`, `clients` e `agencies`: tabelas mestre usadas para enriquecer campanha e inserção
- `mediaUrl` de uma inserção não deve ser tratado como imutável só porque já tem valor salvo. Se o live preview do site mostrar a mesma mídia em URL pública melhor/canônica (ex.: Spaces offload), a rotina de `sync-live` precisa conseguir corrigir o valor salvo, desde que exista uma única inserção planejada para o grupo e uma única mídia pública ativa no grupo.
- Em `portalpantanalmt.com`, uma peça pode ser publicada com URL final no Spaces mesmo que o cadastro tenha ficado com URL local do WordPress. O caso da inserção `1204` mostrou isso claramente: o detalhe da inserção exibia `https://portalpantanalmt.com/app/uploads/...`, enquanto o match vivo correto no site era `https://portalpantanalmt.nyc3.digitaloceanspaces.com/app/uploads/...`.
- Em `roonoticias.com`, uma mídia recém-importada no WordPress pode ficar com `guid` local (`https://roonoticias.com/app/uploads/...`) mesmo quando o host canônico da operação é o bucket do Spaces. No fluxo de AdOps/AdRotate isso é relevante: se a peça existe em `https://roonoticias.nyc3.digitaloceanspaces.com/...` ou `https://roonoticias.nyc3.cdn.digitaloceanspaces.com/...`, essa URL deve vencer a local no `AdRotate` e no `mediaUrl` da inserção, porque a URL local pode impedir renderização consistente no slot e quebrar o print.
- Em `perrenguematogrosso.com`, a URL pública válida da mídia pode continuar sendo o próprio domínio do site. O caso da inserção `1201` não era “URL errada para Spaces”; era a peça correta servida pelo domínio principal do portal.
- A tela de relação com AdRotate pode parecer “duplicada” sem haver dois anúncios diferentes cadastrados. Existem dois motivos distintos:
  - o mesmo `adId` pode aparecer em mais de uma página pública e gerar mais de um item em `exactLiveMatches`
  - outra inserção da mesma campanha pode compartilhar o mesmo grupo e aparecer em `fallbackCandidates`
- O rótulo operacional da posição no detalhe da inserção deve priorizar o próprio `localFormatoNormalizado`/`localFormato` da inserção. Usar o primeiro alias do grupo como fonte principal distorce a leitura quando um mesmo grupo atende mais de um formato.
- A logo mostrada na tela da inserção não deve depender só de `SITE_LOGOS` estático do frontend. Quando disponível, a UI deve priorizar `site.logoUrl` vindo do cadastro do site para refletir a configuração viva de `Settings`.
