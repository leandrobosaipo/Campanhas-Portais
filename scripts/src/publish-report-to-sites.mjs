#!/usr/bin/env node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const reportDir = path.resolve(process.argv[2] || "");
const portainerEnvFile = process.env.PORTAINER_ENV_FILE || "/Users/leandrobosaipo/Projetos/macmini/.env.portainer";
const endpointId = process.env.PORTAINER_ENDPOINT_ID || "3";

if (!reportDir.startsWith(path.join(repoRoot, "relatorios") + path.sep)) {
  throw new Error("Informe uma pasta dentro de relatorios/.");
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return [];
    const index = trimmed.indexOf("=");
    return [[trimmed.slice(0, index), trimmed.slice(index + 1).replace(/^['\"]|['\"]$/g, "")]];
  }));
}

const env = parseEnv(await readFile(portainerEnvFile, "utf8"));
const portainerBase = String(env.PORTAINER_URL || "").replace(/\/$/, "");
const apiKey = env.PORTAINER_API_KEY;
if (!portainerBase || !apiKey) throw new Error("Configuração Portainer ausente.");

async function portainer(method, pathname, body, contentType = "application/json") {
  const response = await fetch(`${portainerBase}${pathname}`, {
    method,
    headers: { "X-API-Key": apiKey, ...(body ? { "content-type": contentType } : {}) },
    body: body ? (contentType === "application/json" ? JSON.stringify(body) : body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Portainer ${method} ${pathname} HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const slug = path.basename(reportDir);
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "adops-report-publish-"));
const tarPath = path.join(tempRoot, `${slug}.tar`);
let helperId = null;

try {
  const tar = spawnSync("tar", ["--no-xattrs", "-C", path.dirname(reportDir), "-cf", tarPath, slug], {
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (tar.status !== 0) throw new Error(tar.stderr || "Falha ao empacotar relatório.");

  const containers = await portainer("GET", `/api/endpoints/${endpointId}/docker/containers/json?all=true`);
  const sites = containers.find((item) => (item.Names || []).includes("/sites-index"));
  if (!sites) throw new Error("Container sites-index não encontrado.");
  const inspect = await portainer("GET", `/api/endpoints/${endpointId}/docker/containers/${sites.Id}/json`);
  const reportsMount = (inspect.Mounts || []).find((mount) => mount.Type === "bind" && mount.Destination === "/app/reports");
  if (!reportsMount?.Source) throw new Error("Bind específico /app/reports não encontrado.");

  const helper = await portainer("POST", `/api/endpoints/${endpointId}/docker/containers/create?name=adops-report-publish-${Date.now()}`, {
    Image: "node:22-alpine",
    Labels: { "cod5.project": "adops", "cod5.kind": "report-publisher", "cod5.service": slug },
    Cmd: ["sh", "-lc", "mkdir -p /target && sleep 120"],
    HostConfig: {
      Binds: [`${reportsMount.Source}:/target`],
      NetworkMode: "none",
      RestartPolicy: { Name: "no" },
    },
  });
  helperId = helper.Id;
  await portainer("POST", `/api/endpoints/${endpointId}/docker/containers/${helperId}/start`);
  const archive = await readFile(tarPath);
  await portainer("PUT", `/api/endpoints/${endpointId}/docker/containers/${helperId}/archive?path=${encodeURIComponent("/target")}`, archive, "application/x-tar");

  console.log(JSON.stringify({ ok: true, slug, target: `/app/reports/${slug}`, mount: "/app/reports" }));
} finally {
  if (helperId) {
    await portainer("POST", `/api/endpoints/${endpointId}/docker/containers/${helperId}/stop?t=2`).catch(() => null);
    await portainer("DELETE", `/api/endpoints/${endpointId}/docker/containers/${helperId}?v=false&force=true`).catch(() => null);
  }
  await rm(tempRoot, { recursive: true, force: true });
}
