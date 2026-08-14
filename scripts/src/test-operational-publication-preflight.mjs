import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const runner = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

const almtPdfLabels = runner.extractPdfCommercialLabels(`PI - PEDIDO DE INSERÇÃO (INTERNET)
ZIMMERMANN PUBLICIDADE E PROPAGANDA - CUIABA
ZIMMERMANN PUBLICIDADE E PROPAGANDA LTDA
CNPJ: 37.526.019/0001-86
VEICULO: SITE ROO NOTÍCIAS
RAZÃO SOCIAL: ROO COMUNICACAO LTDA
CNPJ: 60.847.245/0001-80
RAZÃO SOCIAL: MATO GROSSO ASSEMBLEIA LEGISLATIVA
CLIENTE: ASSEMBLEIA LEGISLATIVA DO ESTADO DE MATO GROSSO - ALMT
CNPJ: 03.929.049/0001-11`);
assert.deepEqual(almtPdfLabels, {
  clientName: "ASSEMBLEIA LEGISLATIVA DO ESTADO DE MATO GROSSO - ALMT",
  clientLegalName: null,
  clientCnpj: null,
  agencyName: "ZIMMERMANN PUBLICIDADE E PROPAGANDA - CUIABA",
});
assert.deepEqual(runner.clientAliasCandidates(almtPdfLabels.clientName), ["ALMT"]);
assert.deepEqual(runner.agencyAliasCandidates(almtPdfLabels.agencyName), ["Z3"]);
assert.equal(runner.extractPdfCommercialLabels("PI - PEDIDO DE INSERÇÃO\nCLIENTE: ALMT").agencyName, null,
  "agência ausente deve permanecer ausente em vez de assumir DMD");
assert.equal(runner.extractPdfCommercialLabels("PI - PEDIDO DE INSERÇÃO\nCLIENTE: SPM COMUNICAÇÃO").agencyName, null,
  "nome do cliente não pode ser interpretado como agência");
assert.deepEqual(runner.extractPdfCommercialLabels(`PI - PEDIDO DE INSERÇÃO
DMD COMUNICAÇÃO
RAZÃO SOCIAL ACME LTDA
CNPJ 12.345.678/0001-90
VEÍCULO PORTAL TESTE`), {
  clientName: null,
  clientLegalName: "ACME LTDA",
  clientCnpj: "12.345.678/0001-90",
  agencyName: "DMD COMUNICAÇÃO",
}, "formato legado sem dois-pontos continua suportado");
assert.deepEqual(runner.extractPdfCommercialLabels(`PI - PEDIDO DE INSERÇÃO
ZIMMERMANN PUBLICIDADE E PROPAGANDA
CLIENTE: ALMT
RAZÃO SOCIAL: ALMT
CNPJ: 03.929.049/0001-11
VEÍCULO: PORTAL TESTE
RAZÃO SOCIAL: PORTAL LTDA
CNPJ: 60.847.245/0001-80`), {
  clientName: "ALMT",
  clientLegalName: null,
  clientCnpj: null,
  agencyName: "ZIMMERMANN PUBLICIDADE E PROPAGANDA",
}, "ordem posterior do veículo não pode trocar o cliente explícito");

assert.equal(runner.validateOperationalPublicationScope({
  campaignId: 970,
  insertionId: 2186,
  siteSigla: "PERRENGUE",
}), true);
assert.throws(() => runner.validateOperationalPublicationScope({
  campaignId: 970,
  insertionId: 2186,
  siteSigla: "ROO",
}), /portal ainda não suportado/i);

assert.equal(runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  pdfPiCodigo: "PI 057652",
  campaignPiCodigo: "PI 057652- PREF ROO",
  insertionPiCodigo: "57652",
}), true);
assert.throws(() => runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  pdfPiCodigo: "PI 57652",
  campaignPiCodigo: "PI 99999- CORRIGIDA",
  insertionPiCodigo: "57652",
}), /PI atual da campanha diverge/i);
assert.throws(() => runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  pdfPiCodigo: "PI 57652",
  campaignPiCodigo: "57652",
  insertionPiCodigo: "PI 99999- CORRIGIDA",
}), /PI atual da inserção diverge/i);
assert.throws(() => runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  pdfPiCodigo: null,
  campaignPiCodigo: "57652",
  insertionPiCodigo: "57652",
}), /PDF não confirmou/i);
assert.throws(() => runner.validateExpectedDrivePiIdentity({
  expectedPiCodigo: "57652",
  fieldsPiCodigo: "PI 57652",
  pdfPiCodigo: "PI 99999",
  campaignPiCodigo: "57652",
  insertionPiCodigo: "57652",
}), /PI lida no PDF diverge/i);

