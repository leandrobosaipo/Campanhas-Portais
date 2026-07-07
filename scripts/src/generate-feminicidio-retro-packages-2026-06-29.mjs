#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const nodeBin = process.execPath;
const captureScript = path.join(repoRoot, "scripts/src/capture-insertion-proof.cjs");
const downloadsRoot = "/Users/leandrobosaipo/Downloads";
const today = "2026-06-29";
const pythonBin =
  process.env.ADOPS_CAPTURE_PYTHON ||
  "/Users/leandrobosaipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const captureAtOverrides = new Map([["1461:2026-06-29", "2026-06-29T19:43:00-04:00"]]);

const omtMediaUrl =
  "https://omatogrossense.nyc3.digitaloceanspaces.com/app/uploads/2026/06/14170712/enfrentamento_ao_feminicidio_e_a_violencia_domestica_825X120-3-1.gif";
const rooMediaUrl =
  "https://roonoticias.nyc3.digitaloceanspaces.com/app/uploads/2026/06/03063603/roo-pi-25206090-825x120-1.gif";
const aflMediaUrl =
  "https://afolhalivre.nyc3.digitaloceanspaces.com/app/uploads/2026/06/03063602/afl-pi-25206089-670x90-1.gif";
const aflForbiddenTopMediaUrl =
  "https://afolhalivre.nyc3.digitaloceanspaces.com/app/uploads/2026/06/08155146/banner_site_825x120-sau-6.gif";

const insertions = {
  1622: {
    id: 1622,
    campanhaId: 929,
    campanhaName: "FEMINICIDIO",
    campanhaNome: "FEMINICIDIO",
    competencia: "JUNHO-2026",
    siteSigla: "OMT",
    piCodigo: "PI 14589",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-13",
    periodoFim: "2026-06-27",
    mediaUrl: omtMediaUrl,
    evidences: [],
  },
  1455: {
    id: 1455,
    campanhaId: 905,
    campanhaName: "FEMINICIDIO",
    campanhaNome: "FEMINICIDIO",
    competencia: "JUNHO-2026",
    siteSigla: "ROO",
    piCodigo: "PI 25206090",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-06-05",
    periodoFim: "2026-06-22",
    mediaUrl: rooMediaUrl,
    evidences: [],
  },
  1461: {
    id: 1461,
    campanhaId: 911,
    campanhaName: "FEMINICIDIO",
    campanhaNome: "FEMINICIDIO",
    competencia: "JUNHO-2026",
    siteSigla: "AFL",
    piCodigo: "PI 25206089",
    clienteNome: "GOVERNO DO ESTADO",
    localFormato: "MEGABANNER HOME 1",
    localFormatoNormalizado: "MEGABANNER HOME 1",
    periodoInicio: "2026-06-09",
    periodoFim: "2026-06-29",
    mediaUrl: aflMediaUrl,
    evidences: [],
  },
};

