#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeNodeModules = "/Users/leandrobosaipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const pythonBin = process.env.ADOPS_CAPTURE_PYTHON || "/Users/leandrobosaipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outRoot = "/Users/leandrobosaipo/Downloads/evidencias-headless-estatico-corrigidas-2026-06-12";
const publicBase = "https://perrenguematogrosso.com";
const staticDistRoot = "/Users/leandrobosaipo/Projetos/migracao/sites/perrenguematogrosso-static/dist";
const localSearchIndex = "/Users/leandrobosaipo/Projetos/migracao/sites/perrenguematogrosso-static/dist/assets/search-index.json";
const adminPostsCache = "/tmp/perrengue-admin-posts-2026-05-01-2026-06-12.json";
const frameKitDir = path.join(repoRoot, "scripts/assets/desktop-frame/windows11-chrome-light");
const frameFont = path.join(repoRoot, "scripts/assets/desktop-frame/fonts/selawik.ttf");
const siteLogosDir = path.join(repoRoot, "artifacts/adops/public/site-logos");

if (!module.paths.includes(runtimeNodeModules)) module.paths.push(runtimeNodeModules);

const campaigns = [
  {
    pi: "16215",
    folder: "PI-16215-OBRAS",
    label: "PI 16215 - OBRAS",
    slotSelector: ".g.g-1",
    contextSelector: "#header-ads-row",
    targetAdClass: "a-142",
    frameOptions: [
      { choice: 3, framePath: "/Users/leandrobosaipo/Downloads/PERRENGUE-PIs-490711-16215-evidencias-slot-real-2026-06-12/test2/2026-06-01/1398/gif-source/frames/frame-002.png" },
      { choice: 8, framePath: "/Users/leandrobosaipo/Downloads/PERRENGUE-PIs-490711-16215-evidencias-slot-real-2026-06-12/test2/2026-06-01/1398/gif-source/frames/frame-007.png" },
      { choice: 11, framePath: "/Users/leandrobosaipo/Downloads/PERRENGUE-PIs-490711-16215-evidencias-slot-real-2026-06-12/test2/2026-06-01/1398/gif-source/frames/frame-010.png" },
      { choice: 12, framePath: "/Users/leandrobosaipo/Downloads/PERRENGUE-PIs-490711-16215-evidencias-slot-real-2026-06-12/test2/2026-06-01/1398/gif-source/frames/frame-011.png" },
    ],
    width: 825,
    height: 120,
    href: "https://www.sinfra.mt.gov.br/obras-de-mobilidade-urbana/",
    dates: [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
    ],
    scrollMode: "top",
  },
  {
    pi: "490711",
    folder: "PI-490711-ENERGISA",
    label: "PI 490711 - ENERGISA",
    slotSelector: ".g.g-6",
    contextSelector: ".g.g-6",
    targetAdClass: "a-134",
    frameOptions: [
      { choice: 13, framePath: "/tmp/energisa-frame-01.png" },
      { choice: 14, framePath: "/tmp/energisa-frame-02.png" },
      { choice: 15, framePath: "/tmp/energisa-frame-03.png" },
      { choice: 16, framePath: "/tmp/energisa-frame-04.png" },
      { choice: 17, framePath: "/tmp/energisa-frame-05.png" },
      { choice: 18, framePath: "/tmp/energisa-frame-06.png" },
      { choice: 19, framePath: "/tmp/energisa-frame-07.png" },
      { choice: 20, framePath: "/tmp/energisa-frame-08.png" },
      { choice: 21, framePath: "/tmp/energisa-frame-09.png" },
      { choice: 23, framePath: "/tmp/energisa-frame-11.png" },
      { choice: 24, framePath: "/tmp/energisa-frame-12.png" },
    ],
    width: 300,
    height: 250,
    href: "https://www.energisa.com.br/juntosutm_source=PERRENGUE%20MATO%20GROSSO&utm_medium=&utm_campaign=HeadsConcessão%20MT%202026EMT&utm_content=Site300X250&utm_term=Heads",
    dates: [
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
      "2026-05-21",
      "2026-05-22",
      "2026-05-23",
      "2026-05-24",
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
    ],
    scrollMode: "slot",
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function dataUrl(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function startStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    try {
      const parsed = new URL(req.url || "/", "http://127.0.0.1");
      const cleanPath = decodeURIComponent(parsed.pathname || "/");
      const relative = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
      const requestedPath = path.resolve(rootDir, relative);
      if (!requestedPath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isDirectory()
        ? path.join(requestedPath, "index.html")
        : requestedPath;
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-store" });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.message || error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function stableChoiceIndex(seed, total) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % total;
}

function selectFrame(campaign, dateKey) {
  const options = campaign.frameOptions || [];
  if (!options.length) throw new Error(`Sem frameOptions para ${campaign.folder}`);
  return options[stableChoiceIndex(`${campaign.pi}:${dateKey}`, options.length)];
}

function parseLocalDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  const [, y, m, d, hh = "00", mm = "00", ss = "00"] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

function formatFullDate(date) {
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Cuiaba" }).format(date);
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "America/Cuiaba" }).format(date);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Cuiaba" }).format(date);
  const year = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Cuiaba" }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Cuiaba",
  }).format(date);
  return `${weekday}, ${day} de ${month} de ${year} ${time}`;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Cuiaba",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Cuiaba",
  }).format(date);
}

