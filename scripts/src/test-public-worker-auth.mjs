import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ENV_FILE = path.join(ROOT, "ops", "cloudflare-public-api", ".env.ops.local");
const API_BASE = "https://adops-api-public.leandro471.workers.dev";

function readOpsToken() {
  if (process.env.OPS_API_TOKEN) return process.env.OPS_API_TOKEN.trim();
  if (!fs.existsSync(ENV_FILE)) return "";
  const raw = fs.readFileSync(ENV_FILE, "utf8");
  const match = raw.match(/^OPS_API_TOKEN=(.*)$/m);
  return match?.[1]?.trim() ?? "";
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const opsToken = readOpsToken();
  const target = `${API_BASE}/api/evidences/231`;

  const preflight = await fetch(target, {
    method: "OPTIONS",
    headers: {
      Origin: "https://adops-campanhas-portais.pages.dev",
      "Access-Control-Request-Method": "DELETE",
      "Access-Control-Request-Headers": "authorization,x-adops-client-build,x-adops-auth-state",
    },
  });
  const allowedHeaders = (preflight.headers.get("access-control-allow-headers") || "").toLowerCase();
  assert(preflight.status === 204, "preflight deveria retornar 204");
  assert(allowedHeaders.includes("authorization"), "preflight deveria liberar authorization");
  assert(allowedHeaders.includes("x-adops-client-build"), "preflight deveria liberar x-adops-client-build");
  assert(allowedHeaders.includes("x-adops-auth-state"), "preflight deveria liberar x-adops-auth-state");

  const noHeader = await fetchJson(target, { method: "DELETE" });
  assert(noHeader.response.status === 401, "sem header deveria retornar 401");
  assert(noHeader.payload?.code === "missing_operator_token", "sem header deveria retornar missing_operator_token");

  const emptyBearer = await fetchJson(target, {
    method: "DELETE",
    headers: {
      Authorization: 'Bearer ""',
      "x-adops-client-build": "smoke-empty",
      "x-adops-auth-state": "empty_bearer_sanitized",
    },
  });
  assert(emptyBearer.response.status === 401, "Bearer vazio deveria retornar 401");
  assert(emptyBearer.payload?.code === "missing_operator_token", "Bearer vazio deveria retornar missing_operator_token");
  assert(emptyBearer.payload?.clientBuild === "smoke-empty", "payload 401 deveria ecoar clientBuild");
  assert(emptyBearer.payload?.authState === "empty_bearer_sanitized", "payload 401 deveria ecoar authState");

  const invalidToken = await fetchJson(target, {
    method: "DELETE",
    headers: {
      Authorization: "Bearer token-invalido",
      "x-adops-client-build": "smoke-invalid",
      "x-adops-auth-state": "present",
    },
  });
  assert(invalidToken.response.status === 401, "token inválido deveria retornar 401");
  assert(invalidToken.payload?.code === "invalid_operator_token", "token inválido deveria retornar invalid_operator_token");

  if (opsToken) {
    const validToken = await fetchJson(`${API_BASE}/api/healthz`, {
      headers: {
        Authorization: `Bearer ${opsToken}`,
      },
    });
    assert(validToken.response.status === 200, "healthz com token válido deveria responder 200");
  }

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "cors preflight allows diagnostic auth headers",
      "missing_operator_token without header",
      "missing_operator_token with empty bearer",
      "invalid_operator_token with invalid token",
    ],
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