assert.equal(runner.validateExpectedDrivePiCommercialContext({
  campaignCompetencia: "AGOSTO/2026",
  fieldsCompetencia: "AGOSTO/2026",
  pdfCompetencia: null,
}), true);
assert.throws(() => runner.validateExpectedDrivePiCommercialContext({
  campaignCompetencia: "AGOSTO/2026",
  fieldsCompetencia: "JULHO/2026",
  pdfCompetencia: "JULHO/2026",
}), /competência.*diverge/i);

const sourceSeparated = runner.mergeDrivePiFields(
  { piCodigo: "PI 14807", competencia: "AGOSTO/2026", insertions: [], raw: {} },
  { piCodigo: null, competencia: null, insertions: [] },
);
assert.equal(sourceSeparated.piCodigo, "PI 14807");
assert.equal(sourceSeparated.pdfPiCodigo, null);

assert.equal(runner.hasHttpsDrivePiDestination({ clickUrl: "https://destino.example/", insertions: [] }), true);
assert.equal(runner.hasHttpsDrivePiDestination({ clickUrl: "http://destino.example/", insertions: [] }), false);
assert.equal(runner.hasHttpsDrivePiDestination({ clickUrl: null, insertions: [] }), false);
const expectedDestinationInsertion = {
  siteId: 4,
  localFormato: "HOME 1",
  localFormatoNormalizado: "HOME 1",
  periodoInicio: "2026-08-01",
  periodoFim: "2026-08-21",
};
const mixedDestinations = {
  clickUrl: null,
  insertions: [
    { ...expectedDestinationInsertion, clickUrl: null, mediaUrl: "https://cdn.example/target.gif" },
    { siteId: 5, localFormato: "HOME 2", periodoInicio: "2026-08-01", periodoFim: "2026-08-21", clickUrl: "https://other.example/", mediaUrl: "https://cdn.example/other.gif" },
  ],
};
assert.equal(runner.hasHttpsDrivePiDestination(mixedDestinations, expectedDestinationInsertion), false);
assert.equal(runner.hasHttpsDrivePiDestination({
  ...mixedDestinations,
  insertions: mixedDestinations.insertions.map((item, index) => index === 0 ? { ...item, clickUrl: "https://target.example/" } : item),
}, expectedDestinationInsertion), true);
assert.equal(runner.hasHttpsDrivePiDestination(mixedDestinations), false, "publicação genérica exige destino em todas as inserções");

assert.equal(runner.validateDrivePiPackageReadiness(
  { hasPdf: true, hasMedia: true },
  { clickUrl: "https://destino.example/", insertions: [{ mediaUrl: "https://cdn.example/banner.gif" }] },
  { issues: [] },
  { requireResolvedMedia: true, requireHttpsDestination: true },
).ok, true);
assert.deepEqual(runner.validateDrivePiPackageReadiness(
  { hasPdf: true, hasMedia: true },
  { clickUrl: null, insertions: [{ mediaUrl: "https://cdn.example/banner.gif" }] },
  { issues: [] },
  { requireResolvedMedia: true, requireHttpsDestination: true },
).issues, ["missing_https_destination"]);
assert.deepEqual(runner.validateDrivePiPackageReadiness(
  { hasPdf: true, hasMedia: true },
  mixedDestinations,
  { issues: [] },
  { requireResolvedMedia: true, requireHttpsDestination: true, expectedInsertion: expectedDestinationInsertion },
).issues, ["missing_https_destination"]);

