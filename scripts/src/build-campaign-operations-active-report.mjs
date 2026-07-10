#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const apiBase = (process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, "");
const targetDate = process.env.ADOPS_REPORT_DATE || new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Cuiaba",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const outDir = path.join(repoRoot, "reports", `campaigns-active-${targetDate}`);
const opsEnvFile = process.env.OPS_ENV_FILE || path.join(repoRoot, ".env.adops-operator.local");

function parseEnv(file) {
  if (!existsSync(file)) return {};
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const token = process.env.OPS_API_TOKEN || parseEnv(opsEnvFile).OPS_API_TOKEN || "";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(options.timeoutMs || 45000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

function statusClass(item) {
  if (item.status === "ok" || item.evidence?.status === "approved") return "ok";
  if (item.requiredActions?.includes("publish_on_site")) return "publish";
  if (item.requiredActions?.includes("locate_or_upload_media")) return "media";
  if (item.requiredActions?.includes("generate_evidence")) return "evidence";
  return "warn";
}

function groupBySite(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.siteSigla || "SEM SITE";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

async function enrichItem(item, upcoming = false) {
  const insertionId = item.adops?.insertionId;
  const result = { ...item, upcoming, resolved: null, evidenceThumbs: [] };
  if (insertionId) {
    try {
      result.resolved = await api(`/api/audit-checklists/resolve?insertionId=${insertionId}&date=${encodeURIComponent(item.period?.start || targetDate)}`, { timeoutMs: 15000 });
    } catch (error) {
      result.resolvedError = error.message;
    }
  }
  if (!upcoming && insertionId) {
    const dates = [
      ...(item.evidence?.auditedDates || []),
      ...(item.evidence?.missingDates || []).slice(0, 2),
    ].slice(0, 8);
    for (const date of dates) {
      try {
        const status = await api(`/api/insertions/${insertionId}/capture-proof/status?date=${date}`, { timeoutMs: 15000 });
        result.evidenceThumbs.push({
          date,
          status: status.status || "unknown",
          url: status.arquivoUrl || "",
          approved: status.checklistValidation?.approved === true || status.auditOk === true,
          issues: status.checklistValidation?.blockingIssues || status.audit?.issues || status.issues || [],
        });
      } catch (error) {
        result.evidenceThumbs.push({ date, status: "failed", url: "", approved: false, issues: [{ detail: error.message }] });
      }
    }
  }
  return result;
}

function renderItem(item) {
  const contract = item.resolved;
  const selectors = contract?.expectedSelectors || {};
  const gates = contract?.requiredGates || {};
  const mediaUrl = item.adops?.mediaUrl || item.drive?.mediaFiles?.[0]?.url || "";
  const actions = (item.requiredActions || []).join(", ") || "nenhuma";
  const blocking = (item.blockingIssues || []).join("; ");
  const thumbs = item.evidenceThumbs?.length
    ? item.evidenceThumbs.map((thumb, index) => thumb.url
      ? `<button class="thumb" data-modal="${esc(item.siteSigla)}-${esc(item.adops?.insertionId)}-${index}" type="button"><img src="${esc(thumb.url)}" alt="Evidência ${esc(thumb.date)}"><span>${esc(thumb.date.slice(5))}</span></button>`
      : `<div class="thumb missing"><strong>${esc(thumb.date.slice(5))}</strong><span>${esc(thumb.status)}</span></div>`).join("")
    : `<div class="thumb missing"><strong>sem print</strong><span>${esc(item.evidence?.status || "pendente")}</span></div>`;
  return `
    <article class="card ${esc(statusClass(item))}">
      <header>
        <div>
          <p class="eyebrow">${esc(item.siteSigla)} · ${esc(item.format?.normalized || item.format?.sheet || "-")}</p>
          <h3>${esc(item.piCodigo)} · ${esc(item.campaignName)}</h3>
        </div>
        <span class="pill">${esc(item.status || (item.upcoming ? "upcoming" : "-"))}</span>
      </header>
      <dl>
        <dt>Período</dt><dd>${esc(item.period?.start)} até ${esc(item.period?.end)} <small>${esc(item.period?.original || "")}</small></dd>
        <dt>Inserção</dt><dd>${esc(item.adops?.insertionId || "-")} · campanha ${esc(item.adops?.campaignId || "-")}</dd>
        <dt>Página/posição</dt><dd>${esc(contract?.resolvedRule?.page || "-")} · grupo ${esc(selectors.groupId || "-")} · <code>${esc(selectors.slotSelector || "-")}</code></dd>
        <dt>Mídia</dt><dd>${mediaUrl ? `<a href="${esc(mediaUrl)}" target="_blank" rel="noopener noreferrer">${esc(mediaUrl)}</a>` : "sem mídia"}</dd>
        <dt>Checklist</dt><dd>frame v4=${esc(gates.requireFrameV4)} · scroll=${esc(gates.requireScrollbar)} · final PNG=${esc(gates.requireFinalPngSlotAudit)} · vídeo=${esc(gates.requireVideoControls)}</dd>
        <dt>Ações</dt><dd>${esc(actions)}${blocking ? `<br><strong>Bloqueio:</strong> ${esc(blocking)}` : ""}</dd>
      </dl>
      <div class="thumbs">${thumbs}</div>
    </article>
  `;
}

function renderModal(item) {
  return (item.evidenceThumbs || []).map((thumb, index) => thumb.url ? `
    <dialog id="${esc(item.siteSigla)}-${esc(item.adops?.insertionId)}-${index}">
      <button type="button" class="close">fechar</button>
      <img src="${esc(thumb.url)}" alt="Evidência ${esc(thumb.date)}">
      <aside>
        <h3>${esc(item.piCodigo)} · ${esc(thumb.date)}</h3>
        <p>Status: ${esc(thumb.status)} · aprovado=${esc(thumb.approved)}</p>
        <a href="${esc(thumb.url)}" target="_blank" rel="noopener noreferrer">abrir imagem</a>
      </aside>
    </dialog>
  ` : "").join("");
}

function renderSection(title, items) {
  return groupBySite(items).map(([site, siteItems]) => `
    <section>
      <div class="site-head"><h2>${esc(title)} · ${esc(site)}</h2><span>${siteItems.length} campanha(s)</span></div>
      <div class="grid">${siteItems.map(renderItem).join("")}</div>
    </section>
  `).join("");
}

async function main() {
  const active = await api(`/api/campaign-operations/active?date=${targetDate}&includeEvidence=true&refreshDrive=false`, { timeoutMs: 60000 });
  const items = [];
  for (const item of active.items || []) items.push(await enrichItem(item, false));
  const upcoming = [];
  for (const item of active.upcomingItems || []) upcoming.push(await enrichItem(item, true));

  const all = [...items, ...upcoming];
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Campanhas ativas e próximas · ${esc(targetDate)}</title>
  <style>
    :root { color-scheme: light; --bg:#fbf7f0; --panel:#fffdfa; --ink:#1f2328; --muted:#667085; --line:#e7ddcf; --ok:#0f7b45; --warn:#a15c00; --bad:#b42318; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--ink); }
    main { max-width: 1240px; margin:0 auto; padding:28px; }
    .hero { display:grid; gap:10px; margin-bottom:24px; }
    .hero h1 { font-size:clamp(30px,4vw,52px); line-height:1; margin:0; letter-spacing:0; }
    .summary { display:flex; flex-wrap:wrap; gap:8px; }
    .metric { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px 12px; min-width:130px; }
    .metric b { display:block; font-size:24px; }
    section { margin:28px 0; }
    .site-head { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); margin-bottom:12px; padding-bottom:8px; }
    .site-head h2 { margin:0; font-size:20px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:12px; }
    .card { background:var(--panel); border:1px solid var(--line); border-left:5px solid var(--muted); border-radius:8px; padding:14px; }
    .card.ok { border-left-color:var(--ok); } .card.publish,.card.evidence,.card.media { border-left-color:var(--warn); }
    .card header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .eyebrow { color:var(--muted); font-weight:800; font-size:12px; text-transform:uppercase; margin:0 0 4px; }
    h3 { margin:0; font-size:18px; }
    .pill { border:1px solid var(--line); border-radius:999px; padding:4px 8px; font-size:12px; font-weight:800; white-space:nowrap; }
    dl { display:grid; grid-template-columns:92px 1fr; gap:7px 10px; margin:14px 0; font-size:13px; }
    dt { color:var(--muted); } dd { margin:0; overflow-wrap:anywhere; } code { background:#f2ece2; border-radius:4px; padding:1px 4px; }
    a { color:#155eef; }
    .thumbs { display:grid; grid-template-columns:repeat(auto-fill,minmax(116px,1fr)); gap:8px; }
    .thumb { position:relative; border:0; padding:0; min-height:72px; border-radius:6px; overflow:hidden; background:#eee; cursor:pointer; }
    .thumb img { width:100%; height:100%; aspect-ratio:16/9; object-fit:cover; display:block; }
    .thumb span { position:absolute; left:5px; bottom:5px; background:rgba(0,0,0,.7); color:white; border-radius:999px; padding:2px 6px; font-size:11px; font-weight:800; }
    .thumb.missing { display:grid; place-items:center; border:1px dashed var(--line); color:var(--muted); }
    dialog { width:min(1120px,94vw); border:0; border-radius:10px; padding:0; background:#111; color:white; }
    dialog::backdrop { background:rgba(0,0,0,.65); }
    dialog img { display:block; max-width:100%; max-height:80vh; margin:auto; }
    dialog aside { padding:12px 16px; background:#1d1d1d; }
    .close { position:absolute; top:8px; right:8px; border:0; border-radius:999px; padding:8px 10px; cursor:pointer; }
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <p class="eyebrow">AdOps · API campaign-operations/active</p>
      <h1>Campanhas ativas e próximas</h1>
      <p>Data de referência: <strong>${esc(targetDate)}</strong>. Fonte: planilha do mês corrente, AdOps, checklist central e status de evidência.</p>
      <div class="summary">
        <div class="metric"><span>Ativas na planilha</span><b>${esc(active.summary?.activeInSheet ?? 0)}</b></div>
        <div class="metric"><span>Casadas no AdOps</span><b>${esc(active.summary?.matchedInAdOps ?? 0)}</b></div>
        <div class="metric"><span>Publicação pendente</span><b>${esc(active.summary?.needsPublication ?? 0)}</b></div>
        <div class="metric"><span>Evidência pendente</span><b>${esc(active.summary?.needsEvidence ?? 0)}</b></div>
        <div class="metric"><span>Próximas</span><b>${esc(active.summary?.upcomingInSheet ?? 0)}</b></div>
      </div>
    </div>
    ${renderSection("Ativas", items)}
    ${renderSection("Próximas entradas no ar", upcoming)}
  </main>
  ${all.map(renderModal).join("")}
  <script>
    document.querySelectorAll('.thumb[data-modal]').forEach(btn => btn.addEventListener('click', () => document.getElementById(btn.dataset.modal)?.showModal()));
    document.querySelectorAll('dialog .close').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog').close()));
  </script>
</body>
</html>`;

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html, "utf8");
  await writeFile(path.join(outDir, "data.json"), JSON.stringify({ generatedAt: new Date().toISOString(), targetDate, active, items, upcoming }, null, 2), "utf8");
  console.log(path.join(outDir, "index.html"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
