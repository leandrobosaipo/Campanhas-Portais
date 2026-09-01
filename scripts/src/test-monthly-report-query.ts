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
} from "../../artifacts/api-server/src/lib/monthly-evidence-report-query";

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
