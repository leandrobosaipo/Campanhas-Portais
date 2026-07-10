# Central de Sincronização

## Objetivo

Dar suporte à implantação do sistema rodando em paralelo com a planilha, reduzindo risco antes do corte definitivo.

## O que a tela cobre

### 1. Preview da planilha

Executa a leitura da planilha mais recente sem gravar nada.

Mostra:

- linhas lidas
- campanhas novas
- campanhas atualizadas
- inserções novas
- inserções atualizadas
- avisos
- amostra das mudanças previstas

Endpoint:

- `GET /api/sync/planilha/preview`

### 2. Aplicar sincronização

Executa a sincronização incremental real da planilha.

Endpoint:

- `POST /api/sync/planilha/latest`

### 3. Revisão de competência

Mostra divergências entre:

- competência da campanha
- período real das inserções

Classificação atual:

- `safe_update_campaign`
  - seguro atualizar a competência da campanha
- `review_split_campaign`
  - a campanha tem mais de uma inserção e provavelmente precisa ser desdobrada
- `review_multiple_period_rules`
  - caso mais ambíguo que depende de regra de negócio

Endpoint de leitura:

- `GET /api/sync/planilha/diagnostics`

Endpoint de aplicação segura:

- `POST /api/sync/competencia/apply-safe`

## Estado atual validado

- `invalidDates = 0`
- `competenciaMismatch = 2`

Casos manuais restantes:

- `VACINA - PREF CUIABÁ`
- `LINGUAGEM ALMT`

## Conciliação com o site

A mesma central usa duas fontes para comparar o planejado com o exibido:

### Planejado no AdOps

- `GET /api/integrations/adrotate/planned`

### Exibido no site público

- `GET /api/integrations/adrotate/live-preview`

Essa leitura pública já identifica:

- `groupId`
- `adId`
- `mediaBasename`
- `pageUrl`

## Auditoria operacional de prints

Além da sincronização, a operação agora tem duas camadas para tratar falhas de evidência:

### Lista de inserções

- mostra o status rápido da auditoria por linha
- quando houver problema, abre um resumo do que falhou:
  - hora da moldura
  - hora do site
  - primeira dobra
  - imagens do anúncio
  - backgrounds
  - vídeos/posters

### Fila `Falhas de Prints`

- concentra evidências `invalid_audit` e `invalid_url`
- organiza por inserção e por dia
- evita a necessidade de abrir cada inserção só para descobrir o erro

Rota:

- `GET /api/insertions/capture-proof/audit/failures`

## Limites conhecidos

- a central ainda não faz `split` automático de campanha
- a conciliação pública verifica o que está visível no site, não o inventário completo administrativo do banco do AdRotate
- a política final de competência para campanhas multi-mês ainda depende de regra operacional confirmada

## Padrao operacional daqui para frente

A partir desta rodada, os fluxos de maior impacto devem seguir o mesmo desenho:

1. mostrar previa
2. explicar impacto
3. pedir confirmacao
4. executar em segundo plano quando a tarefa for longa
5. mostrar progresso e resultado final

Esse padrao passa a valer como referencia para futuras sincronizacoes de:

- planilha
- PI recebida por email
- conciliacao com AdRotate
- lotes de retroativos
