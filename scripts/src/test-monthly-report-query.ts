import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonthlyReportQuery,
  classifyMonthlyInsertion,
  currentMonthInTimeZone,
  monthBounds,
  normalizeMonthlyReportMonth,
  pageMonthlyInsertions,
  publicMonthlyInsertion,
  selectCanonicalMonthlyInsertions,
  excludeSupersededMonthlyInsertions,
  monthlyReportInsertionMatches,
  monthlyEvidenceProvenance,
  resolveMonthlyRequestedCaptureAt,
  selectMonthlyEvidenceProof,
} from "../../artifacts/api-server/src/lib/monthly-evidence-report-query.ts";
import { resolvePromotedCaptureProofMetadata } from "../../artifacts/api-server/src/lib/promoted-capture-proof-metadata.mjs";

test("retorna requestedCaptureAt original só de proof correlacionado, trusted e auditado", () => {
  const requestedCaptureAt = "2026-10-01T09:41:00-04:00";
  const metadata = { requestedCaptureAt };
  const trusted = { correlated: true, trustedCapture: true, technicalStatus: "audited", technicalAccepted: true } as const;
  assert.equal(resolveMonthlyRequestedCaptureAt(metadata, trusted), requestedCaptureAt);
  assert.equal(resolveMonthlyRequestedCaptureAt({ requestedCaptureAt: "2026-10-01T20:30" }, trusted), "2026-10-01T20:30");
  assert.equal(resolveMonthlyRequestedCaptureAt(metadata, { ...trusted, correlated: false }), null);
  assert.equal(resolveMonthlyRequestedCaptureAt(metadata, { ...trusted, trustedCapture: false }), null);
  assert.equal(resolveMonthlyRequestedCaptureAt(metadata, { ...trusted, technicalAccepted: false }), null);
  assert.equal(resolveMonthlyRequestedCaptureAt(metadata, { ...trusted, technicalStatus: "audited_best_effort" }), null);
  assert.equal(resolveMonthlyRequestedCaptureAt({ requestedCaptureAt: "2026-02-30T09:41:00Z" }, trusted), null);
});

function promotedProofFixture() {
  const url = "https://example.test/a.png?v=final";
  const finalAudit = {
    approved: true,
    preliminary: false,
    insertionId: 42,
    date: "2026-10-01",
    blockingIssues: [],
    audit: { ok: true },
  };
  const candidate = {
    id: "candidate-1", insertionId: 42, targetDate: "2026-10-01", sourceJobId: "job-1",
    artifactUrl: url, artifactSha256: "a".repeat(64), artifactBytes: 4096,
    capturedAt: new Date("2026-10-06T09:41:51.403Z"),
    metadata: {
      insertionId: 42, targetDate: "2026-10-01", sourceJobId: "job-1", captureClass: "historical_recovery",
      uploadedUrl: url, capturedAt: "2026-10-06T09:41:51.403Z", auditPolicyVersion: "audit-policy-v1",
      preliminary: true,
      reconstruction: { provenanceVersion: 4, reconstructedAt: "2026-10-06T09:41:51.403Z", historicalDisplayConfirmed: false },
      checklistValidation: { approved: true, preliminary: true, blockingIssues: [], audit: { ok: false } },
      retroContentProof: { status: "approved", futureCount: 0, manifestHash: "verified-manifest-hash" },
    },
  };
  const promotion = {
    id: "promotion-1", candidateId: candidate.id, status: "approved", finalLogId: "log-1",
    insertionId: 42, targetDate: "2026-10-01", sourceJobId: "job-1", candidateUrl: url,
    candidateSha256: candidate.artifactSha256, candidateBytes: candidate.artifactBytes, audit: finalAudit,
  };
  const finalLog = {
    id: "log-1", insertionId: 42, targetDate: "2026-10-01", status: "ok", jobId: "job-1", runnerJobId: "job-1",
    uploadedUrl: url, createdAt: candidate.capturedAt, artifacts: { candidateId: candidate.id }, metadata: candidate.metadata,
  };
  return { canonicalEvidenceUrl: url, candidate, promotion, finalLog, finalAudit };
}

