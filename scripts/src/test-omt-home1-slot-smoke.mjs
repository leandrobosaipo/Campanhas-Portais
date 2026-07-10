import { readFile } from "node:fs/promises";

const configPath = new URL("../../config/adrotate-sites.json", import.meta.url);
const raw = await readFile(configPath, "utf8");
const config = JSON.parse(raw);

const omt = config?.OMT;
if (!omt) {
  throw new Error("Configuração OMT não encontrada em adrotate-sites.json.");
}

const mapping = Array.isArray(omt.formatMappings)
  ? omt.formatMappings.find((item) => Number(item?.groupId) === 2)
  : null;

if (!mapping) {
  throw new Error("Mapping do OMT groupId=2 não encontrado.");
}

if (mapping.page !== "home") {
  throw new Error(`OMT HOME 1 deveria usar page=home, mas veio ${String(mapping.page)}.`);
}

if (mapping.slotSelector !== ".g.g-2") {
  throw new Error(`OMT HOME 1 deveria usar slotSelector=.g.g-2, mas veio ${String(mapping.slotSelector)}.`);
}

if (mapping.contextSelector !== ".g.g-2") {
  throw new Error(`OMT HOME 1 deveria usar contextSelector=.g.g-2, mas veio ${String(mapping.contextSelector)}.`);
}

if (mapping.proofStyle !== "viewport_only") {
  throw new Error(`OMT HOME 1 deveria usar proofStyle=viewport_only, mas veio ${String(mapping.proofStyle)}.`);
}

if (mapping.auditOverrides?.requireSlotVisibleInViewport !== true) {
  throw new Error("OMT HOME 1 deve exigir slot visível no viewport final (requireSlotVisibleInViewport=true).");
}

if (omt.articleFallbackUrl != null) {
  throw new Error("OMT HOME 1 não deveria depender de articleFallbackUrl neste fluxo.");
}

const response = await fetch(omt.homeUrl, {
  headers: {
    "user-agent": "adops-omt-home1-smoke/1.0",
    accept: "text/html,application/xhtml+xml",
  },
});

if (!response.ok) {
  throw new Error(`Home do OMT respondeu HTTP ${response.status}.`);
}

const html = await response.text();
const slotPresent = /class=["'][^"']*\bg\b[^"']*\bg-2\b[^"']*["']/i.test(html);

if (!slotPresent) {
  throw new Error("Slot .g.g-2 não foi encontrado no HTML da home do OMT.");
}

console.log(JSON.stringify({
  ok: true,
  siteSigla: "OMT",
  homeUrl: omt.homeUrl,
  groupId: 2,
  page: mapping.page,
  slotSelector: mapping.slotSelector,
  contextSelector: mapping.contextSelector,
  proofStyle: mapping.proofStyle,
  requireSlotVisibleInViewport: mapping.auditOverrides?.requireSlotVisibleInViewport === true,
  slotPresent,
  articleFallbackUrl: omt.articleFallbackUrl,
}, null, 2));
