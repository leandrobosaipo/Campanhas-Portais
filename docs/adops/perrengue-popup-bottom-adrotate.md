# POP UP inferior do Perrengue via AdRotate

## Objetivo

O POP UP inferior do Perrengue replica o comportamento antigo do WordPress no template estatico, mas sem hardcode de campanha ou midia.

Ele e um slot real controlado pelo AdRotate no grupo `PERRENGUE:9`.

## Fonte oficial

- Portal: `PERRENGUE`
- Grupo AdRotate: `9`
- Posicao operacional: `POP UP / 970x90`
- Pagina: somente home
- Fonte da midia e do periodo: AdRotate exportado a partir do fluxo operacional

O template nao deve conter arquivo, PI, campanha ou midia fixa, incluindo `vg-popup-970x90.gif`.

## Comportamento no site

Quando o grupo `9` existe e esta ativo na home exportada, o renderer cria o container:

```html
<aside id="cod5-bottom-popup-ad" data-cod5-popup-ad="bottom-fixed">
  <div class="cod5-bottom-popup-ad__inner">
    <button type="button" aria-label="Fechar publicidade"></button>
    <div class="g g-9">...</div>
  </div>
</aside>
```

O popup fica fixo no rodape da janela, centralizado, com largura horizontal responsiva e uma margem inferior leve.

A pagina pode rolar normalmente. O popup continua fixo no rodape enquanto estiver aberto.

## Fechamento

O usuario pode fechar por:

- botao `Fechar publicidade`;
- tecla `Escape`.

O fechamento vale apenas para o carregamento atual da pagina.

Nao usar `localStorage` nem `sessionStorage`. Ao recarregar a pagina, se o AdRotate ainda estiver ativo, o popup volta a aparecer.

## Regras de captura

A regra de captura do grupo `PERRENGUE:9` deve apontar para o slot real inferior:

```json
{
  "siteSigla": "PERRENGUE",
  "groupId": 9,
  "slotSelector": "#cod5-bottom-popup-ad .g.g-9",
  "contextSelector": "#cod5-bottom-popup-ad",
  "scrollMode": "top",
  "proofStyle": "viewport_only",
  "auditOverrides": {
    "requireSlotVisibleInViewport": true
  }
}
```

A evidencia deve ser bloqueada se `.g.g-9` aparecer no header, antes do logo/menu ou fora do container `#cod5-bottom-popup-ad`.

## Operacao

1. Publicar ou encerrar campanhas POP UP no AdRotate pelo grupo `9`.
2. Rebuildar o template estatico do Perrengue.
3. Validar a home publica.
4. Gerar print somente quando o popup estiver ativo para a data.

Se o AdRotate nao entregar grupo `9` ativo na home, o template nao renderiza popup e o print deve ficar pendente. Nao criar DOM artificial para cliente.

## Testes

No projeto estatico Perrengue:

```bash
npm run test:static-contracts
```

No projeto AdOps:

```bash
pnpm --dir scripts run test:perrengue-popup-capture-rule
pnpm --dir scripts run test:perrengue-header-ad-policy
pnpm --dir scripts run audit:capture-rules-integrity
```

Validacoes visuais obrigatorias:

- a home mostra no maximo um banner no header;
- `.g.g-9` nao aparece no header;
- o popup aparece fixo no rodape somente quando o grupo `9` esta ativo;
- fechar por botao e `Escape` oculta o popup;
- reload volta a exibir quando o AdRotate continua ativo.
