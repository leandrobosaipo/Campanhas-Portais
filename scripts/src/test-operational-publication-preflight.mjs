import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const runner = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

assert.equal(runner.isRestrictedKvm8GatewaySite({ sshUser: "cod5adops", sshHost: "93.127.210.71" }), true);
assert.equal(runner.isRestrictedKvm8GatewaySite({ sshUser: "root", sshHost: "93.127.210.71" }), false);
const restrictedSnapshotRow = runner.parseRestrictedDbRows([
  Buffer.from("2310").toString("hex"),
  Buffer.from('<a href="https://example.com/?a=1&b=2">linha 1\nlinha 2\tfinal</a>').toString("hex"),
  "~",
].join("\t") + "\n", ["id", "bannercode", "nullable"]);
assert.deepEqual(restrictedSnapshotRow, [{
  id: "2310",
  bannercode: '<a href="https://example.com/?a=1&b=2">linha 1\nlinha 2\tfinal</a>',
  nullable: null,
}]);
for (const invalidHex of ["f", "gg", "ff", "e7"]) {
  assert.throws(() => runner.parseRestrictedDbRows(`${invalidHex}\n`, ["id"]), /HEX inválido|não UTF-8/);
}
const restrictedRestoreSql = runner.restrictedReplaceSql("wp_adrotate", restrictedSnapshotRow);
assert.match(restrictedRestoreSql, /^REPLACE INTO `wp_adrotate`/);
assert.match(restrictedRestoreSql, /FROM_BASE64\(0x[0-9a-f]+\)/);
assert.doesNotMatch(restrictedRestoreSql, /'/);
assert.doesNotMatch(restrictedRestoreSql, /linha 1|example\.com/);
assert.equal(runner.parseRestrictedAdrotateBaseTable("wpve_adrotate\n"), "wpve_adrotate");
assert.throws(() => runner.parseRestrictedAdrotateBaseTable(""), /uma única tabela/i);
assert.throws(() => runner.parseRestrictedAdrotateBaseTable("wp_adrotate\nwpve_adrotate\n"), /encontradas 2/i);

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
assert.deepEqual(runner.extractPdfCommercialLabels(`PI - PEDIDO DE INSERÇÃO
DMD ASSOC. ASSESSORIA E PROPAGANDA LTDA
CLIENTE PREF. MUN DE RONDONOPOLIS VEÍCULO SITE ROO NOTICIAS - CUIABÁ
RAZÃO SOCIAL PREFEITURA MUNICIPAL DE RONDONOPOLIS PRAÇA CUIABA/MT`), {
  clientName: "PREF. MUN DE RONDONOPOLIS",
  clientLegalName: null,
  clientCnpj: null,
  agencyName: "DMD ASSOC. ASSESSORIA E PROPAGANDA LTDA",
}, "layout PDF achatado deve encerrar CLIENTE antes do rótulo VEÍCULO");
assert.equal(runner.extractPdfVehicleName(
  "CLIENTE PREF. MUN DE RONDONOPOLIS VEÍCULO SITE ROO NOTICIAS - CUIABÁ",
), "SITE ROO NOTICIAS - CUIABÁ", "layout PDF achatado deve resolver também o veículo");
assert.deepEqual(runner.clientAliasCandidates("PREF. MUN DE RONDONOPOLIS"), ["Prefeitura de Rondonópolis"],
  "cliente abreviado do PDF deve resolver a entidade comercial exata");
for (const clientName of [
  "UNIMED RONDONOPOLIS",
  "CAMARA MUNICIPAL DE RONDONOPOLIS",
  "ASSOCIACAO COMERCIAL DE RONDONOPOLIS",
]) {
  assert.deepEqual(runner.clientAliasCandidates(clientName), [],
    "nome da cidade sem identidade de prefeitura não pode resolver cliente municipal");
}
for (const clientName of [
  "COMERCIO DE VEÍCULO LTDA",
  "SHOPPING PRAÇA CENTRAL",
  "CAMPANHA PERÍODO INTEGRAL",
]) {
  const source = `PI - PEDIDO DE INSERÇÃO\nCLIENTE ${clientName}`;
  assert.equal(runner.extractPdfCommercialLabels(source).clientName, clientName,
    "palavra comercial sem segundo rótulo estruturado não pode truncar o cliente");
  assert.equal(runner.extractPdfVehicleName(source), null,
    "palavra VEÍCULO dentro do nome do cliente não pode criar portal");
}
for (const source of [
  "CLIENTE ACME VEÍCULO SITE ROO VEÍCULO PORTAL O MATOGROSSENSE",
  "CLIENTE ACME VEÍCULO SITE ROO E PORTAL O MATOGROSSENSE",
  "CLIENTE COMERCIO DE VEÍCULO SITE PUBLICIDADE LTDA",
]) {
  assert.equal(runner.extractPdfVehicleName(source), null,
    "rótulo achatado ambíguo ou sem portal canônico deve falhar fechado");
}

assert.equal(runner.validateOperationalPublicationScope({
  campaignId: 970,
  insertionId: 2186,
  siteSigla: "PERRENGUE",
  identityMode: "operational_identity",
}), true);
assert.throws(() => runner.validateOperationalPublicationScope({
  campaignId: 970,
  insertionId: 2186,
  siteSigla: "ROO",
  identityMode: "operational_identity",
}), /portal ainda não suportado/i);
assert.equal(runner.validateOperationalPublicationScope({
  campaignId: 997,
  insertionId: 2310,
  siteSigla: "ROO",
  identityMode: "sheet_drive_composite",
}), true);
assert.equal(runner.validateOperationalPublicationScope({
  campaignId: 994,
  insertionId: 2278,
  siteSigla: "AFL",
  identityMode: "sheet_drive_composite",
}), true);
assert.throws(() => runner.validateOperationalPublicationScope({
  campaignId: 1,
  insertionId: 1,
  siteSigla: "OMT",
  identityMode: "sheet_drive_composite",
}), /portal ainda não suportado/i);

const operationalConfig = JSON.parse(await readFile(new URL("../../config/adrotate-sites.json", import.meta.url), "utf8"));
const objectKeyA = runner.buildSpacesImageObjectKey({
  siteSigla: "ROO",
  fields: { operationalIdentityKey: "insertion-2310", campaignName: "PRESTAÇÃO DE CONTAS" },
  raw: { periodoInicio: "2026-08-14", localFormato: "MEGABANNER TOPO" },
  sourceName: "banner-825x120.gif",
  contentHash: "a".repeat(64),
});
const objectKeyB = runner.buildSpacesImageObjectKey({
  siteSigla: "ROO",
  fields: { operationalIdentityKey: "insertion-2310", campaignName: "PRESTAÇÃO DE CONTAS" },
  raw: { periodoInicio: "2026-08-14", localFormato: "MEGABANNER TOPO" },
  sourceName: "banner-825x120.gif",
  contentHash: "b".repeat(64),
});
assert.notEqual(objectKeyA, objectKeyB, "mídias com bytes distintos precisam de object keys distintas");
assert.match(objectKeyA, /-aaaaaaaaaaaaaaaa\.gif$/);
for (const siteSigla of ["ROO", "AFL"]) {
  const mapping = operationalConfig[siteSigla].formatMappings.find((item) => item.groupId === 1);
  assert.deepEqual(mapping.operationalMediaProfile, {
    width: 825,
    height: 120,
    formats: ["GIF"],
    deliveryTransform: {
      mode: "pad-horizontal",
      sourceWidth: 820,
      sourceHeight: 120,
      targetWidth: 825,
      targetHeight: 120,
    },
  }, `${siteSigla} precisa do perfil binário contratado e da transformação explícita da peça recebida`);
}

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

const canonicalPdfInsertion = {
  siteId: 35,
  localFormato: "MEGABANNER TOPO 825X120",
  periodoInicio: "2026-08-14",
  periodoFim: "2026-08-20",
};
assert.deepEqual(runner.buildDrivePiPdfInsertions({
  siteId: canonicalPdfInsertion.siteId,
  localFormato: "MEGABANNER TOPO",
  periodo: {
    periodoInicio: canonicalPdfInsertion.periodoInicio,
    periodoFim: canonicalPdfInsertion.periodoFim,
    periodoOriginal: "14/08 - 20/08",
  },
  clickUrl: null,
}), [{
  ...canonicalPdfInsertion,
  localFormato: "MEGABANNER TOPO",
  localFormatoNormalizado: "MEGABANNER TOPO",
  periodoOriginal: "14/08 - 20/08",
  clickUrl: null,
}]);
const agentInsertionWithWrongSchedule = {
  ...canonicalPdfInsertion,
  periodoInicio: "2026-08-18",
  periodoFim: "2026-08-24",
};
const canonicalExpectedMerge = runner.mergeDrivePiFields(
  { piCodigo: "57652", competencia: "AGOSTO/2026", insertions: [agentInsertionWithWrongSchedule], raw: {} },
  { piCodigo: "57652", competencia: "AGOSTO/2026", insertions: [canonicalPdfInsertion] },
  { preferPdfInsertions: true },
);
assert.deepEqual(canonicalExpectedMerge.insertions, [canonicalPdfInsertion]);
const canonicalCommercialMerge = runner.mergeDrivePiFields(
  { piCodigo: "91085", competencia: "AGOSTO/2026", clienteId: 189, agenciaId: 85, insertions: [], raw: {} },
  { piCodigo: "91085", competencia: "AGOSTO/2026", clienteId: 160, agenciaId: 76, insertions: [] },
  { preferPdfCommercialIdentity: true },
);
assert.equal(canonicalCommercialMerge.clienteId, 160, "fluxo canônico deve preferir cliente determinístico do PDF");
assert.equal(canonicalCommercialMerge.agenciaId, 76, "fluxo canônico deve preferir agência determinística do PDF");

const advisoryMerge = runner.mergeDrivePiFields(
  { piCodigo: "57652", competencia: "AGOSTO/2026", insertions: [agentInsertionWithWrongSchedule], raw: {} },
  { piCodigo: "57652", competencia: "AGOSTO/2026", insertions: [canonicalPdfInsertion] },
);
assert.deepEqual(advisoryMerge.insertions, [agentInsertionWithWrongSchedule]);

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
  ["PI NÚMERO: 17046", "17046"],
  ["PI - 17046", "17046"],
  ["PI PEDIDO DE INSERÇÃO 17046", "17046"],
]) {
  assert.equal(runner.extractExplicitPiFromPdfText(text), expected, `deve extrair ${text}`);
}
assert.equal(runner.extractExplicitPiFromPdfText("PI - TCE"), null);
assert.deepEqual(runner.extractExplicitPisFromPdfText("PI 17046 / PI: 99999"), ["17046", "99999"]);
assert.equal(runner.extractPdfCompetencia("VEICULAÇÃO: AGOSTO/2026"), "AGOSTO/2026");
assert.equal(runner.extractPdfVehicleName("VEICULO: SITE ROO NOTÍCIAS"), "SITE ROO NOTÍCIAS");
assert.equal(runner.extractPdfVehicleName("VEICULOS: SITE ROO NOTÍCIAS"), null);
assert.equal(runner.extractPdfVehicleName("OUTRO VEICULO CADASTRADO: SITE ROO NOTÍCIAS"), null);
const z3DayHeader = `${" ".repeat(32)}${Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, " ")).join("  ")}`;
const z3Markers = Array.from({ length: z3DayHeader.length }, () => " ");
for (const [index, character] of Array.from("MEGABANNER TOPO").entries()) z3Markers[index] = character;
for (const day of [14, 15, 16, 17, 18, 19, 20]) {
  const dayIndex = z3DayHeader.indexOf(String(day));
  z3Markers[dayIndex] = "1";
}
assert.deepEqual(runner.parsePeriodoFromLayoutText(`${z3DayHeader}\n${z3Markers.join("")}`, "AGOSTO/2026"), {
  periodoInicio: "2026-08-14",
  periodoFim: "2026-08-20",
  periodoOriginal: "14/08 - 20/08",
});
const ambiguousMarkers = [...z3Markers];
for (const day of [14, 15, 16, 17, 18, 19, 20]) ambiguousMarkers[z3DayHeader.indexOf(String(day))] = " ";
for (const day of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) ambiguousMarkers[z3DayHeader.indexOf(String(day))] = "1";
assert.deepEqual(runner.parsePeriodoFromLayoutText(
  `${z3DayHeader}\n${z3Markers.join("")}\n${ambiguousMarkers.join("")}`,
  "AGOSTO/2026",
), {}, "duas linhas do mesmo formato devem bloquear em vez de escolher outro período");
assert.deepEqual(runner.parsePeriodoFromLayoutText(
  `${z3DayHeader}\n${z3Markers.join("")}\n\n${z3DayHeader}\n${ambiguousMarkers.join("")}`,
  "AGOSTO/2026",
), {}, "dois calendários em páginas ou blocos diferentes devem bloquear globalmente");
assert.deepEqual(runner.parsePeriodoFromLayoutText(
  `${z3DayHeader} ${z3DayHeader}\n${z3Markers.join("")} ${ambiguousMarkers.join("")}`,
  "AGOSTO/2026",
), {}, "dois calendários lado a lado devem bloquear por dias duplicados");
const bboxDayWords = Array.from({ length: 31 }, (_, index) => {
  const day = index + 1;
  const x = 100 + index * 12;
  return `<word xMin="${x}" yMin="100" xMax="${x + 8}" yMax="110">${day}</word>`;
}).join("");
assert.deepEqual(runner.parsePeriodoFromBboxText(
  `<page>${bboxDayWords}</page><page>${bboxDayWords}</page>`,
  "AGOSTO/2026",
), {}, "dias duplicados de páginas diferentes devem bloquear o BBox");

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
assert.deepEqual(runner.classifyGoogleDriveDownloadFailure(403, {
  error: { errors: [{ reason: "userRateLimitExceeded" }] },
}), { reason: "userRateLimitExceeded", retryable: true });
assert.deepEqual(runner.classifyGoogleDriveDownloadFailure(403, {
  error: { errors: [{ reason: "insufficientFilePermissions" }] },
}), { reason: "insufficientFilePermissions", retryable: false });
assert.equal(runner.classifyGoogleDriveDownloadFailure(429, null).retryable, true);
assert.equal(runner.classifyGoogleDriveDownloadFailure(503, null).retryable, true);
assert.match(runnerSource, /validateRestrictedAdrotateEngines[\s\S]*INNODB/, "rollback restrito precisa bloquear tabelas não transacionais");
assert.match(runnerSource, /query[\s\S]*shellEscape\(sql\)[\s\S]*--quiet[\s\S]*--skip-column-names/,
  "wp db query restrito deve suprimir mensagens informativas sem afrouxar o parser");
