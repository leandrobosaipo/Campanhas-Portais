import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import worker from "../../ops/cloudflare-public-api/src/index";

function jobRecord(overrides = {}) {
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  return {
    id: "legacy-job",
    kind: "print-batch",
    status: "queued",
    payload_json: JSON.stringify({ source: "cloudflare-daily-print-cron", date: "2026-08-13" }),
    result_json: null,
    error_text: null,
    requested_by: "cloudflare-scheduled",
    runner_id: null,
    created_at: old,
    updated_at: old,
    ...overrides,
  };
}

function fakeEnv(options = {}) {
  const statements = [];
  const rows = new Map((options.active ?? []).map((item) => [String(item.id), { ...item }]));
  let queueSends = 0;
  const db = {
    prepare(sql) {
      const statement = { sql, values: [] };
      statements.push(statement);
      return {
        bind(...values) {
          statement.values = values;
          return this;
        },
        async run() {
          if (/UPDATE ops_jobs SET status/.test(sql)) {
            const id = String(statement.values.at(-1));
            const row = rows.get(id);
            if (row) {
              row.status = statement.values[0];
              row.result_json = statement.values[1];
              row.error_text = statement.values[2];
              row.runner_id = statement.values[3];
              row.updated_at = statement.values[4];
            }
          }
          return { meta: { changes: 1 } };
        },
        async first() {
          if (/SELECT \* FROM ops_jobs WHERE id/.test(sql)) return rows.get(String(statement.values[0])) ?? null;
          if (/SELECT status FROM ops_jobs WHERE id/.test(sql)) {
            const row = rows.get(String(statement.values[0]));
            return row ? { status: row.status } : null;
          }
          if (/kind = 'print-batch'/.test(sql)) {
            if (options.dailyExisting?.status === "failed" && sql.includes("status IN ('queued','ready_for_runner','running','completed')")) return null;
            return options.dailyExisting ?? null;
          }
          return null;
        },
        async all() {
          if (/status IN \('queued','ready_for_runner','running'\)/.test(sql)) return { results: Array.from(rows.values()) };
          return { results: [] };
        },
      };
    },
  };
  return {
    env: {
      OPS_API_TOKEN: "test-token",
      adops_ops: db,
      adops_ops_queue: { async send() { queueSends += 1; } },
    },
    statements,
    rows,
    queueSends: () => queueSends,
  };
}

test("job destinado ao runner nasce pronto no D1 sem depender da Cloudflare Queue", async () => {
  const fixture = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.test/api/ops/jobs/print-single", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({ insertionId: 1944, date: "2026-08-13" }),
  }), fixture.env, {});
  const payload = await response.json();

  assert.equal(response.status, 202);
  assert.equal(payload.status, "ready_for_runner");
  const insert = fixture.statements.find((item) => item.sql.includes("INSERT INTO ops_jobs"));
  assert.match(insert?.sql ?? "", /'ready_for_runner'/);
  assert.equal(fixture.queueSends(), 0);
});

test("todas as rotas de print respondem o estado realmente persistido", async () => {
  const cases = [
    ["print-batch", { siteId: 1, date: "2026-08-13" }],
    ["print-backfill", { insertionId: 1944, fromDate: "2026-08-12", toDate: "2026-08-13" }],
  ];
  for (const [kind, body] of cases) {
    const fixture = fakeEnv();
    const response = await worker.fetch(new Request(`https://worker.test/api/ops/jobs/${kind}`, {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }), fixture.env, {});
    const payload = await response.json();
    assert.equal(response.status, 202);
    assert.equal(payload.status, "ready_for_runner");
  }
});

test("cron diário cria nova tentativa quando o job anterior falhou", async () => {
  const fixture = fakeEnv({ active: [], dailyExisting: jobRecord({ status: "failed" }) });
  const promises = [];
  await worker.scheduled({ cron: "0 22 * * *", scheduledTime: Date.parse("2026-08-13T22:00:00.000Z") }, fixture.env, {
    waitUntil(promise) { promises.push(promise); },
  });
  await Promise.all(promises);

  assert.equal(fixture.statements.filter((item) => item.sql.includes("INSERT INTO ops_jobs")).length, 1);
  assert.match(fixture.statements.find((item) => item.sql.includes("kind = 'print-batch'"))?.sql ?? "", /status IN \('queued','ready_for_runner','running','completed'\)/);
});

test("cron de retomada cria reconciliador idempotente no runner do Drive", async () => {
  const fixture = fakeEnv();
  const promises = [];
  await worker.scheduled({ cron: "30 21 * * *", scheduledTime: Date.parse("2026-08-13T21:30:00.000Z") }, fixture.env, {
    waitUntil(promise) { promises.push(promise); },
  });
  await Promise.all(promises);

  const insert = fixture.statements.find((item) => item.sql.includes("INSERT OR IGNORE INTO ops_jobs"));
  assert.equal(insert?.values[1], "campaign-publication-reconcile");
  assert.match(String(insert?.values[2]), /campaign-publication-reconcile:2026-08-13/);
});

