import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("legacy candidate promotion stops before runtime, browser or credential lookup", async () => {
  process.env.DATABASE_URL = "postgresql://test_only@127.0.0.1:1/candidate_guard_test";
  const { runLocalCaptureProof } = await import("../../artifacts/api-server/src/lib/local-capture-runtime");
  await assert.rejects(
    runLocalCaptureProof(3024, { candidateOnly: true, promoteCandidate: true }),
    /candidate_promotion_requires_persisted_approval/,
  );
});

test("direct capture CLI cannot promote an unreviewed candidate", () => {
  const script = fileURLToPath(new URL("./capture-insertion-proof.cjs", import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [script,
    "--insertionId", "3024", "--candidateOnly", "true", "--saveEvidence", "true"], {
    env: { PATH: process.env.PATH }, encoding: "utf8", stdio: "pipe", timeout: 5000,
  }), (error: unknown) => {
    const failure = error as { stderr?: string; status?: number };
    assert.equal(failure.status, 1);
    assert.match(String(failure.stderr), /candidate_promotion_requires_persisted_approval/);
    return true;
  });
});
