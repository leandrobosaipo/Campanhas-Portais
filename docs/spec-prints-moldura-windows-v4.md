# SPEC - Prints AdOps com Moldura Windows 11 + Chrome Claro v4

## Objetivo

Padronizar a composicao visual dos prints AdOps com moldura `windows11_chrome_real_template`, mantendo a auditoria baseada no viewport real capturado pelo Playwright.

## Contrato visual atual

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