function formatCardDateTime(date) {
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "America/Cuiaba" }).format(date);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "2-digit", timeZone: "America/Cuiaba" }).format(date);
  const year = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Cuiaba" }).format(date);
  return `${day}/${month}/${year} ${formatTime(date)}`;
}

function toCuiabaIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}-04:00`;
}

function captureDateFor(campaign, dateKey) {
  const minuteOfDay = 18 * 60 + stableChoiceIndex(`capture-time:${campaign.pi}:${dateKey}`, 4 * 60 + 1);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return parseLocalDate(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
}

function formatCardDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Cuiaba",
  }).format(date);
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePosts(posts) {
  const seen = new Set();
  return posts
    .map((post) => {
      const date = parseLocalDate(post.localDate || post.date || post.publishedAt);
      const title = cleanText(post.title?.rendered || post.title);
      const url = post.url || post.link || `/${post.slug || ""}/`;
      const embeddedMedia = post._embedded?.["wp:featuredmedia"]?.[0];
      const embeddedTerm = post._embedded?.["wp:term"]?.flat?.()?.find?.((term) => term?.taxonomy === "category");
      const image = post.image || embeddedMedia?.source_url || post.yoast_head_json?.og_image?.[0]?.url || "";
      return {
        title,
        url,
        category: post.category || embeddedTerm?.name || "Notícias",
        categorySlug: post.categorySlug || embeddedTerm?.slug || "",
        image,
        dateIso: post.localDate || post.date || post.publishedAt || "",
        date,
      };
    })
    .filter((post) => post.title && post.url && post.date)
    .filter((post) => {
      const key = `${post.url}|${post.dateIso}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.date - a.date);
}

async function fetchAdminPosts() {
  try {
    const stat = fs.statSync(adminPostsCache);
    if (Date.now() - stat.mtimeMs < 12 * 60 * 60 * 1000) {
      return JSON.parse(fs.readFileSync(adminPostsCache, "utf8"));
    }
  } catch (_) {
    // Cache ausente ou invalido: segue para REST.
  }
  const all = [];
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, 24); page += 1) {
    const url = `https://admin.perrenguematogrosso.com/wp-json/wp/v2/posts?per_page=100&page=${page}&after=2026-05-01T00:00:00&before=2026-06-12T00:00:00&orderby=date&order=desc&_embed=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      if (page > 1 && response.status === 400) break;
      throw new Error(`Falha ao ler posts antigos do admin REST: ${response.status}`);
    }
    totalPages = Number(response.headers.get("x-wp-totalpages") || totalPages || 1);
    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  fs.writeFileSync(adminPostsCache, JSON.stringify(all));
  return all;
}

async function loadPosts() {
  const posts = JSON.parse(fs.readFileSync(localSearchIndex, "utf8"));
  const adminPosts = await fetchAdminPosts();
  return normalizePosts([...posts, ...adminPosts]);
}

function postsForDate(posts, dateKey, cutoff) {
  const eligible = posts.filter((post) => post.date <= cutoff);
  const sameDay = eligible.filter((post) => {
    const y = post.date.getFullYear();
    const m = String(post.date.getMonth() + 1).padStart(2, "0");
    const d = String(post.date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}` === dateKey;
  });
  const base = sameDay.length >= 6
    ? [...sameDay, ...eligible.filter((post) => !sameDay.includes(post))]
    : eligible;
  if (!base.length) return posts.slice(-12);
  const span = Math.max(1, base.length - 18);
  const offset = stableChoiceIndex(`retro-posts:${dateKey}`, span);
  return [...base.slice(offset), ...base.slice(0, offset)];
}

