import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";
import { promisify } from "node:util";
import { renderDynamicEvidenceReport } from "./build-dynamic-evidence-report.mjs";

const execFileAsync = promisify(execFile);
const monthlyPayload = {
  generatedAt: "2026-09-01T12:00:00.000Z",
  summary: { campaigns: 1, insertions: 1, active: 1, notPublished: 0, pending: 0, invalid: 0 },
  portals: ["OMT"],
  pagination: { total: 1, nextCursor: null },
  items: [{
    id: 1901, campanhaId: 1001, campanhaName: "Campanha dinâmica", clienteNome: "Cliente teste",
    agenciaNome: "Agência teste", piCodigo: "PI 42059", siteSigla: "OMT",
    localFormatoNormalizado: "MEGABANNER TOPO", periodoInicio: "2026-09-01", periodoFim: "2026-09-30",
    bannerPublicadoNoSite: true, mediaUrl: null, publicationStates: ["active"], evidenceStates: ["complete"],
    evidenceDays: [{ date: "2026-09-01", status: "audited", url: "https://example.com/evidence.jpg" }],
  }],
};

test("Chrome real renderiza a resposta dinâmica da API", async () => {
  const requestMethods = [];
  const server = createServer((request, response) => {
    requestMethods.push(request.method);
    response.setHeader("access-control-allow-origin", "*");
    if (request.url === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(renderDynamicEvidenceReport().replace(
        "const API_BASE = 'https://adops-api-public.leandro471.workers.dev'",
        `const API_BASE = 'http://127.0.0.1:${server.address().port}'`,
      ).replace(
        "const REPORT_API_BASE = 'https://adops-api.codigo5.com.br'",
        `const REPORT_API_BASE = 'http://127.0.0.1:${server.address().port}'`,
      ));
      return;
    }
    response.setHeader("content-type", "application/json");
    if (request.url.startsWith("/api/reports/evidences/monthly")) response.end(JSON.stringify(monthlyPayload));
    else if (request.url === "/api/ops/daily-print-status") response.end(JSON.stringify({ lastAttempt: { status: "completed", approved: 1, expected: 1, targetDate: "2026-09-01", summary: "Rotina concluída." } }));
    else response.end(JSON.stringify({
      sheet: { name: "SETEMBRO 2026" }, driveInventory: { snapshotStatus: "fresh", itemCount: 8 }, upcomingItems: [],
      items: [{
        status: "needs_media", campaignName: "Campanha pendente", piCodigo: "PI 999", siteSigla: "OMT",
        period: { start: "2026-09-01", end: "2026-09-30" }, format: { normalized: "MEGABANNER TOPO" },
        sheetSource: { sheetName: "SETEMBRO 2026", rowNumber: 12 }, sourceIdentity: { decision: "confirmed" },
        canonicalSelection: { decision: "confirmed" }, drive: { status: "not_found", mediaFiles: [], mediaMatchesFormat: false },
        adops: { status: "matched", mediaUrl: null, publicConfirmation: "not_published" },
        publicationHealth: { status: "blocked_upstream", reason: "media_missing", expectedGroupId: 1 },
        evidenceHealth: { status: "blocked_upstream" }, requiredActions: ["locate_or_upload_media"], blockingIssues: [],
      }],
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const { stdout } = await execFileAsync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=3000", "--dump-dom", `http://127.0.0.1:${port}/`],
      { timeout: 15_000, maxBuffer: 2_000_000 },
    );
    assert.match(stdout, /Campanha dinâmica/);
    assert.match(stdout, /id="metricCampaigns">1</);
    assert.match(stdout, /Dados consultados diretamente da API AdOps/);
    assert.match(stdout, /Campanha pendente/);
    assert.match(stdout, /Conferir pendências/);
    assert.deepEqual([...new Set(requestMethods)], ["GET"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
