# Produção e Operação

## Objetivo

Definir como levar o sistema para produção sem perder simplicidade operacional e sem tornar a manutenção difícil para usuários administrativos.

## O que precisa existir antes da produção

### Produto

- importação da planilha funcionando
- fluxo manual diário funcionando
- dashboard com dados reais
- nomenclatura operacional clara
- sincronização de implantação definida

### Dados

- base histórica importada
- clientes, agências, sites e formatos normalizados
- deduplicação mínima

### Segurança e acesso

- login por usuário
- perfis de acesso
- trilha de alteração mínima

## Arquitetura mínima recomendada para produção

### Aplicação

- frontend publicado em ambiente web estável
- API publicada separadamente
- banco PostgreSQL gerenciado

### Infra recomendada

- `Frontend`: Vercel, Netlify ou similar
- `API`: Railway, Render, Fly.io ou VPS gerenciada
- `Banco`: PostgreSQL gerenciado
- `Arquivos/evidências`: storage externo organizado por lote e inserção

## Variáveis e segredos

Em produção, no mínimo:

- `DATABASE_URL`
- `PORT`
- `NODE_ENV=production`
- futuro:
  - segredo de sessão
  - credenciais de storage
  - credenciais de observabilidade

## Checklist de produção

### Antes do deploy

- revisar `.env`
- revisar schema do banco
- garantir migrations ou `push` controlado
- testar importação com uma competência real
- validar dashboard com usuário gestor

### No deploy

- publicar API
- publicar frontend
- apontar frontend para a API de produção
- validar healthcheck
- validar login quando existir

### Após deploy

- importar lote inicial
- validar contagens por competência
- validar filtros
- validar anexos e evidências
- validar sincronização manual por botão
- validar sincronização automática por webhook

## Como manter administrável para os usuários

O sistema precisa continuar manual, mas fácil.

### Princípios

- poucos campos livres
- listas padronizadas
- preview antes de gravar importação
- labels operacionais claros
- filtros simples e previsíveis

### Recomendações de produto

- usar selects para site, agência, cliente e formato sempre que possível
- manter aliases para aceitar variações legadas da planilha
- permitir ações em lote para atualização de progresso
- destacar competências e pendências já na entrada
- evitar telas com excesso de campos ao mesmo tempo

### Recomendações de operação

- nomear um responsável pelo cadastro
- nomear um responsável pela revisão de importação
- definir rotina semanal de conferência
- definir quem aprova novos aliases de site, agência e formato

### Recomendações de manutenção funcional

- manter um dicionário de status e formatos
- documentar novas regras no repositório
- revisar mensalmente conflitos de importação
- ter ambiente de homologação para testar mudanças
- monitorar logs de sincronização e falhas por lote

## O que precisa ser monitorado

- erros de API
- falhas de importação
- tempo de resposta das telas principais
- crescimento do banco
- conflitos recorrentes de normalização

## Rotina recomendada de suporte

### Diário

- revisar pendências críticas
- revisar itens atrasados

### Semanal

- revisar importações e inconsistências
- revisar aliases novos

### Mensal

- validar competência fechada com a planilha original
- revisar performance e uso do banco