function composeDesktopProof(viewportPng, finalPng, opts) {
  const payload = Buffer.from(JSON.stringify({ viewportPng, finalPng, opts, frameKitDir, frameFont, siteLogosDir }), "utf8").toString("base64");
  const py = `
import base64, json
from PIL import Image, ImageDraw, ImageFont

payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
viewport_path = payload["viewportPng"]
final_path = payload["finalPng"]
opts = payload["opts"]
frame_kit_dir = payload["frameKitDir"]
frame_font_path = payload["frameFont"]
site_logos_dir = payload["siteLogosDir"]

img = Image.open(viewport_path).convert("RGBA")
w, h = img.size
with open(f"{frame_kit_dir}/layout.json", "r", encoding="utf-8") as handle:
    layout = json.load(handle)
reference_w = int(layout.get("referenceWidth") or 1280)
scale = w / reference_w
chrome_h = max(1, int(round(float(layout.get("chromeTopHeight") or 0) * scale)))
taskbar_h = max(1, int(round(float(layout.get("taskbarHeight") or 0) * scale)))
chrome_top = Image.open(f"{frame_kit_dir}/chrome-top.png").convert("RGBA").resize((w, chrome_h))
taskbar = Image.open(f"{frame_kit_dir}/taskbar.png").convert("RGBA").resize((w, taskbar_h))
canvas = Image.new("RGBA", (w, h + chrome_h + taskbar_h), (255, 255, 255, 255))
canvas.alpha_composite(chrome_top, (0, 0))
canvas.alpha_composite(img, (0, chrome_h))
canvas.alpha_composite(taskbar, (0, chrome_h + h))
draw = ImageDraw.Draw(canvas)

def text_fit(text, max_w, font):
    text = str(text or "")
    if draw.textlength(text, font=font) <= max_w:
        return text
    ellipsis = "..."
    while text and draw.textlength(text + ellipsis, font=font) > max_w:
        text = text[:-1]
    return text + ellipsis if text else ellipsis

def scaled_rect(rect, y_offset=0):
    return [
        int(round(float(rect[0]) * scale)),
        int(round(float(rect[1]) * scale)) + y_offset,
        int(round(float(rect[2]) * scale)),
        int(round(float(rect[3]) * scale)) + y_offset,
    ]

def draw_dynamic_field(field_name, value):
    field = (layout.get("dynamicFields") or {}).get(field_name) or {}
    rect = field.get("rect")
    if field.get("disabled") or not rect or len(rect) != 4:
        return
    target = field.get("target") or "chrome-top"
    y_offset = chrome_h + h if target == "taskbar" else 0
    x0, y0, x1, y1 = scaled_rect(rect, y_offset)
    clear = tuple(field.get("clearFill") or [255, 255, 255, 255])
    fill = tuple(field.get("fill") or [31, 41, 55, 255])
    font = ImageFont.truetype(frame_font_path, max(8, int(round(float(field.get("fontSize") or 12) * scale))))
    pad_x = int(round(float(field.get("paddingX") or 0) * scale))
    pad_y = int(round(float(field.get("paddingY") or 0) * scale))
    draw.rectangle([x0, y0, x1, y1], fill=clear)
    draw.text((x0 + pad_x, y0 + pad_y), text_fit(value, max(1, x1 - x0 - pad_x * 2), font), fill=fill, font=font)

def draw_tab_identity():
    surface = (layout.get("dynamicFields") or {}).get("tabSurface") or {}
    icon = (layout.get("dynamicFields") or {}).get("tabIcon") or {}
    title = (layout.get("dynamicFields") or {}).get("tabTitle") or {}
    if surface.get("rect"):
        x0, y0, x1, y1 = scaled_rect(surface.get("rect"))
        draw.rounded_rectangle([x0, y0, x1, y1], radius=max(4, int(round(float(surface.get("radius") or 10) * scale))), fill=tuple(surface.get("clearFill") or [255,255,255,255]), outline=tuple(surface.get("outlineFill") or [218,224,232,255]), width=max(1, int(round(scale))))
    if icon.get("rect"):
        x0, y0, x1, y1 = scaled_rect(icon.get("rect"))
        draw.rectangle([x0, y0, x1, y1], fill=tuple(icon.get("clearFill") or [255,255,255,255]))
        logo_path = f"{site_logos_dir}/perrengue.png"
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((max(1, x1-x0), max(1, y1-y0)))
        canvas.alpha_composite(logo, (x0 + max(0, int(((x1-x0)-logo.size[0])/2)), y0 + max(0, int(((y1-y0)-logo.size[1])/2))))
    if title.get("rect"):
        x0, y0, x1, y1 = scaled_rect(title.get("rect"))
        font = ImageFont.truetype(frame_font_path, max(8, int(round(float(title.get("fontSize") or 14) * scale))))
        draw.rectangle([x0, y0, x1, y1], fill=tuple(title.get("clearFill") or [255,255,255,255]))
        draw.text((x0 + int(round(float(title.get("paddingX") or 0) * scale)), y0 + int(round(float(title.get("paddingY") or 0) * scale))), text_fit(opts.get("tabTitle", "Perrengue Mato Grosso"), max(1, x1-x0), font), fill=tuple(title.get("fill") or [42,48,56,255]), font=font)

draw_tab_identity()
draw_dynamic_field("addressText", opts.get("addressText", "perrenguematogrosso.com"))
draw_dynamic_field("systemDateTimeInline", opts.get("systemDateTime", ""))

scroll_metrics = opts.get("scrollMetrics") or {}
viewport_height_css = float(scroll_metrics.get("viewportHeight") or 0)
viewport_width_css = float(scroll_metrics.get("viewportWidth") or 0)
document_height_css = float(scroll_metrics.get("documentHeight") or 0)
scroll_y_css = max(0.0, float(scroll_metrics.get("scrollY") or 0))
max_scroll_y_css = max(0.0, float(scroll_metrics.get("maxScrollY") or (document_height_css - viewport_height_css)))
scrollbar_rendered = False
if viewport_height_css > 0 and document_height_css > viewport_height_css + 1 and max_scroll_y_css > 0:
    scrollbar = layout.get("scrollbar") or {}
    scale_y = h / viewport_height_css
    scale_x = (w / viewport_width_css) if viewport_width_css > 0 else scale_y
    scrollbar_w = max(8, int(round(float(scrollbar.get("width") or 12) * scale_x)))
    track_x0 = max(0, w - scrollbar_w)
    track_x1 = w - 1
    track_y0 = chrome_h
    track_y1 = chrome_h + h
    thumb_h = min(max(int(float(scrollbar.get("minThumbHeight") or 44) * scale_y), int(h * (viewport_height_css / document_height_css))), max(1, h))
    thumb_y0 = track_y0 + int((h - thumb_h) * min(1.0, scroll_y_css / max_scroll_y_css))
    thumb_y1 = min(track_y1, thumb_y0 + thumb_h)
    scrollbar_rendered = True
    draw.rectangle([track_x0, track_y0, track_x1, track_y1], fill=tuple(scrollbar.get("trackFill") or [246,247,249,230]))
    draw.rounded_rectangle([track_x0 + 2, thumb_y0 + 2, track_x1 - 2, thumb_y1 - 2], radius=max(3, int(scrollbar_w / 2)), fill=tuple(scrollbar.get("thumbFill") or [127,132,142,235]))

canvas.convert("RGB").save(final_path, "PNG")
print(json.dumps({"frameTemplateVersion": str(layout.get("version") or "unknown"), "scrollbarRendered": scrollbar_rendered}, ensure_ascii=True))
`;
  return JSON.parse(execFileSync(pythonBin, ["-c", py], { encoding: "utf8" }).trim());
}

