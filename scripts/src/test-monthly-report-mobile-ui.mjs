import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const sourcePath = new URL("./build-current-month-evidence-report.mjs", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const buildDir = await mkdtemp(path.join(tmpdir(), "monthly-report-mobile-ui-"));
const modulePath = path.join(path.dirname(sourcePath.pathname), `.test-render-${path.basename(buildDir)}.mjs`);
const importSafeSource = source.replace(
  /main\(\)\.catch\(\(error\) => \{[\s\S]*?\n\}\);\s*$/,
  "export { renderHtml };\n",
);
await writeFile(modulePath, importSafeSource, "utf8");
const { renderHtml } = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
after(async () => {
  await Promise.all([
    rm(modulePath, { force: true }),
    rm(buildDir, { recursive: true, force: true }),
  ]);
});

const insertion = {
  id: 1944,
  modalId: "ins-1944",
  campanhaName: "RADAR",
  siteSigla: "PERRENGUE",
  clienteNome: "Radar",
  agenciaNome: "ZF",
  piCodigo: "PI - TCE",
  localFormato: "HOME 1",
  localFormatoNormalizado: "HOME 1",
  periodoInicio: "2026-08-12",
  periodoFim: "2026-08-25",
  requiredDays: ["2026-08-12", "2026-08-13"],
  auditedDays: 2,
  missingDates: [],
  invalidDates: [],
  state: "ok",
  statusDetail: "Evidências auditadas.",
  evidenceDays: [
    { date: "2026-08-12", status: "audited", url: "https://cdn.example/12.png", downloadUrl: "https://api.example/12.jpg" },
    { date: "2026-08-13", status: "audited", url: "https://cdn.example/13.png", downloadUrl: "https://api.example/13.jpg" },
  ],
};

const nonPublishedInsertion = {
  ...insertion,
  id: 2186,
  modalId: "ins-2186",
  campanhaName: "CRIME AMBIENTAL",
  piCodigo: "PI 17046 - GOV",
  bannerPublicadoNoSite: false,
  state: "not_published",
  requiredDays: ["2026-08-01", "2026-08-02"],
  evidenceDays: [
    { date: "2026-08-01", status: "missing", url: "", downloadUrl: "" },
    { date: "2026-08-02", status: "missing", url: "", downloadUrl: "" },
  ],
  auditedDays: 0,
  missingDates: ["2026-08-01", "2026-08-02"],
  retroactiveMissingDates: ["2026-08-01", "2026-08-02"],
  publicationBlocker: "O PDF não confirmou a PI numérica.",
  publicationAction: "Enviar o PDF autoritativo e executar novo preflight.",
  statusDetail: "Banner não publicado.",
};

const portal = {
  key: "PERRENGUE",
  label: "Perrengue Mato Grosso",
  logo: "",
  homeUrl: "https://perrenguematogrosso.com",
  stats: { active: 1, scheduled: 0, ok: 1, pending: 0, invalid: 0, not_published: 0, evidences: 2 },
  campaigns: [{ name: "RADAR", pi: "PI - TCE", cliente: "Radar", agencia: "ZF", items: [insertion] }],
};

function html() {
  return renderHtml({
    insertions: [insertion],
    portals: [portal],
    audits: {},
    summary: { total: 1, active: 1, scheduled: 0, ok: 1, pending: 0, invalid: 0, notPublished: 0, auditedDays: 2 },
    forecast: { starting: [], ending: [] },
    sources: { driveInventory: { snapshotStatus: "fresh", itemCount: 457 } },
    dailyPrintStatus: {
      timeZone: "America/Cuiaba", schedule: "18:00", nextRunAt: "2026-08-18T22:00:00.000Z",
      lastAttempt: { jobId: "job-1", targetDate: "2026-08-17", status: "partial", startedAt: "2026-08-17T22:00:50.000Z", finishedAt: "2026-08-17T22:14:25.000Z", expected: 16, approved: 14, missing: 2, invalid: 0, summary: "14 de 16 campanhas tiveram o print aprovado; duas precisam de nova tentativa." },
      lastFullyApproved: { targetDate: "2026-08-16", finishedAt: "2026-08-16T22:10:00.000Z" },
    },
  });
}

function nonPublishedHtml() {
  return renderHtml({
    insertions: [nonPublishedInsertion],
    portals: [{ ...portal, stats: { active: 1, scheduled: 0, ok: 0, pending: 0, invalid: 0, not_published: 1, evidences: 0 }, campaigns: [{ ...portal.campaigns[0], items: [nonPublishedInsertion] }] }],
    audits: {},
    summary: { total: 1, active: 1, scheduled: 0, ok: 0, pending: 0, invalid: 0, notPublished: 1, auditedDays: 0 },
    forecast: { starting: [], ending: [] },
    sources: { driveInventory: { snapshotStatus: "fresh", itemCount: 457 } },
  });
}

function mixedHtml() {
  return renderHtml({
    insertions: [insertion, nonPublishedInsertion],
    portals: [{
      ...portal,
      stats: { active: 2, scheduled: 0, ok: 1, pending: 0, invalid: 0, not_published: 1, evidences: 2 },
      campaigns: [
        portal.campaigns[0],
        { name: "CRIME AMBIENTAL", pi: "PI 17046 - GOV", cliente: "Governo", agencia: "ZF", items: [nonPublishedInsertion] },
      ],
    }],
    audits: {},
    summary: { total: 2, active: 2, scheduled: 0, ended: 0, ok: 1, pending: 0, invalid: 0, notPublished: 1, auditedDays: 2 },
    forecast: { starting: [], ending: [] },
    sources: { driveInventory: { snapshotStatus: "fresh", itemCount: 457 } },
    dailyPrintStatus: {
      timeZone: "America/Cuiaba", schedule: "18:00", nextRunAt: "2026-08-18T22:00:00.000Z",
      lastAttempt: { jobId: "job-1", targetDate: "2026-08-17", status: "partial", startedAt: "2026-08-17T22:00:50.000Z", finishedAt: "2026-08-17T22:14:25.000Z", expected: 16, approved: 14, missing: 2, invalid: 0, summary: "14 de 16 campanhas tiveram o print aprovado; duas precisam de nova tentativa." },
      lastFullyApproved: { targetDate: "2026-08-16", finishedAt: "2026-08-16T22:10:00.000Z" },
    },
  });
}

test("mantém somente uma barra móvel compacta e abre filtros em dialog acessível", () => {
  const output = html();
  assert.match(output, /id="filterToggle"[^>]+aria-controls="filterPanel"[^>]+aria-expanded="false"/);
  assert.match(output, /<dialog[^>]+id="filterPanel"/);
  assert.match(output, /\.mobile-toolbar\s*\{[^}]*position:\s*sticky[^}]*min-height:\s*56px/s);
  assert.doesNotMatch(output, /header\s*\{[^}]*position:\s*sticky/s);
  assert.ok(output.indexOf('class="mobile-toolbar"') < output.indexOf("<header>"), "filtro móvel deve aparecer antes do cabeçalho");
  assert.match(output, /id="filterToggle"[^>]*>[\s\S]*?Filtrar campanhas[\s\S]*?<\/button>/);
  assert.match(output, /id="filterActiveCount"[^>]+aria-hidden="true"/);
});

