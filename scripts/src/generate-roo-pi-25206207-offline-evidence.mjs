#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "../..");
const configPath = path.join(repoRoot, "config", "adrotate-sites.json");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const pi = "25206207";
const campaignLabel = "PI 25206207 - GOV FAZ - Roo Noticias";
const slug = "ROO-PI-25206207-GOV-FAZ";
const defaultCreativePatterns = [
  pi,
  "governo",
  "gov",
  "faz",
  "govmt",
  "banner_site_825x120-sau-5.gif",
];
const defaultOutRoot = path.join(
  "/Users/leandrobosaipo/Downloads",
  `${slug}-offline-evidence-${new Date().toISOString().slice(0, 10)}`,
);

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function parseDates() {
  const datesArg = argValue("dates");
  if (datesArg) {
    return datesArg
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const start = argValue("start");
  const end = argValue("end");
  if (!start && !end) return [new Date().toISOString().slice(0, 10)];
  const first = new Date(`${start || end}T00:00:00`);
  const last = new Date(`${end || start}T00:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    throw new Error("Datas invalidas. Use --dates YYYY-MM-DD,YYYY-MM-DD ou --start/--end.");
  }
  const dates = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function httpProbe(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 Codex-AdOps-OfflineEvidence/1.0",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const body = await response.text();
    return {
      url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs: Date.now() - startedAt,
      finalUrl: response.url,
      bodyBytes: Buffer.byteLength(body),
      bodyPreview: body.slice(0, 600),
      hasPi: body.includes(pi),
      hasGovFaz: /governo|gov|faz/i.test(body),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      statusText: null,
      elapsedMs: Date.now() - startedAt,
      finalUrl: null,
      bodyBytes: 0,
      bodyPreview: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeName(value) {
  return String(value).replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function inspectPage(browser, url, outDir, mapping, dateKey) {
  const page = await browser.newPage({
    viewport: { width: 1660, height: 1200 },
    deviceScaleFactor: 1,
  });
  const pageName = `${dateKey}-${sanitizeName(new URL(url).host)}`;
  const screenshotPath = path.join(outDir, "diagnostics", `${pageName}.png`);
  const htmlPath = path.join(outDir, "diagnostics", `${pageName}.html`);
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await fs.writeFile(htmlPath, await page.content());
    const creativePatterns = (argValue("creative-url-contains") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const inspection = await page.evaluate(
      ({ slotSelector, matchers }) => {
        const slot = document.querySelector(slotSelector) || document.querySelector(".g.g-1");
        const rect = slot?.getBoundingClientRect();
        const links = Array.from(slot?.querySelectorAll("a") || []).map((node) => ({
          href: node.href || node.getAttribute("href") || null,
          text: (node.textContent || "").trim().slice(0, 200),
        }));
        const images = Array.from(slot?.querySelectorAll("img") || []).map((node) => ({
          src: node.currentSrc || node.src || node.getAttribute("src") || node.getAttribute("data-lazy-src") || null,
          alt: node.alt || null,
          width: node.naturalWidth || node.width || null,
          height: node.naturalHeight || node.height || null,
        }));
        const slotHtml = slot?.outerHTML || "";
        const text = `${slotHtml} ${links.map((item) => item.href || "").join(" ")} ${images
          .map((item) => `${item.src || ""} ${item.alt || ""}`)
          .join(" ")}`;
        return {
          title: document.title,
          url: location.href,
          slotFound: Boolean(slot),
          slotSelector,
          slotRect: rect
            ? {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              }
            : null,
          links,
          images,
          matched: matchers.some((matcher) => text.toLowerCase().includes(matcher.toLowerCase())),
          matchedTerms: matchers.filter((matcher) => text.toLowerCase().includes(matcher.toLowerCase())),
          slotHtmlPreview: slotHtml.slice(0, 1200),
        };
      },
      { slotSelector: mapping.slotSelector, matchers: [...defaultCreativePatterns, ...creativePatterns] },
    );
    return {
      url,
      date: dateKey,
      ok: Boolean(response?.ok()),
      status: response?.status() || null,
      screenshotPath,
      htmlPath,
      inspection,
    };
  } catch (error) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // The page can fail before a screenshot is possible.
    }
    return {
      url,
      date: dateKey,
      ok: false,
      status: null,
      screenshotPath,
      htmlPath: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close();
  }
}

function zipDir(sourceDir, zipPath) {
  execFileSync("ditto", ["-c", "-k", "--keepParent", sourceDir, zipPath], { stdio: "pipe" });
}

async function main() {
  const outRoot = path.resolve(argValue("out", defaultOutRoot));
  const dates = parseDates();
  await fs.rm(outRoot, { recursive: true, force: true });
  await ensureDir(path.join(outRoot, "diagnostics"));
  await ensureDir(path.join(outRoot, "prints"));
  await ensureDir(path.join(outRoot, "scripts"));

  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const roo = config.ROO;
  const topMapping = roo?.formatMappings?.find((item) => item.groupId === 1);
  if (!roo || !topMapping) throw new Error("Config ROO groupId=1 nao encontrada em config/adrotate-sites.json.");

  const urls = Array.from(
    new Set([
      roo.homeUrl,
      roo.articleFallbackUrl,
      "https://roonoticias.com/",
      "https://www.roonoticias.com.br/",
      "https://roonoticias.com.br/",
    ].filter(Boolean)),
  );

  const healthUrls = [
    "https://adops-api.codigo5.com.br/api/healthz",
    "https://adops-api-public.leandro471.workers.dev/api/healthz",
    ...urls,
  ];

  const probes = [];
  for (const url of healthUrls) probes.push(await httpProbe(url));
  await writeJson(path.join(outRoot, "diagnostics", "http-probes.json"), probes);

  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromeExecutable) ? { executablePath: chromeExecutable } : {}),
  });
  const pageChecks = [];
  for (const dateKey of dates) {
    for (const url of urls) {
      pageChecks.push(await inspectPage(browser, url, outRoot, topMapping, dateKey));
    }
  }
  await browser.close();

  const matchedChecks = pageChecks.filter((item) => item.inspection?.matched);
  for (const [index, item] of matchedChecks.entries()) {
    const parsed = new URL(item.url);
    const pageSlug = parsed.pathname === "/" ? "home" : sanitizeName(parsed.pathname).slice(0, 80);
    const target = path.join(
      outRoot,
      "prints",
      `${slug}_${item.date}_${String(index + 1).padStart(2, "0")}_${sanitizeName(parsed.host)}_${pageSlug}.png`,
    );
    await fs.copyFile(item.screenshotPath, target);
    item.proofPath = target;
  }

  const anySiteOk = pageChecks.some((item) => item.ok);
  const status = matchedChecks.length
    ? "captured_unverified_offline"
    : anySiteOk
      ? "blocked_creative_not_found"
      : "blocked_site_or_adops_unavailable";

  const manifest = {
    pi,
    campaignLabel,
    site: "ROO",
    domain: roo.domain,
    generatedAt: new Date().toISOString(),
    timezone: "America/Cuiaba",
    status,
    audited: false,
    offlineMode: true,
    reason:
      status === "captured_unverified_offline"
        ? "Print capturado diretamente do site, mas sem confirmacao AdOps porque a API privada esta indisponivel."
        : status === "blocked_creative_not_found"
          ? "Site respondeu, mas o criativo da PI 25206207/GOV FAZ nao apareceu no slot ROO groupId=1."
          : "Site ROO ou API AdOps indisponivel durante a captura offline.",
    dates,
    captureContract: {
      groupId: 1,
      aliases: topMapping.aliases,
      slotSelector: topMapping.slotSelector,
      contextSelector: topMapping.contextSelector,
      scrollMode: topMapping.scrollMode,
    },
    creativeMatchers: [
      ...defaultCreativePatterns,
      ...(argValue("creative-url-contains") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ],
    urlsChecked: urls,
    probes,
    pageChecks,
    proofs: matchedChecks.map((item) => ({
      date: item.date,
      url: item.url,
      proofPath: item.proofPath,
      matchedTerms: item.inspection?.matchedTerms || [],
    })),
  };

  await writeJson(path.join(outRoot, "manifest.json"), manifest);
  await fs.writeFile(
    path.join(outRoot, "00-LEIA-ME.txt"),
    [
      campaignLabel,
      "",
      `Status: ${status}`,
      "Auditoria AdOps: false",
      "",
      "Este pacote foi gerado em modo offline porque o servidor/API do AdOps esta indisponivel.",
      "Ele nao substitui evidencia auditada pelo AdOps quando a API privada voltar.",
      "",
      "Contrato usado:",
      `- Portal: ROO / ${roo.domain}`,
      `- Grupo AdRotate: ${topMapping.groupId}`,
      `- Slot: ${topMapping.slotSelector}`,
      `- Datas: ${dates.join(", ")}`,
      "",
      "Arquivos:",
      "- manifest.json: resultado estruturado da captura",
      "- diagnostics/http-probes.json: saude dos endpoints e sites",
      "- diagnostics/*.png: screenshots brutos das paginas testadas",
      "- diagnostics/*.html: HTML capturado quando a pagina respondeu",
      "- prints/*.png: prints copiados somente quando o criativo foi encontrado",
      "",
      "Reexecucao:",
      `node ${path.relative(repoRoot, scriptPath)} --out "${outRoot}" --dates ${dates.join(",")}`,
      "",
    ].join("\n"),
  );
  await fs.copyFile(scriptPath, path.join(outRoot, "scripts", path.basename(scriptPath)));

  const zipPath = `${outRoot}.zip`;
  await fs.rm(zipPath, { force: true });
  zipDir(outRoot, zipPath);

  console.log(
    JSON.stringify(
      {
        ok: matchedChecks.length > 0,
        status,
        outRoot,
        zipPath,
        proofs: matchedChecks.length,
        pageChecks: pageChecks.length,
      },
      null,
      2,
    ),
  );

  if (!matchedChecks.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
