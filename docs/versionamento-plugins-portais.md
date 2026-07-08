# Versionamento de Plugins nos Portais

## Estado confirmado em 12/04/2026

### AdRotate
- `perrenguematogrosso.com`: `5.17.2-c5.8`
- `omatogrossense.com`: `5.17.2-c5.8`
- `afolhalivre.com`: `5.17.2-c5.8`
- `portalnortemt.com`: `5.17.2-c5.8`
- `portalpantanalmt.com`: `5.17.2-c5.8`
- `roonoticias.com`: `5.17.2-c5.8`

### MU-plugins operacionais
- `cod5-avif-fallback.php`: `1.0.0` em todos os 6 portais
- `cod5-adops-retro-preview.php`: `1.0.1` em todos os 6 portais

### Evidência objetiva
- `AdRotate`:
  - `Version: 5.17.2-c5.8` em todos os 6 portais
- `cod5-avif-fallback.php`:
  - `Version: 1.0.0` em todos os 6 portais
- `cod5-adops-retro-preview.php`:
  - `Version: 1.0.1` em todos os 6 portais

### Hash do arquivo principal `adrotate.php`
- todos os 6 portais:
  - `de33005b77388a69f1af659b27a14c3b`

## Conclusão operacional

Hoje o `drift` anterior foi eliminado para os plugins gerenciados desta operação.

Isso significa:
- não basta olhar o nome do plugin
- não basta assumir que “todos estão iguais” sem auditoria
- é preciso controlar:
  - versão declarada
  - hash do arquivo principal
  - changelog do que entrou em cada revisão `c5.x`
  - data do rollout multisite

## Padrão recomendado de versionamento

### Regra 1
Usar o sufixo `-c5.x` como revisão operacional da Código5.

Exemplo:
- `5.17.2-c5.7`
- `5.17.2-c5.8`

### Regra 2
Toda alteração funcional no AdRotate customizado deve:
- subir o número da revisão `c5`
- entrar no changelog
- registrar quais portais já receberam rollout

### Regra 3
MU-plugins próprios da operação também devem ter header `Version:` e changelog mínimo.

Exemplo atual:
- `cod5-avif-fallback.php`: `1.0.0`
- `cod5-adops-retro-preview.php`: `1.0.1`

## Padrão recomendado de administração

### Fonte canônica
Definir uma fonte única para cada plugin operacional:
- AdRotate customizado:
  - referência atual: portal `Perrengue`
- MU-plugins multisite:
  - referência atual: `maintenance-facilnamao/mu-plugins/`

### Checklist de rollout
Sempre registrar:
- versão alvo
- arquivos alterados
- portais atualizados
- portais pendentes
- data do rollout
- validação feita

### Regra de cadastro AdRotate + AdOps

Para anúncios com arquivo selecionado no AdRotate:

- o campo `image` pode apontar para o arquivo real/CDN;
- o `bannercode` deve referenciar a mídia com `src="%asset%"`;
- não salvar AdCode com `src="https://..."` quando existe arquivo selecionado;
- não salvar AdCode vazio quando existe arquivo selecionado;
- não sincronizar `mediaUrl` no AdOps a partir de anúncio com `image` preenchido e `bannercode` sem `%asset%`.

Motivo: o AdRotate marca o anúncio como erro de configuração, o banner pode sumir do slot público e a captura retroativa passa a procurar mídia diferente da publicada.

Validação rápida por portal:

```sql
SELECT id, title, type, author, image
FROM wp_adrotate
WHERE image <> '' AND bannercode NOT LIKE '%asset%';
```

Nos portais irmãos com prefixo `wpve_`, trocar `wp_adrotate` por `wpve_adrotate`.

## Checklist mínimo antes de dizer que “todos estão iguais”

1. conferir `Version:` do plugin
2. conferir hash do arquivo principal
3. validar se o portal carregou o comportamento esperado
4. atualizar o runbook

## Aprendizado consolidado

O Perrengue realmente havia virado referência temporária de novas correções antes dos outros portais receberem rollout.

Nesta rodada isso foi normalizado, mas a regra continua válida:
- qualquer correção funcional em plugin gerenciado precisa sair com plano de rollout
- sem auditoria de hash e versão, a equipe pode achar que os portais estão iguais quando não estão

## Próximo padrão recomendado

Criar uma rotina de auditoria de versão multisite para:
- AdRotate
- MU-plugins operacionais
- tema principal

Ela deve devolver, por portal:
- versão declarada
- hash
- status `igual / divergente`

## Estado desta rodada

- auditoria executada via:
  - `pnpm --filter @workspace/scripts run audit:wordpress-managed-versions`
- relatório gerado:
  - [auditoria-versionamento-wordpress-2026-04-12.md](/Users/leandrobosaipo/Projetos/AdOps/docs/auditoria-versionamento-wordpress-2026-04-12.md)