const packages = [
  {
    slug: `OMT-PI-14589-FEMINICIDIO-retroativos-oficial-${today}`,
    title: "OMT - PI 14589 - FEMINICIDIO",
    site: "OMT",
    pi: "14589",
    campaign: "FEMINICIDIO",
    insertions: [{ insertionId: 1622, dates: rangeDates("2026-06-13", "2026-06-27") }],
    discoveryNotes: [
      "Fonte local oficial: docs/adops/pi-automation-v4-monitor-first-ai-gate.md confirma PDF PI 14589, SITE O MATOGROSSENSE, periodo 13/06/2026 a 27/06/2026, insercao canonica 1622 e campanha 929.",
      "A insercao 1616 foi cancelada como duplicidade e nao foi usada.",
      "A API publica AdOps retornou HTTP 521 nesta execucao; mediaUrl foi comprovada via WordPress/Spaces publico do OMT e validada com HEAD HTTP 200.",
    ],
  },
  {
    slug: `ROO-PI-25206089-FEMINICIDIO-retroativos-oficial-${today}`,
    title: "ROO - PI 25206089 - FEMINICIDIO",
    site: "ROO",
    pi: "25206089",
    campaign: "FEMINICIDIO",
    insertions: [],
    blockedDiscovery: {
      status: "blocked_no_canonical_roo_insertion",
      reason:
        "As fontes locais consultadas nao confirmam PI 25206089 como ROO. O registro historico disponivel aponta 25206089 para AFL, campanha 911/insercao 1461, sem mediaUrl. Gerar print ROO nesta condicao seria evidencia falsa.",
      checkedAt: new Date().toISOString(),
      publicApiStatus: 521,
      consultedSources: [
        "https://adops-api-public.leandro471.workers.dev/api/pi-site-exports?piCodigo=25206089&siteSigla=ROO -> HTTP 521",
        "docs/adops/drive-pi-auto-cadastro-fix-plan-2026-06-02.md -> AFL 25206089, campanha 911, insercao 1461, sem mediaUrl",
        "Busca local em docs/harness-reports, docs/reports e Downloads nao encontrou pacote ROO canonico para PI 25206089",
      ],
      requiredToUnblock: [
        "PDF/Drive ou planilha confirmando PI 25206089 + site ROO",
        "insercao AdOps ROO nao cancelada",
        "periodo oficial",
        "formato e mediaUrl publica saudavel",
      ],
    },
  },
  {
    slug: `ROO-PI-25206090-FEMINICIDIO-retroativos-corrigido-oficial-${today}`,
    title: "ROO - PI 25206090 - FEMINICIDIO",
    site: "ROO",
    pi: "25206090",
    campaign: "FEMINICIDIO",
    discoveryNotes: [
      "Correcao operacional: o pedido inicial citava ROO PI 25206089, mas o Drive confirmou PI_25206089_SITE_A_FOLHA_LIVRE_JUN_VEICULO.pdf para SITE A FOLHA LIVRE.",
      "Fonte Drive confirmada: PI_25206090_SITE_ROO_NOTICIAS_JUN_VEICULO.pdf, veiculo SITE ROO NOTICIAS, MEGABANNER TOPO 825x120px, 18 insercoes.",
      "Planilha Relação de campanhas.xlsx confirma ROO: PI 25206090 - GOV, FEMINICIDIO, 05/06-22/06, TOPO, FINALIZADA.",
      "Historico local docs/adops/drive-pi-auto-cadastro-fix-plan-2026-06-02.md registrava campanha 905/insercao 1419 para ROO 25206090 sem mediaUrl, mas a inspeção viva do AdRotate ROO encontrou o anuncio 36 vinculado a insercao 1455.",
      "Mídia confirmada via WordPress público do ROO, attachment 88499, source_url em Spaces com HEAD HTTP 200.",
      "AdRotate ROO grupo 1 tem sobreposição real com GOV FAZ entre 08/06 e 22/06; o gerador faz retry quando o rotator serve outro criativo.",
    ],
    insertions: [{ insertionId: 1455, dates: rangeDates("2026-06-05", "2026-06-22") }],
  },
  {
    slug: `AFL-PI-25206089-FEMINICIDIO-retroativos-oficial-${today}`,
    title: "AFL - PI 25206089 - FEMINICIDIO",
    site: "AFL",
    pi: "25206089",
    campaign: "FEMINICIDIO",
    discoveryNotes: [
      "Fonte Drive confirmada: PI_25206089_SITE_A_FOLHA_LIVRE_JUN_VEICULO.pdf, veiculo SITE A FOLHA LIVRE, MEGABANNER HOME 1 670x90px.",
      "Planilha Relação de campanhas.xlsx confirma AFL: PI 25206089 - GOV, FEMINICIDIO, 09/06-29/06, HOME 1, ATIVA.",
      "Historico local docs/adops/drive-pi-auto-cadastro-fix-plan-2026-06-02.md registrava campanha 911/insercao 1461 sem mediaUrl.",
      "Inspecao viva do AdRotate AFL encontrou o anuncio 28 ativo vinculado ao grupo 2, Home1 815x120px, com schedule 2026-06-09 a 2026-06-29.",
      "Mídia confirmada no HTML publico do AFL e em Spaces com HEAD HTTP 200.",
      "AdRotate AFL tambem tem banner de topo GOV FAZ ativo; o pacote bloqueia prints que capturem banner_site_825x120-sau-6.gif no lugar do criativo HOME 1.",
    ],
    insertions: [{ insertionId: 1461, dates: rangeDates("2026-06-09", "2026-06-29") }],
  },
];

