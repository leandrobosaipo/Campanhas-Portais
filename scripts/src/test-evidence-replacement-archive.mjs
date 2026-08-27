import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildEvidenceReplacementArchivePlan } = require("./capture-insertion-proof.cjs");

test("arquiva a chave anterior antes de uma substituicao no mesmo bucket", () => {
  const plan = buildEvidenceReplacementArchivePlan({
    evidenceUrl: "https://perrenguematogrosso.nyc3.digitaloceanspaces.com/app/uploads/AGOSTO-2026/970/1827/prova.png?v=1786500684271",
    bucket: "perrenguematogrosso",
    competencia: "AGOSTO/2026",
    campaignId: 970,
    insertionId: 1827,
    targetDate: "2026-08-01",
  });

  assert.equal(plan.sourceKey, "app/uploads/AGOSTO-2026/970/1827/prova.png");
  assert.equal(plan.archiveKey, "adops-evidence-originals/AGOSTO-2026/970/1827/2026-08-01/1786500684271-prova.png");
});

test("recusa URL que nao pertence ao bucket da captura", () => {
  assert.equal(buildEvidenceReplacementArchivePlan({
    evidenceUrl: "https://outro.nyc3.digitaloceanspaces.com/app/uploads/prova.png",
    bucket: "perrenguematogrosso",
    competencia: "AGOSTO/2026",
    campaignId: 970,
    insertionId: 1827,
    targetDate: "2026-08-01",
  }), null);
});
