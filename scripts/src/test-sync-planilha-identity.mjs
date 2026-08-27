import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("./sync-planilha-latest.ts", import.meta.url), "utf8");
const reconcileSource = await readFile(new URL("./reconcile-planilha-adrotate.ts", import.meta.url), "utf8");

test("sincronizacao compara PI pela identidade normalizada", () => {
  assert.match(syncSource, /normalizeCampaignPiIdentity\(item\.piCodigo\)/);
  assert.doesNotMatch(syncSource, /\(item\.piCodigo \?\? ""\) === normalizedPiCode/);
});

test("reconciliacao usa a mesma identidade canonica", () => {
  assert.match(reconcileSource, /normalizeCampaignPiIdentity/);
  assert.match(reconcileSource, /buildCampaignInsertionIdentity/);
});
