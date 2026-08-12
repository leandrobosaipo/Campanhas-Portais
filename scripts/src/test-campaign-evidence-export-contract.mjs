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
  assert.deepEqual(contract.parseCampaignEvidenceIdentity({ piCodigo: "PI 17.048 - GOV", competencia: "agosto/2026" }), {
    piCodigo: "17048",
    competencia: "AGOSTO/2026",
  });
  assert.throws(() => contract.parseCampaignEvidenceIdentity({ piCodigo: "PI - TCE", competencia: "AGOSTO/2026" }), /PI canônica/);
});

test("seleciona apenas insercoes publicadas da PI e competencia canonicas", () => {
  const selected = contract.selectCampaignEvidenceInsertions([
    { id: 1826, piCodigo: "17048", competencia: "AGOSTO/2026", statusNormalizado: "rascunho", bannerPublicadoNoSite: false, mediaUrl: null },
    { id: 1831, piCodigo: "PI 17048 - GOV", competencia: "AGOSTO/2026", statusNormalizado: "em veiculacao", bannerPublicadoNoSite: true, mediaUrl: "https://cdn.example/banner.jpg" },
    { id: 1900, piCodigo: "17048", competencia: "JULHO/2026", statusNormalizado: "em veiculacao", bannerPublicadoNoSite: true, mediaUrl: "https://cdn.example/old.jpg" },
  ], { piCodigo: "17048", competencia: "AGOSTO/2026" });
  assert.deepEqual(selected.map((item) => item.id), [1831]);
});

test("bloqueia pacote parcial, invalido ou com evidencia inacessivel", () => {
  assert.deepEqual(contract.validateCampaignEvidenceReadiness([
    { insertionId: 1831, requiredDates: ["2026-08-11", "2026-08-12"], evidenceDates: ["2026-08-11"], invalidDates: [], inaccessibleDates: [] },
  ]), { ready: false, missingDates: [{ insertionId: 1831, date: "2026-08-12" }], invalidDates: [], inaccessibleDates: [] });
  assert.equal(contract.validateCampaignEvidenceReadiness([
    { insertionId: 1831, requiredDates: ["2026-08-12"], evidenceDates: ["2026-08-12"], invalidDates: [], inaccessibleDates: [] },
  ]).ready, true);
});

test("chave idempotente e estavel para evidencias aprovadas em varios portais", () => {
  const left = contract.buildCampaignEvidenceExportIdempotencyKey({
    piCodigo: "17048",
    competencia: "AGOSTO/2026",
    evidences: [
      { insertionId: 2, evidenceId: 20, portal: "OMT", date: "2026-08-12" },
      { insertionId: 1, evidenceId: 10, portal: "PPMT", date: "2026-08-11" },
    ],
  });
  const right = contract.buildCampaignEvidenceExportIdempotencyKey({
    piCodigo: "PI 17048",
    competencia: "agosto/2026",
    evidences: [
      { insertionId: 1, evidenceId: 10, portal: "ppmt", date: "2026-08-11" },
      { insertionId: 2, evidenceId: 20, portal: "omt", date: "2026-08-12" },
    ],
  });
  assert.equal(left, right);
  assert.match(left, /^campaign-evidence-v1-[a-f0-9]{64}$/);
});
