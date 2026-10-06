import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { composeDesktopProof } = require("./capture-insertion-proof.cjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const kitDir = path.join(root, "scripts/assets/desktop-frame/windows11-chrome-light");
const logoDir = path.join(root, "artifacts/adops/public/site-logos");
const python = process.env.ADOPS_CAPTURE_PYTHON || "python3";
const outDir = path.resolve(process.env.ADOPS_FRAME_V5_PREVIEW_DIR || path.join(root, "outputs/adops-retroativos-20261006/frame-v5-previews"));
mkdirSync(outDir, { recursive: true });

const layout = JSON.parse(readFileSync(path.join(kitDir, "layout.json"), "utf8"));
const sites = JSON.parse(readFileSync(path.join(root, "config/adrotate-sites.json"), "utf8"));
const omt = sites.OMT;
assert.equal(layout.version, "windows11-chrome-light-similar-v5");
assert.equal(layout.frameTheme, "windows11_chrome_reconstructed_template");
assert.deepEqual(layout.assetWidths, [1280, 1660, 3320]);
assert.equal(layout.dynamicFields.systemDateTime.mode, "two-line-date-time");

for (const width of layout.assetWidths) {
  const suffix = width === 1280 ? "" : `-${width}`;
  const top = path.join(kitDir, `chrome-top${suffix}.png`);
  const taskbar = path.join(kitDir, `taskbar${suffix}.png`);
  const sizeCheck = `from PIL import Image; import sys; a=Image.open(sys.argv[1]); b=Image.open(sys.argv[2]); assert a.size == (${width}, round(72*${width}/1280)), a.size; assert b.size == (${width}, round(42*${width}/1280)), b.size`;
  execFileSync(python, ["-c", sizeCheck, top, taskbar], { stdio: "pipe" });

  const viewportPath = path.join(outDir, `viewport-${width}.png`);
  const finalPath = path.join(outDir, `preview-${width}.png`);
  execFileSync(python, ["-c", `from PIL import Image,ImageDraw,ImageFont; import sys; w=int(sys.argv[1]); h=round(w*720/1280); im=Image.new('RGB',(w,h),(250,251,253)); d=ImageDraw.Draw(im); f=ImageFont.truetype(sys.argv[3],max(18,round(w*0.025))); d.text((round(w*.04),round(h*.08)),'AMOSTRA SINTÉTICA · NÃO É CAPTURA VIVA',font=f,fill=(75,84,98)); d.rounded_rectangle((round(w*.04),round(h*.18),round(w*.96),round(h*.9)),radius=round(w*.01),fill=(255,255,255),outline=(222,226,232),width=max(1,round(w/1280))); logo=Image.open(sys.argv[4]).convert('RGBA'); bounds=logo.getchannel('A').getbbox(); logo=logo.crop(bounds) if bounds else logo; logo.thumbnail((round(w*.20),round(w*.09))); im.paste(logo,(round(w*.065),round(h*.25)),logo); im.save(sys.argv[2])`, String(width), viewportPath, path.join(root, "scripts/assets/desktop-frame/fonts/selawik.ttf"), path.join(root, "artifacts/adops/public/site-logos/omt.webp")], { stdio: "pipe" });

  const metadata = composeDesktopProof(viewportPath, finalPath, {
    systemDateTime: "terça-feira, 06/10/2026, 14:22",
    addressText: omt.homeUrl,
    tabTitle: omt.browserTitle,
    hostLabel: omt.hostLabel,
    siteSigla: "omt",
    viewportTrimBottomPx: 0,
  });
  assert.equal(metadata.frameTemplateVersion, layout.version);
  assert.equal(metadata.frameTheme, layout.frameTheme);
  assert.equal(metadata.tabIconFallback, true);
  assert.equal(metadata.tabIconSource, "generic_fallback");
  assert.equal(metadata.tabIconRendered, true);
  assert.equal(metadata.tabTitleRendered, true);
  assert.equal(metadata.chromeFrameHeight, Math.round(72 * width / 1280));
  assert.equal(metadata.taskbarHeight, Math.round(42 * width / 1280));

  const inspect = `from PIL import Image,ImageStat; import sys; im=Image.open(sys.argv[1]).convert('RGB'); w,h=im.size; s=w/1280; y0=h-round(42*s); a=im.crop((w-round(142*s),y0+round(3*s),w-round(4*s),y0+round(39*s))); top=a.crop((0,0,a.width,round(17*s))); bot=a.crop((0,round(17*s),a.width,a.height)); assert ImageStat.Stat(top).stddev[0]>1, ImageStat.Stat(top).stddev; assert ImageStat.Stat(bot).stddev[0]>1, ImageStat.Stat(bot).stddev; assert im.size == (w, round(w*720/1280)+round(72*s)+round(42*s)), im.size`;
  execFileSync(python, ["-c", inspect, finalPath], { stdio: "pipe" });
  writeFileSync(path.join(outDir, `preview-${width}.json`), JSON.stringify({ synthetic: true, sourceSite: { homeUrl: omt.homeUrl, browserTitle: omt.browserTitle, hostLabel: omt.hostLabel }, viewportLogoSource: "artifacts/adops/public/site-logos/omt.webp", note: "Prévia sintética local; usa ícone genérico de fallback, inclui o logo OMT no conteúdo de amostra e não é captura de navegador nem evidência de campanha.", width, ...metadata }, null, 2) + "\n");
}

console.log(JSON.stringify({ ok: true, version: layout.version, previewDir: outDir, widths: layout.assetWidths }));
