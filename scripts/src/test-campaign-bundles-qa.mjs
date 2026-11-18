#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const qaDatabaseUrl = "postgresql://leandrobosaipo@localhost:55437/adops_cas_qa_20261010_08508430?host=/tmp/adops-candidate-pg-socket-retro20261006";
assert.equal(process.env.DATABASE_URL, qaDatabaseUrl, "DATABASE_URL deve apontar exatamente para o banco QA isolado autorizado.");
const parsedDatabaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(parsedDatabaseUrl.protocol, "postgresql:");
assert.equal(parsedDatabaseUrl.username, "leandrobosaipo");
assert.equal(parsedDatabaseUrl.password, "");
assert.equal(parsedDatabaseUrl.hostname, "localhost");
assert.equal(parsedDatabaseUrl.port, "55437");
assert.equal(parsedDatabaseUrl.pathname, "/adops_cas_qa_20261010_08508430");
assert.equal(parsedDatabaseUrl.searchParams.get("host"), "/tmp/adops-candidate-pg-socket-retro20261006");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const express = apiRequire("express");
const { pool } = await import("../../lib/db/src/index.ts");
const { default: campaignBundlesRouter } = await import("../../artifacts/api-server/src/routes/campaign-bundles.ts");
const { normalizeBundlePosition } = await import("../../artifacts/api-server/src/lib/campaign-bundle-identity.ts");

const dbIdentity = (await pool.query(`
  SELECT current_database() AS database, current_user AS username,
         inet_server_port() AS port, inet_server_addr() IS NULL AS unix_socket,
         current_setting('unix_socket_directories') AS socket_directories
`)).rows[0];
assert.equal(dbIdentity.database, "adops_cas_qa_20261010_08508430");
assert.equal(dbIdentity.username, "leandrobosaipo");
assert.equal(dbIdentity.port, null, "a conexão deve usar socket local, sem host TCP");
assert.equal(dbIdentity.unix_socket, true);
assert.ok(dbIdentity.socket_directories.split(",").map((item) => item.trim()).includes("/tmp/adops-candidate-pg-socket-retro20261006"));
const requiredTables = (await pool.query(`
  SELECT to_regclass('public.sites') IS NOT NULL AS sites,
         to_regclass('public.campaigns') IS NOT NULL AS campaigns,
         to_regclass('public.insertions') IS NOT NULL AS insertions,
         to_regclass('public.ops_jobs') IS NOT NULL AS ops_jobs
`)).rows[0];
assert.deepEqual(requiredTables, { sites: true, campaigns: true, insertions: true, ops_jobs: true });

const token = `qa-bundle-${randomUUID()}`;
const source = `${token}-source`;
const siteSigla = `Q${randomUUID().replaceAll("-", "").slice(0, 7).toUpperCase()}`;
const campaignName = `QA Campaign Bundle ${token}`;
const campaignIds = new Set();
const jobIds = new Set();
let siteId = null;
let server = null;
let createdSite = false;

const app = express();
app.use(express.json());
app.use(campaignBundlesRouter);
server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();

async function postJson(route, body, key) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (Number.isInteger(result?.campaign?.id)) campaignIds.add(result.campaign.id);
  if (typeof result?.jobId === "string") jobIds.add(result.jobId);
  return { status: response.status, body: result };
}

function campaign(name, { piCodigo, origin = source } = {}) {
  return { nome: name, ...(piCodigo ? { piCodigo } : {}), competencia: "OUTUBRO/2026", origem: origin };
}

function insertion({ position = "Banner principal", media = `${token}.gif`, start = "2026-10-20", end = "2026-10-27" } = {}) {
  return {
    siteId,
    localFormato: position,
    localFormatoNormalizado: position,
    periodoInicio: start,
    periodoFim: end,
    mediaUrl: `https://qa.invalid/${media}`,
    statusNormalizado: "rascunho",
  };
}

function bundle({ name = campaignName, piCodigo, origin = source, slot, media, start, end, omitMedia = false } = {}) {
  const item = insertion({ position: slot, media, start, end });
  if (omitMedia) delete item.mediaUrl;
  return { campaign: campaign(name, { piCodigo, origin }), insertions: [item], source: "qa-campaign-bundles" };
}