test("condensa o cabeçalho e separa métricas principais das secundárias", () => {
  const output = html();
  assert.match(output, /class="header-overview"/);
  assert.match(output, /class="metric-details"/);
  assert.doesNotMatch(output, /<section class="kpis">/);
  assert.match(output, /\.topbar\s*\{[^}]*min-height:\s*64px/s);
});

test("traduz falha histórica e oferece atalho para a pendência atual", () => {
  const output = mixedHtml();
  assert.match(output, /2 prints precisaram de nova tentativa/);
  assert.match(output, /campanhas publicadas estão em dia agora/);
  assert.match(output, /1 campanha precisa de atenção/);
  assert.match(output, /data-quick-publication="not_published"/);
  assert.doesNotMatch(output, /data-quick-publication="not_published"[^>]+data-quick-evidence/);
  assert.match(output, /Ver 1 campanha sem publicação/);
});

test("preserva filtros na URL e anuncia a quantidade de resultados", () => {
  const output = html();
  assert.match(output, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(output, /history\.replaceState/);
  assert.match(output, /id="resultCount"[^>]+aria-live="polite"/);
  assert.match(output, /id="clearFilters"/);
});

test("expõe filtros independentes de publicação e evidências retroativas", () => {
  const output = html();
  assert.match(output, /for="publicationFilter"[^>]*>Publicação</);
  assert.match(output, /id="publicationFilter"/);
  assert.match(output, /value="not_published"[^>]*>Não publicadas</);
  assert.match(output, /for="evidenceFilter"[^>]*>Evidências</);
  assert.match(output, /id="evidenceFilter"/);
  assert.match(output, /value="missing"[^>]*>Qualquer print pendente</);
  assert.match(output, /value="retroactive_missing"[^>]*>Retroativos pendentes</);
  assert.match(output, /params\.get\('publication'\)/);
  assert.match(output, /params\.get\('evidence'\)/);
});

test("explica bloqueio e retroativos no card da campanha não publicada", () => {
  const output = nonPublishedHtml();
  assert.match(output, /Banner não publicado/);
  assert.match(output, /2 retroativos pendentes/);
  assert.match(output, /01\/08\/2026, 02\/08\/2026/);
  assert.match(output, /O PDF não confirmou a PI numérica/);
  assert.match(output, /Enviar o PDF autoritativo e executar novo preflight/);
});

test("visualizador móvel navega por data sem IDs duplicados", () => {
  const output = html();
  const ids = [...output.matchAll(/(?:^|\s)id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, "todos os IDs do documento devem ser únicos");
  assert.match(output, /id="modalPrevious"/);
  assert.match(output, /id="modalNext"/);
  assert.match(output, /id="modalDate"/);
  assert.match(output, /@media \(max-width:\s*760px\)[\s\S]*#modal\s*\{[^}]*height:\s*100dvh/s);
  assert.match(output, /@media \(max-width:\s*760px\)[\s\S]*#modal \.modal-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(output, /@media \(max-width:\s*1024px\)[\s\S]*#modal/s);
  assert.match(output, /<details class="modal-details"><summary>/);
});

test("JavaScript inline gerado permanece sintaticamente válido", async () => {
  const output = html();
  const scripts = [...output.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((body) => body.trim() && !body.trim().startsWith("{"));
  assert.equal(scripts.length, 1);
  const scriptPath = path.join(buildDir, "report-inline.js");
  await writeFile(scriptPath, scripts[0], "utf8");
  await execFileAsync(process.execPath, ["--check", scriptPath]);
});

test("mostra a rotina diária, contador acessível e fontes operacionais", () => {
  const output = html();
  assert.match(output, /Rotina diária/);
  assert.match(output, /Início e fim/);
  assert.match(output, /2 ausentes · 0 inválidas/);
  assert.match(output, /2 prints precisaram de nova tentativa/);
  assert.match(output, /campanhas publicadas estão em dia agora/);
  assert.doesNotMatch(output, /14 de 16 campanhas tiveram o print aprovado/);
  assert.match(output, /id="dailyCountdown"/);
  assert.match(output, /data-next-run="2026-08-18T22:00:00\.000Z"/);
  assert.match(output, /setInterval\([^,]+,\s*60000\)/s);
  assert.match(output, /Planilha — aba AGOSTO 2026/);
  assert.match(output, /docs\.google\.com\/spreadsheets\/d\/1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu\/edit#gid=971687922/);
  assert.match(output, /Pasta de mídias no Google Drive/);
  assert.match(output, /drive\.google\.com\/drive\/folders\/18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6/);
  assert.match(output, /class="source-link sheet-source"/);
  assert.match(output, /class="source-link drive-source"/);
  assert.match(output, /<svg[^>]+aria-hidden="true"/);
  assert.match(output, /Abrir aba AGOSTO 2026/);
  assert.match(output, /Abrir pasta compartilhada/);
});
