import assert from "node:assert/strict";
import test from "node:test";
import {
  type CampaignOperationMatchCandidate,
  isFormatCompatible,
  selectBestAdopsMatch,
} from "../../artifacts/api-server/src/lib/campaign-operations-matching";

function row(localFormato: string) {
  return {
    piCodigo: "PI TESTE",
    blockSite: "ROO",
    localFormato,
    localFormatoNormalizado: localFormato,
    periodoInicio: "2026-07-20",
    periodoFim: "2026-07-31",
  };
}

function insertion(overrides: Partial<CampaignOperationMatchCandidate>): CampaignOperationMatchCandidate {
  return {
    id: 1,
    localFormato: "HOME 1",
    localFormatoNormalizado: "HOME 1",
    periodoInicio: "2026-07-20",
    periodoFim: "2026-07-31",
    statusNormalizado: "publicado",
    bannerPublicadoNoSite: true,
    mediaUrl: "https://cdn.example.test/banner.gif",
    ...overrides,
  };
}

test("aceita abreviacoes comerciais da planilha", () => {
  assert.equal(isFormatCompatible("HOME 1", "MEGABANNER HOME 1"), true);
  assert.equal(isFormatCompatible("INTERNO", "INTERNO DE NOTICIAS"), true);
  assert.equal(isFormatCompatible("LATERAL 02 — SIDEBAR — 300x250", "LATERAL 02"), true);
});

test("prefere a referencia mais nova somente quando duplicatas operacionais sao identicas", () => {
  const antiga = insertion({
    id: 1855,
    localFormato: "LATERAL 02",
    localFormatoNormalizado: "LATERAL 02",
    mediaUrl: "https://cdn.example.test/lateral.gif",
  });
  const canonica = insertion({
    id: 1941,
    localFormato: "LATERAL 02 — SIDEBAR — 300x250",
    localFormatoNormalizado: "LATERAL 02",
    mediaUrl: "https://cdn.example.test/lateral.gif",
  });
  const result = selectBestAdopsMatch(row("LATERAL 02 — SIDEBAR — 300x250"), [antiga, canonica]);
  assert.equal(result.insertion?.id, 1941);
});

test("mantem ambiguidade quando duplicatas empatadas apontam para midias diferentes", () => {
  const primeira = insertion({ id: 1855, localFormatoNormalizado: "LATERAL 02", mediaUrl: "https://cdn.example.test/a.gif" });
  const segunda = insertion({ id: 1941, localFormatoNormalizado: "LATERAL 02", mediaUrl: "https://cdn.example.test/b.gif" });
  const result = selectBestAdopsMatch(row("LATERAL 02 — SIDEBAR — 300x250"), [primeira, segunda]);
  assert.equal(result.insertion, null);
});

test("prioriza insercao publicada em vez de duplicata cancelada", () => {
  const canceled = insertion({ id: 1807, statusNormalizado: "cancelado", mediaUrl: null, bannerPublicadoNoSite: false });
  const published = insertion({ id: 1812, localFormatoNormalizado: "MEGABANNER HOME 1" });
  const result = selectBestAdopsMatch(row("HOME 1"), [canceled, published]);
  assert.equal(result.insertion?.id, 1812);
});

test("resolve INTERNO para a insercao canonica publicada", () => {
  const canceled = insertion({ id: 1810, localFormatoNormalizado: "INTERNO", statusNormalizado: "cancelado", mediaUrl: null, bannerPublicadoNoSite: false });
  const published = insertion({ id: 1818, localFormatoNormalizado: "INTERNO DE NOTICIAS" });
  const result = selectBestAdopsMatch(row("INTERNO"), [canceled, published]);
  assert.equal(result.insertion?.id, 1818);
});
