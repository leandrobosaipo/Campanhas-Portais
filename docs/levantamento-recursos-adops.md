# Levantamento de recursos para o AdOps funcionar

## Objetivo
Este documento consolida os recursos mínimos para o sistema AdOps continuar operando durante a implantação paralela com a planilha e depois da virada operacional.

## Aplicação principal
- Frontend React/Vite do AdOps
- Caminho local do projeto: `/Users/leandrobosaipo/Projetos/AdOps`
- Build preparado para Cloudflare Pages
- Subdomínio alvo: `adops.codigo5.com.br`

## Banco de dados
- PostgreSQL do AdOps
- Ambiente local atual: `postgresql:///campanhas_portais_local`
- Recurso obrigatório para:
  - campanhas
  - inserções
  - evidências
  - tabelas mestre
  - parâmetros operacionais dos sites

## Armazenamento de evidências
- DigitalOcean Spaces
- Bucket operacional adotado para prints: `cod5`
- Base path padrão: `adops-prints`
- Uso:
  - print diário
  - prova de publicação
  - thumbnails e imagens derivadas quando necessário

## Sites monitorados
- `PERRENGUE`
- `OMT`
- `ROO`
- `AFL`
- `PNMT`
- `PPMT`

## Dependências por site
Cada site precisa ter no AdOps, no mínimo:
- sigla e nome
- domínio e URL pública
- host SSH, porta e usuário
- caminho do webroot
- caminho do WordPress
- caminho do WP-CLI
- versão e mapeamento do AdRotate
- workspace de manutenção
- regras de deploy e limpeza de cache

## WordPress / AdRotate
O sistema depende de:
- plugin AdRotate ativo
- grupos mapeados por posição de mídia
- acesso de leitura administrativa por `wp-cli` e consulta SQL quando necessário
- possibilidade de atualizar o título/sufixo do anúncio para relação com o AdOps
- manutenção do atributo de vínculo do anúncio com inserção/campanha/PI

## Serviços de cache e pós-deploy
Por portal, manter rotina validada de:
- `wp cache flush`
- limpeza de WP Rocket quando existir
- limpeza de Redis/Object Cache quando existir
- purge no Cloudflare quando houver mudança visual, estrutural ou de plugin

## Serviços de borda e DNS
- Cloudflare para domínio do AdOps e dos portais
- Pages para o frontend do AdOps
- DNS/CNAME do subdomínio `adops.codigo5.com.br`
- variável de ambiente `VITE_API_BASE_URL` apontando para a API do AdOps

## API do AdOps
A API continua separada do frontend nesta fase.
Ela precisa entregar:
- leitura e gravação de campanhas e inserções
- sincronização com planilha
- conciliação com AdRotate
- geração e auditoria de prints
- atualização de tabelas mestre e configuração dos sites

## Rotinas operacionais críticas
- sincronizar planilha atual
- conciliar AdOps x AdRotate
- preencher `mediaUrl` das inserções elegíveis
- gerar prints do dia em lote
- auditar se todos os prints do dia existem e estão válidos
- registrar evidência do dia no banco

## Acessos e workspaces de manutenção conhecidos
- Perrengue: `/Users/leandrobosaipo/.openclaw/workspace/wordpress_perrengue`
- Multisite Facil na Mão: `/Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/maintenance-facilnamao`

## Itens que não devem ficar só em memória humana
- mapeamento dos grupos do AdRotate por site
- caminhos de deploy
- ordem correta de limpeza de cache
- bucket/path dos prints
- domínio e subdomínio do AdOps
- estratégia de sincronização planilha -> AdOps -> AdRotate
- critérios de auditoria dos prints do dia

## Estado atual
Já centralizado no banco local do AdOps:
- domínio
- URL pública
- SSH host/porta/usuário
- caminhos WordPress/WP-CLI
- zone ID conhecido do Perrengue
- bucket/base path dos prints
- workspace de manutenção por site
- notas operacionais de deploy
