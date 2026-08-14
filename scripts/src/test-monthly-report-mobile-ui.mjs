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
  });
}

test("mantém somente uma barra móvel compacta e abre filtros em dialog acessível", () => {
  const output = html();
  assert.match(output, /id="filterToggle"[^>]+aria-controls="filterPanel"[^>]+aria-expanded="false"/);
  assert.match(output, /<dialog[^>]+id="filterPanel"/);
  assert.match(output, /\.mobile-toolbar\s*\{[^}]*position:\s*sticky[^}]*min-height:\s*56px/s);
  assert.doesNotMatch(output, /header\s*\{[^}]*position:\s*sticky/s);
});

test("preserva filtros na URL e anuncia a quantidade de resultados", () => {
  const output = html();
  assert.match(output, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(output, /history\.replaceState/);
  assert.match(output, /id="resultCount"[^>]+aria-live="polite"/);
  assert.match(output, /id="clearFilters"/);
});

test("visualizador móvel navega por data sem IDs duplicados", () => {
  const output = html();
  const ids = [...output.matchAll(/(?:^|\s)id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, "todos os IDs do documento devem ser únicos");
  assert.match(output, /id="modalPrevious"/);
  assert.match(output, /id="modalNext"/);
  assert.match(output, /id="modalDate"/);
  assert.match(output, /@media \(max-width:\s*760px\)[\s\S]*#modal\s*\{[^}]*height:\s*100dvh/s);
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