test("resolved promoted metadata prefers correlated final audit over preliminary log metadata", () => {
  const input = promotedProofFixture();
  const metadata = resolvePromotedCaptureProofMetadata(input);
  assert.ok(metadata);
  assert.equal((metadata.checklistValidation as { preliminary?: boolean }).preliminary, false);
  assert.equal((metadata.checklistValidation as { audit?: { ok?: boolean } }).audit?.ok, true);
  const result = monthlyEvidenceProvenance(input.canonicalEvidenceUrl, { uploadedUrl: input.canonicalEvidenceUrl, metadata }, true, "audited");
  assert.equal(result.provenanceStatus, "reconstruction_recorded");
  assert.equal(result.technicalAccepted, true);
});

test("unapproved, legacy-without-receipt, preliminary-only and identity-mismatched promotion stay untrusted", () => {
  const input = promotedProofFixture();
  assert.equal(monthlyEvidenceProvenance(input.canonicalEvidenceUrl, {
    uploadedUrl: input.canonicalEvidenceUrl,
    metadata: input.candidate.metadata,
  }, true, "audited").provenanceStatus, "unknown");
  assert.equal(monthlyEvidenceProvenance(input.canonicalEvidenceUrl, {
    uploadedUrl: input.canonicalEvidenceUrl,
    metadata: input.candidate.metadata,
  }, true, "audited").provenanceStatus, "unknown");
  assert.equal(resolvePromotedCaptureProofMetadata({ ...input, promotion: null }), null);
  assert.equal(resolvePromotedCaptureProofMetadata({ ...input, promotion: { ...input.promotion, status: "blocked" } }), null);
  assert.equal(resolvePromotedCaptureProofMetadata({
    ...input,
    promotion: { ...input.promotion, audit: null },
  }), null);
  for (const changed of [
    { candidate: { ...input.candidate, insertionId: 43 } },
    { promotion: { ...input.promotion, insertionId: 43 } },
    { promotion: { ...input.promotion, targetDate: "2026-10-02" } },
    { promotion: { ...input.promotion, finalLogId: "log-other" } },
    { promotion: { ...input.promotion, candidateId: "candidate-other" } },
    { promotion: { ...input.promotion, audit: { ...input.finalAudit, insertionId: 43 } } },
    { promotion: { ...input.promotion, audit: { ...input.finalAudit, date: "2026-10-02" } } },
    { finalLog: { ...input.finalLog, targetDate: "2026-10-02" } },
    { finalLog: { ...input.finalLog, insertionId: 43 } },
    { finalLog: { ...input.finalLog, uploadedUrl: "https://example.test/other.png" } },
    { finalLog: { ...input.finalLog, jobId: "job-other" } },
    { candidate: { ...input.candidate, sourceJobId: "job-other" } },
    { candidate: { ...input.candidate, artifactSha256: "b".repeat(64) } },
    { candidate: { ...input.candidate, artifactBytes: 4097 } },
  ]) assert.equal(resolvePromotedCaptureProofMetadata({ ...input, ...changed }), null);
});

test("awaiting_readback still accepts a final checklist snapshot from the exact canonical runner log", () => {
  const input = promotedProofFixture();
  const finalLogMetadata = { ...input.candidate.metadata, checklistValidation: input.finalAudit };
  const result = monthlyEvidenceProvenance(input.canonicalEvidenceUrl, {
    uploadedUrl: input.canonicalEvidenceUrl,
    metadata: finalLogMetadata,
  }, true, "audited");
  assert.equal(result.provenanceStatus, "reconstruction_recorded");
  assert.equal(result.technicalAccepted, true);
});

test('proveniência histórica correlacionada é aceita tecnicamente e mantém o marcador histórico', () => {
  const proof = { uploadedUrl: 'https://example.test/a.png', metadata: {
    captureClass: 'historical_recovery', capturedAt: '2026-09-20T03:00:00Z', reconstruction: { provenanceVersion: 3 },
    checklistValidation: { approved: true, blockingIssues: [], audit: { ok: true } },
    retroContentProof: { status: 'approved', futureCount: 0, manifestHash: 'verified-manifest-hash' },
  } };
  const accepted = monthlyEvidenceProvenance('https://example.test/a.png?v=1', proof, true, 'audited');
  assert.equal(accepted.captureClass, 'historical_recovery');
  assert.equal(accepted.acceptancePolicy, 'technical-audit-v1');
  assert.equal(accepted.technicalAccepted, true);
  assert.equal(accepted.requiresDocumentaryAcceptance, false);
  assert.equal(accepted.provenanceStatus, 'reconstruction_recorded');
  assert.equal(accepted.documentaryStatus, 'reconstruction_requires_acceptance', 'alias legado não deve apagar a origem');
  assert.equal('capturedAt' in accepted, false, 'horário vem apenas da correlação canônica da rota');
});