async function forceRetroDom(page, { posts, campaign, captureAt, fullDate, shortDate }) {
  return page.evaluate(({ posts, campaign, captureAt, fullDate, shortDate }) => {
    const setText = (el, value) => {
      if (el && value) el.textContent = value;
    };
    const setAttr = (el, attr, value) => {
      if (el && value) el.setAttribute(attr, value);
    };
    const applyPostTime = (node, post) => {
      if (!node || !post) return;
      setAttr(node, "datetime", post.dateTimeIso);
      node.dataset.date = post.dateTimeIso;
      node.dataset.datetime = post.dateTimeIso;
      node.setAttribute("title", post.dateTimeText);
      if (node.tagName === "TIME") setText(node, post.dateText);
    };

    for (const node of document.querySelectorAll('[data-perr-datetime="full"], .header-datestamp-full, .cod5-header-date-full')) setText(node, fullDate);
    for (const node of document.querySelectorAll('[data-perr-datetime="short"], .header-datestamp-short, .cod5-header-date-short')) setText(node, shortDate);

    const articles = Array.from(document.querySelectorAll("main article, .post-card, .news-card, .perrengue-card, .group")).filter((node) => node.querySelector("a, h1, h2, h3, img"));
    articles.slice(0, 80).forEach((article, index) => {
      const post = posts[index % posts.length];
      if (!post) return;
      article.dataset.adopsRetroDate = captureAt;
      const link = article.querySelector("a[href]");
      if (link) link.href = post.url.startsWith("http") ? post.url : `${location.origin}${post.url}`;
      const title = article.querySelector("h1, h2, h3, .entry-title, [class*='title']");
      setText(title, post.title);
      const img = article.querySelector("img");
      if (img && post.image) {
        img.src = post.image;
        img.srcset = "";
        img.alt = post.title;
        img.loading = "eager";
        img.decoding = "sync";
      }
      const badge = article.querySelector("[class*='badge'], [class*='cat'], .category");
      setText(badge, post.category);
      const time = article.querySelector("time, [datetime], [data-date], [data-datetime]");
      if (time) {
        applyPostTime(time, post);
      }
    });

    const nowItems = Array.from(document.querySelectorAll(".cod5-home-now-list li")).slice(0, 12);
    nowItems.forEach((item, index) => {
      const post = posts[index % posts.length];
      if (!post) return;
      const a = item.querySelector("a");
      if (a) {
        a.href = post.url.startsWith("http") ? post.url : `${location.origin}${post.url}`;
      }
      const hourNode = item.querySelector(".w-14, [title*='Atualizado'], time");
      if (hourNode) {
        setText(hourNode, post.timeText);
        hourNode.setAttribute("title", `Atualizado em ${post.dateTimeText}`);
      }
      const titleNode = item.querySelector(".min-w-0 .block.truncate, .min-w-0 .block:not(.badge-cat), a > span:last-of-type");
      if (titleNode) setText(titleNode, post.title);
      else if (a) a.appendChild(document.createTextNode(post.title));
      const badge = item.querySelector(".badge-cat");
      setText(badge, post.category);
      const time = item.querySelector("time, [datetime], [data-date]");
      if (time) {
        applyPostTime(time, post);
      }
    });

    const sidebarCards = Array.from(document.querySelectorAll(".sidebar-box--popular article, aside article")).filter((node) => node.querySelector("a, h2, h3, img"));
    sidebarCards.slice(0, 18).forEach((card, index) => {
      const post = posts[(index + 1) % posts.length];
      if (!post) return;
      const link = card.querySelector("a[href]");
      if (link) link.href = post.url.startsWith("http") ? post.url : `${location.origin}${post.url}`;
      const title = card.querySelector("h2, h3, h4");
      setText(title, post.title);
      const img = card.querySelector("img");
      if (img && post.image) {
        img.src = post.image;
        img.srcset = "";
        img.alt = post.title;
        img.loading = "eager";
        img.decoding = "sync";
      }
      const badge = card.querySelector("[class*='badge'], [class*='cat'], .category");
      setText(badge, post.category);
      const time = card.querySelector("time, [datetime], [data-date], [data-datetime]");
      if (time) {
        applyPostTime(time, post);
      }
    });

    const slot = document.querySelector(campaign.slotSelector);
    if (!slot) return { ok: false, reason: "slot_missing" };
    const context = document.querySelector(campaign.contextSelector || campaign.slotSelector);
    if (context) {
      context.style.display = "block";
      context.style.visibility = "visible";
      context.style.opacity = "1";
      context.style.overflow = "visible";
      context.hidden = false;
    }
    slot.style.display = "block";
    slot.style.visibility = "visible";
    slot.style.opacity = "1";
    slot.style.position = "relative";
    slot.style.overflow = "visible";
    slot.style.width = campaign.slotSelector === ".g.g-1" ? "100%" : `${campaign.width}px`;
    slot.style.maxWidth = "100%";
    slot.style.height = campaign.slotSelector === ".g.g-1" ? "auto" : `${campaign.height}px`;
    slot.style.minHeight = `${campaign.height}px`;
    slot.hidden = false;
    slot.setAttribute("data-cod5-static-rotation", "1");

    const slides = Array.from(slot.querySelectorAll(":scope > .g-dyn, :scope > .g-single"));
    const target = slides.find((slide) => slide.classList.contains(campaign.targetAdClass));
    if (!target) return { ok: false, reason: "target_ad_missing", targetAdClass: campaign.targetAdClass, available: slides.map((slide) => slide.className) };
    for (const slide of slides) {
      const isTarget = slide === target;
      slide.classList.toggle("is-active", isTarget);
      slide.style.setProperty("display", isTarget ? "block" : "none", "important");
      slide.style.setProperty("visibility", isTarget ? "visible" : "hidden", "important");
      slide.style.setProperty("opacity", isTarget ? "1" : "0", "important");
    }
    let a = target.querySelector("a[href]");
    if (!a) {
      a = document.createElement("a");
      target.appendChild(a);
    }
    a.href = campaign.href || a.href || "/";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.cssText = "display:block!important;width:100%!important;height:100%!important;";
    target.querySelectorAll("video, source").forEach((node) => node.remove());
    let img = target.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      a.appendChild(img);
    }
    img.src = campaign.frameDataUrl;
    img.srcset = "";
    img.sizes = "";
    img.alt = campaign.label;
    img.width = campaign.width;
    img.height = campaign.height;
    img.loading = "eager";
    img.decoding = "sync";
    img.style.cssText = "display:block!important;width:100%!important;height:auto!important;object-fit:contain!important;visibility:visible!important;opacity:1!important;";
    return { ok: true, targetClass: target.className };
  }, { posts, campaign, captureAt, fullDate, shortDate });
}

