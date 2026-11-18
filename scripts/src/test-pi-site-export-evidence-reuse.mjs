import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const runnerSource = await readFile(
  new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url),
  "utf8",
);

const functionStart = runnerSource.indexOf("async function ensureInsertionCaptureCoverage");
const functionEnd = runnerSource.indexOf("\nfunction fulfillmentPlacementKey", functionStart);
const coverageSource = runnerSource.slice(functionStart, functionEnd);

test("pi-site-export preserva evidencia final auditada antes de tentar recuperacao", () => {
  assert(functionStart >= 0 && functionEnd > functionStart, "ensureInsertionCaptureCoverage não encontrada");

  const recoveryLoopStart = coverageSource.indexOf("for (const status of secondPassStatuses)");
  const captureStart = coverageSource.indexOf("captureProofWithRetry", recoveryLoopStart);
  const reusableGuard = coverageSource.indexOf("if (isReusableAuditedEvidence(status)) continue;", recoveryLoopStart);

  assert(recoveryLoopStart >= 0 && captureStart > recoveryLoopStart, "loop de recuperação não encontrado");
  assert(
    reusableGuard > recoveryLoopStart && reusableGuard < captureStart,
    "evidência reutilizável precisa ser preservada antes de qualquer nova captura",
  );
  assert.match(
    coverageSource.slice(reusableGuard, captureStart),
    /if \(!\["missing", "invalid_audit", "invalid_url"\]\.includes\(status\?\.status\)\) continue;/,
    "recuperação automática deve operar somente sobre evidência ausente ou inválida",
  );
});

test("pi-site-export aceita evidencia reutilizavel no readback final sem exigir retroContentProof", () => {
  const finalReadbackStart = coverageSource.indexOf("const finalStatuses");
  const failureMessageStart = coverageSource.indexOf("if (failed.length)", finalReadbackStart);
  const finalReadback = coverageSource.slice(finalReadbackStart, failureMessageStart);

  assert.match(finalReadback, /finalStatuses\.filter\(\(item\) => !isReusableAuditedEvidence\(item\)\)/);
  assert.doesNotMatch(finalReadback, /retroContentProof|strictAuditApproved/);
});