function rangeDates(start, end) {
  const out = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function buildRetroCaptureAt(dateKey, insertionId) {
  const override = captureAtOverrides.get(`${insertionId}:${dateKey}`);
  if (override) return override;
  const seed = `${insertionId}:${dateKey}`;
  let hash = 0;
  const start = 18 * 60;
  const end = 22 * 60;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % (end - start);
  }
  const totalMinutes = start + hash;
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minute = String(totalMinutes % 60).padStart(2, "0");
  return `${dateKey}T${hour}:${minute}:00-04:00`;
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function startLocalApi() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const insertionMatch = url.pathname.match(/^\/api\/insertions\/(\d+)$/);
    if (insertionMatch) {
      const insertion = insertions[Number(insertionMatch[1])];
      if (!insertion) return jsonResponse(res, 404, { error: "not_found" });
      return jsonResponse(res, 200, insertion);
    }
    if (url.pathname.startsWith("/api/capture-rules/runtime")) {
      return jsonResponse(res, 404, { error: "use_local_adrotate_sites_mapping" });
    }
    if (url.pathname.includes("/capture-proof/status")) {
      return jsonResponse(res, 200, { status: "audited", auditOk: true, issues: [] });
    }
    return jsonResponse(res, 404, { error: "not_found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, apiBase: `http://127.0.0.1:${address.port}/api` };
}

async function probeUrl(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Codex-AdOps-RetroEvidence/official-2026-06-29" },
    });
    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("text/html") ? await response.text() : "";
    return {
      url,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      elapsedMs: Date.now() - startedAt,
      contentType,
      looks404: /404|not found|pagina nao encontrada|p.gina n.o encontrada/i.test(text.slice(0, 8000)),
    };
  } catch (error) {
    const curl = spawnSync("curl", ["-sSIL", "--max-time", "20", url], { encoding: "utf8" });
    const statusMatch = String(curl.stdout || "").match(/HTTP\/[^\s]+\s+(\d+)/g);
    const lastStatus = statusMatch?.length ? Number(statusMatch.at(-1)?.match(/(\d{3})/)?.[1]) : null;
    if (curl.status === 0 && lastStatus) {
      return {
        url,
        ok: lastStatus >= 200 && lastStatus < 400,
        status: lastStatus,
        finalUrl: url,
        elapsedMs: Date.now() - startedAt,
        contentType: String(curl.stdout || "").match(/content-type:\s*([^\r\n]+)/i)?.[1] || "",
        looks404: false,
        probeFallback: "curl-head",
      };
    }
    return {
      url,
      ok: false,
      status: null,
      finalUrl: null,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mkdirClean(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function sha256(file) {
  const buffer = await fs.readFile(file);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

function compact(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function siteHomeUrl(site) {
  if (site === "OMT") return "https://omatogrossense.com/";
  if (site === "ROO") return "https://roonoticias.com/";
  if (site === "AFL") return "https://afolhalivre.com/";
  return "https://omatogrossense.com/";
}

function configuredSlotSelectorFor(insertion) {
  if (insertion.siteSigla === "OMT" && insertion.localFormatoNormalizado === "MEGABANNER TOPO") return ".g.g-1";
  if (insertion.siteSigla === "ROO" && insertion.localFormatoNormalizado === "MEGABANNER TOPO") {
    return "div.hidden.lg\\:block .g.g-1";
  }
  if (insertion.siteSigla === "AFL" && insertion.localFormatoNormalizado === "MEGABANNER HOME 1") return ".g.g-2";
  return "";
}

function assertOfficialMetadata(meta, pkg, insertion, date) {
  const issues = [];
  const expectedDate = date.split("-").reverse().join("/");
  const expectedMediaName = path.basename(new URL(insertion.mediaUrl).pathname);
  const dynamicFields = Array.isArray(meta.dynamicFields) ? meta.dynamicFields : [];

  if (meta.frameTheme !== "windows11_chrome_real_template") issues.push("frame_theme_not_official");
  if (meta.frameTemplateVersion !== "windows11-chrome-light-similar-v4") issues.push("frame_template_version_invalid");
  if (meta.chromeTopTheme !== "light") issues.push("chrome_top_theme_invalid");
  if (meta.frameStrictAssetsOk !== true) issues.push("frame_assets_not_strict");
  for (const field of ["addressText", "tabSurface", "tabTitle", "tabIcon", "systemDateTimeInline"]) {
    if (!dynamicFields.includes(field)) issues.push(`${field}_missing`);
  }
  if (meta.tabSurfaceRendered !== true) issues.push("tab_surface_not_rendered");
  if (meta.tabTitleRendered !== true) issues.push("tab_title_not_rendered");
  if (meta.tabIconRendered !== true) issues.push("tab_icon_not_rendered");
  if (meta.tabIconFallback === true) issues.push("tab_icon_fallback_used");
  if (meta.scrollbarRendered !== true) issues.push("scrollbar_not_rendered");
  if (!Number.isFinite(Number(meta.scrollbarThumbTop))) issues.push("scrollbar_thumb_top_missing");
  if (!Number.isFinite(Number(meta.scrollbarThumbHeight))) issues.push("scrollbar_thumb_height_missing");
  if (!String(meta.systemDateTime || "").includes(expectedDate)) issues.push("desktop_date_mismatch");
  if (meta.retroGate?.ok !== true) issues.push("retro_gate_failed");
  if (meta.creativePlacementAudit?.ok !== true) issues.push("creative_placement_failed");
  if (meta.finalPngSlotAudit?.ok !== true) issues.push("final_png_slot_failed");
  if (meta.headerAdPolicyAudit?.ok !== true) issues.push("header_policy_failed");
  if (!String(meta.mediaBasename || "").includes(expectedMediaName)) issues.push("media_basename_mismatch");
  if (!String(meta.matchedMediaUrl || meta.mediaUrl || "").includes(expectedMediaName)) issues.push("matched_media_mismatch");
  if (pkg.site === "AFL") {
    const forbiddenMediaName = path.basename(new URL(aflForbiddenTopMediaUrl).pathname);
    const mediaFields = [
      meta.mediaBasename,
      meta.matchedMediaUrl,
      meta.mediaUrl,
      meta.finalPngSlotAudit?.matchedMediaUrl,
      meta.creativePlacementAudit?.matchedMediaUrl,
    ]
      .filter(Boolean)
      .join(" ");
    if (mediaFields.includes(forbiddenMediaName)) issues.push("afl_forbidden_top_creative_captured");
  }
  if (pkg.site === "OMT" && meta.visiblePageDateAudit?.ok === false) issues.push("omt_visible_header_date_mismatch");
  return issues;
}

function captureEnvFor(insertion, generatedRoot, apiBase) {
  const env = {
    ...process.env,
    ADOPS_CAPTURE_API_BASE: apiBase,
    ADOPS_GENERATED_PRINTS_ROOT: generatedRoot,
    ADOPS_CAPTURE_PYTHON: pythonBin,
  };
  if (!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && existsSync(chromeExecutable)) {
    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = chromeExecutable;
  }
  delete env.ADOPS_CAPTURE_API_TOKEN;
  delete env.ADOPS_INTERNAL_API_TOKEN;
  return env;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2500).unref();
    }, Number(options.timeoutMs || 300_000));
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, timedOut: signal === "SIGTERM" || signal === "SIGKILL" });
    });
  });
}

