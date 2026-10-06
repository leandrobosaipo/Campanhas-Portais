# Moldura reconstruída de navegador e desktop

Este diretório contém um **template gráfico reconstruído** para enquadrar evidências AdOps. Os PNGs são desenhos gerados pelo projeto, não capturas reais do Chrome ou do Windows e não comprovam versão, sistema operacional ou navegador nativos.

## Kit atual

- `layout.json`: versão `windows11-chrome-light-similar-v5`, tema `windows11_chrome_reconstructed_template`, dimensões e coordenadas dinâmicas.
- `chrome-top[-LARGURA].png` e `taskbar[-LARGURA].png`: camadas raster preparadas offline nas larguras 1280, 1660 e 3320; o runner seleciona uma fonte com resolução suficiente e compõe com Pillow.
- `icons/`: SVGs licenciados de Windows, Search, Edge, Chrome, Site Controls (`sliders-horizontal`) e extensões (`puzzle`). O v5 também desenha estrela, + de nova aba e menu com formas próprias.
- `../fonts/selawik.ttf`: fonte Selawik sob SIL Open Font License 1.1; licença em `../fonts/LICENSE-Selawik.txt`.

O topo mostra uma única aba cujo título e URL vêm do portal. O favicon vem de um `link[rel*=icon]` observado na página pública. A busca usa `credentials: omit`, rejeita redirecionamentos, expira em 3 segundos e limita corpo a 1 MiB, URI `data:` a 1,4 MB e imagem a 512×512 pixels. Só aceita a mesma origem ou o host exato `cdn.perrenguematogrosso.com` quando o domínio configurado e observado é `perrenguematogrosso.com`; outros hosts externos são recusados. Se não for possível verificar a imagem, o compositor desenha um glifo genérico e registra `tabIconFallback=true`; o gate da auditoria final continua bloqueando esse caso. A barra inferior não inventa clima nem perfil. O relógio vem do instante auditado e aparece em duas linhas: `HH:mm` e `dd/MM/yyyy`, alinhado à direita.

## Compatibilidade e fonte

O identificador `windows11-chrome-light-similar-v4` permanece aceito para auditorias já gravadas. Ele também designa um template semelhante/reconstruído; não certifica captura nativa. Novas evidências usam v5 e o tema `windows11_chrome_reconstructed_template`.

Selawik é a fonte licenciada incluída. Não redistribua fontes proprietárias obtidas de uma instalação Windows. A página [Segoe UI da Microsoft](https://learn.microsoft.com/en-us/typography/font-list/segoe-ui) informa a disponibilidade da família e a [FAQ de fontes da Microsoft](https://learn.microsoft.com/en-us/typography/fonts/font-faq) explica as condições de redistribuição; este projeto não inclui nem afirma usar Segoe UI.

## Regenerar PNGs offline

Use o Python com Pillow configurado no ambiente de build:

```bash
ADOPS_CAPTURE_PYTHON=/caminho/para/python3 node scripts/src/build-windows-frame-kit.mjs
```

O comando gera as três resoluções com Pillow/Selawik e rasteriza os SVGs licenciados via `rsvg-convert`, disponível neste ambiente de build. Esse utilitário é necessário apenas offline para gerar assets; não é uma dependência do runner nem é chamado pelo compositor. Faça uma prévia sintética com `node scripts/src/test-windows-frame-v5.mjs`; os arquivos gerados ficam em `outputs/adops-retroativos-20261006/frame-v5-previews/` e não são capturas de navegador.

Ausência de PNG, layout ou fonte deve interromper a composição antes da publicação de evidência.
