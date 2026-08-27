import assert from "node:assert/strict";
import test from "node:test";
import { parseHarnessArgs, runHarness } from "./harness-retroactive-recovery.mjs";

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
    async publicAsset(asset) {
      calls.push({ kind: "public_asset", asset });
      assert.ok(scenario.publicAssets.includes(asset));
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
  await runHarness({ mode: "verify", insertionId: 2645, fromDate: "2026-08-24", toDate: "2026-08-26", api: fakeApi(calls, { auditedDates: ["2026-08-24", "2026-08-25", "2026-08-26"], publicAssets: ["html", "thumbnail", "modal", "download"] }) });
  assert.deepEqual(calls.filter((call) => call.kind === "public_asset").map((call) => call.asset), ["html", "thumbnail", "modal", "download"]);
});

test("parser aceita o separador do pnpm", () => {
  assert.equal(parseHarnessArgs(["--", "--mode=check", "--output-dir=docs/harness-reports/retroactive-recovery/test"]).mode, "check");
});
