import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualManifest,
  classifyManualDocument,
  extractMarkdownHeadings,
  renderTrustedMarkdown,
  validateManualSources,
  buildSafePublishCommand,
  buildSafeRollbackCommand,
} from "./adops-operational-manual-contract.mjs";

test("manifesto mantém o manual não listado e no preset corporate-base", () => {
  const manifest = buildManualManifest("2026-08-12T18:10:00.000Z");
  assert.equal(manifest.visibility, "unlisted");
  assert.equal(manifest.publication.preset, "corporate-base");
  assert.equal(manifest.publication.motion, "reduced");
  assert.equal(manifest.slug, "adops-manual-operacional");
});

test("classifica tutorial, referência, how-to e explicação sem inventar documento", () => {
  assert.equal(classifyManualDocument("docs/runbook-nova-pi-evidencias.md"), "tutorial");
  assert.equal(classifyManualDocument("docs/adops/ops-api-runbook.md"), "reference");
  assert.equal(classifyManualDocument("docs/adops/system/RUNBOOK.md"), "how-to");
  assert.equal(classifyManualDocument("docs/status-do-projeto.md"), "explanation");
});

test("renderiza markdown confiável com semântica e escapa HTML bruto", () => {
  const html = renderTrustedMarkdown("## Etapa\n\n- item\n\n```bash\ncurl /api/healthz\n```\n\n<script>alert(1)</script>");
  assert.match(html, /<h2 id="etapa">Etapa<\/h2>/);
  assert.match(html, /<ul><li>item<\/li><\/ul>/);
  assert.match(html, /<pre><code class="language-bash">curl \/api\/healthz<\/code><\/pre>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderiza tabelas de runbook de forma navegável", () => {
  const html = renderTrustedMarkdown("| Objetivo | Interface |\n|---|---|\n| Saúde | `GET /api/healthz` |");
  assert.match(html, /<div class="table-wrap"><table>/);
  assert.match(html, /<th>Objetivo<\/th>/);
  assert.match(html, /<td>Saúde<\/td>/);
  assert.match(html, /<code>GET \/api\/healthz<\/code>/);
});

test("bloqueia protocolos ativos em links Markdown", () => {
  const html = renderTrustedMarkdown("[seguro](https://codigo5.com.br) [relativo](./runbook.md) [âncora](#gate) [ruim](javascript:alert(1)) [dado](data:text/html,x)");
  assert.match(html, /href="https:\/\/codigo5\.com\.br"/);
  assert.match(html, /href="\.\/runbook\.md"/);
  assert.match(html, /href="#gate"/);
  assert.doesNotMatch(html, /javascript:|data:text/i);
  assert.match(html, /<span class="unsafe-link">ruim<\/span>/);
});

test("publicação remota restaura backup se a promoção falhar", () => {
  const command = buildSafePublishCommand({ slug: "manual", stagingName: "manual.staging", backupName: "manual.backup" });
  assert.match(command, /if ! mv -- 'manual\.staging' 'manual'/);
  assert.match(command, /mv -- 'manual\.backup' 'manual'/);
  const rollback = buildSafeRollbackCommand({ slug: "manual", backupName: "manual.backup", failedName: "manual.failed" });
  assert.match(rollback, /mv -- 'manual' 'manual\.failed'/);
  assert.match(rollback, /mv -- 'manual\.backup' 'manual'/);
  assert.throws(() => buildSafePublishCommand({ slug: "../manual", stagingName: "x", backupName: "y" }), /inválido/);
});

test("extrai títulos para navegação e valida metadados obrigatórios", () => {
  assert.deepEqual(extractMarkdownHeadings("# Título\n## Um fluxo\n### Gate final"), [
    { level: 1, text: "Título", id: "titulo" },
    { level: 2, text: "Um fluxo", id: "um-fluxo" },
    { level: 3, text: "Gate final", id: "gate-final" },
  ]);
  assert.throws(() => validateManualSources([{ path: "x.md", content: "# Sem metadados" }]), /Estado:/);
  assert.doesNotThrow(() => validateManualSources([{ path: "x.md", content: "> Estado: vigente\n> Público: equipe\n> Última validação: 2026-08-12\n> Release: 47e0dab\n> Fonte autoritativa: OpenAPI" }]));
});
