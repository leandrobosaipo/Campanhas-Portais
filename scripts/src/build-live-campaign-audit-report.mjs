import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targetDate = process.argv[2] || "2026-07-10";
const sourcePath = process.argv[3] || `/tmp/adops-active-${targetDate}.json`;
const slug = `adops-campanhas-ativas-${targetDate}`;
const outputDir = path.join(root, "reports", slug);
const active = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const drive = {
  "90519": { status: "confirmado", detail: "PDF + GIF 825x120", url: "https://drive.google.com/drive/folders/1Ld0kRewKwhKcW8nuqK8acqydJUFUKiXv" },
  "003124": { status: "confirmado", detail: "PDF ROO + VT compartilhado SANEAR", url: "https://drive.google.com/file/d/1rW-X23QPXsQtKXjJb-k_zHRV9G7vl66n" },
  "90665": { status: "confirmado", detail: "PDF + GIF 825x120", url: "https://drive.google.com/drive/folders/1ZVyBOhzamhsUZeRD5UxNQpaBfDpcVXm2" },
  "492306": { status: "confirmado", detail: "PDF + GIF + instruções de link/VT", url: "https://drive.google.com/drive/folders/1LeuIjr01G1K5gwfToIUQBNiy8WPEs4eG" },
  "003123": { status: "confirmado", detail: "PDF + GIF + Google Doc com link do VT", url: "https://drive.google.com/drive/folders/1S53ZH8saZ2jqd8w3gAhkgLTGBIvcPZpv" },
  "4500152231": { status: "confirmado", detail: "PDF + GIF 670x90", url: "https://drive.google.com/drive/folders/1U0Ac3gD-Q4ElOYoG61jfDNzY4_P78ZPx" },
  "003121": { status: "confirmado", detail: "PDF + MP4 + Google Doc com link do VT", url: "https://drive.google.com/drive/folders/1SrKZf_WjUBaKBPlmHE5E8-dMn9yumuD2" },
  "14609": { status: "confirmado", detail: "PDF + GIFs 825x120 e 670x90", url: "https://drive.google.com/drive/folders/17UQiLYyffXHGG9VxmroRu_MmmF6IAKhr" },
  "14664": { status: "confirmado", detail: "PDF + GIF + MP4 + link de destino", url: "https://drive.google.com/drive/folders/1UljQsg6qFjRAH4Zy0TflIib7LgGE1HgG" },
  "14608": { status: "confirmado", detail: "PDF + GIF 825x120", url: "https://drive.google.com/drive/folders/1D1PRobk7IVWwWzqzjGNjvxLiiA6I2oqj" },
  "14646": { status: "confirmado", detail: "PDF + GIF 825x120", url: "https://drive.google.com/drive/folders/1XGRtWv9LCMUrzrb1MMPJHAESVaIrp4Bz" },
  "41653": { status: "confirmado", detail: "PDF + GIF 825x120", url: "https://drive.google.com/drive/folders/170nRx_teg_48fgT6yP8MAdeDk7Ozti-I" },
  "16890": { status: "confirmado", detail: "PDF + GIF 670x90 + link TCE", url: "https://drive.google.com/drive/folders/1BYw24KPxC_BLqeCBd1WeJ-Th4qqzYad0" },
  "16883": { status: "confirmado", detail: "PDF + GIF 825x120", url: "https://drive.google.com/drive/folders/1OQXNIT3kVaG1W_8mvexC9UTu505gnxMM" },
};

const applyIds = new Set([1681, 1665, 1666, 1755, 1690, 1684, 1693]);
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};
const piNumber = (value) => String(value || "").match(/\d{3,}/)?.[0] || "";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const fmtDate = (value) => value ? value.split("-").reverse().join("/") : "-";

function relationFor(id) {
  return readJson(`/tmp/adops-relations/${id}.json`) || {};
}

function applyFor(id) {
  if (!applyIds.has(Number(id))) return null;
  return readJson(`/tmp/apply-${id}.json`);
}

function evidenceFor(id) {
  return readJson(`/tmp/adops-statuses-final/${id}.json`);
}

