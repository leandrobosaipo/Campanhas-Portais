import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("./build-current-month-evidence-report.mjs", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const buildDir = await mkdtemp(path.join(tmpdir(), "monthly-report-live-polling-"));
const modulePath = path.join(path.dirname(sourcePath.pathname), `.test-live-render-${path.basename(buildDir)}.mjs`);
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
  id: 2278,
  modalId: "ins-2278",
  campanhaName: "CAMPANHA TESTE",
  siteSigla: "PERRENGUE",
  clienteNome: "Cliente",
  agenciaNome: "Agência",
  piCodigo: "PI 123",
  localFormato: "HOME 1",
  localFormatoNormalizado: "HOME 1",
  mediaUrl: "https://cdn.example/media.gif",
  periodoInicio: "2026-08-01",
  periodoFim: "2026-08-31",
  requiredDays: ["2026-08-27"],
  evidenceDays: [{ date: "2026-08-27", status: "missing", url: "", downloadUrl: "" }],
  auditedDays: 0,
  missingDates: ["2026-08-27"],
  invalidDates: [],
  retroactiveMissingDates: [],
  state: "pending",
  statusDetail: "Print pendente.",
};

const portal = {
  key: "PERRENGUE",
  label: "Perrengue Mato Grosso",
  logo: "",
  homeUrl: "https://perrenguematogrosso.com",
  stats: { active: 1, scheduled: 0, ended: 0, ok: 0, pending: 1, invalid: 0, not_published: 0, blocked_upstream: 0, evidences: 0 },
  campaigns: [{ name: insertion.campanhaName, pi: insertion.piCodigo, cliente: insertion.clienteNome, agencia: insertion.agenciaNome, items: [insertion] }],
};

function html() {
  return renderHtml({
    insertions: [insertion],
    portals: [portal],
    audits: {},
    summary: { total: 1, active: 1, scheduled: 0, ended: 0, ok: 0, pending: 1, invalid: 0, notPublished: 0, blockedUpstream: 0, auditedDays: 0 },
    forecast: { starting: [], ending: [] },
    sources: { driveInventory: { snapshotStatus: "fresh", itemCount: 1 } },
    dailyPrintStatus: {
      nextRunAt: "2026-08-28T22:00:00.000Z",
      lastAttempt: { jobId: "daily-job-1", targetDate: "2026-08-27", status: "running", expected: 1, approved: 0, missing: 1, invalid: 0, failedInsertionIds: [] },
    },
  });
}

test("relatório renderizado expõe progresso vivo acessível e preserva o snapshot", () => {
  const output = html();
  assert.match(output, /id="livePrintProgress"/);
  assert.match(output, /id="livePrintProgressBar"[^>]+role="progressbar"[^>]+aria-valuemin="0"[^>]+aria-valuemax="100"[^>]+aria-valuenow="0"/);
  assert.match(output, /id="livePrintSummary"[^>]+aria-live="polite"/);
  assert.match(output, /id="livePrintItems"/);
  assert.match(output, /id="livePrintUpdatedAt"/);
  assert.match(output, /data-live-insertion-id="2278" data-live-date="2026-08-27"/);
  assert.match(output, />Print pendente</);
});

test("cliente vivo usa somente GET, todos os contratos e polling finito", () => {
  const output = html();
  assert.match(output, /\/api\/ops\/daily-print-status/);
  assert.match(output, /\/api\/ops\/queue\/overview/);
  assert.match(output, /\/api\/ops\/jobs\/.*\/progress/);
  assert.match(output, /\/api\/insertions\/.*\/capture-proof\/status/);
  assert.doesNotMatch(output, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
  assert.match(output, /15_000|15000/);
  assert.match(output, /30_000|30000/);
  assert.match(output, /60_000|60000/);
  assert.match(output, /120_000|120000/);
  assert.match(output, /document\.hidden/);
  assert.match(output, /document\.addEventListener\(['"]visibilitychange['"]/);
  assert.match(output, /liveRequest\.abort\(\)/);
  assert.match(output, /Dados vivos indisponíveis/);
});