const mergedExpectedContext = runner.mergeExpectedDrivePiContext({
  piCodigo: "PI 14807",
  campaignName: null,
  competencia: null,
  clienteId: null,
  agenciaId: 76,
  insertions: [],
}, {
  campaign: { id: 972, nome: "Enfrentamento ao Feminicídio", competencia: "AGOSTO/2026", clienteId: 11, agenciaId: 76 },
  insertion: {
    id: 2187,
    campanhaId: 972,
    siteId: 4,
    localFormato: "Megabanner Topo — Header — 825x120",
    localFormatoNormalizado: "MEGABANNER TOPO — HEADER — 825X120",
    periodoInicio: "2026-08-01",
    periodoFim: "2026-08-21",
    periodoOriginal: "01/08- 21/08",
  },
});
assert.equal(mergedExpectedContext.piCodigo, "PI 14807", "PI deve continuar vindo do PDF");
assert.equal(mergedExpectedContext.campaignName, "Enfrentamento ao Feminicídio", "nome ausente no PDF usa a campanha canônica já vinculada");
assert.equal(mergedExpectedContext.competencia, "AGOSTO/2026");
assert.equal(mergedExpectedContext.clienteId, 11);
assert.equal(mergedExpectedContext.agenciaId, 76);
assert.deepEqual(mergedExpectedContext.insertions, [{
  siteId: 4,
  localFormato: "Megabanner Topo — Header — 825x120",
  localFormatoNormalizado: "MEGABANNER TOPO — HEADER — 825X120",
  periodoInicio: "2026-08-01",
  periodoFim: "2026-08-21",
  periodoOriginal: "01/08- 21/08",
  siteSigla: null,
}]);

const destination = runner.resolveOperationalDestination([
  { text: "Destino: https://www.tce.mt.gov.br/" },
]);
assert.equal(destination, "https://www.tce.mt.gov.br/");
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: http://example.com/" }]), /HTTPS/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "https://a.example/ https://b.example/" }]), /exatamente um/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: https://localhost/admin" }]), /exatamente um/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: https://127.0.0.1/private" }]), /exatamente um/);
assert.throws(() => runner.resolveOperationalDestination([{ text: "Destino: https://user:pass@example.com/" }]), /exatamente um/);

const contract = runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "PI - TCE" },
  site: { id: 33, sigla: "PERRENGUE" },
});
assert.equal(contract.ok, true);
assert.equal(contract.preserveCommercialPi, "PI - TCE");
assert.throws(() => runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "17190" },
  site: { id: 33, sigla: "PERRENGUE" },
}), /PI numérica/);

const compositeContract = runner.validateOperationalPublicationContract({
  identityMode: "sheet_drive_composite",
  expectedPiCodigo: "17046",
  expectedCampaignId: 970,
  expectedInsertionId: 2186,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "MEGABANNER TOPO — HEADER — 825X120",
  expectedPeriodStart: "2026-08-01",
  expectedPeriodEnd: "2026-08-22",
}, {
  insertion: { id: 2186, campanhaId: 970, piCodigo: "PI 17046 - GOV", localFormatoNormalizado: "MEGABANNER TOPO — HEADER — 825X120", periodoInicio: "2026-08-01", periodoFim: "2026-08-22" },
  campaign: { id: 970, piCodigo: "PI 17046 - GOV" },
  site: { sigla: "PERRENGUE" },
});
assert.equal(compositeContract.expectedPiCodigo, "17046");
assert.throws(() => runner.validateOperationalPublicationContract({
  identityMode: "sheet_drive_composite", expectedPiCodigo: "17046", expectedCampaignId: 970, expectedInsertionId: 2186,
  expectedSiteSigla: "PERRENGUE", expectedFormat: "MEGABANNER TOPO — HEADER — 825X120", expectedPeriodStart: "2026-08-01", expectedPeriodEnd: "2026-08-22",
}, {
  insertion: { id: 2186, campanhaId: 970, piCodigo: "PI 99999", localFormatoNormalizado: "MEGABANNER TOPO — HEADER — 825X120", periodoInicio: "2026-08-01", periodoFim: "2026-08-22" },
  campaign: { id: 970, piCodigo: "PI 17046 - GOV" }, site: { sigla: "PERRENGUE" },
}), /PI.*diverge/i);

for (const [text, expected] of [
  ["PI 17046", "17046"],
  ["PI: 17046", "17046"],
  ["PI Nº 17046", "17046"],
  ["PI - 17046", "17046"],
  ["PI PEDIDO DE INSERÇÃO 17046", "17046"],
]) {
  assert.equal(runner.extractExplicitPiFromPdfText(text), expected, `deve extrair ${text}`);
}
assert.equal(runner.extractExplicitPiFromPdfText("PI - TCE"), null);
assert.deepEqual(runner.extractExplicitPisFromPdfText("PI 17046 / PI: 99999"), ["17046", "99999"]);

