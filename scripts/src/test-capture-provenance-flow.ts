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

test("pre-upload não cria provenance confiável a partir do próprio request", async () => {
  const source = await readFile(new URL("../../artifacts/api-server/src/routes/audit-checklists.ts", import.meta.url), "utf8");
  const preUpload = source.slice(source.indexOf('req.body?.phase === "pre_upload"'), source.indexOf("const validation =", source.indexOf('req.body?.phase === "pre_upload"')));
  assert.doesNotMatch(preUpload, /attachServerCaptureProvenance/);
  assert.match(preUpload, /delete item\[key\]/);
  assert.match(preUpload, /"reconstruction"/);
});

test("reconciliação exige batch diário concluído e não troca URL de evidência", async () => {
  const worker = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
  const route = worker.slice(worker.indexOf("if (publicScheduledReconcileRoute)"), worker.indexOf("return notFound();", worker.indexOf("if (publicScheduledReconcileRoute)")));
  assert.match(route, /sourceJob\.status !== "completed"/);
  assert.match(route, /sourcePayload\.source !== "cloudflare-cron-daily-print"/);
  assert.match(route, /sourcePayload\.date !== targetDate/);
  assert.match(route, /capturedInsertionIds/);

  const api = await readFile(new URL("../../artifacts/api-server/src/routes/insertions.ts", import.meta.url), "utf8");
  const reconcile = api.slice(api.indexOf('router.post("/insertions/capture-proof/reconcile-scheduled"'), api.indexOf('router.get("/insertions/capture-proof/audit"'));
  assert.doesNotMatch(reconcile, /update\(evidencesTable\)/);
  assert.match(reconcile, /unchanged: true/);
  assert.match(reconcile, /metadata: previousMetadata/);
  assert.match(reconcile, /adopsInternalAuth !== true/);
  assert.match(reconcile, /catch \(error\)/);
});

test("pre-upload é gate preliminar e auditoria final preserva prova temporal", async () => {
  const checklist = await readFile(new URL("../../artifacts/api-server/src/lib/audit-checklist.ts", import.meta.url), "utf8");
  assert.match(checklist, /input\.phase === "pre_upload"/);
  assert.match(checklist, /metadata_retro_content_unverified/);
  const route = await readFile(new URL("../../artifacts/api-server/src/routes/audit-checklists.ts", import.meta.url), "utf8");
  assert.match(route, /preliminary: req\.body\?\.phase === "pre_upload"/);
});
