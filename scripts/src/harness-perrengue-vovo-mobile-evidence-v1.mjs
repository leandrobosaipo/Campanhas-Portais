import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const defaultReportDir = resolve(repoRoot, "docs", "harness-reports", "perrengue-vovo-mobile-evidence-v1", stamp);
const reportDir = resolve(process.env.ADOPS_HARNESS_REPORT_DIR || defaultReportDir);
const outputDir = resolve(process.env.ADOPS_EVIDENCE_OUTPUT_DIR || reportDir);
const targetDate = process.env.ADOPS_TARGET_DATE || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Cuiaba",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const itemsFile = process.env.ADOPS_HARNESS_ITEMS_FILE ? resolve(process.env.ADOPS_HARNESS_ITEMS_FILE) : "";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mediaBasename(url) {
  try {
    return basename(new URL(url).pathname).toLowerCase();
  } catch {
    return basename(String(url || "")).toLowerCase();
  }
}

function buildStableNumber(seed, modulo) {
  let value = 0;
  for (const char of String(seed || "")) {
    value = (value * 33 + char.charCodeAt(0)) % 2147483647;
  }
  return modulo > 0 ? value % modulo : value;
}

function isGifUrl(url) {
  return /\.gif(?:[?#]|$)/i.test(String(url || ""));
}

function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(url || ""));
}

function analyzeImageIdentity(imagePath, options = {}) {
  const payload = Buffer.from(JSON.stringify({
    imagePath,
    minIdentityFrameScore: Number(options.minIdentityFrameScore ?? 36),
    minTextEdgeRatio: Number(options.minTextEdgeRatio ?? 0.012),
  }), "utf8").toString("base64");
  const py = `
import base64, json
from PIL import Image, ImageStat, ImageFilter
payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
image = Image.open(payload["imagePath"]).convert("RGB")
gray = image.convert("L")
stat = ImageStat.Stat(gray)
edge = gray.filter(ImageFilter.FIND_EDGES)
edge_stat = ImageStat.Stat(edge)
edge_pixels = list(edge.getdata())
text_edge_ratio = sum(1 for px in edge_pixels if px >= 42) / max(len(edge_pixels), 1)
pixels = list(gray.getdata())
midtone_ratio = sum(1 for px in pixels if 28 <= px <= 227) / max(len(pixels), 1)
identity_score = stat.stddev[0] * 0.55 + edge_stat.mean[0] * 1.15 + midtone_ratio * 90.0 + text_edge_ratio * 650.0
ok = identity_score >= float(payload["minIdentityFrameScore"]) and text_edge_ratio >= float(payload["minTextEdgeRatio"])
reasons = []
if identity_score < float(payload["minIdentityFrameScore"]):
    reasons.append(f"identityFrameScore baixo: {identity_score:.3f} < {float(payload['minIdentityFrameScore'])}")
if text_edge_ratio < float(payload["minTextEdgeRatio"]):
    reasons.append(f"textEdgeRatio baixo: {text_edge_ratio:.5f} < {float(payload['minTextEdgeRatio'])}")
print(json.dumps({
    "identityFrameOk": ok,
    "identityFrameScore": round(identity_score, 3),
    "textEdgeRatio": round(text_edge_ratio, 5),
    "edgeMean": round(edge_stat.mean[0], 3),
    "midtoneRatio": round(midtone_ratio, 5),
    "stddev": round(stat.stddev[0], 3),
    "identityFrameReasons": reasons,
}))
`;
  return JSON.parse(execFileSync(process.env.ADOPS_CAPTURE_PYTHON || "python3", ["-c", py], { encoding: "utf8" }));
}

