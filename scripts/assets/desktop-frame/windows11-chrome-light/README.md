# Windows 11 + Chrome Light Frame Kit

Este kit é a fonte visual oficial da moldura dos prints AdOps.

## Arquivos obrigatórios

- `chrome-top.png`: captura real do topo do Chrome claro, sem conteúdo do site.
- `taskbar.png`: captura real da barra de tarefas do Windows 11.
- `layout.json`: coordenadas fixas dos campos dinâmicos.
- `icons/`: ícones reais da taskbar e bandeja (`Start`, `Search`, `File Explorer`, `Edge`, `Chrome`, `Settings`, `network`, `volume`, `caret`) com licença explícita.

## Fonte

O compositor usa Selawik como padrão. Selawik é uma substituta open source da Segoe UI, licenciada em OFL 1.1.

Para usar Segoe real de uma instalação Windows licenciada, defina:

```bash
export ADOPS_WINDOWS_FRAME_FONT="/caminho/para/Segoe UI.ttf"
```

Se `ADOPS_WINDOWS_FRAME_FONT` for informado e a fonte não existir, a captura falha com `windows_frame_font_missing`.

## Como atualizar o template

1. Capture uma tela real do Windows 11 com Chrome claro na resolução base.
2. Recorte o topo do Chrome em `chrome-top.png`.
3. Recorte a barra de tarefas em `taskbar.png`.
4. Atualize `layout.json` com:
   - largura de referência;
   - altura do topo do Chrome;
   - altura da barra de tarefas;
   - retângulos de URL e data/hora.
5. Rode captura local sem upload em pelo menos 3 cenários:
   - home/topo;
   - slot com rolagem;
   - página interna.

Atalho para gerar os dois recortes a partir de uma captura real:

```bash
pnpm --dir scripts run frame:build-windows-template -- \
  --source "/caminho/para/captura-real-windows-chrome.png" \
  --chromeTopHeight 102 \
  --taskbarHeight 42 \
  --overlayIcons true \
  --iconsDir "/caminho/para/icons"
```

Atalho para regenerar o template similar claro, sem texto/ícone fixo na aba:

```bash
pnpm --dir scripts run frame:build-windows-template -- \
  --generateSimilar true \
  --width 1280 \
  --chromeTopHeight 102 \
  --taskbarHeight 42 \
  --overlayIcons true
```

## Regra operacional

Este kit aceita template similar quando não houver captura real completa.

Se `chrome-top.png`, `taskbar.png` ou a fonte configurada estiverem ausentes, o job deve falhar antes de publicar qualquer evidência.

Proibido usar placeholders de cor para ícones de app na taskbar.
