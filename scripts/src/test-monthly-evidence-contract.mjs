import assert from "node:assert/strict";
import test from "node:test";
import * as contract from "./monthly-evidence-contract.mjs";

test("seleciona somente insercoes canonicas retornadas por campaign-operations", () => {
  const active = [{ id: 1827 }, { id: 1831 }];
  const month = [{ id: 1826 }, { id: 1827 }, { id: 1831 }, { id: 1900 }];

  assert.deepEqual(contract.selectCanonicalInsertions(active, month).map((item) => item.id), [1827, 1831]);
});

test("trata competencia numerica e por extenso como o mesmo mes", () => {
  assert.equal(contract.competenciaMatchesMonth("08/2026", "AGOSTO/2026", "2026-08"), true);
  assert.equal(contract.competenciaMatchesMonth("AGOSTO 2026", "AGOSTO/2026", "2026-08"), true);
  assert.equal(contract.competenciaMatchesMonth("07/2026", "AGOSTO/2026", "2026-08"), false);
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

test("gera opcoes unicas de portal e combina portal com busca e estado", () => {
  const portals = contract.buildPortalFilterOptions([
    { key: "PPMT", label: "Portal Primeira Página" },
    { key: "OMT", label: "O Mato-grossense" },
    { key: "PPMT", label: "Portal Primeira Página" },
  ]);

  assert.deepEqual(portals, [
    { value: "ALL", label: "Todos os portais" },
    { value: "OMT", label: "O Mato-grossense" },
    { value: "PPMT", label: "Portal Primeira Página" },
  ]);
  assert.equal(contract.campaignMatchesFilters({ portal: "PPMT", search: "CRIME AMBIENTAL 17048", states: "active ok" }, { portal: "PPMT", search: "17048", state: "ok" }), true);
  assert.equal(contract.campaignMatchesFilters({ portal: "PPMT", search: "CRIME AMBIENTAL 17048", states: "active ok" }, { portal: "OMT", search: "17048", state: "ok" }), false);
  assert.equal(contract.campaignMatchesFilters({ portal: "PPMT", search: "CRIME AMBIENTAL 17048", states: "active ok" }, { portal: "ALL", search: "DENGUE", state: "all" }), false);
});

test("combina publicação e retroativos sem perder portal ou busca", () => {
  const campaign = {
    portal: "PERRENGUE",
    search: "CRIME AMBIENTAL PI 17046 GOV",
    states: "active not_published",
    publicationStates: "not_published",
    evidenceStates: "retroactive_missing",
  };

  assert.equal(contract.campaignMatchesFilters(campaign, {
    portal: "PERRENGUE",
    search: "17046",
    publication: "not_published",
    evidence: "retroactive_missing",
  }), true);
  assert.equal(contract.campaignMatchesFilters(campaign, {
    portal: "PERRENGUE",
    search: "17046",
    publication: "active",
    evidence: "retroactive_missing",
  }), false);
  assert.equal(contract.campaignMatchesFilters(campaign, {
    portal: "PERRENGUE",
    search: "17046",
    publication: "not_published",
    evidence: "complete",
  }), false);
});

test("classifica evidência completa sem depender do estado de publicação", () => {
  const metadata = contract.buildCampaignFilterMetadata({
    items: [{
      state: "not_published",
      bannerPublicadoNoSite: false,
      requiredDays: ["2026-08-01", "2026-08-02"],
      auditedDays: 2,
      missingDates: [],
      invalidDates: [],
    }],
  }, "2026-08-14");
  assert.match(metadata.publicationStates, /\bnot_published\b/);
  assert.match(metadata.evidenceStates, /\bcomplete\b/);
});

test("distingue qualquer print pendente de retroativo pendente", () => {
  const currentMissing = contract.buildCampaignFilterMetadata({
    items: [{ requiredDays: ["2026-08-17"], auditedDays: 0, missingDates: ["2026-08-17"], invalidDates: [] }],
  }, "2026-08-17");
  assert.match(currentMissing.evidenceStates, /\bmissing\b/);
  assert.doesNotMatch(currentMissing.evidenceStates, /\bretroactive_missing\b/);

  const retroactiveMissing = contract.buildCampaignFilterMetadata({
    items: [{ requiredDays: ["2026-08-16"], auditedDays: 0, missingDates: ["2026-08-16"], invalidDates: [] }],
  }, "2026-08-17");
  assert.match(retroactiveMissing.evidenceStates, /\bmissing\b/);
  assert.match(retroactiveMissing.evidenceStates, /\bretroactive_missing\b/);
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
  assert.match(left, /^monthly-evidence-v2-[a-f0-9]{64}$/);
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

test("consultas agregadas toleram a latencia observada da API sem remover timeout", () => {
  assert.equal(contract.MONTHLY_REPORT_SOURCE_TIMEOUT_MS, 120_000);
});

test("evidencia agregada preserva aprovacao, alcance e datas canonicas", () => {
  const adapted = contract.adaptAggregatedEvidenceDay({
    date: "2026-08-12",
    status: "audited",
    evidenceId: 77,
    url: "https://cdn.example/evidence.png",
    auditHash: "abc",
    blockingIssues: [],
  });
  assert.equal(contract.classifyEvidenceStatus(adapted), "audited");
  assert.equal(adapted.checklistValidation.approved, true);
  assert.equal(adapted.isReachable, true);
  assert.deepEqual(contract.canonicalRequiredDates({ evidence: { requiredDates: ["2026-08-12", "2026-08-14"] } }), ["2026-08-12", "2026-08-14"]);
  assert.deepEqual(contract.canonicalRequiredDates({ evidenceDays: [{ date: "2026-08-12" }, { date: "2026-08-14" }] }), ["2026-08-12", "2026-08-14"]);
});

test("relatório incremental mostra prova aprovada do dia sem cobrar as demais antes do fechamento", () => {
  const statusByDate = new Map([
    ["2026-08-21", contract.adaptAggregatedEvidenceDay({ status: "audited", url: "https://cdn.example/proof.png" })],
    ["2026-08-22", { status: "missing" }],
  ]);
  assert.deepEqual(contract.selectReportEvidenceDates(
    ["2026-08-20", "2026-08-21", "2026-08-22"],
    { evidenceCutoffDate: "2026-08-20", targetDate: "2026-08-21", statusByDate },
  ), ["2026-08-20", "2026-08-21"]);
});

test("download e validado por leitura parcial real", () => {
  assert.deepEqual(contract.buildDeliveryProbeOptions(), {
    method: "GET",
    headers: { range: "bytes=0-1023" },
    redirect: "follow",
  });
});

test("ZIP usa a mesma API publica que possui o job de exportacao", () => {
  assert.equal(
    contract.buildPiSiteExportDownloadUrl("https://worker.example/api/", "job id"),
    "https://worker.example/api/pi-site-exports/jobs/job%20id/download",
  );
});

test("download completo usa o job agregado por campanha", () => {
  assert.equal(
    contract.buildCampaignEvidenceExportDownloadUrl("https://worker.example/api/", "campaign job"),
    "https://worker.example/api/campaign-evidence-exports/jobs/campaign%20job/download",
  );
});

test("relatório não solicita ZIP comercial quando a PI ainda não é canônica", () => {
  assert.equal(contract.canonicalCommercialPi("PI - TCE"), null);
  assert.equal(contract.canonicalCommercialPi(""), null);
  assert.equal(contract.canonicalCommercialPi("PI 017190"), "17190");
  assert.equal(contract.canonicalCommercialPi("PI 88998- PREF PVA"), "88998");
  assert.equal(contract.canonicalCommercialPi("RADAR 17190"), null);
});

test("validador ZIP nao depende do binario unzip", () => {
  assert.match(contract.EVIDENCE_ZIP_VALIDATION_PYTHON, /zipfile\.ZipFile/);
  assert.match(contract.EVIDENCE_ZIP_VALIDATION_PYTHON, /SHA256SUMS\.txt/);
});

test("readback repete apenas falha transitoria", () => {
  assert.equal(contract.shouldRetryDeliveryStatus(500), true);
  assert.equal(contract.shouldRetryDeliveryStatus(429), true);
  assert.equal(contract.shouldRetryDeliveryStatus(404), false);
});

test("readback amostra tres downloads por contrato", () => {
  assert.deepEqual(contract.takeDeliverySamples([1, 2, 3, 4]), [1, 2, 3]);
});

test("publicacao Portainer tolera a latencia observada sem remover timeout", () => {
  assert.equal(contract.MONTHLY_REPORT_PORTAINER_TIMEOUT_MS, 60_000);
  assert.equal(contract.MONTHLY_REPORT_EXPORT_CREATE_TIMEOUT_MS, 180_000);
  assert.equal(contract.MONTHLY_REPORT_CAMPAIGN_BATCH_TIMEOUT_MS, 360_000);
});

test("publicacao pode usar rota interna do Portainer", () => {
  assert.equal(contract.resolveReportPortainerUrl({ ADOPS_REPORT_PORTAINER_URL: "http://portainer:9000", PORTAINER_URL: "https://public.example" }), "http://portainer:9000");
});

test("publicacao prefere bind dedicado de relatorios", () => {
  assert.equal(contract.resolveReportsPublishMount({ ADOPS_REPORTS_PUBLISH_MOUNT: "/sites-reports" }), "/sites-reports");
  assert.equal(contract.resolveReportsPublishMount({}), "");
});

test("catalogo HTML e JSON podem ser validados sem parse incorreto", () => {
  assert.equal(contract.isJsonContentType("application/json; charset=utf-8"), true);
  assert.equal(contract.isJsonContentType("text/html; charset=utf-8"), false);
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

test("não cobra o dia corrente antes ou durante a rotina das 18h", () => {
  assert.deepEqual(contract.resolveEvidenceWindow({ reportDate: "2026-08-20", now: new Date("2026-08-20T18:30:00Z"), dailyPrintStatus: null }), {
    evidenceCutoffDate: "2026-08-19", phase: "awaiting_capture",
  });
  assert.deepEqual(contract.resolveEvidenceWindow({ reportDate: "2026-08-20", now: new Date("2026-08-20T23:00:00Z"), dailyPrintStatus: { lastAttempt: { targetDate: "2026-08-20", status: "running" } } }), {
    evidenceCutoffDate: "2026-08-19", phase: "processing",
  });
});

test("cobra o dia após término canônico ou fechamento da janela", () => {
  assert.deepEqual(contract.resolveEvidenceWindow({ reportDate: "2026-08-20", now: new Date("2026-08-20T23:15:00Z"), dailyPrintStatus: { lastAttempt: { targetDate: "2026-08-20", status: "completed" } } }), {
    evidenceCutoffDate: "2026-08-20", phase: "completed",
  });
  assert.deepEqual(contract.resolveEvidenceWindow({ reportDate: "2026-08-20", now: new Date("2026-08-21T02:30:00Z"), dailyPrintStatus: null }), {
    evidenceCutoffDate: "2026-08-20", phase: "routine_overdue",
  });
});
