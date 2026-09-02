import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.doesNotMatch(html, /localStorage/);
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
    "preview=1",
  ]) assert.match(html, new RegExp(marker));
  assert.match(html, /\.thumb img\s*\{/);
  assert.match(html, /\.brand img/);
  assert.match(html, /min-height:\s*44px/);
});

test("preserva conteúdo completo do cabeçalho, operação e modal de evidência", () => {
  for (const marker of [
    "Evidências AdOps",
    "Mais números",
    "metricAttention",
    "metricPrints",
    "Campanhas publicadas conferidas",
    "Planilha — aba do mês",
    "Próximas a entrar no ar",
    "Próximas a vencer",
    "Dia anterior",
    "Dia seguinte",
    "Detalhes da evidência",
    "Baixar JPEG",
    "Ver grupo do anúncio",
    "aria-current=\"date\"",
  ]) assert.match(html, new RegExp(marker));
  assert.match(html, /\.modal-side h2\{[^}]*margin:0 90px 8px 0/);
});

test("cancela resposta antiga e carrega imagens somente quando necessário", () => {
  assert.match(html, /AbortController/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /requestSequence/);
  assert.match(html, /\[hidden\]\{display:none!important\}/);
  assert.match(html, /day\.evidenceId\?evidenceDownloadUrl\(item,day\):''/);
  assert.match(html, /missing-evidence/);
  assert.match(html, /\.portal-head\{grid-template-columns:1fr;align-items:start\}/);
});

test("consulta dados protegidos pela sessao Google sem guardar token no HTML", () => {
  assert.match(html, /https:\/\/adops-api\.codigo5\.com\.br/);
  assert.match(html, /credentials:\s*['"]include['"]/);
  assert.match(html, /\/api\/auth\/google\/login\?next=/);
  assert.doesNotMatch(html, /OPS_API_TOKEN|GOOGLE_CLIENT_SECRET|localStorage/);
});

test("oferece captura e exclusao assincronas com progresso e contagem regressiva", () => {
  for (const marker of [
    "Gerar print desta data",
    "Excluir evidência",
    "evidenceJobProgress",
    "role=\"progressbar\"",
    "aria-valuenow",
    "progress\.percent",
    "progress\.stage",
    "sessionStorage",
    "response\.status===404",
    "Tentar novamente",
    "/capture-proof/jobs",
    "/api/evidences/",
    "Contagem regressiva",
    "nextRunAt",
  ]) assert.match(html, new RegExp(marker));
  assert.match(html, /\/api\/insertions\/'\+item\.id\+'\/capture-proof\/jobs\/'\+encodeURIComponent\(jobId\)/);
  assert.doesNotMatch(html, /\/api\/ops\/jobs\/'\+encodeURIComponent\(jobId\)+'\/progress/);
});

test("reaproveita o ZIP da campanha e mostra o andamento real", () => {
  assert.match(html, /Abrir anúncio no AdRotate/);
  assert.match(html, /Abrir grupo no AdRotate/);
  assert.match(html, /adrotate-ad-open/);
  assert.ok(html.includes("REPORT_API_BASE+'/api/pi-site-exports/jobs'"));
  assert.doesNotMatch(html, /dynamic-report:'\+crypto\.randomUUID\(\)/);
  assert.match(html, /replace\(\/\[\^A-Za-z0-9\._:-\]\+\/g,'-'\)/);
  assert.match(html, /Aguardando runner|Montando ZIP|Pacote pronto/);
});

test("JavaScript inline permanece sintaticamente valido", () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("reutiliza o JPEG preparado das miniaturas no servidor", async () => {
  const source = await readFile(new URL("../../artifacts/api-server/src/routes/insertions.ts", import.meta.url), "utf8");
  assert.match(source, /adops-evidence-preview-cache/);
  assert.match(source, /cod5_cachedOutput/);
});
