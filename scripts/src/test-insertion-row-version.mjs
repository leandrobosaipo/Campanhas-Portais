#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";

// Run only against a fresh isolated QA database; never default to production.
const connection = new URL(process.env.DATABASE_URL ?? "http://missing.invalid");
assert.match(connection.pathname, /^\/adops_cas_qa_[a-z0-9_]+$/);
assert.equal(connection.searchParams.get("host"), "/tmp/adops-candidate-pg-socket-retro20261006");
assert.equal(connection.port, "55437");
const require = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const express = require("express");
const { pool } = await import("../../lib/db/src/index.ts");
const { rows: [guard] } = await pool.query("SELECT current_database() AS name, inet_server_addr() IS NULL AS socket, current_setting('port') AS port");
assert.equal(guard.name, connection.pathname.slice(1));
assert.equal(guard.socket, true);
assert.equal(guard.port, "55437");
const { default: router } = await import("../../artifacts/api-server/src/routes/insertions.ts");
const { default: campaignsRouter } = await import("../../artifacts/api-server/src/routes/campaigns.ts");
const app = express();
app.use(express.json());
app.use(router);
app.use(campaignsRouter);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
let campaignId;
let insertionId;
const request = async (route, method = "GET", body) => {
  const response = await fetch(`${base}${route}`, {
    method, headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
};
try {
  campaignId = (await pool.query("INSERT INTO campaigns (nome) VALUES ('CAS isolated QA') RETURNING id")).rows[0].id;
  insertionId = (await pool.query("INSERT INTO insertions (campanha_id, updated_at) VALUES ($1, '2026-10-10T12:00:00.771746Z') RETURNING id", [campaignId])).rows[0].id;
  const route = `/insertions/${insertionId}`;
  const initial = await request(route);
  assert.equal(initial.status, 200);
  assert.match(initial.body.rowVersion, /^\d{1,10}$/);
  const fresh = await request(route, "PATCH", { expectedRowVersion: initial.body.rowVersion, observacoes: "fresh" });
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.notEqual(fresh.body.rowVersion, initial.body.rowVersion);
  const stale = await request(route, "PATCH", { expectedRowVersion: initial.body.rowVersion, observacoes: "stale" });
  assert.equal(stale.status, 409);
  assert.equal((await request(route)).body.observacoes, "fresh");

  // A second writer can keep updated_at unchanged; the transaction version must still reject it.
  await pool.query("UPDATE insertions SET observacoes = 'other actor' WHERE id = $1", [insertionId]);
  assert.equal((await request(route, "PATCH", { expectedRowVersion: fresh.body.rowVersion, observacoes: "lost update" })).status, 409);
  const beforeRace = (await request(route)).body;
  const race = await Promise.all(["actor A", "actor B"].map(observacoes => request(route, "PATCH", { expectedRowVersion: beforeRace.rowVersion, observacoes })));
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  const winner = race.find(result => result.status === 200).body;
  assert.equal((await request(route)).body.observacoes, winner.observacoes);
  assert.equal((await request(route, "PATCH", { expectedRowVersion: "1 OR true", observacoes: "bad token" })).status, 400);
  assert.equal((await request("/insertions/bulk-update", "POST", { ids: [insertionId], updates: { expectedRowVersion: winner.rowVersion, observacoes: "bulk bypass" } })).status, 400);
  assert.equal((await request(route)).body.rowVersion, winner.rowVersion);
  assert.equal((await request(route, "PATCH", { observacoes: "compatible manual edit" })).status, 200);
  const campaignRoute = `/campaigns/${campaignId}`;
  assert.equal((await request(campaignRoute, "PATCH", { nome: "CAS isolated QA normal" })).status, 200);
  assert.equal((await request(campaignRoute, "PATCH", { mode: "unsupported", nome: "must stay unchanged" })).status, 400);
  const commercial = { mode: "fill_missing_only", dryRun: true, sourceRef: "isolated QA verified source", planilhaRef: "QA-2026-10" };
  const preflight = await request(campaignRoute, "PATCH", commercial);
  assert.equal(preflight.status, 200);
  assert.deepEqual(preflight.body.changedFields, ["planilhaRef"]);
  const applied = await request(campaignRoute, "PATCH", { ...commercial, dryRun: false, expectedUpdatedAt: preflight.body.expectedUpdatedAt });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.campaign.planilhaRef, "QA-2026-10");
  await pool.query("DELETE FROM ops_jobs WHERE id = $1 AND kind = 'campaign-commercial-fill'", [applied.body.jobId]);
  assert.equal((await request(campaignRoute, "PATCH", { ...commercial, planilhaRef: "different occupied value" })).body.canApply, false);
  console.log("ok: real QA route preserves microsecond-safe CAS, replay rejection, competing writers, validation and compatibility");
} finally {
  if (insertionId) await pool.query("DELETE FROM insertions WHERE id = $1", [insertionId]);
  if (campaignId) await pool.query("DELETE FROM campaigns WHERE id = $1", [campaignId]);
  await new Promise(resolve => server.close(resolve));
  await pool.end();
}
