import assert from "node:assert/strict";
import test from "node:test";
import * as contract from "./monthly-evidence-contract.mjs";

test("seleciona somente insercoes canonicas retornadas por campaign-operations", () => {
  const active = [{ id: 1827 }, { id: 1831 }];
  const month = [{ id: 1826 }, { id: 1827 }, { id: 1831 }, { id: 1900 }];

  assert.deepEqual(contract.selectCanonicalInsertions(active, month).map((item) => item.id), [1827, 1831]);
});

test("classifica audited, missing e invalid sem aceitar HTTP 200 isolado", () => {
  assert.equal(contract.classifyEvidenceStatus({ status: "ok", isReachable: true, checklistValidation: { approved: true } }), "audited");
  assert.equal(contract.classifyEvidenceStatus({ status: "ok_best_effort", isReachable: true, checklistValidation: { approved: true } }), "audited_best_effort");
  assert.equal(contract.classifyEvidenceStatus({ status: "missing" }), "missing");
  assert.equal(contract.classifyEvidenceStatus({ status: "ok", isReachable: true, checklistValidation: { approved: false } }), "invalid");
  assert.equal(contract.classifyEvidenceStatus({ status: "invalid_url", isReachable: false }), "invalid");
  assert.equal(contract.classifyEvidenceStatus({ status: "audited", isReachable: false, arquivoUrl: "https://example.com/prova.png", checklistValidation: { approved: true } }), "invalid");
});

test("calcula entradas e vencimentos nos sete dias seguintes", () => {
  const items = [
    { id: 1, periodoInicio: "2026-08-12", periodoFim: "2026-08-20" },
    { id: 2, periodoInicio: "2026-08-18", periodoFim: "2026-08-13" },
    { id: 3, periodoInicio: "2026-08-19", periodoFim: "2026-08-19" },
  ];
  const forecast = contract.buildSevenDayForecast(items, "2026-08-11");

  assert.deepEqual(forecast.starting.map((item) => item.id), [1, 2]);
  assert.deepEqual(forecast.ending.map((item) => item.id), [2]);
  assert.equal(forecast.windowEnd, "2026-08-18");
});

test("gera report.json nao listado e chave estavel baseada nas evidencias aprovadas", () => {
  const report = contract.buildMonthlyReportManifest({
    slug: "adops-evidencias-agosto-2026",
    title: "Evidências AdOps · AGOSTO/2026",
    generatedAt: "2026-08-11T22:15:00.000Z",
  });
  assert.equal(report.visibility, "unlisted");
  assert.equal(report.publication.preset, "corporate-base");

  const left = contract.buildCampaignExportIdempotencyKey({
    piCodigo: "17048",
    siteSigla: "PPMT",
    competencia: "AGOSTO/2026",
    evidences: [{ id: 3, date: "2026-08-11" }, { id: 2, date: "2026-08-10" }],
  });
  const right = contract.buildCampaignExportIdempotencyKey({
    piCodigo: "17048",
    siteSigla: "ppmt",
    competencia: "AGOSTO/2026",
    evidences: [{ id: 2, date: "2026-08-10" }, { id: 3, date: "2026-08-11" }],
  });
  assert.equal(left, right);
  assert.match(left, /^monthly-evidence-[a-f0-9]{64}$/);
});

test("bloqueia publicacao com pendencias e monta troca atomica com rollback", () => {
  assert.equal(contract.isMonthlyReportPublishable({ missing: 0, invalid: 0 }), true);
  assert.equal(contract.isMonthlyReportPublishable({ missing: 1, invalid: 0 }), false);
  assert.equal(contract.isMonthlyReportPublishable({ missing: 0, invalid: 1 }), false);

  const command = contract.buildAtomicPublishCommand({
    slug: "adops-evidencias-agosto-2026",
    stagingName: "adops-evidencias-agosto-2026.staging-123",
    backupName: "adops-evidencias-agosto-2026.backup-123",
  });
  assert.match(command, /mv -- 'adops-evidencias-agosto-2026' 'adops-evidencias-agosto-2026\.backup-123'/);
  assert.match(command, /mv -- 'adops-evidencias-agosto-2026\.staging-123' 'adops-evidencias-agosto-2026'/);
  assert.doesNotMatch(command, /rm -rf/);
});

test("gate ignora evidencias de insercoes ainda nao publicadas", () => {
  const summary = contract.buildMonthlyPublicationGate([
    { id: 1, bannerPublicadoNoSite: true, missingDates: [], invalidDates: [] },
    { id: 2, bannerPublicadoNoSite: false, missingDates: ["2026-08-12"], invalidDates: [] },
    { id: 3, bannerPublicadoNoSite: true, missingDates: [], invalidDates: ["2026-08-11"] },
  ]);

  assert.deepEqual(summary, { missing: 0, invalid: 1 });
  assert.equal(contract.isMonthlyReportPublishable(summary), false);
});

test("publica no bind real de /app/reports e nao em subpasta presumida de /app", () => {
  const source = contract.findReportsMountSource([
    { Type: "bind", Source: "/srv/sites-index/app", Destination: "/app" },
    { Type: "bind", Source: "/srv/balboa/reports", Destination: "/app/reports" },
  ]);

  assert.equal(source, "/srv/balboa/reports");
  assert.throws(
    () => contract.findReportsMountSource([{ Type: "bind", Source: "/srv/sites-index/app", Destination: "/app" }]),
    /\/app\/reports/,
  );
});

test("distingue falha de auditoria de falha tecnica do runner", () => {
  assert.equal(contract.isAuditFailureJob({ status: "failed", error: "capture_audit_failed: status=invalid_audit" }), true);
  assert.equal(contract.isAuditFailureJob({ status: "failed", error: "callback_fetch_failed" }), false);
  assert.equal(contract.isAuditFailureJob({ status: "completed", error: null }), false);
});
