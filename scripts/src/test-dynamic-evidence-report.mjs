import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { renderDynamicEvidenceReport } from "./build-dynamic-evidence-report.mjs";

const html = renderDynamicEvidenceReport();

test("gera uma casca pequena sem registros incorporados", () => {
  assert.ok(html.length < 80_000, `HTML inicial inesperadamente grande: ${html.length}`);
  assert.doesNotMatch(html, /"insertions"\s*:\s*\[/);
  assert.match(html, /\/api\/reports\/evidences\/monthly/);
});

test("abre no mes corrente de Cuiaba e nao persiste mes antigo", () => {
  assert.match(html, /timeZone:\s*['"]America\/Cuiaba['"]/);
  assert.match(html, /id="monthFilter"[^>]*type="month"/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
});

test("usa validacao de mes compativel com o publicador do sites-index", () => {
  assert.match(html, /\[0-9\]\{4\}/);
  assert.doesNotMatch(html, /\\d\{4\}/);
});

test("preserva filtros, URL, modais, acessibilidade e paginação", () => {
  for (const marker of [
    'id="campaignSearch"',
    'id="portalFilter"',
    'id="publicationFilter"',
    'id="evidenceFilter"',
    'id="filterPanel"',
    'id="evidenceModal"',
    'id="mediaModal"',
    'id="operationsPanel"',
    'data-operations-section="routine"',
    'data-operations-section="sources"',
    'data-operations-section="agenda"',
    'id="campaignPackage"',
    'Abrir no AdOps',
    'id="loadMore"',
    "history.replaceState",
    "aria-live=\"polite\"",
    "@media \\(max-width:760px\\)",
  ]) assert.match(html, new RegExp(marker));
});

test("preserva o layout antigo com logos, miniaturas e ZIP por campanha", () => {
  for (const marker of [
    "desktop-report-filters",
    "mobile-toolbar",
    "class=\"brand\"",
    "siteLogoUrl",
    "campaign-downloads",
    "Baixar ZIP desta campanha",
    "evidence-section",
    "thumbs evidence-track",
    "latest-label",
    "evidenceDownloadUrl",
    "imageMaxWidth=1600",
  ]) assert.match(html, new RegExp(marker));
  assert.match(html, /\.thumb img\s*\{/);
  assert.match(html, /\.brand img/);
  assert.match(html, /min-height:\s*44px/);
});

test("cancela resposta antiga e carrega imagens somente quando necessário", () => {
  assert.match(html, /AbortController/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /requestSequence/);
  assert.match(html, /\[hidden\]\{display:none!important\}/);
});

test("JavaScript inline permanece sintaticamente valido", () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});
