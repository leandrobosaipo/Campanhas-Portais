#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const serviceName = "adops-drive-pi-monitor";
const volumeName = "adops-drive-pi-monitor-data";
const portainerEnvPath = process.env.PORTAINER_ENV_FILE || "/Users/leandrobosaipo/Projetos/macmini/.env.portainer";
const serviceAccountFile = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE ||
  "/Users/leandrobosaipo/.config/adops/secrets/google-drive-service-account-codigo5web-adops-drive-pi-monitor.json";
const opsEnvCandidates = [
  process.env.OPS_ENV_FILE,
  join(repoRoot, ".env.adops-operator.local"),
  join(repoRoot, "ops/cloudflare-public-api/.env.ops.local"),
].filter(Boolean);

function parseEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return {};
  const result = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function requireValue(name, value) {
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

function loadOpsApiToken() {
  if (process.env.OPS_API_TOKEN) return process.env.OPS_API_TOKEN;
  for (const candidate of opsEnvCandidates) {
    const env = parseEnvFile(candidate);
    if (env.OPS_API_TOKEN) return env.OPS_API_TOKEN;
  }
  throw new Error("OPS_API_TOKEN ausente nos arquivos locais conhecidos.");
}

function redactEnv(envList = []) {
  return envList.map((item) => {
    const [name] = String(item).split("=", 1);
    if (/TOKEN|SECRET|KEY|JSON|PASSWORD|CREDENTIAL/i.test(name)) return `${name}=<redacted>`;
    return item;
  });
}

function sanitizeInspect(inspect) {
  return {
    Id: inspect.Id,
    Name: inspect.Name,
    Created: inspect.Created,
    Path: inspect.Path,
    Args: inspect.Args,
    Config: {
      Image: inspect.Config?.Image,
      Env: redactEnv(inspect.Config?.Env || []),
      Labels: inspect.Config?.Labels || {},
      Cmd: inspect.Config?.Cmd,
    },
    HostConfig: {
      Binds: inspect.HostConfig?.Binds || [],
      PortBindings: inspect.HostConfig?.PortBindings || {},
      RestartPolicy: inspect.HostConfig?.RestartPolicy || {},
      NetworkMode: inspect.HostConfig?.NetworkMode,
    },
    Mounts: inspect.Mounts || [],
    NetworkSettings: {
      Ports: inspect.NetworkSettings?.Ports || {},
    },
    State: inspect.State,
  };
}

const monitorScript = String.raw`
import { createPrivateKey, createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ROOT_FOLDER_ID = process.env.DRIVE_PI_MONITOR_ROOT_FOLDER_ID || "18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6";
const INTERVAL_MS = Number(process.env.DRIVE_PI_MONITOR_INTERVAL_MS || 300000);
const STATE_FILE = process.env.DRIVE_PI_MONITOR_STATE_FILE || "/data/drive-pi-monitor-state.json";
const MAX_ITEMS = Number(process.env.DRIVE_PI_MONITOR_MAX_ITEMS || 2000);
const OPS_API_BASE_URL = (process.env.OPS_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, "");
const OPS_API_TOKEN = process.env.OPS_API_TOKEN || "";
const OPS_API_TOKEN_FILE = process.env.OPS_API_TOKEN_FILE || "/data/secrets/ops-api-token";
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || "";
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE || "/data/secrets/google-drive-service-account.json";

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;
let cachedOpsApiToken = null;
let cachedServiceAccount = null;

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function loadServiceAccount() {
  if (cachedServiceAccount) return cachedServiceAccount;
  const raw = SERVICE_ACCOUNT_JSON || await readFile(SERVICE_ACCOUNT_FILE, "utf8");
  const credentials = JSON.parse(raw);
  if (!credentials.client_email || !credentials.private_key) throw new Error("Conta de servico invalida.");
  cachedServiceAccount = credentials;
  return cachedServiceAccount;
}

async function getOpsApiToken() {
  if (cachedOpsApiToken) return cachedOpsApiToken;
  cachedOpsApiToken = OPS_API_TOKEN || (await readFile(OPS_API_TOKEN_FILE, "utf8")).trim();
  if (!cachedOpsApiToken) throw new Error("OPS_API_TOKEN ausente.");
  return cachedOpsApiToken;
}

async function getDriveAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessTokenExpiresAt - 60 > now) return cachedAccessToken;
  const credentials = await loadServiceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = base64Url(JSON.stringify(header)) + "." + base64Url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(createPrivateKey(credentials.private_key), "base64url");
  const assertion = unsigned + "." + signature;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Drive token falhou: " + response.status + " " + (payload.error || "erro"));
  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = now + Number(payload.expires_in || 3600);
  return cachedAccessToken;
}

async function driveGet(url) {
  const token = await getDriveAccessToken();
  const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Drive API falhou: " + response.status + " " + (payload.error?.message || "erro"));
  return payload;
}

function drivePiEventType(item, previous) {
  if (!previous && item.mimeType === "application/vnd.google-apps.folder") return "folder_created";
  if (!previous) return "created";
  if (item.mimeType === "application/vnd.google-apps.folder") return "folder_updated";
  return "updated";
}

function shouldEmitDrivePiEvent(item) {
  const path = String(item?.path || "");
  const name = String(item?.name || "");
  const mimeType = String(item?.mimeType || "");
  const isFolder = mimeType === "application/vnd.google-apps.folder";
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(name);
  const isEvidenceAsset = /\/evidencias?[-_/ ]|\/evid[eê]ncias?/i.test(path) &&
    (/^image\//.test(mimeType) || /^video\//.test(mimeType) || /\.(png|jpe?g|webp|gif|mp4|zip)$/i.test(name));
  if (isEvidenceAsset && !isFolder && !isPdf) return false;
  return true;
}

async function listDrivePiFolderRecursive(folderId, basePath = "", seen = new Map()) {
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: "'" + folderId + "' in parents and trashed = false",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      orderBy: "folder,name",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const payload = await driveGet("https://www.googleapis.com/drive/v3/files?" + params);
    for (const file of payload.files || []) {
      const itemPath = (basePath + "/" + file.name).replace(/\/+/g, "/");
      const item = {
        driveFileId: file.id,
        name: file.name,
        mimeType: file.mimeType || "application/octet-stream",
        path: itemPath,
        parentFolderId: folderId,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink || null,
      };
      seen.set(file.id, item);
      if (file.mimeType === "application/vnd.google-apps.folder") await listDrivePiFolderRecursive(file.id, itemPath, seen);
      if (seen.size >= MAX_ITEMS) break;
    }
    pageToken = payload.nextPageToken || "";
  } while (pageToken && seen.size < MAX_ITEMS);
  return seen;
}

async function postDrivePiMonitorEvent(item, previous) {
  const opsApiToken = await getOpsApiToken();
  const event = {
    eventId: "drive:" + item.driveFileId + ":" + item.modifiedTime,
    driveFileId: item.driveFileId,
    name: item.name,
    mimeType: item.mimeType,
    path: item.path,
    parentFolderId: item.parentFolderId,
    modifiedTime: item.modifiedTime,
    webViewLink: item.webViewLink,
    eventType: drivePiEventType(item, previous),
  };
  const response = await fetch(OPS_API_BASE_URL + "/api/ops/drive-pi-events", {
    method: "POST",
    headers: {
      authorization: "Bearer " + opsApiToken,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload.error || payload.details || payload.message || "erro";
    throw new Error("Worker recusou evento: " + response.status + " " + details + " | file=" + item.driveFileId + " | path=" + item.path);
  }
  return payload;
}

async function runOnce() {
  const state = await readJsonFile(STATE_FILE, { initialized: false, items: {} });
  const currentMap = await listDrivePiFolderRecursive(ROOT_FOLDER_ID);
  const currentItems = Object.fromEntries(currentMap);
  const sent = [];
  const failed = [];
  const skipped = [];
  if (state.initialized) {
    for (const item of currentMap.values()) {
      const previous = state.items?.[item.driveFileId] || null;
      if (!previous || previous.modifiedTime !== item.modifiedTime || previous.path !== item.path || previous.name !== item.name) {
        if (!shouldEmitDrivePiEvent(item)) {
          skipped.push({
            driveFileId: item.driveFileId,
            name: item.name,
            path: item.path,
            reason: "evidence_asset_not_pi_intake",
          });
          continue;
        }
        try {
          const result = await postDrivePiMonitorEvent(item, previous);
          sent.push({
            driveFileId: item.driveFileId,
            name: item.name,
            path: item.path,
            duplicate: Boolean(result?.duplicate),
            jobId: result?.jobId || null,
          });
        } catch (error) {
          failed.push({
            driveFileId: item.driveFileId,
            name: item.name,
            path: item.path,
            error: error instanceof Error ? error.message : String(error),
          });
          if (previous) currentItems[item.driveFileId] = previous;
          else delete currentItems[item.driveFileId];
        }
      }
    }
  }
  await writeJsonFile(STATE_FILE, {
    initialized: true,
    rootFolderId: ROOT_FOLDER_ID,
    checkedAt: new Date().toISOString(),
    count: currentMap.size,
    items: currentItems,
  });
  if (!state.initialized) console.log("[drive-pi-monitor] baseline criado com " + currentMap.size + " item(s)");
  else console.log("[drive-pi-monitor] verificado: " + currentMap.size + " item(s), " + sent.length + " evento(s) enviado(s), " + skipped.length + " ignorado(s), " + failed.length + " falha(s)");
  for (const item of failed) console.error("[drive-pi-monitor] evento falhou: " + JSON.stringify(item));
  return { baseline: !state.initialized, scanned: currentMap.size, sent, skipped, failed };
}

async function main() {
  await getOpsApiToken();
  await loadServiceAccount();
  console.log("[drive-pi-monitor] iniciado; intervalo=" + INTERVAL_MS + "ms; state=" + STATE_FILE);
  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      console.error("[drive-pi-monitor] erro: " + error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error("[drive-pi-monitor] fatal: " + error.message);
  process.exit(1);
});
`;

async function portainerRequest(baseUrl, apiKey, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "X-API-Key": apiKey,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Portainer ${method} ${path} falhou: ${response.status} ${text.slice(0, 300)}`);
  }
  return payload;
}

async function writeSecretsToVolume(portainerUrl, portainerApiKey, endpointId, serviceAccountJson, opsApiToken) {
  const initName = `${serviceName}-init-${Date.now()}`;
  const script = [
    "const fs = require('fs');",
    "fs.mkdirSync('/data/secrets', { recursive: true });",
    "fs.writeFileSync('/data/secrets/google-drive-service-account.json', process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);",
    "fs.writeFileSync('/data/secrets/ops-api-token', process.env.OPS_API_TOKEN);",
    "fs.chmodSync('/data/secrets/google-drive-service-account.json', 0o600);",
    "fs.chmodSync('/data/secrets/ops-api-token', 0o600);",
    "console.log('secrets_written');",
  ].join("\n");
  const created = await portainerRequest(portainerUrl, portainerApiKey, "POST", `/api/endpoints/${endpointId}/docker/containers/create?name=${initName}`, {
    Image: "node:22-alpine",
    Labels: {
      "cod5.project": "adops",
      "cod5.service": serviceName,
      "cod5.kind": "drive-pi-monitor-init",
    },
    Env: [
      `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=${serviceAccountJson}`,
      `OPS_API_TOKEN=${opsApiToken}`,
    ],
    Cmd: ["node", "-e", script],
    HostConfig: {
      Binds: [`${volumeName}:/data`],
      NetworkMode: "none",
      RestartPolicy: { Name: "no" },
    },
  });
  await portainerRequest(portainerUrl, portainerApiKey, "POST", `/api/endpoints/${endpointId}/docker/containers/${created.Id}/start`);
  const waitResult = await portainerRequest(portainerUrl, portainerApiKey, "POST", `/api/endpoints/${endpointId}/docker/containers/${created.Id}/wait`);
  await portainerRequest(portainerUrl, portainerApiKey, "DELETE", `/api/endpoints/${endpointId}/docker/containers/${created.Id}?v=false&force=true`);
  if (waitResult?.StatusCode !== 0) throw new Error(`Init container falhou ao gravar secrets: ${waitResult?.StatusCode}`);
  console.log("secrets_written_to_volume");
}

async function main() {
  const portainerEnv = parseEnvFile(portainerEnvPath);
  const portainerUrl = requireValue("PORTAINER_URL", portainerEnv.PORTAINER_URL || process.env.PORTAINER_URL).replace(/\/$/, "");
  const portainerApiKey = requireValue("PORTAINER_API_KEY", portainerEnv.PORTAINER_API_KEY || process.env.PORTAINER_API_KEY);
  const opsApiToken = loadOpsApiToken();
  const serviceAccountJson = readFileSync(serviceAccountFile, "utf8");
  JSON.parse(serviceAccountJson);

  const endpoints = await portainerRequest(portainerUrl, portainerApiKey, "GET", "/api/endpoints");
  const endpoint = endpoints.find((item) => item.Name === "local" && item.Status === 1);
  if (!endpoint) throw new Error("Endpoint Portainer local online nao encontrado.");
  const endpointId = endpoint.Id;

  const labels = {
    "cod5.project": "adops",
    "cod5.service": serviceName,
    "cod5.kind": "drive-pi-monitor",
  };

  const volumes = await portainerRequest(portainerUrl, portainerApiKey, "GET", `/api/endpoints/${endpointId}/docker/volumes`);
  const volumeExists = Array.isArray(volumes?.Volumes) && volumes.Volumes.some((item) => item.Name === volumeName);
  if (!volumeExists) {
    await portainerRequest(portainerUrl, portainerApiKey, "POST", `/api/endpoints/${endpointId}/docker/volumes/create`, {
      Name: volumeName,
      Labels: labels,
    });
    console.log(`volume_created ${volumeName}`);
  } else {
    console.log(`volume_exists ${volumeName}`);
  }

  await writeSecretsToVolume(portainerUrl, portainerApiKey, endpointId, serviceAccountJson, opsApiToken);

  const containers = await portainerRequest(portainerUrl, portainerApiKey, "GET", `/api/endpoints/${endpointId}/docker/containers/json?all=true`);
  const existing = containers.find((item) => (item.Names || []).includes(`/${serviceName}`));
  if (existing) {
    const inspect = await portainerRequest(portainerUrl, portainerApiKey, "GET", `/api/endpoints/${endpointId}/docker/containers/${existing.Id}/json`);
    const backupDir = join(repoRoot, "docs/deploy-backups", serviceName);
    mkdirSync(backupDir, { recursive: true });
    const backupPath = join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-container-inspect.json`);
    writeFileSync(backupPath, JSON.stringify(sanitizeInspect(inspect), null, 2));
    console.log(`backup_written ${backupPath}`);
    if (existing.State === "running") {
      await portainerRequest(portainerUrl, portainerApiKey, "POST", `/api/endpoints/${endpointId}/docker/containers/${existing.Id}/stop?t=20`);
      console.log(`container_stopped ${serviceName}`);
    }
    await portainerRequest(portainerUrl, portainerApiKey, "DELETE", `/api/endpoints/${endpointId}/docker/containers/${existing.Id}?v=false&force=false`);
    console.log(`container_removed ${serviceName}`);
  }

  const createPayload = {
    Image: "node:22-alpine",
    Labels: labels,
    Env: [
      "NODE_ENV=production",
      "OPS_API_BASE_URL=https://adops-api.codigo5.com.br",
      "OPS_API_TOKEN_FILE=/data/secrets/ops-api-token",
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=/data/secrets/google-drive-service-account.json",
      "DRIVE_PI_MONITOR_ROOT_FOLDER_ID=18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6",
      "DRIVE_PI_MONITOR_INTERVAL_MS=300000",
      "DRIVE_PI_MONITOR_STATE_FILE=/data/drive-pi-monitor-state.json",
      "DRIVE_PI_MONITOR_MAX_ITEMS=2000",
    ],
    Cmd: ["sh", "-lc", `mkdir -p /app /data && cat > /app/monitor.mjs <<'EOF'\n${monitorScript}\nEOF\nnode /app/monitor.mjs`],
    HostConfig: {
      Binds: [`${volumeName}:/data`],
      NetworkMode: "bridge",
      RestartPolicy: { Name: "unless-stopped" },
    },
  };

  const created = await portainerRequest(portainerUrl, portainerApiKey, "POST", `/api/endpoints/${endpointId}/docker/containers/create?name=${serviceName}`, createPayload);
  await portainerRequest(portainerUrl, portainerApiKey, "POST", `/api/endpoints/${endpointId}/docker/containers/${created.Id}/start`);
  const inspect = await portainerRequest(portainerUrl, portainerApiKey, "GET", `/api/endpoints/${endpointId}/docker/containers/${created.Id}/json`);
  console.log(`container_started ${serviceName}`);
  console.log(`endpoint_id ${endpointId}`);
  console.log(`container_id ${created.Id}`);
  console.log(`state ${inspect.State?.Status || "unknown"}`);
  console.log(`restart_policy ${inspect.HostConfig?.RestartPolicy?.Name || "none"}`);
  console.log(`ports ${JSON.stringify(inspect.NetworkSettings?.Ports || {})}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