async function runOfficialCapture({ apiBase, outDir, insertion, date, pkg }) {
  const generatedRoot = path.join(outDir, "_generated");
  const captureAt = buildRetroCaptureAt(date, insertion.id);
  const result = await runProcess(
    nodeBin,
    [
      captureScript,
      "--apiBase",
      apiBase,
      "--insertionId",
      String(insertion.id),
      "--captureAt",
      captureAt,
      "--upload",
      "false",
      "--saveEvidence",
      "false",
      "--replaceExisting",
      "true",
    ],
    {
      cwd: repoRoot,
      env: captureEnvFor(insertion, generatedRoot, apiBase),
      timeoutMs: Number(process.env.ADOPS_CAPTURE_TIMEOUT_MS || 300_000),
    },
  );

  let payload = null;
  const stdout = String(result.stdout || "").trim();
  if (stdout) {
    try {
      payload = JSON.parse(stdout.slice(stdout.indexOf("{")));
    } catch {
      payload = null;
    }
  }

  if (result.status !== 0 || !payload?.ok) {
    return {
      ok: false,
      captureAt,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: payload?.error || String(result.stderr || result.stdout || "capture_failed").slice(0, 2000),
    };
  }

  const meta = await readJson(payload.metadata);
  const issues = assertOfficialMetadata(meta, pkg, insertion, date);
  return {
    ok: issues.length === 0,
    captureAt,
    issues,
    payload,
    meta,
    finalPng: payload.finalPng,
    metadataPath: payload.metadata,
  };
}

