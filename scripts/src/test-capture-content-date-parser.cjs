"use strict";

const assert = require("node:assert/strict");
const {
  parseIsoLikeDate,
  evaluateContentTimeline,
  evaluateRetroContentProof,
} = require("./capture-insertion-proof.cjs");

assert.equal(
  parseIsoLikeDate("10/07/2026")?.toISOString(),
  "2026-07-10T04:00:00.000Z",
  "data brasileira sem hora deve ser interpretada como DD/MM/AAAA",
);

assert.equal(
  parseIsoLikeDate("10/07/2026 às 18:31")?.toISOString(),
  "2026-07-10T22:31:00.000Z",
  "data brasileira com hora deve preservar o horário local",
);

assert.equal(
  parseIsoLikeDate("31/02/2026"),
  null,
  "data brasileira impossível deve ser recusada",
);

assert.equal(
  evaluateContentTimeline(["10/07/2026"], "2026-07-10T20:31").ok,
  true,
  "a própria data da captura não pode virar outubro por ambiguidade",
);

assert.equal(
  evaluateContentTimeline(["11/07/2026"], "2026-07-10T20:31").ok,
  false,
  "uma data realmente futura deve continuar bloqueada",
);

assert.equal(
  evaluateContentTimeline([], "2026-07-10T20:31").ok,
  false,
  "amostra editorial vazia deve reprovar",
);

const expectedPosts = [
  { id: 1, url: "https://portal.test/noticia-a/", date: "2026-07-10T18:00:00" },
  { id: 2, url: "https://portal.test/noticia-b/", date: "2026-07-10T17:00:00" },
  { id: 3, url: "https://portal.test/noticia-c/", date: "2026-07-10T16:00:00" },
];
const editorialSamples = expectedPosts.map((item) => ({ title: `Notícia ${item.id}`, url: item.url, date: item.date }));

assert.equal(
  evaluateRetroContentProof({
    requestedCaptureAt: "2026-07-10T20:31",
    pageType: "home",
    previewActive: true,
    editorialSamples,
    expectedPosts,
    minimumRequired: 3,
  }).status,
  "approved",
  "home com três notícias históricas correspondentes deve aprovar",
);

assert.equal(
  evaluateRetroContentProof({
    requestedCaptureAt: "2026-07-10T20:31",
    pageType: "home",
    previewActive: false,
    editorialSamples,
    expectedPosts,
    minimumRequired: 3,
  }).issues.some((issue) => issue.code === "retro_preview_not_active"),
  true,
  "preview sem assinatura confirmada deve reprovar",
);

assert.equal(
  evaluateRetroContentProof({
    requestedCaptureAt: "2026-07-10T20:31",
    pageType: "home",
    previewActive: true,
    editorialSamples: editorialSamples.slice(0, 2),
    expectedPosts,
    minimumRequired: 3,
  }).issues.some((issue) => issue.code === "retro_content_expected_mismatch"),
  true,
  "cabeçalho correto sem o mínimo de notícias esperadas deve reprovar",
);

assert.equal(
  evaluateRetroContentProof({
    requestedCaptureAt: "2026-07-10T20:31",
    pageType: "home",
    previewActive: false,
    reconstructed: true,
    editorialSamples,
    expectedPosts,
    minimumRequired: 3,
  }).issues.some((issue) => issue.code === "retro_reconstruction_failed"),
  true,
  "reconstrução sem manifesto deve reprovar",
);

console.log("capture_content_date_parser_ok");
