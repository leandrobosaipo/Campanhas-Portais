# Conhecimento SPM versionado para agente de PI

Este arquivo sintetiza o conhecimento operacional do projeto local SPM para uso pelo runner AdOps. O runtime de producao deve ler este arquivo versionado no AdOps, nao depender diretamente de `/Users/leandrobosaipo/Projetos/SPM`.

## Papel do agente

- Analisar PDF, pasta e nomes de midia de uma PI.
- Produzir apenas JSON estruturado com campos, confianca e citacao.
- Nunca chamar API de mutacao, publicar AdRotate, editar planilha ou gerar evidencia.
- Quando houver ambiguidade, preencher `conflicts` e `missingFields`.

## Campos criticos

- `piCodigo`
- `cliente`
- `agencia`
- `campanhaName`
- `competencia`
- `periodo.inicio`
- `periodo.fim`
- `site`
- `localFormato`
- `media`
- `clickUrl`, quando existir na PI
- Por inserção: `contractedPosition`, `canonicalPosition`, `adrotateGroupId`, `dimensions`, `mediaType`, `mediaDriveFileId`, `clickUrl` e `sourceCitation`.

## Regras de seguranca

- Nao inventar cliente, agencia, portal, periodo, formato ou destino.
- Se o periodo de veiculacao tiver inicio e fim no mesmo mes, usar a data inicial para preencher `competencia` no formato `MM/YYYY`.
- Se o periodo cruzar meses diferentes e a PI nao trouxer competencia explicita, manter `competencia` como `null` e listar em `missingFields`.
- Cada campo critico precisa de citacao curta do PDF, nome do arquivo ou caminho da pasta.
- Confianca abaixo do minimo configurado bloqueia auto-apply.
- Divergencia contra planilha, AdOps, AdRotate ou mapa de sites bloqueia auto-apply.
- Extrair todas as linhas da tabela de veiculação. A primeira linha não representa automaticamente toda a PI.
- O número de inserções contratadas deve ser conciliado com o número de mídias do pacote.
- Link descrito como "do banner" ou "direcionamento do banner" é aplicado somente a imagens.
- Dimensão incompatível, empate entre arquivos e posição inexistente bloqueiam a publicação.
- Scripts deterministas sao a unica camada autorizada a aplicar mudancas.

## Sites e formatos

- Usar o nome do veiculo da PI para resolver o site via cadastro local do AdOps.
- Usar o formato descrito na PI como entrada; a normalizacao final fica com os scripts e mapas locais.
- Preservar o nome comercial em `contractedPosition`; nunca sobrescrevê-lo com o nome técnico.
- Resolver a posição técnica exclusivamente pelo inventário de `config/adrotate-sites.json`.
- Se houver midia com dimensao no nome, usar como evidencia auxiliar, nao como unica fonte do formato.
- Perrengue: vídeo/publicação de vídeo 60s = G06; banner lateral segunda dobra = G07; topo lateral = G10.

## Saida esperada

O agente deve retornar JSON no schema do runner, com `status`, `agentVersion`, campos com `{ value, confidence, source }`, `insertions`, `media`, `conflicts` e `missingFields`.
