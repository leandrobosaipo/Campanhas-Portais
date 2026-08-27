import assert from "node:assert/strict";
import test from "node:test";
import {
  type CampaignOperationMatchCandidate,
  findDuplicateCampaignInsertions,
  findCampaignIdentityMatches,
  isFormatCompatible,
  isInactiveInsertionStatus,
  normalizeCampaignPiIdentity,
  selectBestAdopsMatch,
} from "../../artifacts/api-server/src/lib/campaign-operations-matching";

test("duplicata cancelada deixa de ser bloqueio operacional", () => {
  assert.equal(isInactiveInsertionStatus("cancelado"), true);
  assert.equal(isInactiveInsertionStatus("rascunho"), false);
});

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

test("associa PI sem numero somente por portal, campanha e periodo exatos", () => {
  const candidates = [
    { ...insertion({ id: 1944 }), campaignName: "RADAR", piCodigo: "PI - TCE", siteSigla: "PERRENGUE" },
    { ...insertion({ id: 1940 }), campaignName: "RADAR", piCodigo: "PI 17190 - TCE", siteSigla: "OMT" },
  ];
  const matches = findCampaignIdentityMatches({
    piCodigo: "PI - TCE",
    campaignName: "RADAR",
    blockSite: "PERRENGUE",
    periodoInicio: "2026-07-20",
    periodoFim: "2026-07-31",
  }, candidates);
  assert.deepEqual(matches.map((candidate) => candidate.id), [1944]);
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

test("prefere POP UP publicado em vez de duplicata detalhada em rascunho", () => {
  const published = insertion({
    id: 1861,
    localFormato: "POP UP",
    localFormatoNormalizado: "POP UP",
    periodoInicio: "2026-08-09",
    periodoFim: "2026-08-31",
    statusNormalizado: "em_veiculacao",
    bannerPublicadoNoSite: true,
    mediaUrl: "https://cdn.example.test/970x90-almt.gif",
  });
  const duplicateDraft = insertion({
    id: 2193,
    localFormato: "POP UP — SITEWIDE — 970x90",
    localFormatoNormalizado: "POP UP — SITEWIDE — 970x90",
    periodoInicio: "2026-08-09",
    periodoFim: "2026-08-31",
    statusNormalizado: "rascunho",
    bannerPublicadoNoSite: false,
    mediaUrl: null,
  });
  const result = selectBestAdopsMatch({
    localFormato: "POP UP — SITEWIDE — 970x90",
    periodoInicio: "2026-08-09",
    periodoFim: "2026-08-31",
  }, [published, duplicateDraft]);
  assert.equal(result.compatible.length, 2);
  assert.equal(result.insertion?.id, 1861);
});

test("prefere as tres insercoes publicadas da PI 90892 aos rascunhos detalhados", () => {
  const cases = [
    {
      sheet: "MEGABANNER TOPO — HEADER — 825x120",
      publishedFormat: "MEGABANNER TOPO",
      publishedId: 1843,
      draftId: 2188,
    },
    {
      sheet: "VIDEO — LATERAL 01 — SIDEBAR — 300x250",
      publishedFormat: "VIDEO",
      publishedId: 1844,
      draftId: 2190,
    },
  ];

  for (const item of cases) {
    const published = insertion({
      id: item.publishedId,
      localFormato: item.publishedFormat,
      localFormatoNormalizado: item.publishedFormat,
      periodoInicio: "2026-08-01",
      periodoFim: "2026-08-12",
      statusNormalizado: "publicado",
      bannerPublicadoNoSite: true,
      mediaUrl: `https://cdn.example.test/${item.publishedId}.gif`,
    });
    const duplicateDraft = insertion({
      id: item.draftId,
      localFormato: item.sheet,
      localFormatoNormalizado: item.sheet,
      periodoInicio: "2026-08-01",
      periodoFim: "2026-08-12",
      statusNormalizado: "print_gerado",
      bannerPublicadoNoSite: false,
      mediaUrl: null,
    });
    const result = selectBestAdopsMatch({
      localFormato: item.sheet,
      periodoInicio: "2026-08-01",
      periodoFim: "2026-08-12",
    }, [published, duplicateDraft]);

    assert.equal(result.compatible.length, 2, item.sheet);
    assert.equal(result.insertion?.id, item.publishedId, item.sheet);
  }
});

test("prefere a variante publicada com HEADER e dimensoes quando a PI possui alias legado tambem publicado", () => {
  const legacy = insertion({
    id: 1827,
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-08-01",
    periodoFim: "2026-08-22",
    mediaUrl: "https://cdn.example.test/legacy.gif",
  });
  const header = insertion({
    id: 2186,
    localFormato: "MEGABANNER TOPO — HEADER — 825x120",
    localFormatoNormalizado: "Megabanner Topo — Header — 825x120",
    periodoInicio: "2026-08-01",
    periodoFim: "2026-08-22",
    mediaUrl: "https://cdn.example.test/header.gif",
  });
  const result = selectBestAdopsMatch({
    localFormato: "MEGABANNER TOPO — HEADER — 825x120",
    periodoInicio: "2026-08-01",
    periodoFim: "2026-08-22",
  }, [legacy, header]);
  assert.equal(result.insertion?.id, 2186);
});

test("prefere a insercao OMT publicada da PI 742 ao rascunho duplicado", () => {
  const published = insertion({
    id: 1840,
    localFormato: "TOPO",
    localFormatoNormalizado: "TOPO",
    periodoInicio: "2026-07-31",
    periodoFim: "2026-08-09",
    statusNormalizado: "publicado",
    bannerPublicadoNoSite: true,
    mediaUrl: "https://cdn.example.test/pi-742.gif",
  });
  const duplicateDraft = insertion({
    id: 1852,
    localFormato: "MEGABANNER TOPO",
    localFormatoNormalizado: "MEGABANNER TOPO",
    periodoInicio: "2026-07-31",
    periodoFim: "2026-08-09",
    statusNormalizado: "print_gerado",
    bannerPublicadoNoSite: false,
    mediaUrl: null,
  });
  const result = selectBestAdopsMatch({
    localFormato: "MEGABANNER TOPO",
    periodoInicio: "2026-07-31",
    periodoFim: "2026-08-09",
  }, [published, duplicateDraft]);

  assert.equal(result.compatible.length, 2);
  assert.equal(result.insertion?.id, 1840);
});

test("nao mistura outra variante POP UP com o SITEWIDE 970x90", () => {
  assert.equal(isFormatCompatible("POP UP — SITEWIDE — 970x90", "POP UP MOBILE"), false);
  assert.equal(isFormatCompatible("POP UP — SITEWIDE — 970x90", "POP UP 300x250"), false);
});

test("nao amplia aliases de topo e video para outras posicoes", () => {
  assert.equal(isFormatCompatible("TOPO", "TOPO LATERAL"), false);
  assert.equal(isFormatCompatible("VIDEO", "VIDEO MOBILE"), false);
  assert.equal(isFormatCompatible("TOPO", "MEGABANNER TOPO — HEADER — 825x120"), false);
});

test("seleciona PNMT DENGUE #1839 e descarta rascunho ou cancelada", () => {
  const canonical = insertion({
    id: 1839, localFormato: "HOME 1", localFormatoNormalizado: "HOME 1",
    periodoInicio: "2026-08-03", periodoFim: "2026-08-17",
    statusNormalizado: "finalizado", bannerPublicadoNoSite: true,
    mediaUrl: "https://cdn.example.test/dengue.gif",
  });
  const draft = insertion({
    id: 2400, periodoInicio: "2026-08-03", periodoFim: "2026-08-17",
    statusNormalizado: "rascunho", bannerPublicadoNoSite: false, mediaUrl: null,
  });
  const canceled = insertion({
    id: 1826, periodoInicio: "2026-08-03", periodoFim: "2026-08-17",
    statusNormalizado: "cancelado", bannerPublicadoNoSite: false, mediaUrl: null,
  });
  const result = selectBestAdopsMatch({ localFormato: "HOME 1", periodoInicio: "2026-08-03", periodoFim: "2026-08-17" }, [draft, canceled, canonical]);
  assert.equal(result.insertion?.id, 1839);
});

test("normaliza variantes textuais da PI 91159", () => {
  for (const value of ["91159", "PI 91159", "PI 91159 - PREF PVA"]) {
    assert.equal(normalizeCampaignPiIdentity(value), "91159");
  }
});

test("detecta duplicidade por PI portal formato e periodo", () => {
  const candidates = [
    { ...insertion({ id: 2693 }), piCodigo: "91159", siteSigla: "AFL", localFormatoNormalizado: "INTERNO DE NOTICIAS", periodoInicio: "2026-08-21", periodoFim: "2026-08-31" },
    { ...insertion({ id: 2714, mediaUrl: null, bannerPublicadoNoSite: false }), piCodigo: "PI 91159 - PREF PVA", siteSigla: "AFL", localFormatoNormalizado: "INTERNO DE NOTICIAS", periodoInicio: "2026-08-21", periodoFim: "2026-08-31" },
  ];
  assert.deepEqual(findDuplicateCampaignInsertions({ piCodigo: "PI 91159", siteSigla: "AFL", localFormato: "INTERNO DE NOTICIAS", periodoInicio: "2026-08-21", periodoFim: "2026-08-31" }, candidates).map((item) => item.id), [2693, 2714]);
});

test("nao confunde identidade completa ao variar PI, portal, formato ou periodo", () => {
  const candidate = {
    ...insertion({ id: 2693 }),
    piCodigo: "91159",
    siteSigla: "AFL",
    localFormatoNormalizado: "INTERNO DE NOTICIAS",
    periodoInicio: "2026-08-21",
    periodoFim: "2026-08-31",
  };
  const identity = {
    piCodigo: "PI 91159",
    siteSigla: "AFL",
    localFormato: "INTERNO DE NOTICIAS",
    periodoInicio: "2026-08-21",
    periodoFim: "2026-08-31",
  };

  for (const mismatch of [
    { piCodigo: "91160" },
    { siteSigla: "OMT" },
    { localFormato: "HOME 1" },
    { periodoFim: "2026-09-01" },
  ]) {
    assert.deepEqual(findDuplicateCampaignInsertions({ ...identity, ...mismatch }, [candidate]), []);
  }
});
