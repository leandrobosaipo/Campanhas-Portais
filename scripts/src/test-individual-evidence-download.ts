import assert from "node:assert/strict";
import test from "node:test";
import * as evidenceExport from "../../artifacts/api-server/src/lib/evidence-export";

test("fixa a variante web do download individual nos limites do portal", () => {
  assert.deepEqual(evidenceExport.parseIndividualEvidenceDownloadOptions({
    variant: "web", imageMaxWidth: "1600", imageQuality: "72",
  }), { variant: "web", imageMaxWidth: 1600, imageQuality: 72 });
  assert.throws(() => evidenceExport.parseIndividualEvidenceDownloadOptions({ variant: "original" }), /variant=web/);
});

test("nome do JPEG contem portal PI formato e data", () => {
  assert.equal(evidenceExport.buildIndividualEvidenceDownloadName({
    siteSigla: "PPMT", piCodigo: "PI 17048", localFormatoNormalizado: "HOME 1",
  }, "2026-08-11"), "PPMT-PI-17048-HOME-1-2026-08-11.jpg");
});

test("download individual exige evidencia aprovada e acessivel", () => {
  assert.equal(evidenceExport.isApprovedEvidenceDownload({ status: "ok", isReachable: true, checklistValidation: { approved: true } }), true);
  assert.equal(evidenceExport.isApprovedEvidenceDownload({ status: "ok", isReachable: true, checklistValidation: { approved: false } }), false);
  assert.equal(evidenceExport.isApprovedEvidenceDownload({ status: "invalid_url", isReachable: false, checklistValidation: { approved: true } }), false);
});

test("pacote usa somente linhas canonicas com auditoria aprovada", () => {
  const rows = [
    { id: 1, titulo: "Print 2026-08-10", criadoEm: "2026-08-10T20:00:00Z" },
    { id: 2, titulo: "Print 2026-08-10", criadoEm: "2026-08-10T21:00:00Z" },
    { id: 3, titulo: "Print 2026-08-11", criadoEm: "2026-08-11T20:00:00Z" },
  ];
  const approved = evidenceExport.selectApprovedCanonicalEvidenceRows(
    rows,
    (row) => row.titulo.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null,
    new Map([
      ["2026-08-10", { status: "ok", isReachable: true, checklistValidation: { approved: true } }],
      ["2026-08-11", { status: "invalid_audit", isReachable: true, checklistValidation: { approved: false } }],
    ]),
  );
  assert.deepEqual(approved.map((row) => row.id), [2]);
});