assert.equal(runner.validateCompositePdfEvidence({
  expectedPiCodigo: "17046",
  expectedDocument: { size: "63740", md5Checksum: "a22c37e0be907efabc9a20d2c0c0cedc" },
  archive: { bytes: 63740, md5: "a22c37e0be907efabc9a20d2c0c0cedc" },
  parsedPdf: { piCodigo: null, parseError: null },
}), true);
assert.throws(() => runner.validateCompositePdfEvidence({
  expectedPiCodigo: "17046",
  expectedDocument: { size: null, md5Checksum: null },
  archive: { bytes: 63740, md5: "a22c37e0be907efabc9a20d2c0c0cedc" },
  parsedPdf: { piCodigo: null, parseError: null },
}), /checksum.*tamanho/i);
assert.throws(() => runner.validateCompositePdfEvidence({
  expectedPiCodigo: "17046",
  expectedDocument: { size: "63740", md5Checksum: "a22c37e0be907efabc9a20d2c0c0cedc" },
  archive: { bytes: 63740, md5: "a22c37e0be907efabc9a20d2c0c0cedc" },
  parsedPdf: { piCodigo: null, parseError: "pdftotext failed" },
}), /não pôde ser lido/i);
assert.throws(() => runner.validateCompositePdfEvidence({
  expectedPiCodigo: "17046",
  expectedDocument: { size: "63740", md5Checksum: "a22c37e0be907efabc9a20d2c0c0cedc" },
  archive: { bytes: 63740, md5: "a22c37e0be907efabc9a20d2c0c0cedc" },
  parsedPdf: { piCodigo: "PI: 99999", parseError: null },
}), /diverge/i);
assert.throws(() => runner.validateCompositePdfEvidence({
  expectedPiCodigo: "17046",
  expectedDocument: { size: "63740", md5Checksum: "a22c37e0be907efabc9a20d2c0c0cedc" },
  archive: { bytes: 63740, md5: "a22c37e0be907efabc9a20d2c0c0cedc" },
  parsedPdf: { piCodigo: "PI 17046", explicitPiCandidates: ["17046", "99999"], parseError: null },
}), /divergente|ambígua/i);

assert.equal(runner.validateCompositePendingGuard({
  identityMode: "sheet_drive_composite", publicationStatus: "ready_for_publication",
  sourceIdentity: { canonicalPi: "17046" }, operationalIdentity: { fingerprint: "f".repeat(64) },
}, { identityMode: "sheet_drive_composite", expectedPiCodigo: "17046", fingerprint: "f".repeat(64) }), true);
assert.throws(() => runner.validateCompositePendingGuard({
  identityMode: "sheet_drive_composite", publicationStatus: "ready_for_publication",
  sourceIdentity: { canonicalPi: "17046" }, operationalIdentity: { fingerprint: "e".repeat(64) },
}, { identityMode: "sheet_drive_composite", expectedPiCodigo: "17046", fingerprint: "f".repeat(64) }), /fingerprint/i);

