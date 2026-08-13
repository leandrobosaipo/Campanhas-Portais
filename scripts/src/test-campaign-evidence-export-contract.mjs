import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const buildDir = await mkdtemp(path.join(tmpdir(), "campaign-evidence-contract-"));
const outputPath = path.join(buildDir, "contract.mjs");
const build = spawnSync("pnpm", ["--filter", "@workspace/api-server", "exec", "esbuild", "src/lib/campaign-evidence-export.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${outputPath}`], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(build.status, 0, build.stderr || build.stdout);
const contract = await import(pathToFileURL(outputPath));
after(() => rm(buildDir, { recursive: true, force: true }));

test("normaliza a identidade por PI e competencia sem aceitar campanha sem PI", () => {
  assert.equal(contract.normalizeCampaignPi("PI 009750- PREF ROO"), "9750");
  assert.deepEqual(contract.parseCampaignEvidenceIdentity({ piCodigo: "PI 17.048 - GOV", competencia: "agosto/2026" }), {
    piCodigo: "17048",
    competencia: "AGOSTO/2026",
  });
  assert.deepEqual(contract.parseCampaignEvidenceIdentity({ piCodigo: "PI 009750- PREF ROO", competencia: "AGOSTO/2026" }), {
    piCodigo: "9750",
    competencia: "AGOSTO/2026",
  });
  assert.throws(() => contract.parseCampaignEvidenceIdentity({ piCodigo: "PI - TCE", competencia: "AGOSTO/2026" }), /PI canônica/);
});

test("normalização canônica trata zeros à esquerda igual em planilha, operação e lote", () => {
  for (const value of ["9750", "009750", "PI 009750- PREF ROO"]) {
    assert.equal(contract.normalizeCampaignPi(value), "9750");
  }
});

test("preserva insercoes canonicas sem omitir blockers de publicacao ou midia", () => {
  const selected = contract.selectCampaignEvidenceInsertions([
    { id: 1826, piCodigo: "17048", competencia: "AGOSTO/2026", statusNormalizado: "rascunho", bannerPublicadoNoSite: false, mediaUrl: null },
    { id: 1831, piCodigo: "PI 17048 - GOV", competencia: "AGOSTO/2026", statusNormalizado: "em veiculacao", bannerPublicadoNoSite: true, mediaUrl: "https://cdn.example/banner.jpg" },
    { id: 1900, piCodigo: "17048", competencia: "JULHO/2026", statusNormalizado: "em veiculacao", bannerPublicadoNoSite: true, mediaUrl: "https://cdn.example/old.jpg" },
    { id: 1901, piCodigo: "PI 017048- GOV", competencia: "AGOSTO/2026", statusNormalizado: "em veiculacao", bannerPublicadoNoSite: true, mediaUrl: "https://cdn.example/labelled.jpg" },
  ], { piCodigo: "17048", competencia: "AGOSTO/2026" });
  assert.deepEqual(selected.map((item) => item.id), [1826, 1831, 1901]);
});

test("bloqueia pacote parcial, invalido ou com evidencia inacessivel", () => {
  assert.deepEqual(contract.validateCampaignEvidenceReadiness([
    { insertionId: 1831, requiredDates: ["2026-08-11", "2026-08-12"], evidenceDates: ["2026-08-11"], invalidDates: [], inaccessibleDates: [] },
  ]), { ready: false, missingDates: [{ insertionId: 1831, date: "2026-08-12" }], invalidDates: [], inaccessibleDates: [], operationalBlockers: [] });
  assert.equal(contract.validateCampaignEvidenceReadiness([
    { insertionId: 1831, requiredDates: ["2026-08-12"], evidenceDates: ["2026-08-12"], invalidDates: [], inaccessibleDates: [] },
  ]).ready, true);
});

test("chave idempotente e estavel para evidencias aprovadas em varios portais", () => {
  const left = contract.buildCampaignEvidenceExportIdempotencyKey({
    piCodigo: "17048",
    competencia: "AGOSTO/2026",
    imageMaxWidth: 1600,
    imageQuality: 72,
    evidences: [
      { insertionId: 2, evidenceId: 20, portal: "OMT", date: "2026-08-12" },
      { insertionId: 1, evidenceId: 10, portal: "PPMT", date: "2026-08-11" },
    ],
  });
  const right = contract.buildCampaignEvidenceExportIdempotencyKey({
    piCodigo: "PI 17048",
    competencia: "agosto/2026",
    imageMaxWidth: 1600,
    imageQuality: 72,
    evidences: [
      { insertionId: 1, evidenceId: 10, portal: "ppmt", date: "2026-08-11" },
      { insertionId: 2, evidenceId: 20, portal: "omt", date: "2026-08-12" },
    ],
  });
  assert.equal(left, right);
  assert.match(left, /^campaign-evidence-v1-[a-f0-9]{64}$/);
  assert.notEqual(left, contract.buildCampaignEvidenceExportIdempotencyKey({
    piCodigo: "17048",
    competencia: "AGOSTO/2026",
    imageMaxWidth: 1200,
    imageQuality: 60,
    evidences: [
      { insertionId: 1, evidenceId: 10, portal: "PPMT", date: "2026-08-11" },
      { insertionId: 2, evidenceId: 20, portal: "OMT", date: "2026-08-12" },
    ],
  }));
});

test("fila compacta inclui somente operacoes com acao pendente", () => {
  const result = contract.buildPendingPublicationView({
    date: "2026-08-12",
    generatedAt: "2026-08-12T15:36:28.201Z",
    summary: { needsPublication: 1, needsEvidence: 1 },
    items: [
      { campaignName: "RADAR", piCodigo: "PI - TCE", requiredActions: ["publish_on_site", "generate_evidence"], blockingIssues: ["PI ausente"], adops: { insertionId: 1944 } },
      { campaignName: "FAKE NEWS", piCodigo: "17161", requiredActions: [], blockingIssues: [], adops: { insertionId: 1861 } },
    ],
    upcomingItems: [],
  });
  assert.deepEqual(result.summary, { pending: 1, needsPublication: 1, needsEvidence: 1 });
  assert.deepEqual(result.items.map((item) => item.adops.insertionId), [1944]);
});

test("lote de campanhas normaliza identidade e remove duplicatas", () => {
  assert.deepEqual(contract.parseCampaignEvidenceBatch({
    competencia: "agosto/2026",
    campaigns: [{ piCodigo: "PI 17048" }, { piCodigo: "17048" }, { piCodigo: "17190" }],
    imageMaxWidth: 1600,
    imageQuality: 72,
  }), {
    competencia: "AGOSTO/2026",
    campaigns: [{ piCodigo: "17048" }, { piCodigo: "17190" }],
    mode: "prints-only",
    variant: "web",
    imageMaxWidth: 1600,
    imageQuality: 72,
  });
});

test("fonte mensal remove payload pesado do Drive e preserva evidencias por data", () => {
  const source = contract.buildMonthlyEvidenceSource({
    version: "campaign-operations-v1",
    date: "2026-08-12",
    generatedAt: "2026-08-12T15:36:28.201Z",
    sheet: { name: "AGOSTO 2026", activeRows: 1 },
    summary: { activeInSheet: 1 },
    items: [{
      campaignName: "RADAR",
      piCodigo: "PI - TCE",
      siteSigla: "PERRENGUE",
      period: { start: "2026-08-12", end: "2026-08-25" },
      format: { normalized: "HOME 1" },
      adops: { insertionId: 1944 },
      evidence: { days: [{ date: "2026-08-12", status: "missing", evidenceId: null, url: null, auditHash: null, blockingIssues: [] }] },
      drive: { status: "matched", folderId: "folder", folderPath: "/PERRENGUE/RADAR", mediaFiles: [{ id: "large" }] },
      requiredActions: ["generate_evidence"],
      blockingIssues: [],
    }],
    upcomingItems: [],
  });
  assert.equal(source.items[0].drive.folderId, "folder");
  assert.equal("mediaFiles" in source.items[0].drive, false);
  assert.deepEqual(source.items[0].evidence.days.map((day) => day.status), ["missing"]);
});