function selectGifIdentityFrame(mediaUrl, seed) {
  const payload = Buffer.from(JSON.stringify({
    mediaUrl,
    seed: Number(seed || 0),
    minIdentityFrameScore: 52,
    minTextEdgeRatio: 0.012,
    minNonBgRatio: 0.02,
    minContrast: 20,
  }), "utf8").toString("base64");
  const py = `
import base64, json, urllib.request, tempfile, os
from PIL import Image, ImageChops, ImageStat, ImageFilter, ImageFile
payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
ImageFile.LOAD_TRUNCATED_IMAGES = True
req = urllib.request.Request(payload["mediaUrl"], headers={"User-Agent": "Mozilla/5.0 (AdOpsHarness/1.0)", "Accept": "image/gif,*/*;q=0.8"})
with urllib.request.urlopen(req, timeout=30) as response:
    data = response.read()
tmp_dir = tempfile.mkdtemp(prefix="adops-gif-frame-")
gif_path = os.path.join(tmp_dir, "source.gif")
with open(gif_path, "wb") as handle:
    handle.write(data)
image = Image.open(gif_path)
frame_count = getattr(image, "n_frames", 1)
def non_bg(rgb):
    bg = Image.new("RGB", rgb.size, rgb.getpixel((0, 0)))
    diff = ImageChops.difference(rgb, bg).convert("L")
    mask = diff.point(lambda px: 255 if px > 12 else 0)
    return mask.histogram()[255] / max(rgb.size[0] * rgb.size[1], 1)
def metrics(rgb):
    gray = rgb.convert("L")
    stat = ImageStat.Stat(gray)
    edge = gray.filter(ImageFilter.FIND_EDGES)
    edge_stat = ImageStat.Stat(edge)
    edge_pixels = list(edge.getdata())
    text_edge_ratio = sum(1 for px in edge_pixels if px >= 42) / max(len(edge_pixels), 1)
    pixels = list(gray.getdata())
    midtone_ratio = sum(1 for px in pixels if 28 <= px <= 227) / max(len(pixels), 1)
    score = stat.stddev[0] * 0.55 + edge_stat.mean[0] * 1.15 + midtone_ratio * 90.0 + text_edge_ratio * 650.0
    return stat.stddev[0], non_bg(rgb), edge_stat.mean[0], text_edge_ratio, midtone_ratio, score
rows = []
for index in range(frame_count):
    image.seek(index)
    rgb = image.convert("RGBA").convert("RGB")
    contrast, non_bg_ratio, edge_mean, text_edge_ratio, midtone_ratio, score = metrics(rgb)
    ok = score >= float(payload["minIdentityFrameScore"]) and text_edge_ratio >= float(payload["minTextEdgeRatio"]) and non_bg_ratio >= float(payload["minNonBgRatio"]) and contrast >= float(payload["minContrast"])
    rows.append({
        "frameIndex": index,
        "durationMs": int(image.info.get("duration", 0) or 0),
        "contrast": round(contrast, 3),
        "nonBgRatio": round(non_bg_ratio, 5),
        "edgeMean": round(edge_mean, 3),
        "textEdgeRatio": round(text_edge_ratio, 5),
        "midtoneRatio": round(midtone_ratio, 5),
        "identityFrameScore": round(score, 3),
        "identityFrameOk": ok,
        "rgb": rgb,
    })
candidates = [row for row in rows if row["identityFrameOk"]]
if not candidates:
    print(json.dumps({
        "ok": False,
        "reason": "gif_identity_frame_missing",
        "frameCount": frame_count,
        "candidates": [{k:v for k,v in row.items() if k != "rgb"} for row in rows[:24]],
    }))
    raise SystemExit(0)
chosen = sorted(candidates, key=lambda row: (row["identityFrameScore"], row["contrast"], row["frameIndex"]), reverse=True)[int(payload["seed"]) % len(candidates)]
out = os.path.join(tmp_dir, "chosen.png")
chosen["rgb"].save(out, "PNG")
with open(out, "rb") as handle:
    data_url = "data:image/png;base64," + base64.b64encode(handle.read()).decode("ascii")
clean = {k:v for k,v in chosen.items() if k != "rgb"}
print(json.dumps({
    "ok": True,
    "dataUrl": data_url,
    "frameCount": frame_count,
    "chosen": clean,
    "candidateCount": len(candidates),
}))
`;
  return JSON.parse(execFileSync(process.env.ADOPS_CAPTURE_PYTHON || "python3", ["-c", py], { encoding: "utf8" }));
}

async function loadActiveItems() {
  if (!itemsFile) return [];
  const payload = JSON.parse(await readFile(itemsFile, "utf8"));
  const items = Array.isArray(payload) ? payload : payload.items;
  if (!Array.isArray(items)) throw new Error("ADOPS_HARNESS_ITEMS_FILE deve conter array ou { items }.");
  return items.filter((item) => item && item.insertionId && item.mediaUrl);
}

