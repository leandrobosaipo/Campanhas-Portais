import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildInsertionCanonicalIdentity } from "../../artifacts/api-server/src/lib/insertion-identity.ts";

const a = buildInsertionCanonicalIdentity({ piCodigo: "PI 14609", siteSigla: "afl", position: "MEGABANNER TOPO", periodStart: "2026-07-26", periodEnd: "2026-07-31" });
const b = buildInsertionCanonicalIdentity({ piCodigo: "14609", siteSigla: "AFL", position: "megabanner topo", periodStart: "2026-07-26", periodEnd: "2026-07-31" });
assert.equal(a, b);
assert.notEqual(a, buildInsertionCanonicalIdentity({ piCodigo: "14609", siteSigla: "AFL", position: "HOME 1", periodStart: "2026-07-26", periodEnd: "2026-07-31" }));

const runner = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
for (const marker of [
  "awaiting_human_review",
  "sendTelegramPositionDeliveriesDirect",
  "artifacts: { positions: [] }",
  "splitZipByPosition",
  "HumanReviewRequiredError",
  "existingTelegramReceipts",
]) assert(runner.includes(marker), `runner sem ${marker}`);
assert(
  runner.indexOf("throw new HumanReviewRequiredError") < runner.indexOf("const positionDownloads = await Promise.all"),
  "o gate humano deve ocorrer antes da montagem e publicação dos artefatos",
);

const migration = await readFile(new URL("../../ops/portainer/adops-stack/migrations/2026-08-07-adops-proof-integrity.sql", import.meta.url), "utf8");
for (const marker of [
  "capture_proof_reviews",
  "insertion_media_selections",
  "adrotate_publication_snapshots",
  "insertion_identity_reconciliation_log",
  "canonical_identity_backfill_duplicate",
  "superseded_by_published_rule_2026_08_07",
  "insertions_canonical_identity_active_uidx",
]) assert(migration.includes(marker));

console.log("ok: canonical identity, review gate, position delivery and audit migrations");