assert.equal(runner.validateAdrotatePublicationGuard({
  expectedCampaignId: 970,
  expectedInsertionId: 2186,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "MEGABANNER TOPO — HEADER — 825X120",
  expectedPeriodStart: "2026-08-01",
  expectedPeriodEnd: "2026-08-22",
  expectedMediaUrl: "https://cdn.example/17046.gif",
  expectedPiCodigo: "17046",
}, {
  insertion: { id: 2186, campanhaId: 970, piCodigo: "PI 17046 - GOV", localFormatoNormalizado: "MEGABANNER TOPO — HEADER — 825X120", periodoInicio: "2026-08-01", periodoFim: "2026-08-22", mediaUrl: "https://cdn.example/17046.gif" },
  campaign: { id: 970, piCodigo: "17046" }, site: { sigla: "PERRENGUE" },
}), true);
assert.throws(() => runner.validateAdrotatePublicationGuard({
  expectedCampaignId: 970, expectedInsertionId: 2186, expectedSiteSigla: "PERRENGUE", expectedFormat: "MEGABANNER TOPO — HEADER — 825X120", expectedPeriodStart: "2026-08-01", expectedPeriodEnd: "2026-08-22", expectedMediaUrl: "https://cdn.example/17046.gif",
}, {
  insertion: { id: 2186, campanhaId: 970, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-01", periodoFim: "2026-08-22", mediaUrl: "https://cdn.example/17046.gif" }, campaign: { id: 970 }, site: { sigla: "PERRENGUE" },
}), /formato/i);
assert.throws(() => runner.validateAdrotatePublicationGuard({
  expectedCampaignId: 970, expectedInsertionId: 2186, expectedSiteSigla: "PERRENGUE", expectedFormat: "MEGABANNER TOPO — HEADER — 825X120", expectedPeriodStart: "2026-08-01", expectedPeriodEnd: "2026-08-22", expectedMediaUrl: "https://cdn.example/17046.gif", expectedPiCodigo: "17046",
}, {
  insertion: { id: 2186, campanhaId: 970, piCodigo: "PI 17046", localFormatoNormalizado: "MEGABANNER TOPO — HEADER — 825X120", periodoInicio: "2026-08-01", periodoFim: "2026-08-22", mediaUrl: "https://cdn.example/17046.gif" }, campaign: { id: 970, piCodigo: "PI 99999" }, site: { sigla: "PERRENGUE" },
}), /PI/i);
assert.throws(() => runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, piCodigo: "PI 009750- PREF ROO", siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "PI - TCE" },
  site: { id: 33, sigla: "PERRENGUE" },
}), /PI numérica/);
assert.throws(() => runner.validateOperationalPublicationContract({
  expectedCampaignId: 989,
  expectedInsertionId: 1944,
  expectedSiteSigla: "PERRENGUE",
  expectedFormat: "HOME 1",
  expectedPeriodStart: "2026-08-12",
  expectedPeriodEnd: "2026-08-25",
}, {
  insertion: { id: 1944, campanhaId: 989, siteId: 33, localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25" },
  campaign: { id: 989, piCodigo: "PI 009750- PREF ROO" },
  site: { id: 33, sigla: "PERRENGUE" },
}), /PI numérica/);

const adrotatePayload = runner.buildAdrotatePublishPayload({
  insertion: { id: 1944, campanhaId: 989, siteSigla: "PERRENGUE", mediaUrl: "https://cdn.example/radar.gif", localFormatoNormalizado: "HOME 1", periodoInicio: "2026-08-12", periodoFim: "2026-08-25", observacoes: "Link destino informado: https://www.tce.mt.gov.br/" },
  campaign: { id: 989, piCodigo: "PI - TCE", nome: "RADAR" },
  site: { sigla: "PERRENGUE" },
  checklist: { expectedSelectors: { groupId: 2, slotSelector: ".g.g-2", contextSelector: ".g.g-2" }, expectedMedia: { mediaUrl: "https://cdn.example/radar.gif" }, resolvedRule: { page: "home" } },
  targetDate: "2026-08-13",
  replaceExisting: true,
  purgeCache: true,
  generateEvidence: false,
  identityMode: "operational_identity",
});
assert.equal(adrotatePayload.pi_code, null);
assert.equal(adrotatePayload.external_key, "ADOPS-PERRENGUE-1944");
assert.equal(adrotatePayload.group_id, 2);
assert.equal(runner.validateOperationalDriveItem(
  { id: "gif-radar", name: "670x90 tce.gif", mimeType: "image/gif", modifiedTime: "2026-08-12T00:34:08.000Z", size: "65191", md5Checksum: "abc" },
  { driveFileId: "gif-radar", name: "670x90 tce.gif", mimeType: "image/gif", modifiedTime: "2026-08-12T00:34:08.000Z", size: "65191", md5Checksum: "abc" },
  "Mídia",
), true);
assert.throws(() => runner.validateOperationalDriveItem(
  { id: "gif-radar", modifiedTime: "2026-08-12T00:34:08.000Z" },
  { driveFileId: "gif-radar", modifiedTime: "2026-08-13T00:00:00.000Z" },
  "Mídia",
), /mudou/);
assert.deepEqual(runner.normalizePerrengueAdrotateSnapshot({ ads: [], links: [], schedules: [] }), { ads: [], links: [], schedules: [] });
assert.throws(() => runner.normalizePerrengueAdrotateSnapshot(null), /inválido/);
assert.throws(() => runner.normalizePerrengueAdrotateSnapshot({ ads: [], links: [] }), /schedules/);
assert.equal(runner.selectCanonicalSnapshotAd({ ads: [{ id: "12" }, { id: "41" }] }).id, "41");
assert.equal(runner.evaluateRestoredAdHtml(
  "ADOPS-PERRENGUE-1944 rejected.gif",
  { previousAdId: 12, previousMediaBasename: "old.gif", rejectedMediaBasename: "rejected.gif" },
).ok, false);
assert.equal(runner.evaluateRestoredAdHtml(
  "a-12 old.gif",
  { previousAdId: 12, previousMediaBasename: "old.gif", rejectedMediaBasename: "rejected.gif" },
).ok, true);

const publishReason = runner.buildPerrengueRebuildTriggerReason({
  insertionId: 1944,
  operation: "publish",
  operationId: "job-f521",
});
const rollbackReason = runner.buildPerrengueRebuildTriggerReason({
  insertionId: 1944,
  operation: "rollback",
  operationId: "job-f521",
});
assert.equal(publishReason, "adops_adrotate_publish_1944_job-f521");
assert.equal(rollbackReason, "adops_adrotate_rollback_1944_job-f521");
assert.notEqual(publishReason, rollbackReason);
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: false,
  last: { status: "ok", trigger: { reason: publishReason } },
}, publishReason), { matched: true, completed: true, failed: false, status: "ok" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: false,
  last: { status: "ok", trigger: { reason: publishReason } },
}, rollbackReason), { matched: false, completed: false, failed: false, status: null });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: false,
  last: { status: "failed", trigger: { reason: rollbackReason } },
}, rollbackReason), { matched: true, completed: false, failed: true, status: "failed" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: true,
  queued: false,
  last: { status: "running", trigger: { reason: publishReason } },
}, publishReason), { matched: true, completed: false, failed: false, status: "running" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: false,
  queued: true,
  last: { status: "queued", trigger: { reason: publishReason } },
}, publishReason), { matched: true, completed: false, failed: false, status: "queued" });
assert.deepEqual(runner.evaluatePerrengueRebuildHealth({
  running: true,
  queued: true,
  last: { status: "running", trigger: { reason: "editorial-next" } },
  recentRuns: [{ status: "ok", trigger: { reason: publishReason } }],
}, publishReason), { matched: true, completed: true, failed: false, status: "ok" });