test('proveniência sem correlação e auditoria não aprovada seguem bloqueadas', () => {
  const proof = { uploadedUrl: 'https://example.test/a.png', metadata: {
    captureClass: 'historical_recovery', capturedAt: '2026-09-20T03:00:00Z', reconstruction: { provenanceVersion: 3 },
    checklistValidation: { approved: true, blockingIssues: [], audit: { ok: true } },
    retroContentProof: { status: 'approved', futureCount: 0, manifestHash: 'verified-manifest-hash' },
  } };
  const untrusted = monthlyEvidenceProvenance('https://example.test/a.png', proof, false, 'audited');
  assert.equal(untrusted.technicalAccepted, false);
  assert.equal(untrusted.provenanceStatus, 'unknown');
  assert.equal(untrusted.documentaryStatus, 'reconstruction_requires_acceptance');
  assert.equal(monthlyEvidenceProvenance('https://example.test/b.png', proof, true, 'audited').provenanceStatus, 'unknown');
  assert.equal(monthlyEvidenceProvenance('https://example.test/a.png', null, true, 'audited').provenanceStatus, 'unknown');
  assert.equal(monthlyEvidenceProvenance('https://example.test/a.png', proof, true, 'invalid_audit').technicalAccepted, false);
  for (const metadata of [
    { ...proof.metadata, checklistValidation: { ...proof.metadata.checklistValidation, approved: false } },
    { ...proof.metadata, checklistValidation: { ...proof.metadata.checklistValidation, blockingIssues: ['visual_mismatch'] } },
    { ...proof.metadata, checklistValidation: { ...proof.metadata.checklistValidation, audit: { ok: false } } },
    { ...proof.metadata, retroContentProof: { ...proof.metadata.retroContentProof, futureCount: 1 } },
    { ...proof.metadata, retroContentProof: { ...proof.metadata.retroContentProof, manifestHash: '' } },
    { ...proof.metadata, retroContentProof: { ...proof.metadata.retroContentProof, status: 'missing' } },
  ]) {
    assert.equal(monthlyEvidenceProvenance('https://example.test/a.png', { ...proof, metadata }, true, 'audited').technicalAccepted, false);
  }
  assert.equal(monthlyEvidenceProvenance('https://example.test/a.png', { ...proof, metadata: { captureClass: 'scheduled' } }).documentaryStatus, 'provenance_unverified');
});

test('captura agendada mantém a política existente sem exigir prova editorial retroativa', () => {
  const proof = { uploadedUrl: 'https://example.test/a.png', metadata: { captureClass: 'scheduled' } };
  const result = monthlyEvidenceProvenance('https://example.test/a.png', proof, true, 'audited');
  assert.equal(result.technicalAccepted, true);
  assert.equal(result.provenanceStatus, 'capture_recorded');
});

test('reconstrucao tecnicamente aceita completa o mês sem perder seu status de origem', () => {
  const result = classifyMonthlyInsertion({ published: true, periodStart: '2026-09-01', periodEnd: '2026-09-18', today: '2026-09-21', evidenceDays: [{ date: '2026-09-18', status: 'reconstruction', technicalAccepted: true }] });
  assert.deepEqual(result.evidenceStates, ['complete']);
});

test('reconstrucao sem aceite técnico e proveniência desconhecida seguem pendentes', () => {
  const result = classifyMonthlyInsertion({ published: true, periodStart: '2026-09-01', periodEnd: '2026-09-18', today: '2026-09-21', evidenceDays: [
    { date: '2026-09-18', status: 'reconstruction', technicalAccepted: false },
  ] });
  assert.deepEqual(result.evidenceStates, ['documentary_pending']);
  const unknown = classifyMonthlyInsertion({ published: true, periodStart: '2026-09-01', periodEnd: '2026-09-18', today: '2026-09-21', evidenceDays: [
    { date: '2026-09-18', status: 'provenance_unverified', technicalAccepted: false },
  ] });
  assert.deepEqual(unknown.evidenceStates, ['documentary_pending']);
});