function adInfo(item) {
  const relation = relationFor(item.adops.insertionId);
  const applied = applyFor(item.adops.insertionId);
  const execution = applied?.result?.execution || {};
  const match = relation.exactLiveMatches?.[0] || null;
  return {
    adId: match?.adId || execution.wpCliResult?.ad_id || execution.wpCliResult?.existing_ad_id || null,
    groupId: relation.adrotateGroupId || execution.wpCliResult?.group_id || null,
    exactMatches: relation.exactLiveMatches?.length || 0,
    publicValidated: Boolean(execution.publicHtmlValidation?.ok),
    mediaFound: Boolean(execution.publicHtmlValidation?.mediaFound),
    adFound: Boolean(execution.publicHtmlValidation?.adFound),
    rebuildOk: item.siteSigla !== "PERRENGUE" || Boolean(execution.headlessRebuild?.completed) || !applied,
  };
}

const activeRows = active.items.map((item) => {
  const ad = adInfo(item);
  const evidence = evidenceFor(item.adops.insertionId);
  const evidenceOk = evidence?.status === "audited" && evidence?.checklistValidation?.approved === true && (evidence?.checklistValidation?.blockingIssues?.length || 0) === 0;
  const liveOk = ad.exactMatches > 0 || (ad.publicValidated && ad.mediaFound && ad.adFound);
  return { ...item, kind: "active", ad, evidence, evidenceOk, liveOk, ready: liveOk && evidenceOk, drive: drive[piNumber(item.piCodigo)] || { status: "não localizado", detail: "Revisão manual necessária", url: null } };
});

const upcomingRows = active.upcomingItems.map((item) => {
  const ad = adInfo(item);
  const scheduled = Boolean(ad.adId && ad.groupId);
  return { ...item, kind: "upcoming", ad, scheduled, ready: scheduled, drive: drive[piNumber(item.piCodigo)] || { status: "não localizado", detail: "Revisão manual necessária", url: null } };
});

const rows = [...activeRows, ...upcomingRows];
const metrics = {
  active: activeRows.length,
  activeReady: activeRows.filter((row) => row.ready).length,
  upcoming: upcomingRows.length,
  upcomingReady: upcomingRows.filter((row) => row.ready).length,
  adops: rows.filter((row) => row.adops?.status === "matched").length,
  drive: rows.filter((row) => row.drive.status === "confirmado").length,
  evidence: activeRows.filter((row) => row.evidenceOk).length,
};

const rowHtml = (row) => {
  const state = row.ready ? (row.kind === "active" ? "Confirmada" : "Programada") : "Pendente";
  const stateClass = row.ready ? "ok" : "warn";
  const evidenceLink = row.evidence?.arquivoUrl ? `<a href="${esc(row.evidence.arquivoUrl)}" target="_blank" rel="noopener">abrir evidência</a>` : "não exigida antes do início";
  const driveLink = row.drive.url ? `<a href="${esc(row.drive.url)}" target="_blank" rel="noopener">${esc(row.drive.detail)}</a>` : esc(row.drive.detail);
  return `<tr data-kind="${row.kind}" data-site="${esc(row.siteSigla)}" data-state="${stateClass}">
    <td><span class="status ${stateClass}">${state}</span><small>${row.kind === "active" ? "ativa" : "entra em breve"}</small></td>
    <td><strong>${esc(row.siteSigla)}</strong><small>${esc(row.format.normalized)}</small></td>
    <td><strong>${esc(row.piCodigo)}</strong><small>${esc(row.campaignName)}</small></td>
    <td>${fmtDate(row.period.start)}<br><small>até ${fmtDate(row.period.end)}</small></td>
    <td><strong>#${row.adops.insertionId}</strong><small>campanha ${row.adops.campaignId}</small></td>
    <td>${row.ad.adId ? `ad ${esc(row.ad.adId)} / grupo ${esc(row.ad.groupId)}` : "sem confirmação"}<small>${row.kind === "active" ? (row.liveOk ? "HTML/mídia validados" : "não validado") : "período administrativo conferido"}</small></td>
    <td>${driveLink}</td>
    <td>${row.kind === "active" ? evidenceLink : "primeiro dia de veiculação"}</td>
  </tr>`;
};