async function findRecentVovoArticle() {
  const response = await fetch("https://perrenguematogrosso.com/assets/search-index.json?adops_vovo_mobile=1", {
    cache: "no-store",
  });
  assert(response.ok, `search-index HTTP ${response.status}`);
  const items = await response.json();
  assert(Array.isArray(items), "search-index nao retornou array");
  const posts = items
    .filter((post) => post?.categorySlug === "vovo-de-olho" || post?.categorySlugs?.includes?.("vovo-de-olho"))
    .sort((left, right) => String(right.date || right.publishedAt || "").localeCompare(String(left.date || left.publishedAt || "")));
  assert(posts.length > 0, "nenhum post vovo-de-olho encontrado");
  const selected = posts[0];
  return {
    title: selected.title,
    url: new URL(selected.url || `/${selected.slug}/`, "https://perrenguematogrosso.com").toString(),
    date: selected.date || selected.publishedAt || null,
    categorySlug: "vovo-de-olho",
  };
}

async function prepareArticlePage(page, article, item, mediaProof) {
  await page.goto(`${article.url}${article.url.includes("?") ? "&" : "?"}adops_mobile_vovo=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1800);

  return await page.evaluate(async ({ mediaUrl, displayMediaUrl, selector, basename: targetBasename, videoSeed }) => {
    const categoryOk = document.body.classList.contains("category-vovo-de-olho") ||
      /Vovô de Olho|Vovo de Olho/i.test(document.body.textContent || "");
    const articleOk = location.pathname !== "/" && Boolean(document.querySelector("article, main h1"));
    const slot = document.querySelector(selector) || document.querySelector(".g.g-1") || document.querySelector(".g.g-6");
    if (!slot) return { ok: false, reason: "slot_missing", categoryOk, articleOk };

    for (const child of Array.from(slot.children)) {
      child.style.display = "none";
      child.classList.remove("is-active");
    }

    const wrapper = document.createElement("div");
    wrapper.className = "g-dyn adops-mobile-vovo-proof is-active";
    wrapper.setAttribute("data-adops-mobile-vovo-proof", "1");
    wrapper.style.display = "block";
    wrapper.style.visibility = "visible";
    wrapper.style.opacity = "1";
    wrapper.style.width = "100%";

    const link = document.createElement("a");
    link.href = "/";
    link.style.display = "block";

    const isVideo = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(mediaUrl);
    const media = document.createElement(isVideo ? "video" : "img");
    media.src = displayMediaUrl || mediaUrl;
    if (isVideo) {
      media.muted = true;
      media.autoplay = false;
      media.loop = false;
      media.playsInline = true;
      media.controls = true;
      media.preload = "auto";
      media.setAttribute("playsinline", "");
      media.setAttribute("muted", "");
    } else {
      media.alt = "Publicidade";
      media.loading = "eager";
      media.decoding = "sync";
    }
    media.style.display = "block";
    media.style.width = "100%";
    media.style.height = "auto";
    link.appendChild(media);
    wrapper.appendChild(link);
    slot.insertBefore(wrapper, slot.firstChild);

    let videoProof = null;
    if (media instanceof HTMLVideoElement) {
      const video = media;
      const waitForReady = async () => {
        try {
          video.load();
        } catch {}
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) return true;
          await new Promise((resolve) => window.setTimeout(resolve, 120));
        }
        return video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0;
      };
      const ready = await waitForReady();
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? Number(video.duration) : 0;
      const minTarget = duration > 4 ? Math.max(1, duration * 0.15) : 0.8;
      const maxTarget = duration > 4 ? Math.max(minTarget + 0.5, duration * 0.85) : Math.max(1.2, duration || 1.8);
      const randomRatio = (Number(videoSeed) % 1000) / 1000;
      const targetTime = duration > 0
        ? Math.min(duration - 0.25, minTarget + ((maxTarget - minTarget) * randomRatio))
        : 1.2 + ((Number(videoSeed) % 7) * 0.35);
      if (ready) {
        try {
          video.currentTime = Math.max(0.5, targetTime);
        } catch {}
      }
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      try {
        video.pause();
      } catch {}
      if (getComputedStyle(wrapper).position === "static") wrapper.style.position = "relative";
      const overlay = document.createElement("div");
      overlay.setAttribute("data-adops-video-overlay", "1");
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.right = "0";
      overlay.style.bottom = "0";
      overlay.style.padding = "8px 10px 7px";
      overlay.style.background = "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 60%, rgba(0,0,0,0.92) 100%)";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "20";
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.color = "#fff";
      row.style.font = "11px Arial, sans-serif";
      row.style.marginBottom = "5px";
      const icon = document.createElement("span");
      icon.textContent = "▶";
      const time = document.createElement("span");
      const format = (value) => {
        const safe = Math.max(0, Math.floor(Number(value || 0)));
        return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
      };
      time.textContent = `${format(video.currentTime)} / ${format(video.duration || 0)}`;
      row.appendChild(icon);
      row.appendChild(time);
      const bar = document.createElement("div");
      bar.style.height = "4px";
      bar.style.borderRadius = "999px";
      bar.style.background = "rgba(255,255,255,0.3)";
      bar.style.overflow = "hidden";
      const fill = document.createElement("div");
      const progressRatio = video.duration > 0 ? Math.min(100, Math.max(2, (video.currentTime / video.duration) * 100)) : 4;
      fill.style.width = `${progressRatio}%`;
      fill.style.height = "100%";
      fill.style.background = "#ff4f5e";
      bar.appendChild(fill);
      overlay.appendChild(row);
      overlay.appendChild(bar);
      wrapper.appendChild(overlay);
      videoProof = {
        ok: ready && duration > 0 && video.currentTime > 0.5,
        currentTime: Number(video.currentTime || 0),
        duration,
        targetTime,
        randomSeed: Number(videoSeed),
        controls: video.controls === true,
        progressVisible: true,
        overlayInjected: true,
      };
    }

    const rect = slot.getBoundingClientRect();
    const mediaUrls = Array.from(slot.querySelectorAll("img,video,source")).map((node) => node.currentSrc || node.src || node.getAttribute("src") || "");
    const hasMedia = mediaUrls.some((src) => String(src).toLowerCase().includes(targetBasename)) || Boolean(displayMediaUrl && String(displayMediaUrl).startsWith("data:image/png"));
    return { ok: categoryOk && articleOk && hasMedia, categoryOk, articleOk, hasMedia, selectorUsed: selector, rect: { top: rect.top, height: rect.height }, mediaUrls, videoProof };
  }, {
    mediaUrl: item.mediaUrl,
    displayMediaUrl: mediaProof?.displayMediaUrl || item.mediaUrl,
    selector: item.expectedGroup === 6 ? ".g.g-6" : ".g.g-1",
    basename: mediaBasename(item.mediaUrl),
    videoSeed: buildStableNumber(`${item.insertionId}:${targetDate}:mobile:${item.mediaUrl}`, 1000),
  });
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "mobile"), { recursive: true });
  await mkdir(join(reportDir, "artifacts"), { recursive: true });

  const docs = await Promise.all([
    readFile(resolve(repoRoot, "docs/prints-retroativos.md"), "utf8"),
    readFile(resolve(repoRoot, "docs/correcao-retroativos-perrengue-headless-2026-06-11.md"), "utf8"),
  ]);
  assert(docs.join("\n").includes("vovo-de-olho"), "documentacao nao cita vovo-de-olho");
  const docsText = docs.join("\n").toLowerCase();
  assert(docsText.includes("desktop topo") || docsText.includes("desktop do topo"), "documentacao nao cita desktop topo");
  assert(existsSync(resolve(repoRoot, "scripts/src/harness-perrengue-vovo-mobile-evidence-v1.mjs")), "harness ausente");

  const article = await findRecentVovoArticle();
  const items = await loadActiveItems();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const item of items) {
      let gifFrameProof = null;
      if (isGifUrl(item.mediaUrl)) {
        try {
          gifFrameProof = selectGifIdentityFrame(item.mediaUrl, buildStableNumber(`${item.insertionId}:${targetDate}:gif:${item.mediaUrl}`, 1000));
        } catch (error) {
          gifFrameProof = {
            ok: false,
            reason: "gif_identity_frame_error",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      const mediaProof = {
        displayMediaUrl: gifFrameProof?.ok ? gifFrameProof.dataUrl : item.mediaUrl,
        gifFrameProof,
      };
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const prepared = await prepareArticlePage(page, article, item, mediaProof);
      if (item.expectedGroup === 6) {
        await page.locator(".adops-mobile-vovo-proof").scrollIntoViewIfNeeded().catch(() => null);
        await page.waitForTimeout(450);
      } else {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
        await page.waitForTimeout(450);
      }
      const fileName = `${item.insertionId}-${slugify(item.campaign || item.campanhaName || "campanha")}-${targetDate}.png`;
      const screenshotPath = join(outputDir, "mobile", fileName);
      const mediaProofPath = join(reportDir, "artifacts", `${item.insertionId}-${slugify(item.campaign || item.campanhaName || "campanha")}-media.png`);
      await page.locator(".adops-mobile-vovo-proof").screenshot({ path: mediaProofPath }).catch(() => null);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const visible = await page.evaluate(() => {
        const media = document.querySelector(".adops-mobile-vovo-proof img, .adops-mobile-vovo-proof video");
        if (!media) return false;
        const rect = media.getBoundingClientRect();
        return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.top < window.innerHeight;
      });
      const isVideo = isVideoUrl(item.mediaUrl);
      const screenshotIdentity = existsSync(mediaProofPath) ? analyzeImageIdentity(mediaProofPath) : {
        identityFrameOk: false,
        identityFrameScore: null,
        identityFrameReasons: ["miniatura do slot nao foi gerada"],
      };
      const identityFrameOk = isVideo
        ? screenshotIdentity.identityFrameOk === true
        : (gifFrameProof?.ok === true ? gifFrameProof.chosen?.identityFrameOk === true : screenshotIdentity.identityFrameOk === true);
      const videoProgressOk = !isVideo || Boolean(
        prepared.videoProof &&
        prepared.videoProof.ok === true &&
        prepared.videoProof.controls === true &&
        prepared.videoProof.progressVisible === true &&
        Number(prepared.videoProof.currentTime || 0) > 0.5 &&
        Number(prepared.videoProof.duration || 0) > 0
      );
      const result = {
        insertionId: item.insertionId,
        campaign: item.campaign || item.campanhaName || null,
        expectedGroup: item.expectedGroup ?? null,
        mediaUrl: item.mediaUrl,
        article,
        prepared,
        visible,
        identityFrameOk,
        identityFrameScore: gifFrameProof?.ok ? gifFrameProof.chosen?.identityFrameScore ?? null : screenshotIdentity.identityFrameScore,
        identityFrameReasons: gifFrameProof?.ok ? [] : (screenshotIdentity.identityFrameReasons || gifFrameProof?.candidates || []),
        gifFrameProof: gifFrameProof ? {
          ok: gifFrameProof.ok === true,
          frameCount: gifFrameProof.frameCount ?? null,
          chosen: gifFrameProof.chosen ?? null,
          candidateCount: gifFrameProof.candidateCount ?? 0,
          reason: gifFrameProof.reason ?? null,
        } : null,
        videoProgressOk,
        videoProof: prepared.videoProof || null,
        mediaProofPath,
        screenshot: screenshotPath,
        ok: prepared.ok === true && visible === true && identityFrameOk === true && videoProgressOk === true,
      };
      results.push(result);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  for (const result of results) {
    assert(result.ok, `mobile vovo falhou para insercao ${result.insertionId}: ${JSON.stringify(result.prepared)}`);
  }

  const payload = {
    ok: failures.length === 0,
    targetDate,
    reportDir,
    outputDir,
    article,
    totalItems: items.length,
    generated: results.length,
    results,
    failures,
  };
  await writeFile(join(reportDir, "results.json"), JSON.stringify(payload, null, 2));
  await writeFile(join(outputDir, "mobile-audit.json"), JSON.stringify(payload, null, 2));
  await writeFile(join(reportDir, "summary.md"), [
    "# Harness Perrengue Vovo Mobile Evidence v1",
    "",
    `- ok: ${payload.ok}`,
    `- targetDate: ${targetDate}`,
    `- artigo: ${article.url}`,
    `- itens: ${items.length}`,
    `- gerados: ${results.length}`,
    "",
    ...failures.map((failure) => `- FAIL ${failure}`),
  ].join("\n"));

  console.log(JSON.stringify(payload, null, 2));
  if (failures.length) process.exit(1);
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