test('tentativa nova não promovida não oculta a prova do arquivo preservado', () => {
  const original = { uploadedUrl: 'https://example.test/original.png', updatedAt: new Date('2026-09-18') };
  const candidate = { uploadedUrl: 'https://example.test/candidate.png', updatedAt: new Date('2026-09-20') };
  assert.equal(selectMonthlyEvidenceProof(original.uploadedUrl, [original, candidate]), original);
  assert.equal(selectMonthlyEvidenceProof('https://example.test/unknown.png', [candidate]), null);
});

test("remove insercoes arquivadas ou substituidas antes do enriquecimento", () => {
  assert.deepEqual(excludeSupersededMonthlyInsertions([
    { id: 1, archivedAt: null, supersededByInsertionId: null },
    { id: 2, archivedAt: new Date(), supersededByInsertionId: null },
    { id: 3, archivedAt: null, supersededByInsertionId: 1 },
  ]).map((item) => item.id), [1]);
});

test("usa o mes corrente de Cuiaba quando a URL nao informa mes", () => {
  assert.equal(currentMonthInTimeZone(new Date("2026-09-01T03:30:00.000Z"), "America/Cuiaba"), "2026-08");
  assert.equal(currentMonthInTimeZone(new Date("2026-09-01T04:30:00.000Z"), "America/Cuiaba"), "2026-09");
});

test("aceita mes real e recusa formato ou mes impossivel", () => {
  assert.equal(normalizeMonthlyReportMonth("2026-09"), "2026-09");
  assert.equal(normalizeMonthlyReportMonth("2026-13"), null);
  assert.equal(normalizeMonthlyReportMonth("setembro-2026"), null);
});

test("gera consulta paginada e limitada sem enviar filtros vazios", () => {
  assert.deepEqual(buildMonthlyReportQuery({
    month: "2026-09",
    portal: "omt",
    publication: "not_published",
    evidence: "missing",
    search: "  cliente x  ",
    cursor: "20",
    limit: "999",
  }), {
    month: "2026-09",
    portal: "OMT",
    publication: "not_published",
    evidence: "missing",
    search: "cliente x",
    offset: 20,
    limit: 50,
  });
});

test("aceita até 50 campanhas por página para reduzir consultas sequenciais", () => {
  assert.equal(buildMonthlyReportQuery({ month: "2026-09", limit: "50" }).limit, 50);
  assert.equal(buildMonthlyReportQuery({ month: "2026-09", limit: "500" }).limit, 50);
});

test("recusa filtros desconhecidos e cursor negativo", () => {
  assert.deepEqual(buildMonthlyReportQuery({
    month: "2026-09",
    portal: "qualquer",
    publication: "quebrado",
    evidence: "quebrado",
    cursor: "-5",
  }), {
    month: "2026-09",
    portal: null,
    publication: "all",
    evidence: "all",
    search: "",
    offset: 0,
    limit: 12,
  });
});

test("limita o mes atual ao dia corrente e fecha mes historico", () => {
  assert.deepEqual(monthBounds("2026-09", "2026-09-12"), { start: "2026-09-01", end: "2026-09-30", evidenceEnd: "2026-09-12" });
  assert.deepEqual(monthBounds("2026-08", "2026-09-12"), { start: "2026-08-01", end: "2026-08-31", evidenceEnd: "2026-08-31" });
});

test("separa publicacao e auditoria sem aceitar evidencia apenas existente", () => {
  assert.deepEqual(classifyMonthlyInsertion({
    published: true,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    today: "2026-09-12",
    evidenceDays: [
      { date: "2026-09-01", status: "audited" },
      { date: "2026-09-02", status: "invalid_audit" },
    ],
  }), {
    publicationStates: ["active"],
    evidenceStates: ["invalid"],
  });
});

test("resposta publica remove campos comerciais e observacoes internas", () => {
  const result = publicMonthlyInsertion({
    id: 1,
    campanhaId: 2,
    campanhaName: "Campanha",
    clienteCnpj: "nao-pode-sair",
    valorLiquido: 999,
    observacoes: "interno",
  });
  assert.deepEqual(result, { id: 1, campanhaId: 2, campanhaName: "Campanha" });
});