assert.match(runnerSource, /LOCK TABLES[\s\S]*CREATE TEMPORARY TABLE cod5_adops_current_ads[\s\S]*DELETE FROM/, "rollback restrito precisa resolver e bloquear IDs na mesma sessão");
const restrictedSnapshotSql = runner.buildRestrictedAdrotateSnapshotSql({
  tables: { ads: "wpve_adrotate", links: "wpve_adrotate_linkmeta", schedules: "wpve_adrotate_schedule" },
  columns: { ads: ["id", "title"], links: ["id", "ad", "schedule"], schedules: ["id", "name"] },
  insertionId: 2310,
  externalKey: "ADOPS-ROO-2310",
});
assert.match(restrictedSnapshotSql, /START TRANSACTION WITH CONSISTENT SNAPSHOT/,
  "snapshot restrito precisa ler os três datasets na mesma visão transacional");
assert.match(restrictedSnapshotSql, /BINARY adops_external_key=0x[0-9a-f]+/,
  "chave externa deve ser comparada em bytes, sem depender da collation do WordPress");
assert.doesNotMatch(restrictedSnapshotSql, /CONVERT\(UNHEX/);
assert.match(restrictedSnapshotSql, /HEX\(CAST\(/,
  "snapshot deve usar HEX sem quebra de linha nem função REPLACE interpretada como mutação pelo WP-CLI");
assert.doesNotMatch(restrictedSnapshotSql, /REPLACE|TO_BASE64/);
assert.doesNotMatch(restrictedSnapshotSql, /'\\[nr]'/);
assert.doesNotMatch(restrictedSnapshotSql, /'/,
  "snapshot restrito deve atravessar o gateway sem literais SQL entre aspas");
assert.equal((restrictedSnapshotSql.match(/COMMIT/g) || []).length, 1);
assert.deepEqual(runner.parseRestrictedAdrotateSnapshotOutput([
  "META\tADS\t1",
  `ADS\t${Buffer.from("7").toString("hex")}\t${Buffer.from("banner\nseguro").toString("hex")}`,
  "META\tLINKS\t1",
  `LINKS\t${Buffer.from("8").toString("hex")}\t${Buffer.from("7").toString("hex")}\t${Buffer.from("9").toString("hex")}`,
  "META\tSCHEDULES\t1",
  `SCHEDULES\t${Buffer.from("9").toString("hex")}\t~`,
].join("\n"), {
  ads: ["id", "title"],
  links: ["id", "ad", "schedule"],
  schedules: ["id", "name"],
}), {
  ads: [{ id: "7", title: "banner\nseguro" }],
  links: [{ id: "8", ad: "7", schedule: "9" }],
  schedules: [{ id: "9", name: null }],
});
assert.throws(() => runner.parseRestrictedAdrotateSnapshotOutput("", {
  ads: ["id"], links: ["id"], schedules: ["id"],
}), /incompleto para ADS/);
assert.deepEqual(runner.parseRestrictedAdrotateSnapshotOutput([
  "META\tADS\t0",
  "META\tLINKS\t0",
  "META\tSCHEDULES\t0",
].join("\n"), {
  ads: ["id"], links: ["id"], schedules: ["id"],
}), { ads: [], links: [], schedules: [] });
assert.throws(() => runner.parseRestrictedAdrotateSnapshotOutput([
  "META\tADS\t1",
  "META\tLINKS\t0",
  "META\tSCHEDULES\t0",
].join("\n"), {
  ads: ["id"], links: ["id"], schedules: ["id"],
}), /incompleto para ADS/);
assert.match(runnerSource, /insertionAfterPublish = await privateApiPatch[\s\S]*expectedUpdatedAt: payload\.publicationGuard\.expectedUpdatedAt/,
  "PATCH de publicação deve continuar o CAS iniciado pelo preflight");
assert.match(runnerSource, /expectedUpdatedAt: published\?\.insertionAfterPublish\?\.updatedAt \|\| patchedInsertion\?\.updatedAt/,
  "rollback deve usar a versão devolvida pelo PATCH final do publicador");
const adrotateConfig = JSON.parse(await readFile(new URL("../../config/adrotate-sites.json", import.meta.url), "utf8"));
for (const [groupId, width, height] of [[1, 825, 120], [9, 970, 90]]) {
  const mapping = adrotateConfig.PERRENGUE.formatMappings.find((item) => item.groupId === groupId);
  assert.deepEqual(mapping?.operationalMediaProfile, {
    width,
    height,
    formats: ["GIF"],
    ...(groupId === 1 ? {
      deliveryTransform: {
        mode: "pad-horizontal",
        sourceWidth: 820,
        sourceHeight: 120,
        targetWidth: 825,
        targetHeight: 120,
      },
    } : {}),
  },
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
  const supplied = path.join(dir, "supplied-820x120.gif");
  await execFileAsync("convert", [
    "-delay", "20", "-size", "820x120", "gradient:#0057b8-#ffffff",
    "-delay", "30", "-size", "820x120", "gradient:#ffffff-#0057b8",
    "-loop", "0", supplied,
  ]);
  const delivery = await runner.prepareOperationalDeliveryImage(supplied, {
    width: 825,
    height: 120,
    formats: ["GIF"],
    deliveryTransform: {
      mode: "pad-horizontal",
      sourceWidth: 820,
      sourceHeight: 120,
      targetWidth: 825,
      targetHeight: 120,
    },
  });
  assert.equal(delivery.transformed, true);
  assert.equal(delivery.source.width, 820);
  assert.equal(delivery.source.height, 120);
  assert.equal(delivery.metadata.width, 825);
  assert.equal(delivery.metadata.height, 120);
  assert.equal(delivery.metadata.frames, 2);
  assert.deepEqual(delivery.metadata.durations, delivery.source.durations);
  assert.equal(delivery.metadata.loop, delivery.source.loop);
  assert.match(delivery.filePath, /825x120-delivery\.gif$/);
  const deliveryBytes = await readFile(delivery.filePath);
  const deliverySha256 = crypto.createHash("sha256").update(deliveryBytes).digest("hex");
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "image/gif" });
    response.end(deliveryBytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const readback = await runner.assertOperationalMediaReadback({
      mediaUrl: `http://127.0.0.1:${address.port}/banner.gif`,
      expectedSha256: deliverySha256,
      expectedProfile: { width: 825, height: 120 },
      archivePath: delivery.filePath,
    });
    assert.equal(readback.ok, true);
    assert.equal(readback.sha256, deliverySha256);
    assert.equal(readback.metadata.frames, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await assert.rejects(() => runner.prepareOperationalDeliveryImage(supplied, {
    width: 970,
    height: 90,
    formats: ["GIF"],
    deliveryTransform: {
      mode: "pad-horizontal",
      sourceWidth: 820,
      sourceHeight: 120,
      targetWidth: 825,
      targetHeight: 120,
    },
  }), /Dimens/);
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
