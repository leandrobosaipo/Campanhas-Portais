import assert from "node:assert/strict";
import test from "node:test";
import {
  type CampaignOperationMatchCandidate,
  isFormatCompatible,
  selectBestAdopsMatch,
} from "../../artifacts/api-server/src/lib/campaign-operations-matching";
import { resolveCampaignPlacementCode } from "../../artifacts/api-server/src/lib/campaign-placement";

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
  assert.equal(isFormatCompatible("MEGABANNER HOME 1", "HOME 1"), true);
  assert.equal(isFormatCompatible("MEGABANNER HOME 1", "HOME 2"), false);
  assert.equal(isFormatCompatible("INTERNO", "INTERNO DE NOTICIAS"), true);
});

test("posição canônica é estável entre labels operacionais", () => {
  assert.equal(resolveCampaignPlacementCode("MEGA BANNER HOME 1"), "home_1");
  assert.equal(resolveCampaignPlacementCode("HOME 1"), "home_1");
  assert.equal(resolveCampaignPlacementCode("MEGABANNER TOPO"), "top");
  assert.equal(resolveCampaignPlacementCode("INTERNO DE NOTÍCIAS"), "article_internal");
  assert.equal(isFormatCompatible("HOME 1", "MEGABANNER HOME 2"), false);
});

test("mantem a insercao canonica apos a sincronizacao normalizar HOME 1", () => {
  const published = insertion({ id: 1854, localFormatoNormalizado: "HOME 1" });
  const result = selectBestAdopsMatch(row("MEGABANNER HOME 1"), [published]);
  assert.equal(result.insertion?.id, 1854);
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
