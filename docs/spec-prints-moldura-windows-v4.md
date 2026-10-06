# SPEC - Prints AdOps com Moldura Windows 11 + Chrome Claro v4

## Escopo legado e precedência — 06/10/2026

Este documento conserva o contrato do kit v4. O identificador histórico `windows11_chrome_real_template` descreve o compositor existente e não certifica uma screenshot nativa do Windows nem o uso de Segoe UI original. A apresentação nova v5 usa `windows11_chrome_reconstructed_template`, Selawik e recursos gráficos abertos autorizados, sem reinterpretar PNGs ou metadata antigos.

Para novas reconstruções, seguir a [SPEC de reconstrução v4 e moldura v5](./adops/retroactive-proof-v4/spec.md) e seu [HARNESS](./adops/retroactive-proof-v4/harness.md). Proveniência v4 e kit visual v5 são versões de contratos diferentes. O rollout novo exige canário e readback; este runbook legado não comprova sua publicação.

## Objetivo

Padronizar a composicao visual dos prints AdOps com moldura `windows11_chrome_real_template`, mantendo a auditoria baseada no viewport real capturado pelo Playwright.

## Contrato visual legado v4

- `frameTemplateVersion`: `windows11-chrome-light-similar-v4`.
- `chromeTopTheme`: `light`.
- O topo do Chrome nao pode conter texto ou icone fixo de outro site.
- A aba ativa deve ser repintada por `tabSurface` antes de renderizar logo e titulo.
- O icone da aba vem de `artifacts/adops/public/site-logos/{siteSigla}.{png|webp|jpg|jpeg}`.
- O titulo da aba vem de `browserTitle` do mapping do site.
- A barra de endereco usa URL/dominio real da pagina capturada.
- A barra inferior usa data/hora derivada de `captureAt` ou da data efetiva da captura.
- A barra de rolagem usa `pageScrollMetrics`; ela nao e decorativa.

## Metadata obrigatorio

Cada captura composta deve registrar:

- `frameTheme = "windows11_chrome_real_template"`
- `frameTemplateVersion`
- `frameTemplateSize`
- `frameStrictAssetsOk = true`
- `dynamicFields` contendo `addressText`, `tabSurface`, `tabTitle`, `tabIcon`, `systemDateTimeInline`
- `chromeTopTheme = "light"`
- `tabSurfaceRendered = true`
- `tabTitleRendered = true`
- `tabIconRendered = true`
- `tabIconFallback = false` para sites com logo local
- `scrollbarRendered` conforme altura real do documento
- `scrollbarThumbTop`
- `scrollbarThumbHeight`

## Arquivos de runtime

- Kit visual: `scripts/assets/desktop-frame/windows11-chrome-light/`
- Layout: `scripts/assets/desktop-frame/windows11-chrome-light/layout.json`
- Compositor: `scripts/src/capture-insertion-proof.cjs`
- Gerador do kit: `scripts/src/build-windows-frame-kit.mjs`
- Teste de contrato: `scripts/src/test-windows-frame-template.mjs`

## Regras de seguranca operacional

- Nao publicar evidencia se os assets obrigatorios da moldura estiverem ausentes.
- Nao usar fallback fake quando a fonte configurada estiver ausente.
- Nao alterar selecao de frame, auditoria, preview retroativo ou regras por site ao mexer na moldura.
- Se `tabIconFallback=true` em site que possui logo local, tratar como falha de aceite visual.
- Prints sem `mediaUrl` nao devem ser forcados; primeiro corrigir o cadastro da insercao.

## Regeneracao do kit similar

```bash
ADOPS_CAPTURE_PYTHON=/Users/leandrobosaipo/.openclaw/venvs/whoispdf/bin/python \
pnpm --dir scripts run frame:build-windows-template -- \
  --generateSimilar true \
  --width 1280 \
  --chromeTopHeight 102 \
  --taskbarHeight 42 \
  --overlayIcons true
```