async function runOfficialCaptureWithRetry(args) {
  const maxAttempts = Number(process.env.ADOPS_CAPTURE_RETRY_ATTEMPTS || 2);
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await runOfficialCapture(args);
    if (last.ok) return { ...last, attempts: attempt };
    const errorText = `${last.error || ""}\n${last.stderr || ""}\n${last.stdout || ""}`;
    const transient = /browser.*closed|Target page|context.*closed|ECONNRESET|ERR_CONNECTION|Timeout|timed out|SIGTERM|SIGKILL|creative_not_found/i.test(errorText);
    if (!transient || attempt === maxAttempts) break;
    console.error(`[retry] insertion=${args.insertion.id} date=${args.date} attempt=${attempt + 1}/${maxAttempts}`);
    await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
  }
  return { ...(last || { ok: false, error: "capture_not_started" }), attempts: maxAttempts };
}

async function buildContactSheet(outDir, rows) {
  const listPath = path.join(outDir, ".contact-sheet-input.json");
  const sheetPath = path.join(outDir, "visual-contact-sheet.png");
  const items = rows.filter((row) => row.status === "audited" && row.localFile);
  await fs.writeFile(listPath, JSON.stringify({ sheetPath, items }, null, 2));
  const py = `
import json, math
from PIL import Image, ImageDraw, ImageFont
data=json.load(open(${JSON.stringify(listPath)}))
items=data["items"]
thumb_w, thumb_h = 360, 230
pad, label_h = 18, 58
cols = 3
rows = max(1, math.ceil(len(items)/cols))
W = cols*thumb_w + (cols+1)*pad
H = rows*(thumb_h+label_h) + (rows+1)*pad
sheet = Image.new("RGB", (W,H), "#f7f3ec")
draw = ImageDraw.Draw(sheet)
try:
  font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
  small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
except Exception:
  font = ImageFont.load_default()
  small = ImageFont.load_default()
for idx,item in enumerate(items):
  c=idx%cols; r=idx//cols
  x=pad+c*(thumb_w+pad); y=pad+r*(thumb_h+label_h+pad)
  try:
    im=Image.open(item["localFile"]).convert("RGB")
    im.thumbnail((thumb_w, thumb_h), Image.LANCZOS)
    bx=x+(thumb_w-im.width)//2; by=y+(thumb_h-im.height)//2
    sheet.paste(im,(bx,by))
  except Exception as e:
    draw.rectangle([x,y,x+thumb_w,y+thumb_h], fill="#ddd", outline="#999")
    draw.text((x+8,y+8), str(e)[:80], fill="#900", font=small)
  draw.rectangle([x,y+thumb_h,x+thumb_w,y+thumb_h+label_h], fill="#ffffff", outline="#d8d0c4")
  draw.text((x+8,y+thumb_h+6), f'{item["date"]} - ins {item["insertionId"]}', fill="#1c1c1c", font=font)
  draw.text((x+8,y+thumb_h+32), item.get("format","")[:46], fill="#555", font=small)
sheet.save(data["sheetPath"])
`;
  const result = spawnSync(pythonBin, ["-c", py], { encoding: "utf8" });
  await fs.rm(listPath, { force: true });
  if (result.status !== 0) throw new Error(`Falha ao criar contact sheet: ${result.stderr || result.stdout}`);
  return sheetPath;
}

async function cleanMacMetadata(dir) {
  spawnSync("find", [dir, "-name", ".DS_Store", "-delete"], { encoding: "utf8" });
  spawnSync("find", [dir, "-name", "._*", "-delete"], { encoding: "utf8" });
}

