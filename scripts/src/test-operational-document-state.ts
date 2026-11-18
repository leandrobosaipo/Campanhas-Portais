import assert from "node:assert/strict";
import test from "node:test";
import { listOperationalDocuments } from "../../artifacts/api-server/src/lib/operational-documents";

test("declaração para período em andamento é minuta pendente", async () => {
  const documents = await listOperationalDocuments({
    id: 3080, campanhaName: "NOVOS TEMPOS", piCodigo: "25207719",
    clienteNome: "Câmara Municipal de Cuiabá", agenciaNome: "Genius Publicidade",
    siteSigla: "PERRENGUE", siteNome: "Perrengue Mato Grosso",
    localFormato: "LATERAL PRIMEIRA DOBRA", localFormatoNormalizado: "VIDEO",
    periodoInicio: "2026-10-09", periodoFim: "2026-10-18", competencia: "10/2026",
  }, new Date("2026-10-09T22:10:00Z"));
  const declaration = documents.find((item) => item.kind === "declaracao-execucao");
  assert.ok(declaration);
  assert.match(`${declaration.title} ${declaration.description} ${declaration.pdfFileName}`, /pendente/i);
});

test("período encerrado só vira declaração final com cobertura auditada", async () => {
  const source = {
    id: 3080, campanhaName: "NOVOS TEMPOS", piCodigo: "25207719",
    clienteNome: "Câmara Municipal de Cuiabá", agenciaNome: "Genius Publicidade",
    siteSigla: "PERRENGUE", siteNome: "Perrengue Mato Grosso",
    localFormato: "LATERAL PRIMEIRA DOBRA", localFormatoNormalizado: "VIDEO",
    periodoInicio: "2026-10-09", periodoFim: "2026-10-18", competencia: "10/2026",
  };
  const now = new Date("2026-10-19T16:00:00Z");
  const pending = await listOperationalDocuments(source, now);
  assert.match(pending.find((item) => item.kind === "declaracao-execucao")!.title, /pendente/i);
  const verified = await listOperationalDocuments({ ...source, executionVerified: true }, now);
  assert.doesNotMatch(verified.find((item) => item.kind === "declaracao-execucao")!.title, /pendente/i);
});
