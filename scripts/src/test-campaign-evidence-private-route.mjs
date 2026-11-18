import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

test("materializador completo exige token e jobs publicos usam a fila PostgreSQL", async () => {
  const [app, routes, evidences, runner] = await Promise.all([
    readFile(path.join(repoRoot, "artifacts/api-server/src/app.ts"), "utf8"),
    readFile(path.join(repoRoot, "artifacts/api-server/src/routes/insertions.ts"), "utf8"),
    readFile(path.join(repoRoot, "artifacts/api-server/src/routes/evidences.ts"), "utf8"),
    readFile(path.join(repoRoot, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8"),
  ]);
  assert.match(routes, /router\.get\("\/internal\/campaign-evidence-exports"/);
  assert.match(routes, /router\.post\("\/internal\/campaign-evidence-exports"/);
  assert.match(routes, /O download exige descritor imutável assinado/);
  assert.doesNotMatch(routes, /req\.query\.evidenceIds/);
  assert.match(evidences, /router\.post\("\/campaign-evidence-exports\/jobs"/);
  assert.match(evidences, /cod5_criarJobOperacional/);
  assert.doesNotMatch(evidences, /proxyCampaignEvidenceWorkerRequest|workers\.dev/);
  assert.match(app, /req\.path\.startsWith\("\/internal\/"\)/);
  assert.match(app, /publicAsyncCampaignExportPost/);
  assert.match(app, /internal_api_token_not_configured/);
  assert.match(evidences, /as_of_date_requires_authenticated_batch/);
  assert.match(evidences, /cod5_criarJobExportacaoEvidencias\(\{ \.\.\.body, piCodigo, competencia \}, "", true\)/);
  assert.match(routes, /getActiveCampaignOperations\(\{ date: asOfDate, includeEvidence, sheetScope: "monthly" \}\)/);
  assert.match(routes, /listCampaignEvidenceInsertions\(identity\.piCodigo, identity\.competencia, false, asOfDate\)/);
  const campaignExportBody = runner.slice(runner.indexOf("async function executeCampaignEvidenceExport"), runner.indexOf("async function handleJob"));
  assert.match(campaignExportBody, /\{ evidenceFingerprint, evidenceFingerprintSignature \}/);
  assert.match(campaignExportBody, /evidenceFingerprintSignature/);
  assert.match(campaignExportBody, /params\.set\("asOfDate", asOfDate\)/);
  assert.doesNotMatch(campaignExportBody, /evidenceIds:/);
  assert.doesNotMatch(campaignExportBody, /ensureInsertionCaptureCoverage/);
});