async function writeBlockedPackage(pkg, outDir, apiPublicProbe, pageProbes) {
  const diagnosticsDir = path.join(outDir, "diagnostics");
  await mkdirClean(outDir);
  await fs.mkdir(path.join(outDir, "prints"), { recursive: true });
  await fs.mkdir(path.join(outDir, "metadata"), { recursive: true });
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await buildContactSheet(outDir, []);
  await fs.writeFile(
    path.join(outDir, "status.csv"),
    "date,site,pi,insertionId,format,status,auditOk,issues,localFile,metadataFile,targetUrl,captureAt,mediaUrl,matchedMediaUrl,configuredSlotSelector,slotSelector,contextSelector,finalProofStyle,frameTemplateVersion,chromeTopTheme,scrollbarRendered,scrollbarThumbTop,scrollbarThumbHeight,pageStatus,pageLooks404,mediaStatus,sha256\n",
  );
  const manifest = {
    title: pkg.title,
    generatedAt: new Date().toISOString(),
    timezone: "America/Cuiaba",
    generator: "scripts/src/generate-feminicidio-retro-packages-2026-06-29.mjs",
    officialCaptureScript: "scripts/src/capture-insertion-proof.cjs",
    frameContract: "windows11-chrome-light-similar-v4",
    site: pkg.site,
    pi: pkg.pi,
    campaign: pkg.campaign,
    status: "blocked",
    auditOk: false,
    invalidCount: 0,
    totalPrints: 0,
    auditedCount: 0,
    apiPublic: apiPublicProbe,
    pageProbes,
    blockedDiscovery: pkg.blockedDiscovery,
    telegram: { status: "pending" },
  };
  await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(diagnosticsDir, "blocked-discovery.json"), `${JSON.stringify(pkg.blockedDiscovery, null, 2)}\n`);
  await fs.writeFile(
    path.join(outDir, "00-LEIA-ME.txt"),
    [
      pkg.title,
      "",
      "Status: blocked",
      "Prints auditados localmente: 0/0",
      "",
      pkg.blockedDiscovery.reason,
      "",
      "Nao gerei PNG porque a fonte PI+site nao esta confirmada. Isso evita evidencia falsa.",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(outDir, "atividades-correcao.md"),
    [
      "# Atividades de correcao",
      "",
      "- Confirmar PDF/Drive ou planilha para PI 25206089 + ROO.",
      "- Confirmar insercao ROO nao cancelada, periodo, formato e mediaUrl.",
      "- Depois da confirmacao, gerar prints pelo capturador oficial.",
      "",
    ].join("\n"),
  );
  await cleanMacMetadata(outDir);
  const zipPath = `${outDir}.zip`;
  await fs.rm(zipPath, { force: true });
  const zip = spawnSync("zip", ["-X", "-r", zipPath, path.basename(outDir)], {
    cwd: path.dirname(outDir),
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (zip.status !== 0) throw new Error(`Falha ao zipar ${outDir}: ${zip.stderr || zip.stdout}`);
  return { outDir, zipPath, manifest, failures: [{ blocked: true, reason: pkg.blockedDiscovery.reason }] };
}

async function buildPackage(apiBase, pkg) {
  const outDir = path.join(downloadsRoot, pkg.slug);
  const printsDir = path.join(outDir, "prints");
  const metadataDir = path.join(outDir, "metadata");
  const diagnosticsDir = path.join(outDir, "diagnostics");
  const resumeExisting = process.env.ADOPS_RESUME_EXISTING === "1";
  const apiPublicProbe = await probeUrl("https://adops-api-public.leandro471.workers.dev/api/insertions");
  const pageProbes = [await probeUrl(siteHomeUrl(pkg.site))];

  if (pkg.blockedDiscovery) return writeBlockedPackage(pkg, outDir, apiPublicProbe, pageProbes);

  if (resumeExisting && existsSync(outDir)) {
    await fs.mkdir(outDir, { recursive: true });
  } else {
    await mkdirClean(outDir);
  }
  await fs.mkdir(printsDir, { recursive: true });
  await fs.mkdir(metadataDir, { recursive: true });
  await fs.mkdir(diagnosticsDir, { recursive: true });

  const mediaProbes = [];
  for (const group of pkg.insertions) {
    mediaProbes.push(await probeUrl(insertions[group.insertionId].mediaUrl));
  }

  const rows = [];
  const failures = [];
  for (const group of pkg.insertions) {
    const insertion = insertions[group.insertionId];
    for (const date of group.dates) {
      if (process.env.ADOPS_ONLY_DATE && date !== process.env.ADOPS_ONLY_DATE) continue;
      const fileName = `${date}-${pkg.site}-PI-${pkg.pi}-${compact(insertion.campanhaName)}-${compact(insertion.localFormatoNormalizado)}-${group.insertionId}.png`;
      const metaName = fileName.replace(/\.png$/i, ".meta.json");
      const finalTarget = path.join(printsDir, fileName);
      const metaTarget = path.join(metadataDir, metaName);
      console.error(`[official-capture] ${pkg.slug} insertion=${group.insertionId} date=${date}`);
      let result;
      if (resumeExisting && !process.env.ADOPS_ONLY_DATE && existsSync(finalTarget) && existsSync(metaTarget)) {
        const meta = await readJson(metaTarget);
        const issues = assertOfficialMetadata(meta, pkg, insertion, date);
        result = {
          ok: issues.length === 0,
          captureAt: buildRetroCaptureAt(date, insertion.id),
          issues,
          meta,
          finalPng: finalTarget,
          metadataPath: metaTarget,
          attempts: 0,
        };
      } else {
        result = await runOfficialCaptureWithRetry({ apiBase, outDir, insertion, date, pkg });
      }
      const mediaProbe = mediaProbes.find((probe) => probe.url === insertion.mediaUrl) || null;
      let copied = false;
      if (resumeExisting && result.ok && result.finalPng === finalTarget && existsSync(finalTarget) && existsSync(metaTarget)) {
        copied = true;
      } else if (result.ok && result.finalPng && existsSync(result.finalPng)) {
        await fs.copyFile(result.finalPng, finalTarget);
        await fs.copyFile(result.metadataPath, metaTarget);
        copied = true;
      }
      const status = result.ok && copied && mediaProbe?.ok === true ? "audited" : "invalid_audit";
      const issues = [
        ...(Array.isArray(result.issues) ? result.issues : []),
        result.ok ? null : "official_capture_failed",
        copied ? null : "png_missing",
        mediaProbe?.ok === true ? null : "media_url_unhealthy",
      ].filter(Boolean);
      const row = {
        date,
        site: pkg.site,
        pi: pkg.pi,
        insertionId: group.insertionId,
        format: insertion.localFormatoNormalizado,
        status,
        auditOk: status === "audited",
        issues: issues.join("|"),
        localFile: copied ? finalTarget : "",
        metadataFile: copied ? metaTarget : "",
        targetUrl: result.meta?.pageUrl || "",
        captureAt: result.captureAt,
        mediaUrl: insertion.mediaUrl,
        matchedMediaUrl: result.meta?.matchedMediaUrl || "",
        configuredSlotSelector: configuredSlotSelectorFor(insertion),
        slotSelector: result.meta?.slotSelector || "",
        contextSelector: result.meta?.contextSelector || "",
        finalProofStyle: result.meta?.finalProofStyle || "",
        frameTemplateVersion: result.meta?.frameTemplateVersion || "",
        chromeTopTheme: result.meta?.chromeTopTheme || "",
        scrollbarRendered: result.meta?.scrollbarRendered ?? "",
        scrollbarThumbTop: result.meta?.scrollbarThumbTop ?? "",
        scrollbarThumbHeight: result.meta?.scrollbarThumbHeight ?? "",
        pageStatus: "",
        pageLooks404: "",
        mediaStatus: mediaProbe?.status ?? "",
        sha256: copied ? await sha256(finalTarget) : "",
      };
      rows.push(row);
      if (status !== "audited") {
        const failure = {
          row,
          captureStatus: result.status ?? null,
          error: result.error || null,
          stdout: result.stdout ? String(result.stdout).slice(-4000) : null,
          stderr: result.stderr ? String(result.stderr).slice(-4000) : null,
          metadata: result.meta || null,
        };
        failures.push(failure);
        await fs.writeFile(path.join(diagnosticsDir, `${date}-${group.insertionId}-failure.json`), `${JSON.stringify(failure, null, 2)}\n`);
      } else {
        await fs.rm(path.join(diagnosticsDir, `${date}-${group.insertionId}-failure.json`), { force: true });
      }
    }
  }

  await buildContactSheet(outDir, rows);
  const statusCsv = [
    "date,site,pi,insertionId,format,status,auditOk,issues,localFile,metadataFile,targetUrl,captureAt,mediaUrl,matchedMediaUrl,configuredSlotSelector,slotSelector,contextSelector,finalProofStyle,frameTemplateVersion,chromeTopTheme,scrollbarRendered,scrollbarThumbTop,scrollbarThumbHeight,pageStatus,pageLooks404,mediaStatus,sha256",
    ...rows.map((row) =>
      [
        row.date,
        row.site,
        row.pi,
        row.insertionId,
        row.format,
        row.status,
        row.auditOk,
        row.issues,
        row.localFile,
        row.metadataFile,
        row.targetUrl,
        row.captureAt,
        row.mediaUrl,
        row.matchedMediaUrl,
        row.configuredSlotSelector,
        row.slotSelector,
        row.contextSelector,
        row.finalProofStyle,
        row.frameTemplateVersion,
        row.chromeTopTheme,
        row.scrollbarRendered,
        row.scrollbarThumbTop,
        row.scrollbarThumbHeight,
        row.pageStatus,
        row.pageLooks404,
        row.mediaStatus,
        row.sha256,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");
  await fs.writeFile(path.join(outDir, "status.csv"), `${statusCsv}\n`);

  const manifest = {
    title: pkg.title,
    generatedAt: new Date().toISOString(),
    timezone: "America/Cuiaba",
    generator: "scripts/src/generate-feminicidio-retro-packages-2026-06-29.mjs",
    officialCaptureScript: "scripts/src/capture-insertion-proof.cjs",
    frameContract: "windows11-chrome-light-similar-v4",
    site: pkg.site,
    pi: pkg.pi,
    campaign: pkg.campaign,
    status: failures.length ? "needs_review" : "audited",
    auditOk: failures.length === 0,
    apiPublic: {
      status: apiPublicProbe.status,
      ok: apiPublicProbe.ok,
      note:
        apiPublicProbe.status === 521 || apiPublicProbe.ok === false
          ? "API publica indisponivel ou instavel; pacote gerado com API local minima e capturador oficial."
          : "API publica respondeu durante a geracao.",
    },
    pageProbes,
    mediaProbes,
    discoveryNotes: pkg.discoveryNotes || [],
    totalPrints: rows.length,
    auditedCount: rows.filter((row) => row.status === "audited").length,
    invalidCount: rows.filter((row) => row.status !== "audited").length,
    insertions: pkg.insertions.map((group) => ({
      ...insertions[group.insertionId],
      evidences: undefined,
      dates: group.dates,
    })),
    rows,
    telegram: { status: "pending" },
  };
  await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(
    path.join(outDir, "00-LEIA-ME.txt"),
    [
      pkg.title,
      "",
      `Status: ${manifest.status}`,
      `Prints auditados localmente: ${manifest.auditedCount}/${manifest.totalPrints}`,
      `Contrato visual: ${manifest.frameContract}`,
      `API publica AdOps: ${apiPublicProbe.status || "sem resposta"}`,
      "",
      "Todos os PNGs em prints/ foram aceitos apenas se vieram do capturador oficial capture-insertion-proof.cjs.",
      "O pacote bloqueia evidencia com moldura nao oficial, seletor errado, media divergente ou scrollbar ausente.",
      "",
      "Arquivos:",
      "- prints/: PNGs finais para envio",
      "- metadata/: meta.json oficial de cada print",
      "- diagnostics/: falhas/probes, se houver",
      "- visual-contact-sheet.png: revisao visual consolidada",
      "- status.csv: status por data",
      "- manifest.json: metadados, hashes e probes",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(outDir, "atividades-correcao.md"),
    [
      "# Atividades executadas",
      "",
      "- Conferida documentacao de retroativos, moldura Windows v4 e janela de horario.",
      `- Confirmada fonte canonica para ${pkg.site} PI ${pkg.pi}.`,
      "- Validada media publica via HTTP.",
      "- Geradas evidencias pelo capturador oficial.",
      "- Validado manifest/status e montada folha visual.",
      "",
    ].join("\n"),
  );

  await cleanMacMetadata(outDir);
  await fs.rm(path.join(outDir, "_generated"), { recursive: true, force: true });
  const zipPath = `${outDir}.zip`;
  await fs.rm(zipPath, { force: true });
  const zip = spawnSync("zip", ["-X", "-r", zipPath, path.basename(outDir)], {
    cwd: path.dirname(outDir),
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (zip.status !== 0) throw new Error(`Falha ao zipar ${outDir}: ${zip.stderr || zip.stdout}`);
  return { outDir, zipPath, manifest, failures };
}

async function main() {
  const { server, apiBase } = await startLocalApi();
  const results = [];
  try {
    for (const pkg of packages) {
      if (process.env.ADOPS_ONLY_PACKAGE && !pkg.slug.includes(process.env.ADOPS_ONLY_PACKAGE)) continue;
      results.push(await buildPackage(apiBase, pkg));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(
    JSON.stringify(
      {
        ok: results.every((item) => item.failures.length === 0),
        results: results.map((item) => ({
          outDir: item.outDir,
          zipPath: item.zipPath,
          status: item.manifest.status,
          totalPrints: item.manifest.totalPrints,
          auditedCount: item.manifest.auditedCount,
          invalidCount: item.manifest.invalidCount,
        })),
      },
      null,
      2,
    ),
  );
  if (results.some((item) => item.failures.length > 0)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