async function gotoWithRetry(page, url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 60000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await page.waitForTimeout(1200 * attempt);
    }
  }
  throw lastError;
}

async function capture(browser, sourceBase, posts, campaign, dateKey) {
  const captureDate = captureDateFor(campaign, dateKey);
  const captureAt = toCuiabaIso(captureDate);
  const eligible = postsForDate(posts, dateKey, captureDate).slice(0, 18).map((post) => ({
    ...post,
    cardDate: formatCardDate(post.date),
    timeText: formatTime(post.date),
    dateText: formatCardDate(post.date),
    dateTimeText: formatCardDateTime(post.date),
    dateTimeIso: toCuiabaIso(post.date),
    url: post.url.startsWith("http") ? post.url : `${publicBase}${post.url}`,
  }));
  const dir = path.join(outRoot, campaign.folder);
  const selectedFrame = selectFrame(campaign, dateKey);
  ensureDir(dir);
  const viewportPath = path.join(dir, `${dateKey}-viewport.png`);
  const finalPath = path.join(dir, `${dateKey}.png`);

  const page = await browser.newPage({ viewport: { width: 1660, height: 1200 }, deviceScaleFactor: 2 });
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "media" || type === "font") return route.abort();
    return route.continue();
  });
  await gotoWithRetry(page, `${sourceBase}/?adops_retro=${encodeURIComponent(captureAt)}`);
  await page.waitForSelector("body", { timeout: 30000 });
  await page.waitForTimeout(1200);
  const forced = await forceRetroDom(page, {
    posts: eligible,
    campaign: { ...campaign, frameDataUrl: dataUrl(selectedFrame.framePath) },
    captureAt,
    fullDate: formatFullDate(captureDate),
    shortDate: formatShortDate(captureDate),
  });
  if (!forced.ok) throw new Error(`${campaign.folder} ${dateKey}: ${forced.reason}`);
  if (campaign.scrollMode === "slot") {
    await page.locator(campaign.slotSelector).scrollIntoViewIfNeeded({ timeout: 10000 });
    await page.evaluate(() => window.scrollBy(0, -96));
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(500);
  const audit = await page.evaluate(({ campaign, captureAt }) => {
    const slot = document.querySelector(campaign.slotSelector);
    const rect = slot?.getBoundingClientRect();
    const img = slot?.querySelector("img");
    const target = campaign.targetAdClass ? slot?.querySelector(`.${campaign.targetAdClass}`) : null;
    const headerText = Array.from(document.querySelectorAll('[data-perr-datetime="full"], [data-perr-datetime="short"], .header-datestamp-full, .header-datestamp-short'))
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    const articleTitles = Array.from(document.querySelectorAll("main article h1, main article h2, main article h3"))
      .map((node) => node.textContent?.trim()?.replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 12);
    const articleDates = Array.from(document.querySelectorAll("main article time[datetime]"))
      .map((node) => node.getAttribute("datetime") || node.getAttribute("data-date") || node.getAttribute("data-datetime") || "")
      .filter(Boolean)
      .slice(0, 20);
    const nowTimes = Array.from(document.querySelectorAll(".cod5-home-now-list li .w-14, .cod5-home-now-list li [title*='Atualizado'], .cod5-home-now-list li time"))
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .slice(0, 8);
    const sidebarPopularCards = Array.from(document.querySelectorAll(".sidebar-box--popular article")).slice(0, 8);
    const scrollMetrics = {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      documentHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      scrollY: window.scrollY,
      maxScrollY: Math.max(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight),
    };
    return {
      slotVisible: !!rect && rect.width >= campaign.width * 0.75 && rect.height >= campaign.height * 0.75 && rect.bottom > 0 && rect.top < innerHeight,
      slotRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      mediaIsDataUrl: !!img?.src?.startsWith("data:image/png;base64,"),
      templateMarkers: {
        hasLegacyShell: document.documentElement.classList.contains("cod5-legacy-shell-template"),
        hasSiteHeader: !!document.querySelector("#site-header"),
        hasHeaderAdsRow: !!document.querySelector("#header-ads-row"),
        hasStaticRotation: !!document.querySelector(".g[data-cod5-static-rotation], .g .g-dyn"),
      },
      targetAdClass: campaign.targetAdClass,
      targetAdActive: !!target?.classList.contains("is-active"),
      activeSlideClass: slot?.querySelector(":scope > .is-active")?.className || "",
      sourceUrl: location.href,
      articleTitles,
      headerText,
      articleDates,
      noFutureArticles: articleDates.every((value) => new Date(value).getTime() <= new Date(captureAt).getTime()),
      nowTimes,
      nowTimesNotAllEqual: new Set(nowTimes).size > 1,
      sidebarPopularCount: sidebarPopularCards.length,
      sidebarPopularHasImages: sidebarPopularCards.every((card) => !!card.querySelector("img")),
      sidebarPopularHasTitles: sidebarPopularCards.every((card) => !!card.querySelector("h2, h3, h4")?.textContent?.trim()),
      scrollMetrics,
    };
  }, { campaign, captureAt });
  await page.screenshot({ path: viewportPath, fullPage: false });
  await page.close();

  const frame = composeDesktopProof(viewportPath, finalPath, {
    addressText: "perrenguematogrosso.com",
    hostLabel: "perrenguematogrosso.com",
    tabTitle: "Perrengue Mato Grosso",
    siteSigla: "perrengue",
    systemDateTime: formatShortDate(captureDate),
    scrollMetrics: audit.scrollMetrics,
  });
  fs.rmSync(viewportPath, { force: true });
  return { pi: campaign.pi, folder: campaign.folder, date: dateKey, file: finalPath, audit, frame, retroPostCount: eligible.length, selectedFrame };
}

