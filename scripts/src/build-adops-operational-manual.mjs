#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSafePublishCommand,
  buildSafeRollbackCommand,
  buildManualManifest,
  classifyManualDocument,
  extractMarkdownHeadings,
  renderTrustedMarkdown,
  validateManualSources,
} from "./adops-operational-manual-contract.mjs";
import {
  findReportsMountSource,
  MONTHLY_REPORT_PORTAINER_TIMEOUT_MS,
  resolveReportPortainerUrl,
  resolveReportsPublishMount,
} from "./monthly-evidence-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const slug = "adops-manual-operacional";
const outputDir = process.env.ADOPS_MANUAL_OUTPUT_DIR || path.join(repoRoot, "docs/reports", slug);
const generatedAt = process.env.ADOPS_MANUAL_GENERATED_AT || new Date().toISOString();
const publicUrl = `https://sites.codigo5.com.br/reports/${slug}/`;
const portainerEnvFile = process.env.PORTAINER_ENV_FILE || "/Users/leandrobosaipo/Projetos/macmini/.env.portainer";
const assetRoot = "/Users/leandrobosaipo/.agents/skills/cod5-visual-action-report/assets";

const sourceDefinitions = [
  { path: "docs/START_HERE_ADOPS.md", title: "Comece aqui", category: "operacao", tasks: ["operacao", "incidentes"] },
  { path: "docs/runbook-nova-pi-evidencias.md", title: "Nova PI, publicação e evidências", category: "campanhas", tasks: ["campanhas", "evidencias", "operacao"] },
  { path: "docs/adops/ops-api-runbook.md", title: "API operacional", category: "api", tasks: ["api", "evidencias", "incidentes"] },
  { path: "docs/adops/evidence-monthly-report/runbook.md", title: "Relatório mensal", category: "evidencias", tasks: ["evidencias", "operacao", "incidentes"] },
  { path: "docs/adops/system/RUNBOOK.md", title: "Produção e manutenção", category: "manutencao", tasks: ["manutencao", "incidentes"] },
  { path: "docs/status-do-projeto.md", title: "Estado confirmado", category: "operacao", tasks: ["operacao", "incidentes"] },
];

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return [];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function buildHtml(documents, manifest) {
  const cards = documents.map((document, index) => `
    <article class="manual-card" id="doc-${index}" data-category="${document.tasks.join(" ")}" data-search="${escapeHtml(document.searchText)}">
      <header class="card-header"><div><span class="eyebrow">${escapeHtml(document.typeLabel)}</span><h2>${escapeHtml(document.title)}</h2></div><span class="status">vigente</span></header>
      <details ${index === 0 ? "open" : ""}><summary>Abrir orientação</summary><div class="markdown">${document.html}</div></details>
    </article>`).join("");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="description" content="${escapeHtml(manifest.description)}">
<title>${escapeHtml(manifest.title)}</title><link rel="icon" href="assets/favicon.png"><link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<style>
:root{--blue:#0755a5;--blue-2:#eaf3fc;--ink:#172033;--muted:#5e687b;--line:#d9e1eb;--bg:#f4f7fa;--white:#fff;--ok:#187448;--radius:4px;color-scheme:light}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.skip{position:absolute;left:8px;top:-60px;background:var(--ink);color:#fff;padding:12px;z-index:10}.skip:focus{top:8px}.shell{width:min(1180px,calc(100% - 32px));margin:auto}.hero{background:linear-gradient(125deg,#07396c,#0968bf);color:#fff;padding:30px 0 26px}.brand{display:flex;gap:14px;align-items:center}.brand img{width:48px;height:48px;object-fit:contain;background:#fff;border-radius:var(--radius)}h1{font-size:clamp(1.8rem,4vw,2.7rem);line-height:1.08;margin:4px 0 8px}.hero p{margin:0;max-width:760px;color:#eaf4ff}.hero-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}.hero-meta span{border:1px solid #ffffff55;padding:6px 9px;border-radius:var(--radius);font-size:.85rem}.controls{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5;padding:14px 0}.control-grid{display:grid;grid-template-columns:minmax(220px,1fr) 2fr;gap:12px}.search{width:100%;min-height:44px;border:1px solid #8794a7;border-radius:var(--radius);padding:0 13px;font:inherit}.filters{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.filter{min-height:44px;white-space:nowrap;border:1px solid #8aa0b7;background:#fff;color:#173c61;border-radius:var(--radius);padding:0 13px;font-weight:650;cursor:pointer}.filter[aria-pressed="true"]{background:var(--blue);color:#fff;border-color:var(--blue)}:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}.content{padding:24px 0 48px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.metric,.manual-card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 2px 10px #20344d0d}.metric{padding:15px}.metric strong{display:block;font-size:1.45rem;color:var(--blue)}.metric span{color:var(--muted);font-size:.9rem}.result{color:var(--muted);margin:10px 0 16px}.cards{display:grid;gap:16px}.manual-card{padding:20px;min-width:0}.card-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.card-header h2{margin:2px 0 10px;font-size:1.35rem}.eyebrow{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--blue);font-weight:750}.status{color:var(--ok);background:#e7f5ed;border:1px solid #abd6be;padding:4px 8px;border-radius:var(--radius);font-size:.78rem;font-weight:750}details summary{min-height:44px;display:flex;align-items:center;color:var(--blue);font-weight:700;cursor:pointer}.markdown{border-top:1px solid var(--line);padding-top:8px;overflow-wrap:anywhere}.markdown h1{font-size:1.55rem;color:var(--ink);margin-top:22px}.markdown h2{font-size:1.3rem;margin-top:26px}.markdown h3{font-size:1.1rem}.markdown a{color:#0057a8}.markdown code{background:#edf1f5;border-radius:3px;padding:2px 5px;font-size:.9em}.markdown pre{background:#142033;color:#eef6ff;padding:14px;border-radius:var(--radius);overflow:auto}.markdown pre code{background:transparent;padding:0}.markdown blockquote{margin:15px 0;padding:10px 14px;border-left:4px solid var(--blue);background:var(--blue-2)}.markdown p{max-width:88ch}.markdown ul{padding-left:22px}.table-wrap{max-width:100%;overflow:auto;margin:14px 0}.markdown table{width:100%;border-collapse:collapse;min-width:560px}.markdown th,.markdown td{text-align:left;vertical-align:top;border:1px solid var(--line);padding:9px}.markdown th{background:var(--blue-2)}.empty{display:none;background:#fff4dc;border:1px solid #d8ad56;padding:16px;border-radius:var(--radius)}footer{padding:24px 0 38px;color:var(--muted);font-size:.9rem}.hidden{display:none!important}@media(max-width:760px){.shell{width:min(100% - 20px,1180px)}.control-grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.controls{position:static}.manual-card{padding:15px}.card-header{align-items:start}.markdown{font-size:.96rem}.markdown pre{margin-inline:0;max-width:100%}}@media(max-width:420px){.metrics{grid-template-columns:1fr 1fr}.metric{padding:12px}.metric strong{font-size:1.2rem}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style></head><body><a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="hero"><div class="shell"><div class="brand"><img src="assets/logo.png" alt="Código5"><div><span class="eyebrow" style="color:#cfe7ff">Documentação viva</span><h1>Manual Operacional AdOps</h1></div></div><p>Rotinas vigentes para cadastrar, publicar, auditar, entregar e manter campanhas sem duplicidade e com evidência verificável.</p><div class="hero-meta"><span>Release 47e0dab</span><span>Validado em 12/08/2026</span><span>Acesso não listado</span></div></div></header>
<nav class="controls" aria-label="Filtrar manual"><div class="shell control-grid"><label><span class="eyebrow">Buscar tarefa</span><input class="search" id="manual-search" type="search" placeholder="Campanha, PI, print, ZIP ou incidente"></label><div class="filters" aria-label="Categorias"><button class="filter" data-filter="all" aria-pressed="true">Tudo</button>${[["operacao","Operação"],["campanhas","Campanhas"],["evidencias","Evidências"],["api","API"],["manutencao","Manutenção"],["incidentes","Incidentes"]].map(([key,label])=>`<button class="filter" data-filter="${key}" aria-pressed="false">${label}</button>`).join("")}</div></div></nav>
<main id="conteudo" class="shell content"><section class="metrics" aria-label="Resumo"><div class="metric"><strong>6</strong><span>fontes canônicas</span></div><div class="metric"><strong>5</strong><span>camadas operacionais</span></div><div class="metric"><strong>3</strong><span>exportações simultâneas</span></div><div class="metric"><strong>1</strong><span>captura por vez</span></div></section><p class="result" id="result-count" aria-live="polite">6 orientações encontradas</p><div class="empty" id="empty">Nenhuma orientação encontrada. Limpe a busca ou selecione outra categoria.</div><section class="cards">${cards}</section></main>
<footer><div class="shell">Fonte: Markdown versionado. Wire contract: <a href="https://adops-api.codigo5.com.br/api/docs">OpenAPI vivo</a>. Conteúdo não listado não equivale a autenticação.</div></footer>
<script>(()=>{const search=document.querySelector('#manual-search');const buttons=[...document.querySelectorAll('[data-filter]')];const cards=[...document.querySelectorAll('.manual-card')];const count=document.querySelector('#result-count');const empty=document.querySelector('#empty');let filter='all';const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();function apply(){const q=norm(search.value);let visible=0;for(const card of cards){const categories=card.dataset.category.split(' ');const okFilter=filter==='all'||categories.includes(filter);const okSearch=!q||norm(card.dataset.search).includes(q);card.classList.toggle('hidden',!(okFilter&&okSearch));if(okFilter&&okSearch)visible++}count.textContent=visible+' '+(visible===1?'orientação encontrada':'orientações encontradas');empty.style.display=visible?'none':'block'}search.addEventListener('input',apply);for(const button of buttons)button.addEventListener('click',()=>{filter=button.dataset.filter;for(const item of buttons)item.setAttribute('aria-pressed',String(item===button));apply()});})();</script></body></html>`;
}

function readSources() {
  const sources = sourceDefinitions.map((definition) => {
    const absolutePath = path.join(repoRoot, definition.path);
    const content = readFileSync(absolutePath, "utf8");
    return { ...definition, content };
  });
  validateManualSources(sources);
  return sources.map((source) => ({
    path: source.path,
    title: source.title,
    category: source.category,
    tasks: source.tasks,
    status: "vigente",
    type: classifyManualDocument(source.path),
    typeLabel: ({ tutorial: "Tutorial", reference: "Referência", "how-to": "Como fazer", explanation: "Estado" })[classifyManualDocument(source.path)],
    headings: extractMarkdownHeadings(source.content),
    html: renderTrustedMarkdown(source.content),
    searchText: source.content.replace(/\s+/g, " ").toLowerCase(),
    sha256: createHash("sha256").update(source.content).digest("hex"),
  }));
}

async function copyAssets() {
  const target = path.join(outputDir, "assets");
  await mkdir(target, { recursive: true });
  const mapping = [["logo.png","logo.png"],["favicon.png","favicon.png"],["logo.png","apple-touch-icon.png"],["thumb.png","thumb.png"]];
  for (const [source, name] of mapping) await copyFile(path.join(assetRoot, source), path.join(target, name));
}

function validateOutput(html, data, manifest) {
  if (manifest.visibility !== "unlisted" || !html.includes('content="noindex,nofollow"')) throw new Error("Gate de privacidade do manual falhou.");
  if (data.documents.length !== 6) throw new Error("Quantidade de fontes canônicas inválida.");
  const forbidden = [/Bearer\s+[A-Za-z0-9._-]{12,}/, /PORTAINER_API_KEY\s*=\s*[^.<\s]/, /OPS_API_TOKEN\s*=\s*[^.<\s]/];
  if (forbidden.some((pattern) => pattern.test(html))) throw new Error("Possível segredo detectado no HTML.");
}

function validateReportDirectory(directory) {
  for (const relativePath of ["index.html", "data.json", "report.json", "assets/logo.png", "assets/favicon.png", "assets/apple-touch-icon.png", "assets/thumb.png"]) {
    const absolutePath = path.join(directory, relativePath);
    if (!existsSync(absolutePath) || readFileSync(absolutePath).length === 0) throw new Error(`Artefato ausente ou vazio: ${relativePath}`);
  }
  const report = JSON.parse(readFileSync(path.join(directory, "report.json"), "utf8"));
  const data = JSON.parse(readFileSync(path.join(directory, "data.json"), "utf8"));
  const html = readFileSync(path.join(directory, "index.html"), "utf8");
  validateOutput(html, data, report);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = MONTHLY_REPORT_PORTAINER_TIMEOUT_MS) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
}

async function validatePublicReadback(token) {
  for (const relativePath of ["", "report.json", "data.json", "assets/logo.png"]) {
    const separator = relativePath ? "?" : "?";
    const response = await fetchWithTimeout(`${publicUrl}${relativePath}${separator}v=${token}`, { redirect: "follow", cache: "no-store" }, 20_000);
    if (!response.ok) throw new Error(`Readback público falhou em ${relativePath || "index.html"}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`Readback público vazio em ${relativePath || "index.html"}`);
    if (relativePath === "report.json") {
      const report = JSON.parse(bytes.toString("utf8"));
      if (report.visibility !== "unlisted" || report.sourceHash !== manifest.sourceHash) throw new Error("Readback público não corresponde ao manifesto publicado.");
    }
    if (!relativePath && !bytes.toString("utf8").includes('content="noindex,nofollow"')) throw new Error("Readback público perdeu noindex,nofollow.");
  }
}

