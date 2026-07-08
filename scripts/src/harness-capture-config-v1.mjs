#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = (process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev/api").replace(/\/$/, "");
const OPS_TOKEN = process.env.OPS_API_TOKEN || "";
const ROLE = process.env.ADOPS_TEST_ROLE || "admin";

if (!OPS_TOKEN) {
  console.error("OPS_API_TOKEN ausente.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve(process.cwd(), `docs/harness-reports/capture-config/${stamp}`);
await fs.mkdir(reportDir, { recursive: true });

const headers = {
  "content-type": "application/json",
  authorization: `Bearer ${OPS_TOKEN}`,
  "x-adops-role": ROLE,
  "x-adops-actor": "harness-capture-config-v1",
};

const results = [];
const checks = [];

async function step(name, fn) {
  const startedAt = Date.now();
  try {
    const data = await fn();
    const durationMs = Date.now() - startedAt;
    results.push({ name, ok: true, durationMs, data });
    return data;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, durationMs, error: message });
    throw error;
  }
}

async function api(pathname, init = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${pathname} -> ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function check(name, condition, details = null) {
  checks.push({ name, ok: Boolean(condition), details });
}

const uniqueGroupId = Number(`9${Date.now().toString().slice(-5)}`);
const basePayload = {
  siteSigla: "PERRENGUE",
  groupId: uniqueGroupId,
  aliases: [`HARNESS ${uniqueGroupId}`],
  page: "home",
  slotSelector: ".g.g-1",
  contextSelector: "#header-ads-row",
  scrollMode: "top",
  proofStyle: "viewport_only",
  enabled: true,
  auditConfig: {
    postVisualWaitMs: 1200,
    animatedBannerDelayMs: 1800,
  },
};

let perfBefore = null;
let perfAfter = null;
let ruleId = null;
let fatalError = null;

try {
  perfBefore = await step("perf-health-before", () => api("/capture-rules/perf/health", { method: "GET" }));
  const created = await step("create-draft", () => api("/capture-rules", { method: "POST", body: JSON.stringify(basePayload) }));
  ruleId = created?.item?.id;
  if (!ruleId) throw new Error("create-draft sem ruleId");

  await step("list-rules", () => api(`/capture-rules?siteSigla=PERRENGUE&status=draft&limit=10`, { method: "GET" }));
  const validated = await step("validate-draft", () => api(`/capture-rules/${ruleId}/validate`, { method: "POST", body: JSON.stringify({ requestedBy: "harness" }) }));
  if (validated?.status !== "passed") throw new Error("Validação não passou.");
  const validatedBatch = await step(
    "validate-batch",
    () =>
      api(`/capture-rules/validate-batch`, {
        method: "POST",
        body: JSON.stringify({ ruleIds: [ruleId], requestedBy: "harness-batch" }),
      }),
  );
  check("validate-batch-ruleId", Number(validatedBatch?.total) >= 1, { total: validatedBatch?.total });

  const published = await step("publish-draft", () => api(`/capture-rules/${ruleId}/publish`, { method: "POST", body: JSON.stringify({ requestedBy: "harness" }) }));
  const publishedVersionId = published?.publishedVersionId;

  await step("runtime-read", () => api(`/capture-rules/runtime?siteSigla=PERRENGUE&groupId=${uniqueGroupId}`, { method: "GET" }));
  const versions = await step("list-versions", () => api(`/capture-rules/${ruleId}/versions?limit=20`, { method: "GET" }));
  await step("list-validations", () => api(`/capture-rules/${ruleId}/validations?limit=20`, { method: "GET" }));

  const rollbackVersionId = Number(versions?.items?.find((item) => item.status === "published")?.id || publishedVersionId || 0);
  if (rollbackVersionId > 0) {
    await step("rollback", () => api(`/capture-rules/${ruleId}/rollback`, { method: "POST", body: JSON.stringify({ versionId: rollbackVersionId, requestedBy: "harness" }) }));
  }

  perfAfter = await step("perf-health-after", () => api("/capture-rules/perf/health", { method: "GET" }));
  const runtimeRead = results.find((item) => item.name === "runtime-read")?.data;
  check("runtime-source-db-published", runtimeRead?.rule?.source === "db_published", { source: runtimeRead?.rule?.source });
  check("runtime-p95-budget", Number(perfAfter?.routeP95Ms ?? 0) <= 250, { routeP95Ms: perfAfter?.routeP95Ms });
  check("runtime-query-budget", Number(perfAfter?.avgQueriesPerRuntimeCall ?? 0) <= 1.5, {
    avgQueriesPerRuntimeCall: perfAfter?.avgQueriesPerRuntimeCall,
  });
} catch (error) {
  fatalError = error instanceof Error ? error.message : String(error);
}

const failed = results.filter((item) => !item.ok);
const summary = {
  ok: failed.length === 0 && checks.every((item) => item.ok) && !fatalError,
  apiBase: API_BASE,
  role: ROLE,
  ruleId,
  uniqueGroupId,
  fatalError,
  steps: results,
  checks,
  metrics: {
    before: perfBefore,
    after: perfAfter,
  },
};

await fs.writeFile(path.join(reportDir, "results.json"), JSON.stringify(summary, null, 2));
await fs.writeFile(path.join(reportDir, "perf.json"), JSON.stringify({ before: perfBefore, after: perfAfter }, null, 2));

const md = [
  "# Harness Report — Capture Config v1",
  "",
  `- API: \`${API_BASE}\``,
  `- Rule ID: \`${ruleId}\``,
  `- Group ID: \`${uniqueGroupId}\``,
  `- Resultado: ${summary.ok ? "PASS" : "FAIL"}`,
  `- Erro fatal: ${fatalError ? `\`${fatalError}\`` : "nenhum"}`,
  "",
  "## Steps",
  ...results.map((item) => `- ${item.ok ? "✅" : "❌"} ${item.name} (${item.durationMs} ms)`),
  "",
  "## Checks",
  ...checks.map((item) => `- ${item.ok ? "✅" : "❌"} ${item.name}${item.details ? ` :: ${JSON.stringify(item.details)}` : ""}`),
  "",
  "## Perf",
  `- cacheHitRate before: ${perfBefore?.cacheHitRate ?? "n/a"}`,
  `- cacheHitRate after: ${perfAfter?.cacheHitRate ?? "n/a"}`,
  `- routeP95 before: ${perfBefore?.routeP95Ms ?? "n/a"} ms`,
  `- routeP95 after: ${perfAfter?.routeP95Ms ?? "n/a"} ms`,
].join("\n");

await fs.writeFile(path.join(reportDir, "summary.md"), md);
console.log(JSON.stringify({ ok: summary.ok, reportDir }, null, 2));
process.exit(summary.ok ? 0 : 1);