const siteOptions = [...new Set(rows.map((row) => row.siteSigla))].sort().map((site) => `<option value="${esc(site)}">${esc(site)}</option>`).join("");
const generatedAt = new Date().toISOString();
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auditoria de campanhas · ${targetDate}</title><meta name="description" content="Auditoria técnica de campanhas ativas e programadas nos portais Código5.">
<link rel="icon" href="assets/favicon.svg"><style>
:root{color-scheme:light;--bg:#f5f7f4;--paper:#fff;--ink:#17201b;--muted:#627069;--line:#dce4de;--green:#087443;--blue:#155eef;--amber:#a15c00;--soft:#edf3ef}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);line-height:1.45}a{color:var(--blue)}main{max-width:1380px;margin:auto}.hero{padding:44px 28px 30px;border-bottom:1px solid var(--line);background:var(--paper)}.kicker{margin:0 0 8px;color:var(--green);font-size:12px;font-weight:800;text-transform:uppercase}.hero h1{margin:0;max-width:900px;font-size:clamp(34px,5vw,64px);line-height:1.02;letter-spacing:0}.lead{max-width:850px;color:var(--muted);font-size:18px}.metrics{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--paper)}.metric{padding:20px 24px;border-right:1px solid var(--line)}.metric:last-child{border:0}.metric b{display:block;font-size:30px}.metric span{color:var(--muted);font-size:12px}.band{padding:30px 28px;border-bottom:1px solid var(--line)}.band h2{margin:0 0 8px;font-size:24px}.band p{margin:0;color:var(--muted)}.flow{display:grid;grid-template-columns:repeat(6,1fr);margin-top:20px;border:1px solid var(--line);background:var(--paper)}.flow div{padding:16px;border-right:1px solid var(--line);font-weight:700}.flow div:last-child{border:0}.flow small,td small{display:block;margin-top:4px;color:var(--muted);font-weight:400}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 14px}.controls select,.controls button{min-height:40px;border:1px solid var(--line);background:var(--paper);padding:8px 12px;border-radius:6px;font:inherit}.controls button{cursor:pointer}.table-wrap{overflow:auto;border:1px solid var(--line);background:var(--paper)}table{width:100%;border-collapse:collapse;min-width:1120px}th,td{padding:13px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);font-size:13px}th{position:sticky;top:0;background:#f0f4f1;color:var(--muted);font-size:11px;text-transform:uppercase}tr:last-child td{border-bottom:0}.status{display:inline-flex;padding:4px 7px;border-radius:4px;font-size:11px;font-weight:800}.status.ok{background:#e5f5ec;color:var(--green)}.status.warn{background:#fff0d8;color:var(--amber)}.notes{display:grid;grid-template-columns:1fr 1fr;gap:28px}.notes ul{margin:10px 0 0;padding-left:20px}.notes li{margin:7px 0}.footer{padding:24px 28px 48px;color:var(--muted);font-size:12px}@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}.metric:nth-child(2n){border-right:0}.flow{grid-template-columns:1fr}.flow div{border-right:0;border-bottom:1px solid var(--line)}.notes{grid-template-columns:1fr}.hero,.band{padding-left:18px;padding-right:18px}}
</style></head><body><main>
<header class="hero"><p class="kicker">AdOps · auditoria em produção · ${fmtDate(targetDate)}</p><h1>Campanhas ativas e próximas entradas</h1><p class="lead">Conciliação da planilha oficial com Google Drive, AdOps, AdRotate, HTML público, cache/rebuild e evidências auditadas.</p></header>
<section class="metrics"><div class="metric"><b>${metrics.active}</b><span>ativas na planilha</span></div><div class="metric"><b>${metrics.activeReady}</b><span>ativas confirmadas</span></div><div class="metric"><b>${metrics.upcoming}</b><span>próximas entradas</span></div><div class="metric"><b>${metrics.upcomingReady}</b><span>já programadas</span></div><div class="metric"><b>${metrics.adops}/${rows.length}</b><span>cadastradas no AdOps</span></div><div class="metric"><b>${metrics.evidence}/${metrics.active}</b><span>evidências aprovadas</span></div></section>
<section class="band"><h2>Régua de confirmação</h2><p>Uma marcação administrativa isolada não fecha a auditoria. O aceite percorre todas as fontes.</p><div class="flow"><div>1. Planilha<small>portal, PI, período e posição</small></div><div>2. Drive<small>PDF, mídia e observações</small></div><div>3. AdOps<small>campanha e inserção</small></div><div>4. AdRotate<small>ad, grupo e agenda</small></div><div>5. Produção<small>HTML, cache ou rebuild</small></div><div>6. Evidência<small>PNG e checklist</small></div></div></section>
<section class="band"><h2>Inventário auditado</h2><p>Use os filtros para revisar um portal ou separar o que já está no ar do que entra depois.</p><div class="controls"><select id="site"><option value="">Todos os portais</option>${siteOptions}</select><button type="button" data-filter="active">Ativas</button><button type="button" data-filter="upcoming">Próximas</button><button type="button" data-filter="">Tudo</button></div><div class="table-wrap"><table><thead><tr><th>Estado</th><th>Portal / posição</th><th>PI / campanha</th><th>Período</th><th>AdOps</th><th>AdRotate / produção</th><th>Drive</th><th>Evidência</th></tr></thead><tbody>${rows.map(rowHtml).join("")}</tbody></table></div></section>
<section class="band notes"><div><h2>Confirmado</h2><ul><li>${metrics.adops}/${rows.length} inserções da planilha estão vinculadas no AdOps.</li><li>${metrics.drive}/${rows.length} linhas têm fonte de PI/mídia confirmada no Drive.</li><li>${metrics.activeReady}/${metrics.active} campanhas ativas passaram por publicação/HTML e evidência.</li><li>${metrics.upcomingReady}/${metrics.upcoming} próximas entradas possuem anúncio, grupo e período no AdRotate.</li></ul></div><div><h2>Regras importantes</h2><ul><li>Campanha futura não deve aparecer antes da data em portal dinâmico.</li><li>PMT exige rebuild headless depois de publicar no WordPress.</li><li>Grupos com rotação precisam de validação individual; uma única resposta da home não representa todo o inventário.</li><li>Links em TXT/Google Docs fazem parte da mídia e do destino do anúncio.</li></ul></div></section>
<footer class="footer">Gerado em ${esc(generatedAt)}. Fontes: planilha Relação de campanhas, Google Drive, AdOps API, WordPress/AdRotate e portais públicos.</footer>
</main><script>const rows=[...document.querySelectorAll('tbody tr')],site=document.querySelector('#site');let kind='';function filter(){rows.forEach(r=>r.hidden=!!((site.value&&r.dataset.site!==site.value)||(kind&&r.dataset.kind!==kind)))}site.addEventListener('change',filter);document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.filter;filter()}));</script></body></html>`;

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="32" fill="#087443"/><path d="M56 72h144v24H56zm0 44h92v24H56zm0 44h120v24H56z" fill="#fff"/><circle cx="190" cy="128" r="26" fill="#b7f0d0"/><path d="m177 128 9 9 18-20" fill="none" stroke="#087443" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
fs.mkdirSync(path.join(outputDir, "assets"), { recursive: true });
fs.writeFileSync(path.join(outputDir, "index.html"), html);
fs.writeFileSync(path.join(outputDir, "data.json"), JSON.stringify({ generatedAt, targetDate, metrics, rows }, null, 2));
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify({ title: "Campanhas Ativas AdOps", description: `Auditoria de ${metrics.active} campanhas ativas e ${metrics.upcoming} próximas entradas em ${fmtDate(targetDate)}.`, kind: "relatorio", thumb: "assets/thumb.png", favicon: "assets/favicon.png", logo: "assets/logo.png", updatedAt: targetDate }, null, 2));
fs.writeFileSync(path.join(outputDir, "assets", "logo.svg"), logo);
fs.writeFileSync(path.join(outputDir, "assets", "favicon.svg"), logo);
console.log(outputDir);
