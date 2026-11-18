import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  ensureVisualPreviewSchema,
  visualPreviewSnapshot,
} from "./visual-previews";
import { previewHash } from "./visual-preview-policy.mjs";
import { ADOPS_GROUP, ADOPS_INSTANCE } from "./whatsapp-checklist.mjs";
import {
  SCHEDULED_PREVIEW_CUTOFF,
  TEST_SCHEDULE,
  scheduleExecutions,
  scheduleMatches,
  scheduledMessageKey,
} from "./scheduled-preview-policy.mjs";

let schemaPromise: Promise<unknown> | null = null;
export function ensureScheduledPreviewSchema() {
  if (!schemaPromise)
    schemaPromise = ensureVisualPreviewSchema()
      .then(() =>
        pool.query(`
    CREATE TABLE IF NOT EXISTS adops_scheduled_preview_deliveries (
      id TEXT PRIMARY KEY,message_key TEXT NOT NULL UNIQUE,preview_id TEXT NOT NULL REFERENCES adops_visual_previews(id),
      insertion_id INTEGER NOT NULL REFERENCES insertions(id),revision TEXT NOT NULL,job_id TEXT NOT NULL,
      ad_id INTEGER NOT NULL,schedule_id INTEGER NOT NULL,group_jid TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reserved','delivery_unknown','accepted','delivered','read','cancelled')),
      claim_request_id TEXT UNIQUE,claim_token TEXT,lease_until TIMESTAMPTZ,attempted_at TIMESTAMPTZ,
      provider_id TEXT UNIQUE,receipt JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(insertion_id,ad_id,schedule_id)
    );
    CREATE INDEX IF NOT EXISTS adops_scheduled_preview_pending ON adops_scheduled_preview_deliveries(status,created_at);
  `),
      )
      .catch((e) => {
        schemaPromise = null;
        throw e;
      });
  return schemaPromise;
}