test("pagina insercoes antes da auditoria pesada, mesmo quando uma campanha tem muitos banners", () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({ id: index + 1, campanhaId: index < 60 ? 10 : 20 }));
  assert.deepEqual(pageMonthlyInsertions(rows, 0, 12).map((row) => row.id), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.deepEqual(pageMonthlyInsertions(rows, 12, 12).map((row) => row.id), Array.from({ length: 12 }, (_, index) => index + 13));
});

test("remove duplicata logica mesmo quando a chave canonica ou a campanha divergem", () => {
  const rows = [
    { id: 1830, campanhaId: 973, piCodigo: "PI 25207030 - GOV", siteId: 5, localFormatoNormalizado: "HOME 1", localFormato: "HOME 1", periodoInicio: "2026-08-01", periodoFim: "2026-08-13", mediaUrl: null, bannerPublicadoNoSite: false, statusNormalizado: "rascunho" },
    { id: 1839, campanhaId: 973, piCodigo: "25207030", siteId: 5, localFormatoNormalizado: "HOME 1", localFormato: "HOME 1", periodoInicio: "2026-08-03", periodoFim: "2026-08-17", mediaUrl: "https://cdn.example/banner.gif", bannerPublicadoNoSite: true, statusNormalizado: "publicado" },
    { id: 1852, campanhaId: 979, piCodigo: "PI 742 - PREF VG", siteId: 1, localFormatoNormalizado: "MEGABANNER TOPO", localFormato: "MEGABANNER TOPO", periodoInicio: "2026-07-31", periodoFim: "2026-08-09", mediaUrl: null, bannerPublicadoNoSite: false, statusNormalizado: "print_gerado" },
    { id: 1840, campanhaId: 976, piCodigo: "742", siteId: 1, localFormatoNormalizado: "TOPO", localFormato: "TOPO", periodoInicio: "2026-07-31", periodoFim: "2026-08-09", mediaUrl: "https://cdn.example/acelera.gif", bannerPublicadoNoSite: true, statusNormalizado: "publicado" },
  ];

  assert.deepEqual(selectCanonicalMonthlyInsertions(rows).map((row) => row.id), [1839, 1840]);
});

test("PI 0000 sobreposta mantém a inserção publicada e elegível ao mês por período", () => {
  const rows = [
    { id: 3047, campanhaId: 1049, campanhaName: "SORTE NA CONTA", piCodigo: "0000", siteId: 33, localFormatoNormalizado: "HOME 2", periodoInicio: "2026-09-18", periodoFim: "2026-10-31", mediaUrl: "https://cdn.example/full-banner.gif", bannerPublicadoNoSite: true, statusNormalizado: "publicado", competencia: "OUTUBRO/2025" },
    { id: 3077, campanhaId: 1064, campanhaName: "SORTE NA CONTA", piCodigo: "PI 0000 - AGUAS CBA", siteId: 33, localFormatoNormalizado: "HOME 2", periodoInicio: "2026-09-18", periodoFim: "2026-10-31", mediaUrl: null, bannerPublicadoNoSite: false, statusNormalizado: "rascunho", competencia: "OUTUBRO/2025" },
  ];
  assert.equal(monthlyReportInsertionMatches(rows[0]!, { start: "2026-09-01", end: "2026-09-30" }), true);
  assert.deepEqual(selectCanonicalMonthlyInsertions(rows).map((row) => row.id), [3047]);
});

test("mantem voos separados quando os periodos da mesma PI nao se sobrepoem", () => {
  const base = { campanhaId: 1, piCodigo: "PI 10", siteId: 1, localFormatoNormalizado: "TOPO", localFormato: "TOPO", mediaUrl: "x", bannerPublicadoNoSite: true, statusNormalizado: "publicado" };
  assert.deepEqual(selectCanonicalMonthlyInsertions([
    { ...base, id: 1, periodoInicio: "2026-08-01", periodoFim: "2026-08-05" },
    { ...base, id: 2, periodoInicio: "2026-08-10", periodoFim: "2026-08-15" },
  ]).map((row) => row.id), [1, 2]);
});