test("atualização do Drive agenda retomada idempotente depois do ingest", async () => {
  const fixture = fakeEnv();
  const response = await worker.fetch(new Request("https://worker.test/api/ops/drive-pi-events", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({
      eventId: "drive:file-1944:2026-08-13T18:00:00Z",
      driveFileId: "file-1944",
      name: "PI 17191.pdf",
      mimeType: "application/pdf",
      path: "/PERRENGUE/AGOSTO/PI 17191 - RADAR/PI 17191.pdf",
      parentFolderId: "folder-1944",
      modifiedTime: "2026-08-13T18:00:00Z",
      eventType: "updated",
    }),
  }), fixture.env, {});
  const payload = await response.json();

  assert.equal(response.status, 202);
  assert.equal(payload.kind, "drive-pi-ingest");
  assert.ok(payload.reconcileJobId);
  const jobInserts = fixture.statements.filter((item) => item.sql.includes("INTO ops_jobs"));
  assert.equal(jobInserts.length, 2);
  assert.equal(jobInserts[0]?.values[1], "drive-pi-ingest");
  assert.equal(jobInserts[1]?.values[1], "campaign-publication-reconcile");
  assert.equal(JSON.parse(String(jobInserts[1]?.values[2])).idempotencyKey, "campaign-publication-reconcile:drive:drive:file-1944:2026-08-13T18:00:00Z");
});

test("watchdog recupera uma vez job legado queued em vez de marcá-lo como failed", async () => {
  const fixture = fakeEnv({ active: [jobRecord()] });
  const response = await worker.fetch(new Request("https://worker.test/api/ops/jobs/watchdog", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: "{}",
  }), fixture.env, {});
  const payload = await response.json();
  const row = fixture.rows.get("legacy-job");

  assert.equal(response.status, 200);
  assert.equal(payload.recoveredCount, 1);
  assert.equal(payload.failedCount, 0);
  assert.equal(row.status, "ready_for_runner");
  assert.match(String(row.result_json), /recovered_from_queue/);
});

test("reconciliador espera ingest concluído e usa timeout longo", async () => {
  const source = await readFile(new URL("../../ops/cloudflare-public-api/src/index.ts", import.meta.url), "utf8");
  assert.match(source, /kind === "campaign-publication-reconcile"/);
  assert.match(source, /json_extract\(ops_jobs\.payload_json, '\$\.dependsOnJobId'\)/);
  assert.match(source, /dependency\.status = 'completed'/);
  assert.match(source, /waitingForDependency/);
  assert.match(source, /stage: "dependency_failed"/);
});

test("watchdog não expira reconciliador enquanto ingest ainda executa", async () => {
  const old = new Date(Date.now() - 31 * 60_000).toISOString();
  const fixture = fakeEnv({ active: [
    jobRecord({ id: "ingest-long", kind: "drive-pi-ingest", status: "running", created_at: old, updated_at: old }),
    jobRecord({
      id: "reconcile-waiting",
      kind: "campaign-publication-reconcile",
      status: "ready_for_runner",
      payload_json: JSON.stringify({ dependsOnJobId: "ingest-long" }),
      created_at: old,
      updated_at: old,
    }),
  ] });
  const response = await worker.fetch(new Request("https://worker.test/api/ops/jobs/watchdog", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: "{}",
  }), fixture.env, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.failedCount, 0);
  assert.equal(fixture.rows.get("reconcile-waiting").status, "ready_for_runner");
});

test("watchdog propaga falha do ingest para o reconciliador dependente", async () => {
  const old = new Date(Date.now() - 31 * 60_000).toISOString();
  const fixture = fakeEnv({ active: [
    jobRecord({ id: "ingest-failed", kind: "drive-pi-ingest", status: "failed", created_at: old, updated_at: old }),
    jobRecord({
      id: "reconcile-orphan",
      kind: "campaign-publication-reconcile",
      status: "ready_for_runner",
      payload_json: JSON.stringify({ dependsOnJobId: "ingest-failed" }),
      created_at: old,
      updated_at: old,
    }),
  ] });
  const response = await worker.fetch(new Request("https://worker.test/api/ops/jobs/watchdog", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: "{}",
  }), fixture.env, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.failedCount, 1);
  assert.equal(fixture.rows.get("reconcile-orphan").status, "failed");
  assert.match(String(fixture.rows.get("reconcile-orphan").result_json), /dependency_failed/);
});
