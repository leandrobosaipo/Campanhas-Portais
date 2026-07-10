# Integração AdRotate ↔ AdOps

## O que já está pronto

- Botão `Gerar print` na lista de inserções e no detalhe da inserção.
- Captura semi-automática sem IA:
  - localiza o slot do AdRotate
  - compara o nome do arquivo da mídia esperada
  - gera o print da viewport com moldura Windows 11 + Chrome claro v4
  - envia para o Spaces
  - grava a evidência do dia na inserção
- Endpoint planejado para sincronização com WordPress:
  - `GET /api/integrations/adrotate/planned?competencia=ABRIL/2026`

## Estados visuais da captura

- `Pronto para gerar`
- `Adicionar mídia`
- `Gerando print`
- `Print salvo`
- `Falha na captura`

Esses estados foram centralizados em `adops-config.ts` para reaproveitamento em outras telas.

## Como o vínculo da mídia funciona

- Cada inserção pode ter uma `mediaUrl`.
- A automação extrai o nome do arquivo no final da URL.
- Esse nome é usado para encontrar o criativo correto dentro do slot do site.

Exemplo:

- `mediaUrl`: `https://perrenguematogrosso.com/app/uploads/2026/03/825x120-pref-3.gif`
- `mediaBasename`: `825x120-pref-3.gif`

## Mapeamento atual do Perrengue

- `MEGABANNER TOPO` -> grupo `1`
- `BANNER TOPO LATERAL` / `TOPO LATERAL` / `MEGA BANNER LATERAL` -> grupo `10`
- `PRIMEIRA DOBRA` / `HOME 1` -> grupo `2`
- `HOME 2` -> grupo `3`
- `HOME 3` -> grupo `4`
- `VIDEO - LATERAL` / `LATERAL PRIMEIRA DOBRA` -> grupo `6`
- `BANNER INTERNO NOTICIAS` / `INTERNO DE NOTICIAS` -> grupo `11`

## Saída planejada para o WordPress

O endpoint `integrations/adrotate/planned` entrega, por inserção:

- `insertionId`
- `campaignId`
- `campaignName`
- `piCodigo`
- `competencia`
- `siteSigla`
- `clienteNome`
- `agenciaNome`
- `localFormato`
- `periodoInicio`
- `periodoFim`
- `mediaUrl`
- `mediaBasename`
- `adrotateGroupId`
- `externalKey`

## Restrições conhecidas

- O ambiente local do WordPress estava sem conexão ativa com o MySQL no momento da implementação.
- Por isso, as mudanças no plugin foram validadas por sintaxe e por revisão estrutural, mas não por execução completa do `wp` local.
- O endpoint do dashboard e a captura semi-automática foram validados normalmente.
- Inserções sem `mediaUrl` não entram no print automático com segurança; primeiro é preciso vincular a mídia correta.

## Contrato da moldura atual

- Versão: `windows11-chrome-light-similar-v4`.
- Topo claro do Chrome sem conteúdo estático de outro site.
- Aba ativa renderizada dinamicamente com `tabSurface`, `tabIcon` e `tabTitle`.
- Rodapé preserva data/hora do sistema operacional.
- Barra de rolagem preserva posição real do site.
- A mudança de moldura não altera AdRotate, seleção de frame, preview retroativo ou auditoria de slot.

Validação:

```bash
pnpm --dir scripts run harness:prints-windows-frame-v4
```

## Próximo passo recomendado

1. Subir o MySQL/local do WordPress.
2. Rodar o upgrade do plugin AdRotate para criar as colunas AdOps.
3. Usar o comando WP-CLI novo para inspecionar anúncios e aplicar vínculos com segurança.
4. Só depois partir para sincronização em lote.