test("remove rascunho sem PI quando a campanha publicada equivalente existe", () => {
  const base = { campanhaName: "DENGUE", siteId: 2, localFormatoNormalizado: "MEGABANNER TOPO", periodoInicio: "2026-09-01", periodoFim: "2026-09-15" };
  assert.deepEqual(selectCanonicalMonthlyInsertions([
    { ...base, id: 3014, piCodigo: null, mediaUrl: null, bannerPublicadoNoSite: false, statusNormalizado: "rascunho" },
    { ...base, id: 2988, piCodigo: "PI 42059 - GOV", mediaUrl: "https://cdn.example/dengue.gif", bannerPublicadoNoSite: true, statusNormalizado: "publicado" },
  ]).map((row) => row.id), [2988]);
});

test("normaliza os nomes detalhados usados nos cards duplicados", () => {
  const base = { campanhaId: 1, piCodigo: "PI 90892", siteId: 3, periodoInicio: "2026-08-01", periodoFim: "2026-08-12", statusNormalizado: "print_gerado" };
  assert.deepEqual(selectCanonicalMonthlyInsertions([
    { ...base, id: 2188, localFormato: "Megabanner Topo — Header — 825x120", mediaUrl: null, bannerPublicadoNoSite: false },
    { ...base, id: 1843, localFormato: "MEGABANNER TOPO", mediaUrl: "x", bannerPublicadoNoSite: true },
    { ...base, id: 2190, localFormato: "Video — Lateral 01 — Sidebar — 300x250", mediaUrl: null, bannerPublicadoNoSite: false },
    { ...base, id: 1844, localFormato: "Video", mediaUrl: "y", bannerPublicadoNoSite: true },
  ]).map((row) => row.id), [1843, 1844]);
});

test("mantem campanhas nomeadas distintas com a mesma PI, portal e formato", () => {
  const base = { piCodigo: "PI 91381", siteId: 1, localFormatoNormalizado: "TOPO", periodoInicio: "2026-09-01", periodoFim: "2026-09-30", mediaUrl: null, bannerPublicadoNoSite: false };
  assert.deepEqual(selectCanonicalMonthlyInsertions([
    { ...base, id: 3022, campanhaName: "C DISPLAY" },
    { ...base, id: 3024, campanhaName: "PRESTAÇÃO DE CONTAS" },
  ]).map((row) => row.id), [3022, 3024]);
});

test("marca falta do dia como aguardando horário antes das 18h sem atraso falso", () => {
  assert.deepEqual(classifyMonthlyInsertion({ published: true, periodStart: "2026-09-01", periodEnd: "2026-09-30", today: "2026-09-17", currentHour: 17, evidenceDays: [{ date: "2026-09-17", status: "missing" }] }).evidenceStates, ["scheduled"]);
  assert.deepEqual(classifyMonthlyInsertion({ published: true, periodStart: "2026-09-01", periodEnd: "2026-09-30", today: "2026-09-17", currentHour: 17, evidenceDays: [{ date: "2026-09-16", status: "missing" }, { date: "2026-09-17", status: "missing" }] }).evidenceStates, ["missing", "retroactive_missing"]);
});

test("não deduplica campanhas sem PI quando os nomes também não identificam equivalência", () => {
  const base = { piCodigo: null, siteId: 1, localFormatoNormalizado: "TOPO", periodoInicio: "2026-09-01", periodoFim: "2026-09-30", mediaUrl: null, bannerPublicadoNoSite: false };
  assert.equal(selectCanonicalMonthlyInsertions([{ ...base, id: 1, campanhaName: null }, { ...base, id: 2, campanhaName: null }]).length, 2);
});
test('classifica o estado scheduled produzido pela rota sem falso erro de auditoria', () => {
  const input={published:true,periodStart:'2026-09-01',periodEnd:'2026-09-30',today:'2026-09-17',currentHour:10,evidenceDays:[{date:'2026-09-17',status:'scheduled'}]};
  assert.deepEqual(classifyMonthlyInsertion(input).evidenceStates,['scheduled']);
  assert.deepEqual(classifyMonthlyInsertion({...input,evidenceDays:[...input.evidenceDays,{date:'2026-09-16',status:'missing'}]}).evidenceStates,['missing','retroactive_missing']);
});
