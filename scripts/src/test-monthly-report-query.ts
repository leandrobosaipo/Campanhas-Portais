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
} from "../../artifacts/api-server/src/lib/monthly-evidence-report-query.ts";

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
    limit: 12,
  });
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
