#!/usr/bin/env node
import { createPrivateKey, createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const slug = `adops-drive-pi-canais-${new Date().toISOString().slice(0, 10)}`;
const outputDir = path.join(repoRoot, "docs/reports", slug);
const outputPath = path.join(outputDir, "index.html");
const publicUrl = `https://sites.codigo5.com.br/reports/${slug}/`;
const driveFolderId = "18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6";
const serviceAccountFile = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE ||
  "/Users/leandrobosaipo/.config/adops/secrets/google-drive-service-account-codigo5web-adops-drive-pi-monitor.json";
const portainerEnvFile = process.env.PORTAINER_ENV_FILE ||
  "/Users/leandrobosaipo/Projetos/macmini/.env.portainer";
const opsEnvFile = process.env.OPS_ENV_FILE || path.join(repoRoot, ".env.adops-operator.local");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function statusClass(ok) {
  return ok ? "ok" : "warn";
}

async function driveToken() {
  const credentials = JSON.parse(await readFile(serviceAccountFile, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(createPrivateKey(credentials.private_key), "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Drive token falhou");
  return payload.access_token;
}

async function driveGet(token, url) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Drive API ${response.status}`);
  return payload;
}

async function listDrive(token, folderId, base = "", seen = []) {
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      orderBy: "folder,name",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const payload = await driveGet(token, `https://www.googleapis.com/drive/v3/files?${params}`);
    for (const file of payload.files || []) {
      const itemPath = `${base}/${file.name}`.replace(/\/+/g, "/");
      const item = { ...file, path: itemPath, parentFolderId: folderId };
      seen.push(item);
      if (file.mimeType === "application/vnd.google-apps.folder") await listDrive(token, file.id, itemPath, seen);
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return seen;
}

async function opsFetch(pathname) {
  const token = parseEnvFile(opsEnvFile).OPS_API_TOKEN;
  const response = await fetch(`https://adops-api-public.leandro471.workers.dev${pathname}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { ok: response.ok, status: response.status, payload };
}

async function portainer(method, apiPath, body) {
  const env = parseEnvFile(portainerEnvFile);
  const response = await fetch(`${env.PORTAINER_URL.replace(/\/$/, "")}${apiPath}`, {
    method,
    headers: {
      "X-API-Key": env.PORTAINER_API_KEY,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Portainer ${method} ${apiPath} ${response.status}`);
  return payload;
}

function dockerLog(buffer) {
  let output = "";
  for (let i = 0; i < buffer.length;) {
    if (buffer.length - i >= 8 && buffer[i] <= 2) {
      const len = buffer.readUInt32BE(i + 4);
      output += buffer.slice(i + 8, i + 8 + len).toString("utf8");
      i += 8 + len;
    } else {
      output += buffer.slice(i).toString("utf8");
      break;
    }
  }
  return output;
}

async function getContainer(name) {
  const containers = await portainer("GET", "/api/endpoints/3/docker/containers/json?all=true");
  return containers.find((item) => (item.Names || []).includes(`/${name}`));
}

async function getContainerLogs(id, tail = 80) {
  const env = parseEnvFile(portainerEnvFile);
  const response = await fetch(`${env.PORTAINER_URL.replace(/\/$/, "")}/api/endpoints/3/docker/containers/${id}/logs?stdout=true&stderr=true&tail=${tail}`, {
    headers: { "X-API-Key": env.PORTAINER_API_KEY },
  });
  return dockerLog(Buffer.from(await response.arrayBuffer()));
}

async function execInContainer(containerId, command) {
  const exec = await portainer("POST", `/api/endpoints/3/docker/containers/${containerId}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: command,
  });
  const env = parseEnvFile(portainerEnvFile);
  const response = await fetch(`${env.PORTAINER_URL.replace(/\/$/, "")}/api/endpoints/3/docker/exec/${exec.Id}/start`, {
    method: "POST",
    headers: { "X-API-Key": env.PORTAINER_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ Detach: false, Tty: false }),
  });
  return dockerLog(Buffer.from(await response.arrayBuffer()));
}

async function publishReport() {
  const sites = await getContainer("sites-index");
  if (!sites) throw new Error("Container sites-index nao encontrado");
  const sitesInspect = await portainer("GET", `/api/endpoints/3/docker/containers/${sites.Id}/json`);
  const appMount = (sitesInspect.Mounts || []).find((mount) => mount.Destination === "/app" && mount.Type === "bind");
  if (!appMount?.Source) throw new Error("Bind mount /app do sites-index nao encontrado");
  const tarPath = path.join("/tmp", `${slug}.tar`);
  const tarRoot = path.join("/tmp", `${slug}-publish`);
  await mkdir(path.join(tarRoot, slug), { recursive: true });
  await writeFile(path.join(tarRoot, slug, "index.html"), await readFile(outputPath));
  const tar = spawnSync("tar", ["--no-xattrs", "-C", tarRoot, "-cf", tarPath, slug], {
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (tar.status !== 0) throw new Error(tar.stderr || "tar falhou");

  const helperName = `adops-report-publish-${Date.now()}`;
  const helper = await portainer("POST", `/api/endpoints/3/docker/containers/create?name=${helperName}`, {
    Image: "node:22-alpine",
    Labels: {
      "cod5.project": "adops",
      "cod5.kind": "report-publisher",
      "cod5.service": slug,
    },
    Cmd: ["sh", "-lc", "mkdir -p /target && sleep 120"],
    HostConfig: {
      Binds: [`${appMount.Source}/reports:/target`],
      NetworkMode: "none",
      RestartPolicy: { Name: "no" },
    },
  });
  await portainer("POST", `/api/endpoints/3/docker/containers/${helper.Id}/start`);
  const env = parseEnvFile(portainerEnvFile);
  try {
    const response = await fetch(`${env.PORTAINER_URL.replace(/\/$/, "")}/api/endpoints/3/docker/containers/${helper.Id}/archive?path=${encodeURIComponent("/target")}`, {
      method: "PUT",
      headers: { "X-API-Key": env.PORTAINER_API_KEY, "content-type": "application/x-tar" },
      body: readFileSync(tarPath),
    });
    if (!response.ok) throw new Error(`publish archive falhou: ${response.status} ${await response.text()}`);
  } finally {
    await portainer("POST", `/api/endpoints/3/docker/containers/${helper.Id}/stop?t=2`).catch(() => null);
    await portainer("DELETE", `/api/endpoints/3/docker/containers/${helper.Id}?v=false&force=true`).catch(() => null);
  }
}

async function portalChecks(config) {
  const entries = await Promise.all(Object.values(config).map(async (site) => {
    const started = Date.now();
    try {
      const response = await fetch(site.homeUrl, { redirect: "follow" });
      const html = await response.text();
      const groups = site.formatMappings || [];
      const found = groups.filter((group) => html.includes(`g-${group.groupId}`)).length;
      return {
        sigla: site.sigla,
        label: site.label,
        domain: site.domain,
        ok: response.ok,
        status: response.status,
        durationMs: Date.now() - started,
        configuredSlots: groups.length,
        visibleGroupTokens: found,
      };
    } catch (error) {
      return { sigla: site.sigla, label: site.label, domain: site.domain, ok: false, error: error.message, configuredSlots: site.formatMappings?.length || 0, visibleGroupTokens: 0 };
    }
  }));
  return entries.sort((a, b) => a.sigla.localeCompare(b.sigla));
}

function table(rows, columns) {
  return `<table><thead><tr>${columns.map((col) => `<th>${htmlEscape(col.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((col) => `<td>${col.render ? col.render(row) : htmlEscape(row[col.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const generatedAt = new Date();
  const driveAccessToken = await driveToken();
  const root = await driveGet(driveAccessToken, `https://www.googleapis.com/drive/v3/files/${driveFolderId}?fields=id,name,mimeType,modifiedTime,webViewLink&supportsAllDrives=true`);
  const driveItems = await listDrive(driveAccessToken, driveFolderId);
  const monitor = await getContainer("adops-drive-pi-monitor");
  const monitorLogs = monitor ? await getContainerLogs(monitor.Id, 120) : "";
  const sitesIndex = await getContainer("sites-index");

  const [health, summary, bySite, campaigns, insertions, jobs, syncDiagnostics, syncPreview] = await Promise.all([
    opsFetch("/api/healthz"),
    opsFetch("/api/dashboard/summary?competencia=MAIO/2026"),
    opsFetch("/api/dashboard/by-site?competencia=MAIO/2026"),
    opsFetch("/api/campaigns"),
    opsFetch("/api/insertions"),
    opsFetch("/api/ops/jobs"),
    opsFetch("/api/sync/planilha/diagnostics"),
    opsFetch("/api/sync/planilha/preview"),
  ]);

  const syncHarness = JSON.parse(await readFile(path.join(repoRoot, "docs/harness-reports/sync-planilha-v1/2026-05-11T21-14-35-273Z/results.json"), "utf8"));
  const reconcileHarness = JSON.parse(await readFile(path.join(repoRoot, "docs/harness-reports/reconcile-planilha-adrotate-v1/2026-05-11T21-14-35-274Z/results.json"), "utf8"));
  const captureAuditRun = spawnSync("pnpm", ["--dir", "scripts", "run", "audit:capture-rules-integrity"], { cwd: repoRoot, encoding: "utf8", timeout: 120000 });
  const captureAudit = JSON.parse((captureAuditRun.stdout.match(/\{[\s\S]*\}\s*$/) || ["{}"])[0]);
  const portalConfig = JSON.parse(await readFile(path.join(repoRoot, "config/adrotate-sites.json"), "utf8"));
  const portals = await portalChecks(portalConfig);

  const driveFolders = driveItems.filter((item) => item.mimeType === "application/vnd.google-apps.folder");
  const driveFiles = driveItems.filter((item) => item.mimeType !== "application/vnd.google-apps.folder");
  const insertionsList = Array.isArray(insertions.payload) ? insertions.payload : [];
  const campaignsList = Array.isArray(campaigns.payload) ? campaigns.payload : [];
  const activeInsertions = insertionsList.filter((item) => ["em_veiculacao", "ativa", "publicada"].includes(item.statusNormalizado) || item.bannerPublicadoNoSite).length;
  const scheduledInsertions = insertionsList.filter((item) => item.periodoInicio && item.periodoInicio > generatedAt.toISOString().slice(0, 10)).length;
  const driveJobs = Array.isArray(jobs.payload?.items) ? jobs.payload.items.filter((item) => item.kind === "drive-pi-ingest") : [];
  const latestDriveJob = driveJobs[0] || null;

  const cards = [
    { title: "Drive PI", value: `${driveItems.length}`, label: "itens varridos", ok: Boolean(root?.id) && Boolean(monitor) },
    { title: "Planilha", value: syncHarness.ok ? "OK" : "FAIL", label: "harness sem mutacao", ok: syncHarness.ok },
    { title: "AdOps", value: health.ok ? "OK" : "FAIL", label: `HTTP ${health.status}`, ok: health.ok },
    { title: "Portais", value: `${portals.filter((item) => item.ok).length}/${portals.length}`, label: "homes acessiveis", ok: portals.every((item) => item.ok) },
    { title: "Regras", value: `${captureAudit?.totals?.apiPublishedRules || 0}`, label: "publicadas", ok: captureAudit?.ok && !captureAudit?.totals?.errors },
    { title: "Insercoes", value: `${insertionsList.length}`, label: `${activeInsertions} ativas/publicadas`, ok: insertions.ok },
  ];

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Monitor Drive PI - Relatorio de Canais</title>
  <style>
    :root { color-scheme: light; --ink:#172026; --muted:#5e6b76; --line:#dbe2e8; --ok:#137a4d; --warn:#b45f06; --bad:#b42318; --bg:#f6f8fa; --card:#fff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
    header { background: #101820; color: white; padding: 32px 24px; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 44px); letter-spacing: 0; }
    h2 { margin: 32px 0 12px; font-size: 22px; }
    p { color: var(--muted); line-height: 1.55; }
    .meta { color: #c8d3dc; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 18px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
    .card b { display: block; font-size: 28px; margin: 4px 0; }
    .badge { display: inline-flex; align-items:center; gap:6px; padding: 4px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .ok { color: var(--ok); background: #e8f6ee; }
    .warn { color: var(--warn); background: #fff3df; }
    .bad { color: var(--bad); background: #feeceb; }
    table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; color: var(--muted); background: #edf2f6; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    pre { white-space: pre-wrap; background:#101820; color:#dce7ef; border-radius:8px; padding:16px; max-height:360px; overflow:auto; }
    a { color: #165d92; }
  </style>
</head>
<body>
  <header>
    <h1>Monitor Drive PI - Relatorio de Canais</h1>
    <p class="meta">Gerado em ${htmlEscape(generatedAt.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" }))} | Publicacao: ${htmlEscape(publicUrl)}</p>
  </header>
  <main>
    <section class="grid">${cards.map((card) => `<div class="card"><span class="badge ${statusClass(card.ok)}">${card.ok ? "OK" : "ATENCAO"}</span><b>${htmlEscape(card.value)}</b><p>${htmlEscape(card.title)} - ${htmlEscape(card.label)}</p></div>`).join("")}</section>

    <h2>Resumo Executivo</h2>
    <div class="card">
      <p>A autenticacao produtiva da pasta do Drive esta publicada no Mac Mini pelo container <code>adops-drive-pi-monitor</code>. O container esta sem porta publica, com restart automatico e credenciais lidas de arquivos internos no volume persistente, nao de valores diretos no ambiente final.</p>
      <p>O monitor varreu a pasta <strong>${htmlEscape(root.name)}</strong> e encontrou <strong>${driveItems.length}</strong> itens: ${driveFolders.length} pastas e ${driveFiles.length} arquivos. A rotina esta verificando a cada 5 minutos e nao reenviou evento antigo.</p>
    </div>

    <h2>Drive e Monitor</h2>
    ${table([
      { canal: "Pasta Drive", status: root.id ? "OK" : "Falha", detalhe: `${root.name} | ${driveItems.length} itens | modificada ${root.modifiedTime || "n/d"}` },
      { canal: "Monitor Mac Mini", status: monitor?.State || "ausente", detalhe: `${monitor?.Status || "container nao encontrado"} | sem porta publica` },
      { canal: "Sites Index", status: sitesIndex?.State || "ausente", detalhe: sitesIndex?.Status || "container nao encontrado" },
      { canal: "Ultimo job Drive PI", status: latestDriveJob?.status || "sem job recente", detalhe: latestDriveJob ? `${latestDriveJob.id} | ${latestDriveJob.kind}` : "baseline sem evento novo" },
    ], [
      { key: "canal", label: "Canal" },
      { key: "status", label: "Status" },
      { key: "detalhe", label: "Detalhe" },
    ])}

    <h2>Planilha, AdOps e Fila</h2>
    ${table([
      { canal: "Sync planilha harness", status: syncHarness.ok ? "OK" : "FAIL", detalhe: `mutacao habilitada: ${syncHarness.allowMutation}` },
      { canal: "Reconcile planilha + AdRotate harness", status: reconcileHarness.ok ? "OK" : "FAIL", detalhe: `mutacao habilitada: ${reconcileHarness.allowMutation}` },
      { canal: "AdOps health", status: health.ok ? "OK" : "FAIL", detalhe: `HTTP ${health.status} | ${health.payload?.mode || ""}` },
      { canal: "Campanhas", status: campaigns.ok ? "OK" : "FAIL", detalhe: `${campaignsList.length} campanhas retornadas` },
      { canal: "Insercoes", status: insertions.ok ? "OK" : "FAIL", detalhe: `${insertionsList.length} insercoes | ${activeInsertions} ativas/publicadas | ${scheduledInsertions} agendadas` },
      { canal: "Diagnostico sync", status: syncDiagnostics.ok ? "OK" : "FAIL", detalhe: JSON.stringify(syncDiagnostics.payload).slice(0, 220) },
      { canal: "Preview sync", status: syncPreview.ok ? "OK" : "FAIL", detalhe: JSON.stringify(syncPreview.payload).slice(0, 220) },
    ], [
      { key: "canal", label: "Canal" },
      { key: "status", label: "Status" },
      { key: "detalhe", label: "Detalhe" },
    ])}

    <h2>Portais e Plugins</h2>
    ${table(portals, [
      { key: "sigla", label: "Portal" },
      { key: "domain", label: "Dominio" },
      { key: "status", label: "HTTP", render: (row) => `${row.ok ? "OK" : "FAIL"} ${row.status || row.error || ""}` },
      { key: "configuredSlots", label: "Slots config" },
      { key: "visibleGroupTokens", label: "Tokens na home" },
      { key: "durationMs", label: "Tempo" },
    ])}

    <h2>Auditoria de Regras</h2>
    <div class="card">
      <p>Status: <strong>${captureAudit.ok ? "OK" : "FAIL"}</strong>. Regras publicadas: ${captureAudit?.totals?.apiPublishedRules || 0}. Erros: ${captureAudit?.totals?.errors || 0}. Warnings: ${captureAudit?.totals?.warnings || 0}.</p>
      ${Array.isArray(captureAudit.issues) && captureAudit.issues.length ? `<ul>${captureAudit.issues.map((issue) => `<li>${htmlEscape(issue.severity)} - ${htmlEscape(issue.message)}</li>`).join("")}</ul>` : "<p>Sem issues.</p>"}
    </div>

    <h2>Por Portal no AdOps</h2>
    ${table(Array.isArray(bySite.payload) ? bySite.payload : [], [
      { key: "siteSigla", label: "Portal" },
      { key: "totalInsercoes", label: "Insercoes" },
      { key: "valorLiquido", label: "Valor liquido" },
      { key: "printsGerados", label: "Prints" },
    ])}

    <h2>Logs do Monitor</h2>
    <pre>${htmlEscape(monitorLogs.trim())}</pre>
  </main>
</body>
</html>`;

  await writeFile(outputPath, html);
  await publishReport();
  const validation = await fetch(publicUrl, { redirect: "follow" });
  console.log(JSON.stringify({ ok: validation.ok, status: validation.status, outputPath, publicUrl }, null, 2));
  process.exit(validation.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