async function captureWithRetry(browser, sourceBase, posts, campaign, dateKey, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await capture(browser, sourceBase, posts, campaign, dateKey);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.warn(`retry ${attempt}/${attempts} ${campaign.folder} ${dateKey}: ${error.message || error}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  throw lastError;
}

(async () => {
  process.env.NODE_PATH = runtimeNodeModules;
  for (const campaign of campaigns) {
    for (const frame of campaign.frameOptions || []) {
      if (!fs.existsSync(frame.framePath)) throw new Error(`Frame aprovado ausente: ${frame.framePath}`);
    }
  }
  removeDir(outRoot);
  ensureDir(outRoot);
  if (!fs.existsSync(path.join(staticDistRoot, "index.html"))) throw new Error(`dist headless ausente: ${staticDistRoot}/index.html`);
  const posts = await loadPosts();
  const { server, baseUrl } = await startStaticServer(staticDistRoot);
  const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable });
  const summary = [];
  try {
    for (const campaign of campaigns) {
      for (const dateKey of campaign.dates) {
        console.log(`capturando ${campaign.folder} ${dateKey}`);
        summary.push(await captureWithRetry(browser, baseUrl, posts, campaign, dateKey));
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  fs.writeFileSync(path.join(outRoot, "audit-summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), source: "headless-static-dist-real-slots-frame-freeze", staticDistRoot, summary }, null, 2));
  fs.writeFileSync(path.join(outRoot, "README.txt"), [
    "Evidencias corrigidas: geradas sobre o dist atual do headless estatico do Perrengue.",
    "PI-16215-OBRAS: slot .g.g-1, topo da home.",
    "PI-490711-ENERGISA: slot .g.g-6, lateral/home.",
    "O script preserva o slot real do AdRotate e ativa o anuncio real antes de congelar o frame PNG aprovado.",
    "Frames GIF substituidos por PNG aprovado para evitar fundo solido/transicao vazia.",
    "",
  ].join("\n"));
  console.log(outRoot);
  console.log(JSON.stringify(summary.map((item) => ({
    pi: item.pi,
    date: item.date,
    slotVisible: item.audit.slotVisible,
    mediaIsDataUrl: item.audit.mediaIsDataUrl,
    noFutureArticles: item.audit.noFutureArticles,
    nowTimesNotAllEqual: item.audit.nowTimesNotAllEqual,
    sidebarPopularHasImages: item.audit.sidebarPopularHasImages,
    sidebarPopularHasTitles: item.audit.sidebarPopularHasTitles,
    scrollbarRendered: item.frame.scrollbarRendered,
    selectedFrameChoice: item.selectedFrame.choice,
    targetAdActive: item.audit.targetAdActive,
    activeSlideClass: item.audit.activeSlideClass,
    sourceUrl: item.audit.sourceUrl,
    firstArticleTitle: item.audit.articleTitles?.[0],
    file: item.file,
  })), null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