async function candidates(client: any, insertionId?: number) {
  const jobs = (
    await client.query(
      `SELECT id,kind,status,result_json,updated_at FROM ops_jobs WHERE status='completed' AND kind IN ('adrotate-publish','drive-pi-ingest') AND result_json IS NOT NULL AND (updated_at::timestamptz >= $1::timestamptz OR id=$2) ORDER BY updated_at::timestamptz,id`,
      [SCHEDULED_PREVIEW_CUTOFF, TEST_SCHEDULE.jobId],
    )
  ).rows;
  const items = [];
  for (const job of jobs)
    for (const execution of scheduleExecutions(job)) {
      const id = execution?.wpCliResult?.insertion_id;
      if (!Number.isSafeInteger(id) || (insertionId && id !== insertionId))
        continue;
      const insertion = (
        await client.query(
          "SELECT status_normalizado,banner_publicado_no_site FROM insertions WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (
        insertion?.status_normalizado !== "agendado" ||
        insertion.banner_publicado_no_site !== false
      )
        continue;
      let snapshot;
      try {
        snapshot = await visualPreviewSnapshot(id, false, client);
      } catch {
        continue;
      }
      const previews = (
        await client.query(
          "SELECT * FROM adops_visual_previews WHERE insertion_id=$1 AND snapshot_hash=$2 AND status='completed' ORDER BY created_at DESC,id DESC",
          [id, previewHash(snapshot)],
        )
      ).rows;
      const preview = previews.find((p: any) =>
        scheduleMatches(job, execution, snapshot, p),
      );
      if (!preview) continue;
      // One physical scheduling confirmation creates one notice. Later retries of the same
      // physical agenda cannot manufacture a second notice through another preview revision.
      const existing = (
        await client.query(
          "SELECT id FROM adops_scheduled_preview_deliveries WHERE insertion_id=$1 AND ad_id=$2 AND schedule_id=$3",
          [id, execution.wpCliResult.ad_id, execution.wpCliResult.schedule_id],
        )
      ).rows[0];
      if (existing) continue;
      items.push({ job, execution, snapshot, preview });
    }
  return items;
}
export async function refreshScheduledPreviewDeliveries(
  client: any,
  insertionId?: number,
) {
  for (const item of await candidates(client, insertionId)) {
    const { job, execution, snapshot, preview } = item,
      wp = execution.wpCliResult;
    await client.query(
      `INSERT INTO adops_scheduled_preview_deliveries(id,message_key,preview_id,insertion_id,revision,job_id,ad_id,schedule_id,group_jid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(message_key) DO NOTHING`,
      [
        randomUUID(),
        scheduledMessageKey(snapshot, preview, wp),
        preview.id,
        snapshot.insertionId,
        preview.revision,
        job.id,
        wp.ad_id,
        wp.schedule_id,
        ADOPS_GROUP,
      ],
    );
  }
}
async function isCurrent(row: any, client: Pick<typeof pool, "query"> = pool) {
  const insertion = (
    await client.query(
      "SELECT status_normalizado,banner_publicado_no_site FROM insertions WHERE id=$1",
      [row.insertion_id],
    )
  ).rows[0];
  if (
    insertion?.status_normalizado !== "agendado" ||
    insertion.banner_publicado_no_site !== false
  )
    return false;
  const preview = (
    await client.query("SELECT * FROM adops_visual_previews WHERE id=$1", [
      row.preview_id,
    ])
  ).rows[0];
  try {
    return (
      preview?.status === "completed" &&
      previewHash(await visualPreviewSnapshot(row.insertion_id, false, client)) ===
        preview.snapshot_hash
    );
  } catch {
    return false;
  }
}
async function consumer(row: any, includeClaim = false, client: Pick<typeof pool, "query"> = pool) {
  const p = (
    await client.query(
      "SELECT sha256,snapshot FROM adops_visual_previews WHERE id=$1",
      [row.preview_id],
    )
  ).rows[0];
  const s = p.snapshot;
  return {
    deliveryId: row.id,
    messageKey: row.message_key,
    status: row.status,
    insertionId: row.insertion_id,
    revision: row.revision,
    jobId: row.job_id,
    adId: row.ad_id,
    scheduleId: row.schedule_id,
    groupJid: ADOPS_GROUP,
    instance: ADOPS_INSTANCE,
    caption: `Agendamento confirmado · ${s.site} · ${s.campaignName} · PI ${s.pi} · ${s.format} · ${s.periodStart} a ${s.periodEnd}. Prévia visual; não é comprovação de veiculação.`,
    downloadPath: `/api/insertions/${row.insertion_id}/visual-previews/${encodeURIComponent(row.revision)}/download`,
    filename: `previa-${row.insertion_id}.png`,
    mimetype: "image/png",
    sha256: p.sha256,
    providerId: row.provider_id,
    attemptedAt: row.attempted_at,
    leaseUntil: row.lease_until,
    ...(includeClaim ? { claimToken: row.claim_token } : {}),
    publicationEnabled: false,
  };
}
export async function claimScheduledPreview(
  claimRequestId: string,
  insertionId?: number,
) {
  await ensureScheduledPreviewSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('adops-scheduled-preview-claim-v1')) AS acquired",
    );
    if (!lock.rows[0]?.acquired) {
      await client.query("COMMIT");
      return { delivery: null, busy: true };
    }
    const prior = (
      await client.query(
        "SELECT * FROM adops_scheduled_preview_deliveries WHERE claim_request_id=$1",
        [claimRequestId],
      )
    ).rows[0];
    if (prior) {
      if (insertionId && prior.insertion_id !== insertionId)
        throw Error("scheduled_preview_claim_conflict");
      await client.query("COMMIT");
      return { delivery: await consumer(prior, true, client) };
    }
    await refreshScheduledPreviewDeliveries(client, insertionId);
    const rows = (
      await client.query(
        `SELECT * FROM adops_scheduled_preview_deliveries WHERE (status='pending' OR (status='reserved' AND attempted_at IS NULL AND lease_until<now())) AND ($1::integer IS NULL OR insertion_id=$1) ORDER BY created_at,id FOR UPDATE`,
        [insertionId ?? null],
      )
    ).rows;
    for (const row of rows) {
      if (!(await isCurrent(row, client))) {
        await client.query(
          "UPDATE adops_scheduled_preview_deliveries SET status='cancelled',updated_at=now() WHERE id=$1",
          [row.id],
        );
        continue;
      }
      const saved = (
        await client.query(
          "UPDATE adops_scheduled_preview_deliveries SET status='reserved',claim_request_id=$2,claim_token=$3,lease_until=now()+interval '10 minutes',updated_at=now() WHERE id=$1 RETURNING *",
          [row.id, claimRequestId, randomUUID()],
        )
      ).rows[0];
      await client.query("COMMIT");
      return { delivery: await consumer(saved, true, client) };
    }
    await client.query("COMMIT");
    return { delivery: null };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function attemptScheduledPreview(
  deliveryId: string,
  claimToken: string,
) {
  await ensureScheduledPreviewSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (
      await client.query(
        "SELECT * FROM adops_scheduled_preview_deliveries WHERE id=$1 AND claim_token=$2 FOR UPDATE",
        [deliveryId, claimToken],
      )
    ).rows[0];
    if (!row) throw Error("scheduled_preview_claim_not_found");
    if (row.attempted_at || row.status !== "reserved") {
      await client.query("COMMIT");
      return { sendAllowed: false, delivery: await consumer(row, false, client) };
    }
    if (new Date(row.lease_until).getTime() <= Date.now())
      throw Error("scheduled_preview_claim_expired");
    if (!(await isCurrent(row, client))) {
      await client.query(
        "UPDATE adops_scheduled_preview_deliveries SET status='cancelled',updated_at=now() WHERE id=$1",
        [row.id],
      );
      await client.query("COMMIT");
      return {
        sendAllowed: false,
        delivery: { deliveryId, status: "cancelled" },
      };
    }
    const saved = (
      await client.query(
        "UPDATE adops_scheduled_preview_deliveries SET status='delivery_unknown',attempted_at=now(),updated_at=now() WHERE id=$1 RETURNING *",
        [row.id],
      )
    ).rows[0];
    await client.query("COMMIT");
    return { sendAllowed: true, delivery: await consumer(saved, false, client) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function receiptScheduledPreview(
  deliveryId: string,
  claimToken: string,
  receipt: any,
) {
  if (
    typeof receipt?.key?.id !== "string" ||
    !receipt.key.id ||
    receipt.key.id.length > 256 ||
    receipt.key.remoteJid !== ADOPS_GROUP ||
    receipt.key.fromMe !== true
  )
    throw Error("scheduled_preview_exact_receipt_required");
  await ensureScheduledPreviewSchema();
  const row = (
    await pool.query(
      `UPDATE adops_scheduled_preview_deliveries SET provider_id=$3,receipt=$4,status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'accepted' END,updated_at=now() WHERE id=$1 AND claim_token=$2 AND attempted_at IS NOT NULL AND (provider_id IS NULL OR provider_id=$3) RETURNING *`,
      [
        deliveryId,
        claimToken,
        receipt.key.id,
        JSON.stringify({ key: receipt.key, status: receipt.status ?? null }),
      ],
    )
  ).rows[0];
  if (!row) throw Error("scheduled_preview_receipt_conflict");
  return { delivery: await consumer(row) };
}
export async function listScheduledPreviews() {
  await ensureScheduledPreviewSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('adops-scheduled-preview-claim-v1')) AS acquired",
    );
    if (lock.rows[0]?.acquired) await refreshScheduledPreviewDeliveries(client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  // Replay the existing authenticated webhook inbox. Provider acceptance alone never
  // becomes delivery; only the matching outbound message ACK can advance it.
  if (
    (await pool.query("SELECT to_regclass('adops_wa_events') AS name")).rows[0]
      ?.name
  ) {
    await pool.query(
      `UPDATE adops_scheduled_preview_deliveries d SET status=CASE WHEN EXISTS(SELECT 1 FROM adops_wa_events e WHERE e.data->'key'->>'id'=d.provider_id AND e.data->'key'->>'remoteJid'=d.group_jid AND COALESCE(e.data->'update'->>'status',e.data->>'status') IN ('4','5','READ','PLAYED')) THEN 'read' ELSE 'delivered' END,updated_at=now() WHERE d.provider_id IS NOT NULL AND d.status IN ('accepted','delivery_unknown','delivered') AND EXISTS(SELECT 1 FROM adops_wa_events e WHERE e.data->'key'->>'id'=d.provider_id AND e.data->'key'->>'remoteJid'=d.group_jid AND COALESCE(e.data->'update'->>'status',e.data->>'status') IN ('3','4','5','DELIVERY_ACK','READ','PLAYED'))`,
    );
  }
  const rows = (
    await pool.query(
      "SELECT * FROM adops_scheduled_preview_deliveries ORDER BY created_at DESC,id DESC LIMIT 100",
    )
  ).rows;
  return {
    items: await Promise.all(rows.map((row: any) => consumer(row))),
    cutoff: SCHEDULED_PREVIEW_CUTOFF,
    publicationEnabled: false,
  };
}
