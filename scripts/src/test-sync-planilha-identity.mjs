import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("./sync-planilha-latest.ts", import.meta.url), "utf8");
const reconcileSource = await readFile(new URL("./reconcile-planilha-adrotate.ts", import.meta.url), "utf8");

test("sincronizacao compara PI pela identidade normalizada", () => {
  assert.match(syncSource, /normalizeCampaignPiIdentity\(item\.piCodigo\)/);
  assert.doesNotMatch(syncSource, /\(item\.piCodigo \?\? ""\) === normalizedPiCode/);
});

test("duplicata interrompe antes de criar ou atualizar cadastros", () => {
  const duplicateGate = syncSource.indexOf("if (canonicalInsertionCandidates.length > 1)");
  const continueAfterGate = syncSource.indexOf("continue;", duplicateGate);
  const firstEnsure = syncSource.indexOf("const siteId = await ensureSite(row.siteSigla);");

  assert.ok(duplicateGate >= 0, "o gate de duplicidade deve existir");
  assert.ok(continueAfterGate > duplicateGate, "o gate de duplicidade deve interromper a linha");
  assert.ok(firstEnsure > continueAfterGate, "nenhum ensure mutável pode executar antes do gate");
});

test("reconciliacao usa a mesma identidade canonica", () => {
  assert.match(reconcileSource, /normalizeCampaignPiIdentity/);
  assert.match(reconcileSource, /buildCampaignInsertionIdentity/);
});
