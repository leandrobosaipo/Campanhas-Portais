import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseHarnessArgs, runHarness, writeHarnessArtifacts } from "./harness-retroactive-recovery.mjs";

function sequenceClock(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function fakeApi(calls, scenario) {
  let progressIndex = 0;
  return {
    async get(path) {
      calls.push({ method: "GET", path });
      if (path.includes("/progress")) return { status: scenario.progress[Math.min(progressIndex++, scenario.progress.length - 1)] };
      if (path.includes("capture-proof/status")) return { status: "audited", checklistValidation: { approved: true }, arquivoUrl: "https://cdn.example/evidence.png" };
      return scenario.audit ?? scenario.queue ?? scenario.readiness ?? {};
    },
    async post(path) {
      calls.push({ method: "POST", path });
      return { jobId: scenario.createJobId, status: "ready_for_runner" };
    },
    async publicAsset(target) {
      calls.push({ type: "public_asset", ...target });
      assert.ok(scenario.publicAssets.includes(target.kind));
      return { ok: true };
    },
  };
}

test("check nunca faz POST", async () => {
  const calls = [];
  await runHarness({ mode: "check", api: fakeApi(calls, { audit: { items: [] }, queue: {}, readiness: {} }) });
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("execute acompanha o mesmo job ate completed", async () => {
  const calls = [];
  const result = await runHarness({ mode: "execute", release: "release-42", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", api: fakeApi(calls, { createJobId: "job-2645", progress: ["ready_for_runner", "running", "completed"] }), sleep: async () => undefined });
  assert.equal(result.jobId, "job-2645");
  assert.equal(result.status, "completed");
  assert.equal(result.release, "release-42");
  assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/print-backfill")).length, 1);
});

test("failed nao cria segundo job", async () => {
  const calls = [];
  const result = await runHarness({ mode: "execute", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", api: fakeApi(calls, { createJobId: "job-failed", progress: ["running", "failed"] }), sleep: async () => undefined });
  assert.equal(result.status, "failed");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});

test("timeout retorna job e ultimo progresso", async () => {
  const calls = [];
  await assert.rejects(() => runHarness({ mode: "execute", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", timeoutMs: 1, api: fakeApi(calls, { createJobId: "job-timeout", progress: ["running"] }), now: sequenceClock([0, 2]), sleep: async () => undefined }), (error) => error.code === "job_timeout" && error.jobId === "job-timeout");
});

test("verify consulta cada consumidor separadamente", async () => {
  const calls = [];
  await runHarness({ mode: "verify", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", reportUrl: "https://reports.example/adops/", deliveryApiBase: "https://api.example", api: fakeApi(calls, { auditedDates: ["2026-08-24", "2026-08-25", "2026-08-26"], publicAssets: ["html", "thumbnail", "modal", "download"] }) });
  assert.deepEqual(calls.filter((call) => call.type === "public_asset").map((call) => [call.kind, call.url]), [
    ["html", "https://reports.example/adops/"],
    ["thumbnail", "https://cdn.example/evidence.png"],
    ["modal", "https://reports.example/adops/data.json"],
    ["download", "https://api.example/api/insertions/2645/evidences/2026-08-24/download"],
  ]);
});

test("parser aceita o separador do pnpm", () => {
  assert.equal(parseHarnessArgs(["--", "--mode=check", "--output-dir=docs/harness-reports/retroactive-recovery/test"]).mode, "check");
});

test("rejeita data impossivel antes de consultar a API", async () => {
  await assert.rejects(() => runHarness({ mode: "verify", insertionId: 2645, fromDate: "2026-02-30", toDate: "2026-03-01", api: fakeApi([], { publicAssets: [] }) }), /Datas devem ser/);
});

test("artefatos rejeitam symlink sem escrever fora da raiz", async () => {
  const reportRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/harness-reports/retroactive-recovery");
  await fs.mkdir(reportRoot, { recursive: true });
  const inside = await fs.mkdtemp(path.join(reportRoot, "test-symlink-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "adops-harness-outside-"));
  const link = path.join(inside, "escape");
  try {
    await fs.symlink(outside, link);
    await assert.rejects(() => writeHarnessArtifacts(path.join(link, "child"), { mode: "check", status: "checked" }), /symlink/i);
    await assert.rejects(fs.access(path.join(outside, "results.json")));
  } finally {
    await fs.rm(inside, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
