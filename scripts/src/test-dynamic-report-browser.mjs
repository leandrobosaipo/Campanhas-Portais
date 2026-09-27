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
    evidenceDays: [
      { date: "2026-09-01", status: "audited", evidenceId: 44, verifiedAt: "2026-09-01T12:00:00.000Z", url: "https://example.com/evidence.jpg?v=1" },
      { date: "2026-09-02", status: "reconstruction", technicalStatus: "audited", evidenceId: 45, verifiedAt: "2026-09-02T13:00:00.000Z", url: "https://example.com/reconstruction.jpg?v=2" },
    ],
  }],
};

test("Chrome real renderiza a resposta dinâmica da API", async () => {
  const requestMethods = [];
  const reportRequests = [];
  const operationRequests = [];
  let rawJobListRequested = false;
  const firstPage = Array.from({ length: 12 }, (_, index) => ({
    ...monthlyPayload.items[0],
    id: 1901 + index,
    campanhaId: 1001 + index,
    campanhaName: index === 0 ? "Campanha dinâmica" : `Campanha ${1001 + index}`,
    evidenceDays: index === 0 ? monthlyPayload.items[0].evidenceDays : [],
  }));
  const secondPage = Array.from({ length: 11 }, (_, index) => ({
    ...monthlyPayload.items[0], id: 2000 + index, campanhaId: 2000 + index,
    campanhaName: `Campanha ${2000 + index}`, evidenceDays: [],
  }));
  secondPage.unshift(firstPage[0]);
  const thirdPage = [3217, 3218].map((id) => ({ ...monthlyPayload.items[0], id, campanhaId: id, campanhaName: `Campanha ${id}`, evidenceDays: [] }));
  let failSecondPageOnce = true;
  const server = createServer((request, response) => {
    requestMethods.push(request.method);
    const requestUrl = new URL(request.url, "http://localhost");
    response.setHeader("access-control-allow-origin", "*");
    if (requestUrl.pathname === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(renderDynamicEvidenceReport().replace(
        "const API_BASE = 'https://adops-api-public.leandro471.workers.dev'",
        `const API_BASE = 'http://127.0.0.1:${server.address().port}'`,
      ).replace(
        "const REPORT_API_BASE = 'https://adops-api.codigo5.com.br'",
        `const REPORT_API_BASE = 'http://127.0.0.1:${server.address().port}'`,
      ).replace(
        "const EVIDENCE_API_BASE = 'https://adops-api.codigo5.com.br'",
        `const EVIDENCE_API_BASE = 'http://127.0.0.1:${server.address().port}'`,
      ).replace(
        "</body>",
        '<script>const status=document.querySelector("#statusMessage");new MutationObserver(()=>{if(status.classList.contains("bad")&&status.textContent.includes("incompleta")){document.body.dataset.partialCardsOnError=document.querySelectorAll(".campaign").length;setTimeout(()=>document.querySelector("#refreshButton").click(),0)}}).observe(status,{attributes:true,childList:true,subtree:true});setTimeout(()=>{const click=()=>{const thumb=document.querySelector(".evidence-day");if(thumb){thumb.click();setTimeout(()=>{document.body.dataset.campaignCards=document.querySelectorAll(".campaign").length;document.body.dataset.hasReconstructionOverlay=!!document.querySelector(".reconstruction-label");document.body.dataset.hasSeparateReconstructionNote=!!document.querySelector(".thumb-status");document.body.dataset.modalHasReconstructionStatus=document.querySelector("#evidenceDetails")?.textContent.includes("reconstruída")},500)}else setTimeout(click,100)};click()},500)</script></body>',
      ));
      return;
    }
    response.setHeader("content-type", "application/json");
    if (request.url.startsWith("/api/reports/evidences/monthly")) {
      const url = new URL(request.url, "http://localhost");
      reportRequests.push(url);
      const cursor = url.searchParams.get("cursor");
      if (cursor === "12" && failSecondPageOnce) {
        failSecondPageOnce = false;
        response.statusCode = 503;
        response.end("temporary page failure");
        return;
      }
      const page = cursor === "12" ? secondPage : cursor === "24" ? thirdPage : firstPage;
      response.end(JSON.stringify({ ...monthlyPayload, items: page, summary: { ...monthlyPayload.summary, campaigns: 25 }, pagination: { total: 25, nextCursor: cursor === "24" ? null : cursor === "12" ? "24" : "12" } }));
    }
    else if (requestUrl.pathname === "/api/ops/jobs") {
      rawJobListRequested = true;
      response.end(JSON.stringify({ items: [] }));
    }
    else if (requestUrl.pathname === "/api/ops/daily-print-status") {
      operationRequests.push(requestUrl);
      response.end(JSON.stringify({ lastAttempt: { jobId: "daily-job-1", status: "partial", targetDate: "2026-09-26", approved: 1, expected: 3, missing: 1, invalid: 0, summary: "Último lote diário: partial · 1 auditados · 1 bloqueados · 0 falhas" } }));
    }
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
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=8000", "--dump-dom", `http://127.0.0.1:${port}/?mes=2026-09&publication=active&portal=OMT&q=Campanha`],
      { timeout: 15_000, maxBuffer: 2_000_000 },
    );
    assert.match(stdout, /Campanha dinâmica/);
    assert.match(stdout, /Campanha 3217/);
    assert.match(stdout, /id="metricCampaigns">25</);
    assert.match(stdout, /Último lote diário/);
    assert.match(stdout, /2026-09-26/);
    assert.match(stdout, /1 auditados/);
    assert.match(stdout, /1 bloqueados/);
    assert.match(stdout, /Dados completos consultados diretamente da API AdOps/);
    assert.match(stdout, /Campanha pendente/);
    assert.match(stdout, /Conferir pendências/);
    assert.match(stdout, /alt="Evidência 1901 2026-09-02"/);
    assert.match(stdout, /data-has-reconstruction-overlay="false"/);
    assert.match(stdout, /data-has-separate-reconstruction-note="true"/);
    assert.match(stdout, /data-modal-has-reconstruction-status="true"/);
    assert.match(stdout, /data-partial-cards-on-error="0"/);
    assert.match(stdout, /data-campaign-cards="25"/);
    assert.ok((stdout.match(/adopsEvidenceVersion=45-2026-09-02T13%3A00%3A00.000Z-2/g) || []).length >= 2, "miniatura e modal devem usar a mesma versão da evidência reconstruída");
    assert.equal(reportRequests.length, 5, "todas as páginas devem ser carregadas automaticamente e uma falha deve permitir tentar de novo");
    assert.equal(operationRequests.length, 1);
    assert.equal(operationRequests[0].searchParams.get("date"), null);
    assert.equal(rawJobListRequested, false);
    assert.deepEqual(reportRequests.map((url) => url.searchParams.get("cursor")), [null, "12", null, "12", "24"]);
    assert.ok(reportRequests.every((url) => url.searchParams.get("month") === "2026-09" && url.searchParams.get("publication") === "active" && url.searchParams.get("portal") === "OMT" && url.searchParams.get("search") === "Campanha"), "filtros devem ser preservados em cada página");
    assert.deepEqual([...new Set(requestMethods)], ["GET"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("mostra login explícito em HTTP 401 e preserva os filtros", async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(renderDynamicEvidenceReport().replaceAll(
        "https://adops-api.codigo5.com.br",
        `http://127.0.0.1:${server.address().port}`,
      ));
      return;
    }
    response.setHeader("content-type", "application/json");
    response.statusCode = url.pathname === "/api/reports/evidences/monthly" ? 401 : 200;
    response.end(JSON.stringify({ error: "authentication_required" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const { stdout } = await execFileAsync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=2000", "--dump-dom", `http://127.0.0.1:${port}/?mes=2026-09&publication=active&portal=OMT&q=Campanha`],
      { timeout: 15_000, maxBuffer: 2_000_000 },
    );
    assert.match(stdout, /Sessão AdOps necessária/);
    assert.match(stdout, /id="reportLoginLink"/);
    const href = stdout.match(/id="reportLoginLink" href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    assert.ok(href);
    const login = new URL(href);
    const next = new URL(login.searchParams.get("next"));
    assert.equal(login.pathname, "/api/auth/google/login");
    assert.equal(next.searchParams.get("publication"), "active");
    assert.equal(next.searchParams.get("portal"), "OMT");
    assert.equal(next.searchParams.get("q"), "Campanha");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("consulta mensal pública funciona sem credenciais quando a API permite origem wildcard", async () => {
  const apiServer = createServer((request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("content-type", "application/json");
    if (new URL(request.url, "http://localhost").pathname === "/api/reports/evidences/monthly") {
      response.end(JSON.stringify(monthlyPayload));
      return;
    }
    response.end(JSON.stringify({ items: [], sheet: {}, driveInventory: {}, upcomingItems: [] }));
  });
  await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  const pageServer = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(renderDynamicEvidenceReport().replaceAll(
      "https://adops-api.codigo5.com.br", apiBase,
    ).replaceAll("https://adops-api-public.leandro471.workers.dev", apiBase));
  });
  await new Promise((resolve) => pageServer.listen(0, "127.0.0.1", resolve));
  try {
    const port = pageServer.address().port;
    const { stdout } = await execFileAsync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=3000", "--dump-dom", `http://127.0.0.1:${port}/`],
      { timeout: 15_000, maxBuffer: 2_000_000 },
    );
    assert.ok(
      stdout.includes("Campanha dinâmica"),
      `a lista pública deve carregar; erro observado: ${stdout.match(/Consulta incompleta[^<]*/)?.[0] ?? "nenhum texto de erro"}`,
    );
    assert.match(stdout, /Dados completos consultados diretamente da API AdOps/);
  } finally {
    pageServer.closeAllConnections();
    apiServer.closeAllConnections();
    await Promise.all([pageServer, apiServer].map(server => new Promise(resolve => server.close(resolve))));
  }
});

test("mostra causa de pendência somente quando lote confirma a mesma data e inserção", async () => {
  const item = {
    ...monthlyPayload.items[0], id: 1901, mediaUrl: null, bannerPublicadoNoSite: false,
    statusNormalizado: "rascunho", publicationStates: ["ended"], evidenceStates: ["missing"],
    evidenceDays: [
      { date: "2026-09-01", status: "missing", technicalStatus: "missing" },
      { date: "2026-09-03", status: "missing", technicalStatus: "missing" },
    ],
  };
  const secondItem = {
    ...monthlyPayload.items[0], id: 1902, campanhaId: 1002, campanhaName: "Outra inserção pendente",
    mediaUrl: "https://example.com/banner.gif", adrotateGroupId: null, bannerPublicadoNoSite: false,
    publicationStates: ["not_published"], evidenceStates: ["invalid", "documentary_pending"],
    evidenceDays: [{ date: "2026-09-02", status: "invalid", technicalStatus: "invalid" }],
  };
  const observedDailyStatusDates = [];
  let rawJobListRequested = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(renderDynamicEvidenceReport().replaceAll(
        "https://adops-api.codigo5.com.br", `http://127.0.0.1:${server.address().port}`,
      ).replaceAll(
        "https://adops-api-public.leandro471.workers.dev", `http://127.0.0.1:${server.address().port}`,
      ));
      return;
    }
    if (url.pathname === "/api/reports/evidences/monthly") {
      response.end(JSON.stringify({ ...monthlyPayload, items: [item, secondItem], pagination: { total: 2, nextCursor: null } }));
      return;
    }
    if (url.pathname === "/api/ops/jobs") {
      rawJobListRequested = true;
      response.end(JSON.stringify({ items: [] }));
      return;
    }
    if (url.pathname === "/api/ops/daily-print-status") {
      const date = url.searchParams.get("date") || "latest";
      observedDailyStatusDates.push(date);
      const failedInsertionIds = date === "2026-09-01" || date === "2026-09-03" ? [1901] : [];
      response.end(JSON.stringify({
        lastAttempt: { jobId: "safe-job-id", targetDate: "2026-09-27", status: "completed", expected: 2, approved: 2, missing: 0, invalid: 0, summary: "Rotina concluída" },
        recentAttempts: ["2026-09-01", "2026-09-03"].map(targetDate => ({
          jobId: "safe-job-id", targetDate, status: "failed", errorCode: "audit_incomplete", failedInsertionIds: [1901],
          insertionOutcomes: [{
            insertionId: 1901, targetDate, status: "blocked",
            reasonCode: targetDate === "2026-09-01" ? "drive_media_not_linked" : "expected_media_not_observed",
          }],
        })),
      }));
      return;
    }
    response.end(JSON.stringify({ sheet: {}, driveInventory: {}, upcomingItems: [], items: [] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const { stdout } = await execFileAsync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=2500", "--dump-dom", `http://127.0.0.1:${port}/?mes=2026-09`],
      { timeout: 15_000, maxBuffer: 2_000_000 },
    );
    assert.match(stdout, /2026-09-01: bloqueado — mídia encontrada no Drive, mas não vinculada no AdOps/);
    assert.match(stdout, /Mídia não vinculada ao AdOps/);
    assert.match(stdout, /Grupo AdRotate não resolvido para este formato/);
    assert.match(stdout, /AdOps não marca publicação confirmada/);
    assert.match(stdout, /causa do cron não confirmada no histórico recente/);
    assert.match(stdout, /auditoria reprovada/);
    assert.match(stdout, /Comprovação documental pendente/);
    assert.match(stdout, /2026-09-03: bloqueado — mídia esperada não observada no portal/);
    assert.doesNotMatch(stdout, /private runtime detail/);
    assert.equal(rawJobListRequested, false, "o relatório não deve baixar payload/result brutos de jobs");
    assert.deepEqual([...new Set(observedDailyStatusDates)], ["latest"]);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("encerra consulta pendurada, não mostra resultado parcial e libera Atualizar", async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(renderDynamicEvidenceReport().replace(
        "https://adops-api.codigo5.com.br",
        `http://127.0.0.1:${server.address().port}`,
      ).replace(
        "const REPORT_LOAD_TIMEOUT_MS = 90_000;",
        "const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(new URL(input,location.href).pathname==='/api/reports/evidences/monthly')return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));return nativeFetch(input,init)};const REPORT_LOAD_TIMEOUT_MS = 50;",
      ).replace(
        "</body>",
        '<script>new MutationObserver(()=>{const s=document.querySelector("#statusMessage");if(s.textContent.includes("excedeu 90 segundos")){document.body.dataset.refreshEnabled=String(!document.querySelector("#refreshButton").disabled);document.body.dataset.partialCampaignCount=String(document.querySelectorAll(".campaign").length)}}).observe(document.querySelector("#statusMessage"),{childList:true,subtree:true,characterData:true})</script></body>',
      ));
      return;
    }
    response.statusCode = 200;
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const { stdout } = await execFileAsync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=1000", "--dump-dom", `http://127.0.0.1:${port}/?mes=2026-09&publication=active`],
      { timeout: 15_000, maxBuffer: 2_000_000 },
    );
    assert.match(stdout, /consulta completa excedeu 90 segundos/);
    assert.match(stdout, /data-refresh-enabled="true"/);
    assert.match(stdout, /data-partial-campaign-count="0"/);
    assert.match(stdout, /A lista não foi carregada por completo/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