async function publishReport() {
  const directMount = resolveReportsPublishMount(process.env);
  const token = Date.now();
  const destination = path.join(directMount, slug);
  const staging = path.join(directMount, `${slug}.staging-${token}`);
  const backup = path.join(directMount, `${slug}.backup-${token}`);
  const failed = path.join(directMount, `${slug}.failed-${token}`);
  if (directMount) {
    await cp(outputDir, staging, { recursive: true });
    validateReportDirectory(staging);
    if (existsSync(destination)) await rename(destination, backup);
    try {
      await rename(staging, destination);
      await validatePublicReadback(token);
    } catch (error) {
      if (existsSync(destination)) await rename(destination, failed);
      if (existsSync(backup) && !existsSync(destination)) await rename(backup, destination);
      throw error;
    }
    return;
  }
  const env = { ...parseEnvFile(portainerEnvFile), ...process.env };
  const baseUrl = resolveReportPortainerUrl(env);
  if (!baseUrl || !env.PORTAINER_API_KEY) throw new Error("Portainer não configurado para publicação.");
  const request = async (method, apiPath, body, rawBody, headers = {}) => {
    const response = await fetchWithTimeout(`${baseUrl}${apiPath}`, { method, headers: { "X-API-Key": env.PORTAINER_API_KEY, ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : rawBody });
    const text = await response.text(); if (!response.ok) throw new Error(`Portainer ${method} ${apiPath} HTTP ${response.status}: ${text.slice(0,300)}`);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  };
  const containers = await request("GET", "/api/endpoints/3/docker/containers/json?all=true");
  const sites = containers.find((item) => (item.Names || []).includes("/sites-index"));
  if (!sites) throw new Error("Container sites-index não encontrado.");
  const inspect = await request("GET", `/api/endpoints/3/docker/containers/${sites.Id}/json`);
  const mountSource = findReportsMountSource(inspect.Mounts);
  const stagingName = `${slug}.staging-${token}`; const backupName = `${slug}.backup-${token}`;
  const tempRoot = path.join("/tmp", `${slug}-publish-${token}`); const tempDir = path.join(tempRoot, stagingName); const tarPath = `${tempRoot}.tar`;
  await mkdir(tempRoot, { recursive: true }); await cp(outputDir, tempDir, { recursive: true });
  const tar = spawnSync("tar", ["--no-xattrs", "-C", tempRoot, "-cf", tarPath, stagingName], { encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1" } });
  if (tar.status !== 0) throw new Error(tar.stderr || "tar falhou");
  const helper = await request("POST", `/api/endpoints/3/docker/containers/create?name=adops-manual-publish-${token}`, { Image: "node:22-alpine", Cmd: ["sh","-lc","sleep 120"], HostConfig: { Binds: [`${mountSource}:/target`], NetworkMode: "none", RestartPolicy: { Name: "no" } } });
  await request("POST", `/api/endpoints/3/docker/containers/${helper.Id}/start`);
  const runInHelper = async (command) => {
    const created = await request("POST", `/api/endpoints/3/docker/containers/${helper.Id}/exec`, { AttachStdout: true, AttachStderr: true, Cmd: ["sh","-lc",command] });
    await request("POST", `/api/endpoints/3/docker/exec/${created.Id}/start`, { Detach: false, Tty: false });
    const result = await request("GET", `/api/endpoints/3/docker/exec/${created.Id}/json`);
    if (result.ExitCode !== 0) throw new Error(`Comando de publicação falhou: ${command.split(" ")[0]}`);
  };
  let promoted = false;
  try {
    await request("PUT", `/api/endpoints/3/docker/containers/${helper.Id}/archive?path=${encodeURIComponent("/target")}`, null, readFileSync(tarPath), { "content-type": "application/x-tar" });
    await runInHelper(`cd /target && test -s '${stagingName}/index.html' && test -s '${stagingName}/data.json' && test -s '${stagingName}/report.json' && test -s '${stagingName}/assets/logo.png'`);
    await runInHelper(buildSafePublishCommand({ slug, stagingName, backupName }));
    promoted = true;
    await validatePublicReadback(token);
  } catch (error) {
    if (promoted) {
      await runInHelper(buildSafeRollbackCommand({ slug, backupName, failedName: `${slug}.failed-${token}` })).catch((rollbackError) => {
        throw new AggregateError([error, rollbackError], "Publicação e rollback do manual falharam.");
      });
    }
    throw error;
  } finally {
    await request("POST", `/api/endpoints/3/docker/containers/${helper.Id}/stop?t=2`).catch(()=>null); await request("DELETE", `/api/endpoints/3/docker/containers/${helper.Id}?v=false&force=true`).catch(()=>null); await rm(tempRoot,{recursive:true,force:true}); await rm(tarPath,{force:true});
  }
}

const documents = readSources();
const manifest = { ...buildManualManifest(generatedAt), url: publicUrl, sourceHash: createHash("sha256").update(documents.map((item) => item.sha256).join(":" )).digest("hex") };
const data = { generatedAt, release: "47e0dab", documents: documents.map(({ html, searchText, ...document }) => document) };
const html = buildHtml(documents, manifest);
validateOutput(html, data, manifest);
await mkdir(outputDir, { recursive: true }); await copyAssets();
await Promise.all([writeFile(path.join(outputDir,"index.html"),html),writeFile(path.join(outputDir,"data.json"),JSON.stringify(data,null,2)+"\n"),writeFile(path.join(outputDir,"report.json"),JSON.stringify(manifest,null,2)+"\n")]);
validateReportDirectory(outputDir);
if (process.env.ADOPS_MANUAL_SKIP_PUBLISH !== "1") await publishReport();
console.log(JSON.stringify({ ok:true, outputDir, publicUrl, published: process.env.ADOPS_MANUAL_SKIP_PUBLISH !== "1", sourceHash: manifest.sourceHash }));
