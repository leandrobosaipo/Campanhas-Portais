import { pool } from "@workspace/db";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { withPlaywrightPermit } from "./playwright-budget";
import {
  getSiteIntegration,
  getSiteFormatMapping,
  normalizeLocalFormato,
} from "./adrotate-sites";
import {
  previewHash,
  previewRevision,
  previewConsumer,
  assertPublicUrl,
  fetchPublicPreviewResource,
} from "./visual-preview-policy.mjs";
import { renderVisualSlotPreview } from "../../../../scripts/src/lib/visual-slot-preview.cjs";

let initialized: Promise<unknown> | null = null;
export function ensureVisualPreviewSchema() {
  return (initialized ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS adops_visual_previews (
 id TEXT PRIMARY KEY,insertion_id INTEGER NOT NULL REFERENCES insertions(id),revision TEXT NOT NULL,snapshot_hash TEXT NOT NULL,snapshot JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued',error TEXT,sha256 TEXT,metadata JSONB,attempts INTEGER NOT NULL DEFAULT 0,lease_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(insertion_id,revision));
 CREATE TABLE IF NOT EXISTS adops_visual_preview_events(seq BIGSERIAL PRIMARY KEY,preview_id TEXT NOT NULL UNIQUE REFERENCES adops_visual_previews(id));`,
    )
    .catch((e) => {
      initialized = null;
      throw e;
    }));
}
const root = () =>
  path.resolve(
    process.env.ADOPS_VISUAL_PREVIEW_DIR ??
      path.join(
        process.env.ADOPS_PROJECT_ROOT ?? process.cwd(),
        "outputs",
        "visual-previews",
      ),
  );
export const visualPreviewPath = (id: string) => path.join(root(), id + ".png");
export async function enqueueVisualPreview(
  insertionId: number,
  requestedRevision?: string,
) {
  const snapshot = await visualPreviewSnapshot(insertionId),
    hash = previewHash(snapshot),
    revision =
      requestedRevision === undefined
        ? hash
        : previewRevision(requestedRevision);
  await ensureVisualPreviewSchema();
  const row = (
    await pool.query(
      `INSERT INTO adops_visual_previews(id,insertion_id,revision,snapshot_hash,snapshot) VALUES($1,$2,$3,$4,$5) ON CONFLICT(insertion_id,revision) DO UPDATE SET revision=EXCLUDED.revision RETURNING *`,
      [randomUUID(), insertionId, revision, hash, JSON.stringify(snapshot)],
    )
  ).rows[0];
  if (row.snapshot_hash !== hash) throw Error("preview_revision_conflict");
  kickVisualPreviewRunner();
  return previewConsumer(row);
}
export async function visualPreviewSnapshot(
  insertionId: number,
  validateUrls = true,
  client: Pick<typeof pool, "query"> = pool,
) {
  const row = (
    await client.query(
      `SELECT i.id,i.media_url,i.local_formato,i.local_formato_normalizado,i.periodo_inicio,i.periodo_fim,i.status_normalizado,
        to_jsonb(i)->>'archived_at' AS archived_at,to_jsonb(i)->>'superseded_by_insertion_id' AS superseded_by_insertion_id,
        to_jsonb(i)->>'observacoes' AS notes,s.sigla,c.nome AS campaign_name,c.pi_codigo
        FROM insertions i JOIN sites s ON s.id=i.site_id JOIN campaigns c ON c.id=i.campanha_id WHERE i.id=$1`,
      [insertionId],
    )
  ).rows[0];
  if (!row) throw Error("insertion_not_found");
  if (
    row.archived_at ||
    row.superseded_by_insertion_id ||
    ["cancelado", "arquivado"].includes(row.status_normalizado)
  )
    throw Error("insertion_inactive");
  const format = row.local_formato_normalizado || row.local_formato,
    site = getSiteIntegration(row.sigla),
    mapping = getSiteFormatMapping(row.sigla, format);
  if (!site || !mapping) throw Error("preview_slot_unconfigured");
  const published = (
    await client.query(
      "SELECT * FROM capture_rules WHERE site_sigla=$1 AND status_published=true",
      [row.sigla],
    )
  ).rows;
  const matching = published.filter((r: any) => r.group_id === mapping.groupId);
  if (matching.length !== 1) throw Error("preview_rule_ambiguous");
  const rule = matching[0];
  if (
    !rule.enabled ||
    rule.slot_selector !== mapping.slotSelector ||
    rule.page !== mapping.page ||
    !rule.aliases.some(
      (a: string) => normalizeLocalFormato(a) === normalizeLocalFormato(format),
    ) ||
    published.some(
      (r: any) =>
        r.group_id !== mapping.groupId &&
        (r.slot_selector === rule.slot_selector ||
          r.aliases.some(
            (a: string) =>
              normalizeLocalFormato(a) === normalizeLocalFormato(format),
          )),
    )
  )
    throw Error("preview_rule_drift");
  const pageUrl =
    mapping.page === "home"
      ? site.homeUrl
      : rule.article_fallback_url || site.articleFallbackUrl;
  if (!pageUrl || !row.media_url) throw Error("preview_media_or_page_missing");
  if (new URL(pageUrl).hostname !== new URL(site.homeUrl).hostname)
    throw Error("preview_page_origin_mismatch");
  if (validateUrls)
    await Promise.all([
      assertPublicUrl(pageUrl),
      assertPublicUrl(row.media_url),
    ]);
  return {
    insertionId,
    clickUrl:
      row.notes?.match(
        /Link destino informado[^:]*:\s*(https?:\/\/\S+)/i,
      )?.[1] ?? null,
    site: row.sigla,
    groupId: mapping.groupId,
    format,
    campaignName: row.campaign_name,
    pi: row.pi_codigo,
    periodStart: row.periodo_inicio,
    periodEnd: row.periodo_fim,
    mediaUrl: row.media_url,
    pageUrl,
    slotSelector: rule.slot_selector,
    ruleVersion: rule.rule_version_hash,
    // Confirmed WP widget placement; DOM-only reconstruction when AdRotate omits its empty group.
    fallbackAnchorSelector:
      row.sigla === "AFL" && mapping.groupId === 2 && mapping.page === "home"
        ? "#block-9"
        : null,
  };
}
let draining = false,
  kickPending = false;
export function kickVisualPreviewRunner() {
  if (draining) {
    kickPending = true;
    return;
  }
  draining = true;
  setImmediate(() => {
    let more = false;
    void drain()
      .then((remaining) => {
        more = remaining;
      })
      .finally(() => {
        draining = false;
        if (more || kickPending) {
          kickPending = false;
          kickVisualPreviewRunner();
        }
      });
  });
}
async function drain(): Promise<boolean> {
  try {
    await ensureVisualPreviewSchema();
    for (let count = 0; count < 20; count++) {
      const waiting = await pool.query(
        "SELECT 1 FROM adops_visual_previews WHERE status='queued' OR (status='running' AND updated_at<now()-interval '5 minutes') LIMIT 1",
      );
      if (waiting.rows.length === 0) return false;
      // Acquire the same browser budget as official captures before starting
      // a lease. Time spent waiting for Chromium cannot expire the lease.
      const worked = await withPlaywrightPermit(
        "visual-preview",
        renderNextPreview,
      );
      if (!worked) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function renderNextPreview(): Promise<boolean> {
  const lease = randomUUID();
  const row = (
    await pool.query(
      `UPDATE adops_visual_previews SET status='running',lease_id=$1,attempts=attempts+1,updated_at=now(),error=NULL WHERE id=(SELECT id FROM adops_visual_previews WHERE status='queued' OR (status='running' AND updated_at<now()-interval '5 minutes') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [lease],
    )
  ).rows[0];
  if (!row) return false;
  let browser;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const tmp = path.join(root(), row.id + "." + lease + ".png");
  try {
    if (row.attempts > 3) throw Error("preview_attempts_exhausted");
    const snapshot = await visualPreviewSnapshot(row.insertion_id);
    if (previewHash(snapshot) !== row.snapshot_hash)
      throw Error("preview_revision_stale");
    await mkdir(root(), { recursive: true, mode: 0o700 });
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          }
        : {}),
      args: ["--disable-dev-shm-usage"],
    });
    deadline = setTimeout(() => {
      void browser?.close().catch(() => {});
    }, 90000);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.route("**/*", async (route) => {
      try {
        if (
          !["GET", "HEAD"].includes(route.request().method()) ||
          ["script", "websocket"].includes(route.request().resourceType())
        )
          throw Error("preview_read_only");
        const response: any = await fetchPublicPreviewResource(
          route.request().url(),
        );
        if (route.request().resourceType() === "document")
          response.headers["content-security-policy"] =
            "script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
        await route.fulfill(response);
      } catch (error) {
        if ((error as Error).message === "preview_resource_too_large") {
          await route.fulfill({
            status: 413,
            headers: { "x-adops-preview-error": "preview_media_too_large" },
            body: "",
          });
        } else {
          await route.abort("blockedbyclient");
        }
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const metadata = await renderVisualSlotPreview({
      page,
      ...snapshot,
      width: 1440,
      height: 1000,
      outputPath: tmp,
    });
    if (
      previewHash(await visualPreviewSnapshot(row.insertion_id, false)) !==
      row.snapshot_hash
    )
      throw Error("preview_revision_stale");
    const png = await readFile(tmp);
    if (
      !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw Error("preview_invalid_png");
    const sha256 = createHash("sha256").update(png).digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Every completion holds this lock until COMMIT: sequence order equals committed visibility order.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('adops-visual-preview-completion'))",
      );
      const done = await client.query(
        "UPDATE adops_visual_previews SET status='completed',sha256=$3,metadata=$4,updated_at=now() WHERE id=$1 AND lease_id=$2 AND status='running' RETURNING id",
        [row.id, lease, sha256, JSON.stringify(metadata)],
      );
      if (done.rows.length !== 1) throw Error("preview_lease_lost");
      // The conditional UPDATE owns the row lock until COMMIT. A former
      // lease holder therefore cannot replace the winning artifact.
      await rename(tmp, visualPreviewPath(row.id));
      await client.query(
        "INSERT INTO adops_visual_preview_events(preview_id) VALUES($1) ON CONFLICT(preview_id) DO NOTHING",
        [row.id],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    const message = String((e as Error).message);
    const code = /^[a-z_]+$/.test(message)
      ? message
      : /fallbackAnchorSelector/.test(message)
        ? "preview_anchor_missing_or_ambiguous"
        : /slotSelector.*found 0/.test(message)
          ? "preview_slot_missing"
          : /slotSelector/.test(message)
            ? "preview_slot_ambiguous"
            : /media failed/.test(message)
              ? "preview_media_invalid"
              : /measurable width|layout width/.test(message)
                ? "preview_slot_no_geometry"
                : /viewport/.test(message)
                  ? "preview_slot_outside_viewport"
                  : /Timeout|closed/.test(message)
                    ? "preview_render_timeout"
                    : "preview_render_failed";
    await pool.query(
      "UPDATE adops_visual_previews SET status='failed',error=$3,updated_at=now() WHERE id=$1 AND lease_id=$2 AND status='running'",
      [row.id, lease, code],
    );
  } finally {
    clearTimeout(deadline);
    await browser?.close().catch(() => {});
    await unlink(tmp).catch(() => {});
  }
  return true;
}
