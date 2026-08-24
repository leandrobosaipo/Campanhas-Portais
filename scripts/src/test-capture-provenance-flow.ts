import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { correlateCaptureLogProvenance } from "../../artifacts/api-server/src/lib/capture-audit.ts";

const base = {
  targetDate: "2026-08-22",
  jobId: null,
  runnerJobId: "daily-job-22",
  createdAt: new Date("2026-08-22T22:05:00.000Z"),
  uploadedUrl: "https://cdn.example.com/22.png",
  status: "pending_audit",
  metadata: { sourceJobId: "daily-job-22" },
  evidenceUrl: "https://cdn.example.com/22.png",
};

test("pending_audit só produz provenance quando job e artefato persistidos conferem", () => {
  assert.equal(correlateCaptureLogProvenance(base)?.sourceJobId, "daily-job-22");
  assert.equal(correlateCaptureLogProvenance({ ...base, evidenceUrl: "https://cdn.example.com/other.png" }), null);
  assert.equal(correlateCaptureLogProvenance({ ...base, metadata: { sourceJobId: "fictitious" } }), null);
  assert.equal(correlateCaptureLogProvenance({ ...base, status: "failed" }), null);
});

test("runner persiste provenance provisória antes de consultar auditoria e finaliza depois", async () => {
  const source = await readFile(new URL("./capture-insertion-proof.cjs", import.meta.url), "utf8");
  const provisional = source.indexOf('status: "pending_audit"');
  const audit = source.indexOf("await fetchCaptureAuditStatus", provisional);
  const final = source.indexOf('status: "ok"', audit);
  assert.ok(provisional > 0, "provisional log must exist");
  assert.ok(audit > provisional, "audit must run after provisional persistence");
  assert.ok(final > audit, "final ok log must be persisted only after audit");
});
