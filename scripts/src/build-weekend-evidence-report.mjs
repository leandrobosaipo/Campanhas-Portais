import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sitesConfig from "../../config/adrotate-sites.json" with { type: "json" };

const API_BASE = (process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev").replace(/\/$/, "");
const TOKEN = process.env.OPS_API_TOKEN;
const OUTPUT_DIR = resolve("docs/reports/adops-evidencias-fim-de-semana-2026-05-11");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "index.html");
const COMPETENCIA = "MAIO/2026";
const REPORT_DATES = ["2026-05-09", "2026-05-10", "2026-05-11"];
const GENERATED_AT = new Date().toISOString();

if (!TOKEN) {
  throw new Error("OPS_API_TOKEN ausente.");
}

const headers = { authorization: `Bearer ${TOKEN}` };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(n) ? n : 0);
}

function datePt(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Cuiaba" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function statusLabel(status) {
  const map = {
    audited: "auditada",
    missing: "faltante",
    invalid_audit: "inválida",
    invalid_url: "URL inválida",
    ok: "ok",
    rascunho: "rascunho",
    aguardando_publicacao: "ativa/publicada",
    concluido: "concluída",
    cancelado: "cancelada",
  };
  return map[status] || status || "-";
}

async function api(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${path} HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function portalUrl(item) {
  return sitesConfig[item.siteSigla]?.homeUrl || "#";
}

function adrotateUrl(item, relation) {
  const admin = sitesConfig[item.siteSigla]?.adminBaseUrl;
  const adId = relation?.exactLiveMatches?.[0]?.adId || relation?.historicalAdminMatches?.[0]?.adId || null;
  if (!admin || !adId) return null;
  return `${admin}/admin.php?page=adrotate&view=edit&ad=${encodeURIComponent(adId)}`;
}

function portalGroup(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = item.siteSigla || "SEM_PORTAL";
    const current = grouped.get(key) || {
      siteSigla: key,
      siteNome: item.siteNome || key,
      total: 0,
      publicadas: 0,
      rascunho: 0,
      encerradas: 0,
      valor: 0,
      evidencias: 0,
    };
    current.total += 1;
    current.valor += Number(item.valorLiquido || 0);
    current.evidencias += Number(item.totalEvidencias || 0);
    if (item.bannerPublicadoNoSite && !["concluido", "cancelado"].includes(item.statusNormalizado)) current.publicadas += 1;
    if (item.statusNormalizado === "rascunho") current.rascunho += 1;
    if (["concluido", "cancelado"].includes(item.statusNormalizado)) current.encerradas += 1;
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((a, b) => a.siteSigla.localeCompare(b.siteSigla));
}

function evidenceCard(item, statuses, relation) {
  const thumbStatuses = REPORT_DATES.map((date) => statuses[`${item.id}:${date}`]).filter(Boolean);
  const adLink = adrotateUrl(item, relation);
  const cards = thumbStatuses.map((status) => {
    const url = status.arquivoUrl || status.url || "";
    const issues = status.audit?.issues || status.issueCodes || [];
    return `
      <article class="thumb-card ${status.status === "audited" ? "ok" : "bad"}">
        <button class="thumb-button" ${url ? `data-img="${escapeHtml(url)}" data-title="${escapeHtml(`#${item.id} ${item.siteSigla} ${datePt(status.date || status.targetDate)}`)}"` : "disabled"}>
          ${url ? `<img src="${escapeHtml(url)}" alt="Evidência ${escapeHtml(item.id)} ${escapeHtml(status.date || status.targetDate)}" loading="lazy">` : `<span>sem thumb</span>`}
        </button>
        <div class="thumb-meta">
          <strong>${datePt(status.date || status.targetDate)}</strong>
          <span>${statusLabel(status.status)}</span>
          ${issues.length ? `<small>${escapeHtml(issues.map((i) => i.code || i).join(", "))}</small>` : ""}
        </div>
      </article>`;
  }).join("");
  return `
    <section class="insertion-row">
      <div>
        <div class="row-kicker">${escapeHtml(item.siteSigla)} · #${item.id} · ${escapeHtml(item.localFormatoNormalizado || item.localFormato)}</div>
        <h3>${escapeHtml(item.campanhaName)}</h3>
        <p>${escapeHtml(item.clienteNome)} · ${escapeHtml(item.agenciaNome || "sem agência")} · ${escapeHtml(item.piCodigo || "sem PI")}</p>
        <p class="muted">${datePt(item.periodoInicio)} até ${datePt(item.periodoFim)} · ${statusLabel(item.statusNormalizado)} · ${Number(item.totalEvidencias || 0)} evidências no AdOps</p>
        <div class="row-links">
          <a href="${escapeHtml(portalUrl(item))}" target="_blank" rel="noreferrer">Portal</a>
          ${adLink ? `<a href="${escapeHtml(adLink)}" target="_blank" rel="noreferrer">AdRotate</a>` : `<span>AdRotate sem match ao vivo</span>`}
          ${item.mediaUrl ? `<a href="${escapeHtml(item.mediaUrl)}" target="_blank" rel="noreferrer">Mídia</a>` : ""}
        </div>
      </div>
      <div class="thumb-grid">${cards}</div>
    </section>`;
}

const [insertions, campaigns, jobs] = await Promise.all([
  api(`/api/insertions?competencia=${encodeURIComponent(COMPETENCIA)}&limit=300`),
  api(`/api/campaigns?competencia=${encodeURIComponent(COMPETENCIA)}&limit=300`),
  api("/api/ops/jobs?limit=30"),
]);

const [audits, statusEntries] = await Promise.all([
  Promise.all(REPORT_DATES.map(async (date) => [date, await api(`/api/insertions/capture-proof/audit?date=${date}&competencia=${encodeURIComponent(COMPETENCIA)}`)])),
  Promise.all(insertions.flatMap((item) => REPORT_DATES.map(async (date) => {
    const status = await api(`/api/insertions/${item.id}/capture-proof/status?date=${date}`);
    return [`${item.id}:${date}`, { ...status, date }];
  }))),
]);

const publishedInsertions = insertions.filter((item) => item.bannerPublicadoNoSite && !["cancelado"].includes(item.statusNormalizado));
const reportInsertions = publishedInsertions
  .filter((item) => REPORT_DATES.some((date) => {
    const current = statusEntries.find(([key]) => key === `${item.id}:${date}`)?.[1];
    return current?.status === "audited";
  }))
  .sort((a, b) => `${a.siteSigla}-${a.id}`.localeCompare(`${b.siteSigla}-${b.id}`));

const relationEntries = await Promise.all(reportInsertions.map(async (item) => {
  try {
    return [item.id, await api(`/api/integrations/adrotate/insertions/${item.id}/relation`)];
  } catch {
    return [item.id, null];
  }
}));

const statuses = Object.fromEntries(statusEntries);
const relations = Object.fromEntries(relationEntries);
const portalRows = portalGroup(insertions);
const auditRows = Object.fromEntries(audits);
const weekendJobs = jobs.items.filter((job) => ["313a069f-3adb-49bf-8858-105497c687e1", "212bead1-a0a2-494b-868c-fcc0e0a4e6f4", "c6bb58fc-ea33-4425-81e1-baef3b0a73cd"].includes(job.id));

const totalPublished = insertions.filter((item) => item.bannerPublicadoNoSite && !["cancelado", "concluido"].includes(item.statusNormalizado)).length;
const totalDraft = insertions.filter((item) => item.statusNormalizado === "rascunho").length;
const totalEvidence = insertions.reduce((sum, item) => sum + Number(item.totalEvidencias || 0), 0);
const totalValue = insertions.reduce((sum, item) => sum + Number(item.valorLiquido || 0), 0);

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AdOps · Relatório de evidências do fim de semana</title>
  <style>
    :root { --bg:#f5f7f8; --ink:#16201c; --muted:#66736e; --line:#d9e1de; --card:#fff; --ok:#0d7a4f; --bad:#b42318; --accent:#175c62; --gold:#b7791f; }
    * { box-sizing:border-box; } body { margin:0; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); letter-spacing:0; }
    a { color:var(--accent); text-decoration:none; font-weight:700; } a:hover { text-decoration:underline; }
    .wrap { width:min(1180px, calc(100% - 32px)); margin:0 auto; }
    header { background:#0f1d1a; color:white; padding:34px 0 28px; border-bottom:5px solid #d6a348; }
    header h1 { margin:0; font-size:clamp(28px, 4vw, 48px); line-height:1.02; letter-spacing:0; }
    header p { margin:12px 0 0; color:#c6d5d0; max-width:860px; font-size:17px; }
    .kpis { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:12px; margin:22px 0; }
    .kpi { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:16px; }
    .kpi span { color:var(--muted); font-size:12px; text-transform:uppercase; font-weight:800; }
    .kpi strong { display:block; margin-top:8px; font-size:26px; }
    .section { margin:22px 0; }
    .section h2 { font-size:22px; margin:0 0 12px; }
    .panel { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:18px; }
    .audit-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
    .audit-day { border:1px solid var(--line); border-radius:8px; padding:14px; background:#fbfcfc; }
    .audit-day strong { font-size:20px; }
    .audit-day .ok { color:var(--ok); font-weight:900; }
    .audit-day .bad { color:var(--bad); font-weight:900; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th, td { padding:10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    th { font-size:12px; color:var(--muted); text-transform:uppercase; }
    .insertion-row { display:grid; grid-template-columns:minmax(240px, 390px) 1fr; gap:18px; padding:18px 0; border-top:1px solid var(--line); }
    .insertion-row:first-child { border-top:0; }
    .row-kicker { color:var(--accent); text-transform:uppercase; font-size:12px; font-weight:900; }
    .insertion-row h3 { margin:6px 0 8px; font-size:20px; }
    .insertion-row p { margin:6px 0; }
    .muted { color:var(--muted); }
    .row-links { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .row-links a, .row-links span { border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:#fbfcfc; font-size:13px; }
    .thumb-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
    .thumb-card { border:1px solid var(--line); border-radius:8px; overflow:hidden; background:#fbfcfc; }
    .thumb-card.ok { border-color:#b9dfcf; } .thumb-card.bad { border-color:#f3b8b2; }
    .thumb-button { display:block; width:100%; border:0; padding:0; background:#dfe7e4; cursor:pointer; aspect-ratio:16/9; overflow:hidden; }
    .thumb-button:disabled { cursor:not-allowed; color:var(--muted); font-weight:800; }
    .thumb-button img { width:100%; height:100%; object-fit:cover; display:block; }
    .thumb-meta { padding:9px 10px; display:grid; gap:3px; font-size:13px; }
    .thumb-meta small { color:var(--bad); overflow-wrap:anywhere; }
    .timeline { display:grid; gap:10px; }
    .job { display:grid; grid-template-columns:190px 1fr; gap:12px; border-top:1px solid var(--line); padding-top:10px; }
    .job:first-child { border-top:0; padding-top:0; }
    .tag { display:inline-block; border-radius:999px; padding:4px 8px; font-size:12px; font-weight:900; background:#e9f3ef; color:var(--ok); }
    .tag.warn { background:#fff6df; color:var(--gold); }
    footer { padding:28px 0 40px; color:var(--muted); font-size:13px; }
    dialog { width:min(1080px, calc(100% - 28px)); border:0; border-radius:10px; padding:0; background:#07110f; color:white; }
    dialog::backdrop { background:rgba(0,0,0,.78); }
    .modal-head { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; }
    .modal-head button { border:1px solid rgba(255,255,255,.28); color:white; background:transparent; border-radius:6px; padding:7px 10px; cursor:pointer; }
    .modal-img { width:100%; max-height:78vh; object-fit:contain; background:#000; display:block; }
    @media (max-width: 900px) { .kpis, .audit-grid, .insertion-row, .thumb-grid { grid-template-columns:1fr; } .job { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header><div class="wrap">
    <div class="row-kicker">AdOps · evidências · ${escapeHtml(COMPETENCIA)}</div>
    <h1>Relatório de correção do fim de semana</h1>
    <p>Auditoria dos alertas recebidos por Telegram, correções aplicadas em captura/API e visão operacional por portal com thumbs clicáveis das evidências.</p>
  </div></header>
  <main class="wrap">
    <section class="kpis">
      <div class="kpi"><span>Inserções no mês</span><strong>${insertions.length}</strong></div>
      <div class="kpi"><span>Publicadas/ativas</span><strong>${totalPublished}</strong></div>
      <div class="kpi"><span>Rascunho/agendadas</span><strong>${totalDraft}</strong></div>
      <div class="kpi"><span>Campanhas</span><strong>${campaigns.length}</strong></div>
      <div class="kpi"><span>Evidências</span><strong>${totalEvidence}</strong></div>
    </section>
    <section class="section panel">
      <h2>Diagnóstico executivo</h2>
      <p>O alerta do fim de semana misturava dois tipos de problema. O caso real era evidência faltante nas inserções publicadas <strong>#1253 OMT ANIVERSÁRIO</strong> em 09/05 e <strong>#1256 PERRENGUE ANIVERSARIO</strong> em 10/05. Ambos foram reprocessados e agora estão auditados.</p>
      <p>Os itens <strong>#1202</strong>, <strong>#1271</strong> e os rascunhos de 11/05 apareciam no alerta por falha de critério: a auditoria cobrava inserção com mídia, mas ainda não publicada no site. A API do VPS e o Worker público foram ajustados para considerar somente <code>bannerPublicadoNoSite=true</code>.</p>
    </section>
    <section class="section">
      <h2>Auditoria final</h2>
      <div class="audit-grid">
        ${REPORT_DATES.map((date) => {
          const audit = auditRows[date];
          return `<article class="audit-day">
            <strong>${datePt(date)}</strong>
            <p><span class="ok">${audit.ok}</span> ok · <span class="${audit.missing || audit.invalid ? "bad" : "ok"}">${audit.missing}</span> faltantes · <span class="${audit.invalid ? "bad" : "ok"}">${audit.invalid}</span> inválidas</p>
            <p class="muted">${audit.totalEligible} inserções publicadas elegíveis.</p>
          </article>`;
        }).join("")}
      </div>
    </section>
    <section class="section panel">
      <h2>Por portal</h2>
      <table>
        <thead><tr><th>Portal</th><th>Total</th><th>Publicadas</th><th>Rascunho</th><th>Encerradas</th><th>Evidências</th><th>Valor líquido</th></tr></thead>
        <tbody>
          ${portalRows.map((row) => `<tr><td>${escapeHtml(row.siteSigla)} · ${escapeHtml(row.siteNome)}</td><td>${row.total}</td><td>${row.publicadas}</td><td>${row.rascunho}</td><td>${row.encerradas}</td><td>${row.evidencias}</td><td>${money(row.valor)}</td></tr>`).join("")}
        </tbody>
      </table>
      <p class="muted">Valor líquido consolidado do mês: <strong>${money(totalValue)}</strong>.</p>
    </section>
    <section class="section panel">
      <h2>Evidências com thumbs</h2>
      ${reportInsertions.map((item) => evidenceCard(item, statuses, relations[item.id])).join("")}
    </section>
    <section class="section panel">
      <h2>Correções executadas</h2>
      <div class="timeline">
        <div class="job"><span class="tag">corrigido</span><p>Regra OMT topo publicada como regra #39 com ajuste restrito de GIF/frame para o slot <code>.g.g-1</code> dentro de <code>.header-top-banner</code>.</p></div>
        <div class="job"><span class="tag">corrigido</span><p>API do VPS e Worker público filtram auditoria diária por inserções realmente publicadas no site.</p></div>
        <div class="job"><span class="tag">corrigido</span><p>Reprocessamento #1253 gerou evidência válida de 09/05. Reprocessamento #1256 gerou evidência válida de 10/05.</p></div>
        ${weekendJobs.map((job) => `<div class="job"><span class="tag ${job.status === "completed" ? "" : "warn"}">${escapeHtml(job.status)}</span><p><strong>${escapeHtml(job.kind)}</strong> · ${escapeHtml(job.id)}<br><span class="muted">${escapeHtml(job.result?.execution?.capture?.uploadedUrl || job.error || "sem erro registrado")}</span></p></div>`).join("")}
      </div>
    </section>
  </main>
  <footer><div class="wrap">Gerado em ${escapeHtml(GENERATED_AT)} · Fonte: AdOps API, capture-proof/status, AdRotate relation e fila de jobs.</div></footer>
  <dialog id="evidenceModal">
    <div class="modal-head"><strong id="modalTitle">Evidência</strong><button type="button" id="modalClose">Fechar</button></div>
    <img id="modalImg" class="modal-img" alt="Evidência ampliada">
  </dialog>
  <script>
    const modal = document.getElementById('evidenceModal');
    const modalImg = document.getElementById('modalImg');
    const modalTitle = document.getElementById('modalTitle');
    document.querySelectorAll('.thumb-button[data-img]').forEach((button) => {
      button.addEventListener('click', () => {
        modalImg.src = button.dataset.img;
        modalTitle.textContent = button.dataset.title || 'Evidência';
        modal.showModal();
      });
    });
    document.getElementById('modalClose').addEventListener('click', () => modal.close());
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.close(); });
  </script>
</body>
</html>`;

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_FILE, html, "utf8");
console.log(JSON.stringify({ ok: true, output: OUTPUT_FILE, reportInsertions: reportInsertions.length, generatedAt: GENERATED_AT }, null, 2));
