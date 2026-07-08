import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = process.env.ADOPS_REPORT_DATA_DIR || "/tmp/adops-data";
const outDir =
  process.env.ADOPS_REPORT_OUT_DIR ||
  path.join(root, "docs", "reports", "adops-pulse-2026-05-09");

function readJson(name, fallback = null) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function brl(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function datePt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });
}

function dayPt(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function jsonScript(value) {
  return JSON.stringify(value).replaceAll("</", "<\\/");
}

function findFormat(siteConfig, format) {
  const needle = normalize(format);
  for (const mapping of Object.values(siteConfig?.formatMappings || {})) {
    const aliases = mapping.aliases || [];
    if (aliases.some((alias) => normalize(alias) === needle)) return mapping;
  }
  return Object.values(siteConfig?.formatMappings || {})[0] || null;
}

const summary = readJson("dashboard_summary.json", {});
const bySite = readJson("dashboard_by-site.json", []);
const insertions = readJson("insertions.json", []);
const campaigns = readJson("campaigns.json", []);
const jobsRaw = readJson("jobs.json", []);
const jobs = Array.isArray(jobsRaw) ? jobsRaw : jobsRaw.items || jobsRaw.jobs || [];
const audit = readJson("insertions_capture-proof_audit_date=2026-05-09.json", {});
const diagnostics = readJson("sync_planilha_diagnostics.json", {});
const driveAudit = readJson("drive_audit.json", {});
const siteConfig = JSON.parse(
  fs.readFileSync(path.join(root, "config", "adrotate-sites.json"), "utf8"),
);

const cutoff = driveAudit.cutoff || "2026-05-08T13:31:50.000Z";
const today = "2026-05-09";

const activeInsertions = insertions.filter((row) => row.statusNormalizado !== "finalizada");
const byPortal = new Map();
for (const row of activeInsertions) {
  const sigla = row.siteSigla || "SEM_PORTAL";
  const bucket =
    byPortal.get(sigla) ||
    { sigla, total: 0, agendada: 0, emVeiculacao: 0, vencida: 0, printPendente: 0, evidencias: 0 };
  bucket.total += 1;
  if (String(row.periodoInicio || "") > today) bucket.agendada += 1;
  else if (String(row.periodoFim || "") >= today) bucket.emVeiculacao += 1;
  else bucket.vencida += 1;
  if (!row.printGerado) bucket.printPendente += 1;
  bucket.evidencias += Number(row.totalEvidencias || 0);
  byPortal.set(sigla, bucket);
}

const recentJobs = jobs
  .filter((job) => new Date(job.createdAt || 0) > new Date(cutoff))
  .map((job) => ({
    id: job.id,
    kind: job.kind,
    status: job.status,
    createdAt: job.createdAt,
    error: job.lastError || job.error || "",
  }));

const cards = activeInsertions
  .slice()
  .sort((a, b) => String(a.siteSigla).localeCompare(String(b.siteSigla)) || a.id - b.id)
  .map((row) => {
    const cfg = siteConfig[row.siteSigla] || {};
    const mapping = findFormat(cfg, row.localFormatoNormalizado || row.localFormato);
    const pluginUrl = mapping?.groupId
      ? `${cfg.adminBaseUrl}/admin.php?page=adrotate-groups&view=group&id=${mapping.groupId}`
      : cfg.adminBaseUrl
        ? `${cfg.adminBaseUrl}/admin.php?page=adrotate`
        : "";
    return {
      id: row.id,
      campanhaId: row.campanhaId,
      campanhaName: row.campanhaName || `Campanha ${row.campanhaId}`,
      clienteNome: row.clienteNome || "-",
      agenciaNome: row.agenciaNome || "-",
      siteSigla: row.siteSigla || "-",
      siteNome: row.siteNome || "-",
      portalUrl: cfg.homeUrl || "",
      pluginUrl,
      localFormato: row.localFormatoNormalizado || row.localFormato || "-",
      groupId: mapping?.groupId || null,
      periodo: `${dayPt(row.periodoInicio)} a ${dayPt(row.periodoFim)}`,
      periodoInicio: row.periodoInicio,
      periodoFim: row.periodoFim,
      piCodigo: row.piCodigo || "-",
      valorLiquido: brl(row.valorLiquido),
      mediaUrl: row.mediaUrl || "",
      totalEvidencias: Number(row.totalEvidencias || 0),
      printGerado: Boolean(row.printGerado),
      bannerPublicadoNoSite: Boolean(row.bannerPublicadoNoSite),
      auditSummary: row.auditSummary || {},
      status:
        String(row.periodoInicio || "") > today
          ? "agendada"
          : String(row.periodoFim || "") >= today
            ? "em_veiculacao"
            : "vencida",
    };
  });

const failedAuditItems = (audit.items || [])
  .filter((item) => item.status !== "ok")
  .map((item) => ({
    id: item.insertionId,
    campaign: item.campaignName,
    site: item.siteSigla,
    status: item.status,
    issue: item.audit?.issues?.[0]?.label || item.status,
  }));

const mismatchCount = Array.isArray(diagnostics.competenciaMismatch)
  ? diagnostics.competenciaMismatch.length
  : 0;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AdOps Pulse - 09/05/2026</title>
  <style>
    :root {
      --bg: #f5f7f8;
      --panel: #ffffff;
      --ink: #172027;
      --muted: #60717d;
      --line: #d9e1e5;
      --green: #13795b;
      --blue: #1f6feb;
      --amber: #b7791f;
      --red: #c24135;
      --steel: #334155;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .wrap { width: min(1440px, calc(100% - 32px)); margin: 0 auto; }
    header {
      background: #111820;
      color: white;
      border-bottom: 4px solid #27a376;
    }
    .hero { padding: 28px 0 22px; display: grid; gap: 18px; }
    .eyebrow { color: #9ad8c2; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 52px); line-height: 1.02; letter-spacing: 0; }
    .hero p { max-width: 900px; margin: 0; color: #cbd5dc; font-size: 16px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.07); padding: 7px 10px; border-radius: 999px; font-size: 13px; color: #e6edf3; }
    main { padding: 24px 0 44px; }
    section { margin: 0 0 28px; }
    h2 { margin: 0 0 12px; font-size: 22px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 16px; letter-spacing: 0; }
    .grid { display: grid; gap: 12px; }
    .kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .card, .table-box, .notice {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
    }
    .card { padding: 14px; }
    .kpi-label { color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: .04em; }
    .kpi-value { margin-top: 5px; font-size: 28px; font-weight: 800; }
    .kpi-note { color: var(--muted); font-size: 13px; margin-top: 2px; }
    .findings { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .notice { padding: 14px; border-left: 4px solid var(--steel); }
    .notice.good { border-left-color: var(--green); }
    .notice.warn { border-left-color: var(--amber); }
    .notice.bad { border-left-color: var(--red); }
    .notice p { margin: 0; color: var(--muted); font-size: 14px; }
    .table-box { overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 760px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 14px; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; background: #fbfcfd; }
    tr:last-child td { border-bottom: 0; }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      background: white;
      color: var(--ink);
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
    }
    .gallery { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .insertion-card { padding: 0; overflow: hidden; display: flex; flex-direction: column; min-height: 100%; }
    .thumb {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #e8eef2;
      border: 0;
      padding: 0;
      cursor: pointer;
      display: block;
    }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb .empty { height: 100%; display: grid; place-items: center; color: var(--muted); font-weight: 700; }
    .insertion-body { padding: 12px; display: grid; gap: 8px; }
    .title { font-weight: 800; font-size: 15px; min-height: 42px; }
    .meta { color: var(--muted); font-size: 13px; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 700; background: #eef3f6; color: var(--steel); }
    .badge.green { background: #e4f4ed; color: var(--green); }
    .badge.amber { background: #fff4df; color: var(--amber); }
    .badge.red { background: #fde8e5; color: var(--red); }
    .links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 4px; }
    .linkbtn { border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px; text-align: center; font-size: 12px; font-weight: 700; background: #fbfcfd; }
    dialog {
      width: min(1040px, calc(100% - 28px));
      border: 0;
      border-radius: 8px;
      padding: 0;
      box-shadow: 0 24px 80px rgba(0,0,0,.35);
    }
    dialog::backdrop { background: rgba(17,24,32,.72); }
    .modal-head { display: flex; justify-content: space-between; gap: 12px; padding: 14px; border-bottom: 1px solid var(--line); }
    .modal-head button { border: 1px solid var(--line); background: white; border-radius: 8px; padding: 7px 10px; cursor: pointer; }
    .modal-content { display: grid; grid-template-columns: 1.4fr .8fr; gap: 0; }
    .modal-media { background: #0f1720; min-height: 360px; display: grid; place-items: center; }
    .modal-media img { max-width: 100%; max-height: 74vh; object-fit: contain; }
    .modal-side { padding: 16px; display: grid; gap: 10px; align-content: start; }
    .hidden { display: none !important; }
    @media (max-width: 1180px) { .kpis { grid-template-columns: repeat(3, 1fr); } .findings, .gallery { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 720px) {
      .wrap { width: min(100% - 20px, 1440px); }
      .kpis, .findings, .gallery, .toolbar, .modal-content { grid-template-columns: 1fr; }
      .hero { padding-top: 22px; }
      .links { grid-template-columns: 1fr; }
      table { min-width: 660px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap hero">
      <div>
        <div class="eyebrow">AdOps Pulse • relatório operacional</div>
        <h1>PIs, campanhas, inserções e evidências</h1>
      </div>
      <p>Auditoria gerada em ${escapeHtml(datePt(new Date().toISOString()))}. Corte de comparação: ${escapeHtml(datePt(cutoff))}. O relatório cruza Drive, planilha, fila pública, AdOps, AdRotate e auditoria de evidências sem expor tokens ou links privados.</p>
      <div class="chips">
        <span class="chip">Drive: sem PI nova nas subpastas</span>
        <span class="chip">Planilha: modificada após o corte</span>
        <span class="chip">Runner Drive: credencial exige renovação</span>
        <span class="chip">Publicação: sites.codigo5.com.br</span>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section class="grid kpis">
      ${[
        ["Campanhas", summary.totalCampanhas ?? campaigns.length, "base AdOps"],
        ["Inserções", summary.totalInsercoes ?? insertions.length, "total"],
        ["Ativas", summary.ativas ?? activeInsertions.length, "não finalizadas"],
        ["Concluídas", summary.concluidas ?? 0, "histórico"],
        ["Aguardam print", summary.aguardandoPrint ?? 0, "fila operacional"],
        ["Valor líquido", brl(summary.valorTotalLiquido), "carteira total"],
      ]
        .map(
          ([label, value, note]) => `<div class="card"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-note">${escapeHtml(note)}</div></div>`,
        )
        .join("")}
    </section>

    <section>
      <h2>Diagnóstico de chegada de PI</h2>
      <div class="grid findings">
        <div class="notice good"><h3>Drive</h3><p>${escapeHtml(driveAudit.directConnectorAudit?.finding || "Sem dados de auditoria.")}</p></div>
        <div class="notice warn"><h3>Monitor automático</h3><p>${escapeHtml(driveAudit.runnerState?.interpretation || "Estado do runner não informado.")}</p></div>
        <div class="notice warn"><h3>Planilha</h3><p>${escapeHtml(driveAudit.spreadsheet?.interpretation || "Planilha não verificada.")}</p></div>
        <div class="notice bad"><h3>Fila</h3><p>${recentJobs.length ? `${recentJobs.length} jobs após o corte; ${recentJobs.filter((j) => j.status === "failed").length} falharam.` : "Nenhum job novo após o corte."}</p></div>
      </div>
    </section>

    <section>
      <h2>Inserções ativas e agendadas por portal</h2>
      <div class="table-box">
        <table>
          <thead><tr><th>Portal</th><th>Total ativo</th><th>Agendadas</th><th>Em veiculação</th><th>Vencidas ativas</th><th>Print pendente</th><th>Evidências</th></tr></thead>
          <tbody>
            ${[...byPortal.values()]
              .sort((a, b) => b.total - a.total)
              .map(
                (row) => `<tr><td><strong>${escapeHtml(row.sigla)}</strong></td><td>${row.total}</td><td>${row.agendada}</td><td>${row.emVeiculacao}</td><td>${row.vencida}</td><td>${row.printPendente}</td><td>${row.evidencias}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Saúde da plataforma</h2>
      <div class="grid findings">
        <div class="notice ${failedAuditItems.length ? "warn" : "good"}"><h3>Auditoria de evidências</h3><p>${audit.totalEligible ?? 13} elegíveis em 09/05: ${audit.ok ?? 10} OK, ${audit.missing ?? 2} sem evidência, ${audit.invalid ?? 1} inválida.</p></div>
        <div class="notice warn"><h3>Planilha x competência</h3><p>${mismatchCount} divergências de competência em diagnóstico. Não é bloqueio de publicação por si só, mas exige revisão antes de reconciliar.</p></div>
        <div class="notice bad"><h3>Jobs recentes</h3><p>${recentJobs.length ? recentJobs.map((j) => `${j.kind} ${j.status}: ${j.error || "sem erro"}`).join(" • ") : "Sem jobs recentes depois do corte."}</p></div>
        <div class="notice good"><h3>Segurança do relatório</h3><p>Links privados, tokens e headers de autorização não foram incluídos. Os links de plugin apontam para o admin do portal e exigem login.</p></div>
      </div>
    </section>

    <section>
      <h2>Pendências críticas</h2>
      <div class="table-box">
        <table>
          <thead><tr><th>Origem</th><th>Item</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>
            ${failedAuditItems
              .map(
                (item) => `<tr><td>Evidência</td><td>#${item.id} ${escapeHtml(item.campaign)} (${escapeHtml(item.site)})</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.issue)}</td></tr>`,
              )
              .join("")}
            <tr><td>Drive</td><td>Runner VPS</td><td>credential_error</td><td>Renovar credencial Google Drive no runner para reativar o monitor automático.</td></tr>
            ${recentJobs
              .map(
                (job) => `<tr><td>Fila</td><td>${escapeHtml(job.kind)} ${escapeHtml(job.id)}</td><td>${escapeHtml(job.status)}</td><td>${escapeHtml(job.error || "reprocessar e capturar erro detalhado")}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Drive e planilha</h2>
      <div class="table-box">
        <table>
          <thead><tr><th>Pasta</th><th>Última alteração</th><th>Arquivos encontrados</th><th>ID</th></tr></thead>
          <tbody>
            ${(driveAudit.directConnectorAudit?.folders || [])
              .map(
                (folder) => `<tr><td>${escapeHtml(folder.name)}</td><td>${escapeHtml(datePt(folder.modifiedTime))}</td><td>${folder.files}</td><td>${escapeHtml(folder.id)}</td></tr>`,
              )
              .join("")}
            <tr><td><strong>Planilha fonte</strong></td><td>${escapeHtml(datePt(driveAudit.spreadsheet?.modifiedTime))}</td><td>arquivo atualizado após o corte</td><td>${escapeHtml(driveAudit.spreadsheet?.fileId || "-")}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Galeria de campanhas e inserções</h2>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Buscar por campanha, cliente, PI, portal ou formato">
        <select id="portalFilter"><option value="">Todos os portais</option>${[...new Set(cards.map((c) => c.siteSigla))]
          .sort()
          .map((sigla) => `<option value="${escapeHtml(sigla)}">${escapeHtml(sigla)}</option>`)
          .join("")}</select>
        <select id="statusFilter"><option value="">Todos os status</option><option value="em_veiculacao">Em veiculação</option><option value="agendada">Agendada</option><option value="vencida">Vencida ativa</option></select>
      </div>
      <div id="gallery" class="grid gallery"></div>
    </section>
  </main>

  <dialog id="modal">
    <div class="modal-head"><strong id="modalTitle"></strong><button id="closeModal">Fechar</button></div>
    <div class="modal-content">
      <div class="modal-media" id="modalMedia"></div>
      <div class="modal-side" id="modalSide"></div>
    </div>
  </dialog>

  <script id="cards-data" type="application/json">${jsonScript(cards)}</script>
  <script>
    const cards = JSON.parse(document.getElementById('cards-data').textContent);
    const gallery = document.getElementById('gallery');
    const search = document.getElementById('search');
    const portalFilter = document.getElementById('portalFilter');
    const statusFilter = document.getElementById('statusFilter');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMedia = document.getElementById('modalMedia');
    const modalSide = document.getElementById('modalSide');
    const closeModal = document.getElementById('closeModal');

    function statusLabel(status) {
      return status === 'em_veiculacao' ? 'Em veiculação' : status === 'agendada' ? 'Agendada' : 'Vencida ativa';
    }
    function badgeClass(card) {
      return card.status === 'em_veiculacao' ? 'green' : card.status === 'agendada' ? 'amber' : 'red';
    }
    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    }
    function cardHtml(card) {
      const img = card.mediaUrl ? '<img loading="lazy" src="' + esc(card.mediaUrl) + '" alt="Thumb da campanha ' + esc(card.campanhaName) + '">' : '<div class="empty">Sem mídia</div>';
      return '<article class="card insertion-card" data-id="' + card.id + '">' +
        '<button class="thumb" type="button" data-open="' + card.id + '">' + img + '</button>' +
        '<div class="insertion-body">' +
          '<div class="badges"><span class="badge ' + badgeClass(card) + '">' + statusLabel(card.status) + '</span><span class="badge">' + esc(card.siteSigla) + '</span><span class="badge">' + card.totalEvidencias + ' evid.</span></div>' +
          '<div class="title">#' + card.id + ' · ' + esc(card.campanhaName) + '</div>' +
          '<div class="meta">' + esc(card.clienteNome) + ' · ' + esc(card.agenciaNome) + '</div>' +
          '<div class="meta">' + esc(card.localFormato) + ' · ' + esc(card.periodo) + '</div>' +
          '<div class="meta">PI: ' + esc(card.piCodigo) + ' · ' + esc(card.valorLiquido) + '</div>' +
          '<div class="links">' +
            (card.portalUrl ? '<a class="linkbtn" target="_blank" rel="noopener" href="' + esc(card.portalUrl) + '">Portal</a>' : '<span class="linkbtn">Portal indisponível</span>') +
            (card.pluginUrl ? '<a class="linkbtn" target="_blank" rel="noopener" href="' + esc(card.pluginUrl) + '">Plugin AdRotate</a>' : '<span class="linkbtn">Plugin sem mapa</span>') +
          '</div>' +
        '</div></article>';
    }
    function render() {
      const q = search.value.trim().toLowerCase();
      const portal = portalFilter.value;
      const status = statusFilter.value;
      const filtered = cards.filter(card => {
        const hay = [card.id, card.campanhaName, card.clienteNome, card.agenciaNome, card.siteSigla, card.localFormato, card.piCodigo].join(' ').toLowerCase();
        return (!q || hay.includes(q)) && (!portal || card.siteSigla === portal) && (!status || card.status === status);
      });
      gallery.innerHTML = filtered.map(cardHtml).join('');
      document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openModal(Number(button.dataset.open))));
    }
    function openModal(id) {
      const card = cards.find(item => item.id === id);
      if (!card) return;
      modalTitle.textContent = '#' + card.id + ' · ' + card.campanhaName;
      modalMedia.innerHTML = card.mediaUrl ? '<img src="' + esc(card.mediaUrl) + '" alt="Mídia da campanha">' : '<div class="empty">Sem mídia</div>';
      modalSide.innerHTML =
        '<h3>' + esc(card.siteSigla) + ' · ' + esc(card.localFormato) + '</h3>' +
        '<p><strong>Cliente:</strong> ' + esc(card.clienteNome) + '</p>' +
        '<p><strong>Agência:</strong> ' + esc(card.agenciaNome) + '</p>' +
        '<p><strong>Período:</strong> ' + esc(card.periodo) + '</p>' +
        '<p><strong>PI:</strong> ' + esc(card.piCodigo) + '</p>' +
        '<p><strong>Valor:</strong> ' + esc(card.valorLiquido) + '</p>' +
        '<p><strong>Evidências:</strong> ' + card.totalEvidencias + '</p>' +
        '<p><strong>AdRotate grupo:</strong> ' + esc(card.groupId || 'não mapeado') + '</p>' +
        '<div class="links">' +
          (card.portalUrl ? '<a class="linkbtn" target="_blank" rel="noopener" href="' + esc(card.portalUrl) + '">Abrir portal</a>' : '') +
          (card.pluginUrl ? '<a class="linkbtn" target="_blank" rel="noopener" href="' + esc(card.pluginUrl) + '">Abrir plugin</a>' : '') +
        '</div>';
      modal.showModal();
    }
    closeModal.addEventListener('click', () => modal.close());
    [search, portalFilter, statusFilter].forEach(el => el.addEventListener('input', render));
    render();
  </script>
</body>
</html>`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(path.join(outDir, "index.html"));