try {
  const uniqueSourceExists = await pool.query("SELECT id FROM campaigns WHERE origem = $1 LIMIT 1", [source]);
  assert.equal(uniqueSourceExists.rowCount, 0, "token QA deve estar livre antes de inserir fixtures");
  const site = await pool.query("INSERT INTO sites (nome, sigla) VALUES ($1, $2) RETURNING id", [`QA Campaign Bundles ${token}`, siteSigla]);
  siteId = Number(site.rows[0].id);
  createdSite = true;

  const firstBody = bundle();
  const firstKey = `${token}-first`;
  const first = await postJson("/campaign-bundles", firstBody, firstKey);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.createdInsertions, 1);

  const replay = await postJson("/campaign-bundles", firstBody, firstKey);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.duplicate, true);
  assert.equal(replay.body.campaign.id, first.body.campaign.id);

  const changedPayload = structuredClone(firstBody);
  changedPayload.campaign.nome = `${campaignName} altered`;
  const mismatch = await postJson("/campaign-bundles", changedPayload, firstKey);
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.error, "idempotency_key_payload_mismatch");

  const repeatedIdentity = await postJson("/campaign-bundles", firstBody, `${token}-same-identity`);
  assert.equal(repeatedIdentity.status, 409);
  assert.ok(repeatedIdentity.body.conflicts?.some((item) => item.code === "campaign_operational_identity_exists"));

  const accentedPosition = "Bánner   Príncipal";
  const foldedPosition = "banner principal";
  assert.equal(normalizeBundlePosition(accentedPosition), normalizeBundlePosition(foldedPosition));
  const accentBody = bundle({
    name: `${campaignName} accent`, origin: `${source}-accent`,
    slot: accentedPosition, media: `${token}-accent.gif`,
  });
  const accentCreate = await postJson("/campaign-bundles", accentBody, `${token}-accent-first`);
  assert.equal(accentCreate.status, 201, JSON.stringify(accentCreate.body));
  const accentReplayBody = bundle({
    name: `${campaignName} accent replay`, origin: `${source}-accent`,
    slot: foldedPosition, media: `${token}-accent.gif`,
  });
  const normalizedDuplicate = await postJson("/campaign-bundles", accentReplayBody, `${token}-accent-new-key`);
  assert.equal(normalizedDuplicate.status, 409, JSON.stringify(normalizedDuplicate.body));
  assert.ok(normalizedDuplicate.body.conflicts?.some((item) => item.code === "campaign_operational_identity_exists"));

  const concurrentBody = bundle({ name: `${campaignName} concurrent`, origin: `${source}-concurrent`, media: `${token}-concurrent.gif` });
  const concurrent = await Promise.all([
    postJson("/campaign-bundles", concurrentBody, `${token}-concurrent-a`),
    postJson("/campaign-bundles", concurrentBody, `${token}-concurrent-b`),
  ]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [201, 409]);
  assert.equal(concurrent.filter((item) => item.body.conflicts?.some((conflict) => conflict.code === "campaign_operational_identity_exists")).length, 1);

  const missingMedia = await postJson("/campaign-bundles/preflight", bundle({
    name: `${campaignName} missing media`, origin: `${source}-missing-media`,
    media: `${token}-missing.gif`, omitMedia: true,
  }), null);
  assert.equal(missingMedia.status, 409, JSON.stringify(missingMedia.body));
  assert.ok(missingMedia.body.conflicts?.some((item) => item.code === "provisional_identity_incomplete"));

  const piCodigo = `QA-${randomUUID()}`;
  const piBody = bundle({ name: `${campaignName} PI`, origin: `${source}-pi`, piCodigo, media: `${token}-pi.gif` });
  const piFirst = await postJson("/campaign-bundles", piBody, `${token}-pi-first`);
  assert.equal(piFirst.status, 201, JSON.stringify(piFirst.body));
  const piRepeat = await postJson("/campaign-bundles", piBody, `${token}-pi-repeat`);
  assert.equal(piRepeat.status, 409, JSON.stringify(piRepeat.body));
  assert.ok(piRepeat.body.conflicts?.some((item) => item.code === "campaign_pi_exists"));

  console.log(JSON.stringify({
    ok: true,
    database: dbIdentity.database,
    siteId,
    campaignIds: [...campaignIds],
    jobIds: [...jobIds],
    checks: [
      "create 201",
      "replay same key 200 duplicate",
      "same key changed payload 409",
      "new key existing identity 409",
      "normalized accent/whitespace duplicate 409",
      "concurrent new keys create exactly one campaign",
      "missing media preflight 409",
      "known PI repeat 409",
    ],
  }, null, 2));
} finally {
  if (server) {
    server.close();
    await once(server, "close");
  }
  try {
    if (campaignIds.size || jobIds.size || (createdSite && siteId != null)) {
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        if (jobIds.size) await cleanup.query("DELETE FROM ops_jobs WHERE id = ANY($1::text[])", [[...jobIds]]);
        if (campaignIds.size) {
          await cleanup.query("DELETE FROM insertions WHERE campanha_id = ANY($1::int[])", [[...campaignIds]]);
          await cleanup.query("DELETE FROM campaigns WHERE id = ANY($1::int[])", [[...campaignIds]]);
        }
        if (createdSite && siteId != null) {
          await cleanup.query("DELETE FROM sites WHERE id = $1 AND sigla = $2 AND nome = $3", [siteId, siteSigla, `QA Campaign Bundles ${token}`]);
        }
        await cleanup.query("COMMIT");
      } catch (error) {
        await cleanup.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        cleanup.release();
      }
    }
  } finally {
    await pool.end();
  }
}