const runnerSource = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
assert.match(runnerSource, /insertionAfterPublish = await privateApiPatch[\s\S]*expectedUpdatedAt: payload\.publicationGuard\.expectedUpdatedAt/,
  "PATCH de publicação deve continuar o CAS iniciado pelo preflight");
assert.match(runnerSource, /expectedUpdatedAt: published\?\.insertionAfterPublish\?\.updatedAt \|\| patchedInsertion\?\.updatedAt/,
  "rollback deve usar a versão devolvida pelo PATCH final do publicador");
const adrotateConfig = JSON.parse(await readFile(new URL("../../config/adrotate-sites.json", import.meta.url), "utf8"));
for (const [groupId, width, height] of [[1, 825, 120], [9, 970, 90]]) {
  const mapping = adrotateConfig.PERRENGUE.formatMappings.find((item) => item.groupId === groupId);
  assert.deepEqual(mapping?.operationalMediaProfile, { width, height, formats: ["GIF"] },
    `grupo ${groupId} deve ter perfil binário único para o preflight operacional`);
}

const dir = await mkdtemp(path.join(tmpdir(), "adops-operational-gif-"));
try {
  const file = path.join(dir, "670x90.gif");
  await execFileAsync("convert", ["-size", "670x90", "gradient:#0057b8-#ffffff", file]);
  const metadata = await runner.inspectOperationalImage(file, { width: 670, height: 90, format: "GIF" });
  assert.equal(metadata.width, 670);
  assert.equal(metadata.height, 90);
  assert.equal(metadata.format, "GIF");
  await assert.rejects(() => runner.inspectOperationalImage(file, { width: 825, height: 120, format: "GIF" }), /Dimens/);
  for (const [name, source] of [
    ["snapshot.php", runner.buildPerrengueAdrotateSnapshotPhp()],
    ["restore.php", runner.buildPerrengueAdrotateRestorePhp()],
  ]) {
    const phpFile = path.join(dir, name);
    await writeFile(phpFile, source);
    const lint = await execFileAsync("php", ["-l", phpFile]);
    assert.match(lint.stdout, /No syntax errors detected/);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("ok: operational publication preflight contracts");
