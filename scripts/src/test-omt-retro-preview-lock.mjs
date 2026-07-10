import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const configPath = new URL("../../config/adrotate-sites.json", import.meta.url);
const raw = await readFile(configPath, "utf8");
const config = JSON.parse(raw);
const omt = config?.OMT;

if (!omt?.homeUrl || !omt?.previewSecret) {
  throw new Error("Configuração OMT incompleta para smoke de preview retroativo.");
}

const captureAt = process.argv[2] || "2026-04-13T19:17";
const sig = crypto.createHmac("sha256", String(omt.previewSecret)).update(captureAt).digest("hex");
const url = new URL(String(omt.homeUrl));
url.searchParams.set("adops_preview_at", captureAt);
url.searchParams.set("adops_preview_sig", sig);
const originIp = String(omt.originIp || "").trim();
const curlArgs = [
  "-sS",
  "-D",
  "-",
  "-H",
  "user-agent: adops-omt-retro-preview-lock/1.0",
  "-H",
  "accept: text/html,application/xhtml+xml",
  "-H",
  "cache-control: no-cache",
  "-H",
  "pragma: no-cache",
];
if (originIp) {
  curlArgs.push("--resolve", `${url.hostname}:443:${originIp}`);
}
curlArgs.push(url.toString());
const rawResponse = execFileSync("curl", curlArgs, { encoding: "utf8" });
const [rawHeaders, ...bodyParts] = rawResponse.split(/\r?\n\r?\n/);
const html = bodyParts.join("\n\n");
const httpLine = (rawHeaders.split(/\r?\n/)[0] || "").trim();
const statusMatch = httpLine.match(/HTTP\/[0-9.]+\s+(\d{3})/i);
const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
if (!(statusCode >= 200 && statusCode < 400)) {
  throw new Error(`OMT preview respondeu HTTP ${statusCode || "desconhecido"}.`);
}
const hasExpectedCaptureAt = html.includes(captureAt) || html.includes("2026-04-13T19:17:00-04:00");
const hasLiveDatestampMarker = /data-omt-live-datestamp=["']1["']/i.test(html);
const hasScheduleTick = /scheduleNextTick\s*\(/.test(html);
const hasJsNowDatetimeTick = /setAttribute\('datetime',\s*getLocalIso\(now\)\)/.test(html) || /setAttribute\('datetime',\s*new Date\(\)\.toISOString\(\)\)/.test(html);
if (!hasExpectedCaptureAt || hasLiveDatestampMarker || hasScheduleTick || hasJsNowDatetimeTick) {
  throw new Error(
    `Preview lock incompleto no OMT: captureAtInHtml=${hasExpectedCaptureAt} liveDatestampMarker=${hasLiveDatestampMarker} scheduleTick=${hasScheduleTick} jsNowDatetimeTick=${hasJsNowDatetimeTick} originIp=${originIp || "none"}.`,
  );
}

console.log(JSON.stringify({
  ok: true,
  url: url.toString(),
  captureAt,
  hasExpectedCaptureAt,
  hasLiveDatestampMarker,
  hasScheduleTick,
  hasJsNowDatetimeTick,
  statusCode,
  originIp: originIp || null,
}, null, 2));
