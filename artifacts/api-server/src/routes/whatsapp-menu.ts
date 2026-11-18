import { Router } from "express";
import { pool } from "@workspace/db";
import {
  ADOPS_GROUP,
  ADOPS_INSTANCE,
  readWhatsAppConfig,
  receiptSummary,
} from "../lib/whatsapp-checklist.mjs";
import {
  MENU_ID,
  MENU_CHOICES,
  menuCommand,
  menuText,
  menuEvidenceText,
  menuDate,
  menuHash,
} from "../lib/whatsapp-menu.mjs";
import {
  campaignProgress,
  campaignNotificationState,
  loadCampaignActionProgress,
} from "../lib/campaign-notification-policy.mjs";
import {
  auditedPrintSelection,
  auditedPrintBytes,
} from "../lib/audited-print-delivery";
import { visualPreviewSnapshot } from "../lib/visual-previews";
import { previewHash } from "../lib/visual-preview-policy.mjs";
import { piStatus } from "../lib/whatsapp-pi-status";
const router = Router(),
  base = "/monitoring/whatsapp/menu";
router.use(base, (req, res, next) => {
  const token = req
    .header("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  if (!process.env.OPS_API_TOKEN || token !== process.env.OPS_API_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});
router.get(base + "/pi-status", async (req, res) => {
  if (req.query.q !== undefined && (typeof req.query.q !== "string" || req.query.q.length > 90)) {
    res.status(400).json({error:"invalid_pi_status_query"}); return;
  }
  try { res.json({text: await piStatus(String(req.query.q ?? "")), publicationEnabled:false}); }
  catch { res.status(503).json({error:"pi_status_unavailable"}); }
});
async function schema(client: any) {
  await client.query(`CREATE TABLE IF NOT EXISTS adops_wa_menu_cutovers(policy_key TEXT PRIMARY KEY,activated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS adops_wa_menu_processed(event_key TEXT PRIMARY KEY,processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),outcome TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS adops_wa_menu_deliveries(message_key TEXT PRIMARY KEY,event_key TEXT NOT NULL,identity TEXT NOT NULL,revision TEXT NOT NULL,part TEXT NOT NULL CHECK(part IN ('text','poll')),request JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',provider_id TEXT UNIQUE,attempted_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
}
router.get(base + "/catalog", (_req, res) =>
  res.json({
    choices: MENU_CHOICES,
    commands: ["menu", "ajuda", "menu 1 <campanha ou portal>", "status", "status <portal>", "status PI <número> <portal>", "menu 8 <número> <portal>"],
    bareNumbers: "somente em resposta ao menu",
    publicationEnabled: false,
    commercialMutation: false,
  }),
);
router.post(base + "/print/resolve", async (req, res) => {
  try {
    if (typeof req.body?.query !== "string" || req.body.query.length > 160) {
      res.status(400).json({ error: "audited_print_invalid_query" });
      return;
    }
    const today = new Date().toLocaleDateString("sv-SE", {
        timeZone: "America/Cuiaba",
      }),
      result = await auditedPrintSelection(req.body.query, today);
    res.json({ ...result, ready: !!result.print, publicationEnabled: false });
  } catch (e) {
    res
      .status(
        /^audited_print_invalid_/.test(String((e as Error).message))
          ? 400
          : 503,
      )
      .json({ error: "audited_print_unavailable", publicationEnabled: false });
  }
});
router.get(base + "/prints/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "audited_print_invalid_id" });
      return;
    }
    const result = await auditedPrintBytes({
      insertionId: id,
      date: req.query.date,
      evidenceId: req.query.evidenceId,
      sha256: req.query.sha256,
    });
    res
      .set({
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Adops-Sha256": result.sha256,
        "Cache-Control": "private, no-store",
      })
      .send(result.body);
  } catch {
    res
      .status(409)
      .json({
        error: "audited_print_not_approved_or_unavailable",
        publicationEnabled: false,
      });
  }
});
router.get(base + "/status", async (_req, res) => {
  if (
    !(await pool.query("SELECT to_regclass('adops_wa_menu_deliveries') name"))
      .rows[0]?.name
  ) {
    res.json({
      initialized: false,
      counts: [],
      processed: 0,
      publicationEnabled: false,
    });
    return;
  }
  const counts = (
    await pool.query(
      "SELECT COALESCE(d.status,m.status) status,count(*)::int count FROM adops_wa_menu_deliveries m LEFT JOIN adops_wa_deliveries d ON d.message_key=m.message_key GROUP BY COALESCE(d.status,m.status) ORDER BY status",
    )
  ).rows;
  const processed = (
    await pool.query(
      "SELECT outcome,count(*)::int count FROM adops_wa_menu_processed GROUP BY outcome ORDER BY outcome",
    )
  ).rows;
  const cutover = (
    await pool.query(
      "SELECT activated_at FROM adops_wa_menu_cutovers WHERE policy_key=$1",
      [MENU_ID],
    )
  ).rows[0];
  res.json({
    initialized: !!cutover,
    cutover: cutover?.activated_at,
    counts,
    processed,
    publicationEnabled: false,
  });
});
router.post(base + "/open", async (req, res) => {
  const key = req.header("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 160) {
    res.status(400).json({ error: "idempotency_key_required_8_160" });
    return;
  }
  if (readWhatsAppConfig().enabled !== true) {
    res.status(409).json({ error: "whatsapp_disabled" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('adops-wa-menu-v1'))",
    );
    await schema(client);
    await client.query(
      "INSERT INTO adops_wa_menu_cutovers(policy_key) VALUES($1) ON CONFLICT DO NOTHING",
      [MENU_ID],
    );
    const event = "manual:" + menuHash(key),
      revision = menuHash([MENU_ID, event]),
      identity = MENU_ID + ":" + event;
    const parts = [
      {
        part: "text",
        request: {
          number: ADOPS_GROUP,
          text: menuText(
            { choice: 0, query: "" },
            [],
            new Date().toISOString(),
          ),
          linkPreview: false,
        },
      },
      {
        part: "poll",
        request: {
          number: ADOPS_GROUP,
          name: "ADOPS — o que deseja consultar?",
          values: MENU_CHOICES,
          selectableCount: 1,
        },
      },
    ];
    let queued = 0;
    for (const p of parts) {
      const inserted = await client.query(
        "INSERT INTO adops_wa_menu_deliveries(message_key,event_key,identity,revision,part,request) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [
          revision + ":" + p.part,
          event,
          identity,
          revision,
          p.part,
          JSON.stringify(p.request),
        ],
      );
      queued += inserted.rowCount ?? 0;
    }
    await client.query("COMMIT");
    res.json({
      queued,
      identity,
      publicationEnabled: false,
      commercialMutation: false,
    });
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "menu_open_unavailable" });
  } finally {
    client.release();
  }
});
router.post(base + "/process", async (req, res) => {
  if (readWhatsAppConfig().enabled !== true) {
    res.json({ processed: 0, queued: 0, enabled: false });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('adops-wa-menu-v1'))",
    );
    await schema(client);
    const first = await client.query(
      "INSERT INTO adops_wa_menu_cutovers(policy_key) VALUES($1) ON CONFLICT DO NOTHING RETURNING activated_at",
      [MENU_ID],
    );
    if (first.rowCount) {
      await client.query("COMMIT");
      res.json({ initialized: true, processed: 0, queued: 0, noReplay: true });
      return;
    }
    const limit = Math.max(1, Math.min(100, Number(req.body?.limit) || 50));
    const answers = (
      await client.query(
        `SELECT a.* FROM adops_wa_answers a WHERE a.received_at>(SELECT activated_at FROM adops_wa_menu_cutovers WHERE policy_key=$1) AND NOT EXISTS(SELECT 1 FROM adops_wa_events e WHERE e.received_at<=(SELECT activated_at FROM adops_wa_menu_cutovers WHERE policy_key=$1) AND e.data->'key'->>'id'=a.provider_id) AND NOT EXISTS(SELECT 1 FROM adops_wa_menu_processed p WHERE p.event_key=a.event_key) ORDER BY a.received_at,a.event_key LIMIT $2`,
        [MENU_ID, limit],
      )
    ).rows;
    let queued = 0;
    for (const a of answers) {
      const command = menuCommand(a, {
        group: ADOPS_GROUP,
        senderAliases: readWhatsAppConfig().senderAliases ?? [],
      });
      if (command) {
        const rows = (
          await client.query(
            "SELECT identity,checklist,updated_at FROM adops_monitor_checklists WHERE active=true ORDER BY identity",
          )
        ).rows;
        const now = new Date(),
          today = now.toLocaleDateString("sv-SE", {
            timeZone: "America/Cuiaba",
          }),
          date = command.query.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? today;
        if (command.choice === 1) {
          const ids = [
            ...new Set(
              rows.flatMap((r) =>
                (r.checklist?.positions ?? []).flatMap(
                  (p: any) => p.insertionIds ?? [],
                ),
              ),
            ),
          ];
          const regs = (
            await client.query(
              "SELECT id,status_normalizado AS status,periodo_inicio AS start,periodo_fim AS end,banner_publicado_no_site AS published FROM insertions WHERE id=ANY($1::int[]) AND archived_at IS NULL AND superseded_by_insertion_id IS NULL",
              [ids],
            )
          ).rows;
          if (
            (
              await client.query(
                "SELECT to_regclass('adops_scheduled_preview_deliveries') name",
              )
            ).rows[0]?.name
          ) {
            const receipts = (
              await client.query(
                "SELECT d.insertion_id,p.snapshot_hash FROM adops_scheduled_preview_deliveries d JOIN adops_visual_previews p ON p.id=d.preview_id WHERE d.insertion_id=ANY($1::int[]) AND d.status<>'cancelled'",
                [ids],
              )
            ).rows;
            for (const reg of regs.filter(
              (r: any) => r.status === "agendado" && !r.published,
            )) {
              try {
                const hash = previewHash(
                  await visualPreviewSnapshot(reg.id, false, client),
                );
                reg.scheduleConfirmed = receipts.some(
                  (r: any) =>
                    r.insertion_id === reg.id && r.snapshot_hash === hash,
                );
              } catch {
                reg.scheduleConfirmed = false;
              }
            }
          }
          for (const r of rows) r.registrations = regs;
        }
        if (command.choice === 2) {
          const answers = (
            await client.query(
              "SELECT DISTINCT ON(a.identity) a.identity,a.revision,a.selected_options,a.text_value,v.checklist AS answered_checklist FROM adops_wa_answers a LEFT JOIN adops_monitor_checklist_versions v ON v.identity=a.identity AND v.revision=a.revision WHERE a.identity=ANY($1::text[]) AND a.status='linked_for_review' ORDER BY a.identity,a.received_at DESC,a.event_key",
              [rows.map((r) => r.identity)],
            )
          ).rows;
          for (const r of rows) {
            const answer = answers.find((a) => a.identity === r.identity);
            r.progress = campaignProgress(
              r.checklist,
              answer,
              answer?.answered_checklist,
              await loadCampaignActionProgress(client, r.identity, r.checklist),
            );
            if (!r.checklist.positions?.length) {
              const history = (
                await client.query(
                  "SELECT checklist,created_at FROM adops_monitor_checklist_versions WHERE identity=$1 AND jsonb_array_length(COALESCE(checklist->'positions','[]'::jsonb))>0 ORDER BY created_at DESC LIMIT 1",
                  [r.identity],
                )
              ).rows;
              const state = campaignNotificationState(r, history, [], { now });
              if (state.state === "period_ended")
                r.progress = { phase: "period_ended", nextStep: state.reason };
            }
          }
        }
        let text = menuText(command, rows, now.toISOString());
        if (command.choice === 8) {
          try { text = await piStatus(command.query, now); }
          catch { text = "Consulta de status da PI indisponível. A equipe AdOps precisa conferir as fontes."; }
        }
        if (command.choice === 3) {
          const snapshot = menuDate(date)
            ? (
                await client.query(
                  "SELECT payload,created_at FROM adops_evidence_review_snapshots WHERE target_date=$1 ORDER BY created_at DESC LIMIT 1",
                  [date],
                )
              ).rows[0]
            : null;
          text = menuEvidenceText(
            {
              ...command,
              query: command.query.match(/\b\d{4}-\d{2}-\d{2}\b/)
                ? command.query
                : today + " " + command.query,
            },
            snapshot,
            now.toISOString(),
          );
        }
        if (command.choice === 1) {
          const sources = (
            await client.query(
              "SELECT source,checked_at FROM adops_monitor_sources ORDER BY source",
            )
          ).rows;
          text +=
            "\n\n*Fontes consultadas:*\n" +
            sources
              .map((s) => {
                const name = /sheet|planilha/i.test(s.source)
                  ? "Planilha"
                  : /drive|document/i.test(s.source)
                    ? "Drive e documentos"
                    : /adrotate|wordpress|portal/i.test(s.source)
                      ? "Portal e anúncios"
                      : "Fonte operacional";
                return `${name}: ${new Date(s.checked_at).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })} (Cuiabá)`;
              })
              .join("\n") +
            "\nLeitura salva; pode não refletir mudanças posteriores.";
        }
        const revision = menuHash([a.event_key, command]),
          identity = MENU_ID + ":" + a.event_key;
        let print: any = null;
        if (command.choice === 7) {
          try {
            const result = await auditedPrintSelection(command.query, today);
            text = result.text;
            print = result.print ?? null;
          } catch (e) {
            text = /^audited_print_invalid_/.test(String((e as Error).message))
              ? "Pedido de print inválido. Use print AAAA-MM-DD AFL HOME 1, ou menu 7 AAAA-MM-DD #ID. Nenhuma captura ou envio de mídia foi solicitado."
              : "A consulta do print está indisponível. Nenhum arquivo ou prévia será enviado; a equipe AdOps deve conferir auditoria e armazenamento. Nenhuma captura foi solicitada.";
          }
        }
        const parts: any[] = [
          {
            part: "text",
            request: {
              number: ADOPS_GROUP,
              text,
              linkPreview: false,
              ...(print ? { _auditedPrint: print } : {}),
            },
          },
        ];
        if (command.choice === 0 || command.choice === 6)
          parts.push({
            part: "poll",
            request: {
              number: ADOPS_GROUP,
              name: "ADOPS — o que deseja consultar?",
              values: MENU_CHOICES,
              selectableCount: 1,
            },
          });
        for (const p of parts) {
          await client.query(
            `INSERT INTO adops_wa_menu_deliveries(message_key,event_key,identity,revision,part,request) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
            [
              revision + ":" + p.part,
              a.event_key,
              identity,
              revision,
              p.part,
              JSON.stringify(p.request),
            ],
          );
          queued++;
        }
      }
      await client.query(
        "INSERT INTO adops_wa_menu_processed(event_key,outcome) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [a.event_key, command ? "queued" : "ignored"],
      );
    }
    await client.query("COMMIT");
    res.json({
      processed: answers.length,
      queued,
      publicationEnabled: false,
      commercialMutation: false,
    });
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "menu_process_unavailable" });
  } finally {
    client.release();
  }
});
router.get(base + "/deliveries", async (_req, res) => {
  if (
    !(await pool.query("SELECT to_regclass('adops_wa_menu_deliveries') name"))
      .rows[0]?.name
  ) {
    res.json({ items: [] });
    return;
  }
  const items = (
    await pool.query(
      `SELECT m.message_key,m.identity,m.revision,m.part,COALESCE(d.status,m.status) status,m.provider_id,m.created_at,m.updated_at FROM adops_wa_menu_deliveries m LEFT JOIN adops_wa_deliveries d ON d.message_key=m.message_key ORDER BY m.created_at DESC LIMIT 100`,
    )
  ).rows;
  res.json({ items, publicationEnabled: false });
});
router.post(base + "/claim", async (req, res) => {
  if (readWhatsAppConfig().enabled !== true) {
    res.json({ items: [], enabled: false });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await schema(client);
    const row = (
      await client.query(
        `SELECT m.* FROM adops_wa_menu_deliveries m WHERE m.status='pending' AND m.attempted_at IS NULL AND ($1::text IS NULL OR m.message_key=$1) AND (m.request->'_auditedPrint' IS NULL OR $2::boolean=true) AND (m.part='text' OR EXISTS(SELECT 1 FROM adops_wa_deliveries d WHERE d.identity=m.identity AND d.part='text' AND d.status IN ('accepted','delivered','read'))) ORDER BY m.created_at,m.part DESC FOR UPDATE SKIP LOCKED LIMIT 1`,
        [typeof req.body?.messageKey === "string" ? req.body.messageKey : null,req.body?.supportsAuditedPrint===true],
      )
    ).rows[0];
    if (row) {
      await client.query(
        "UPDATE adops_wa_menu_deliveries SET status='delivery_unknown',attempted_at=now(),updated_at=now() WHERE message_key=$1",
        [row.message_key],
      );
      await client.query(
        `INSERT INTO adops_wa_deliveries(message_key,identity,revision,package_key,part,group_jid,request) VALUES($1,$2,$3,$3,$4,$5,$6)`,
        [
          row.message_key,
          row.identity,
          row.revision,
          row.part,
          ADOPS_GROUP,
          JSON.stringify(row.request),
        ],
      );
    }
    await client.query("COMMIT");
    res.json({
      items: row
        ? [
            {
              messageKey: row.message_key,
              part: row.request?._auditedPrint ? "image" : row.part,
              instance: ADOPS_INSTANCE,
              request: row.request,
              ...(row.request?._auditedPrint
                ? {
                    downloadPath: `/api/monitoring/whatsapp/menu/prints/${row.request._auditedPrint.insertionId}?date=${row.request._auditedPrint.date}&evidenceId=${encodeURIComponent(row.request._auditedPrint.evidenceId)}&sha256=${row.request._auditedPrint.sha256}`,
                  }
                : {}),
            },
          ]
        : [],
      publicationEnabled: false,
    });
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "menu_claim_unavailable" });
  } finally {
    client.release();
  }
});
router.post(base + "/receipts", async (req, res) => {
  const { messageKey, receipt } = req.body ?? {},
    summary = receiptSummary(receipt);
  if (
    typeof messageKey !== "string" ||
    !summary.id ||
    summary.remoteJid !== ADOPS_GROUP
  ) {
    res.status(400).json({ error: "exact_message_receipt_required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (
      await client.query(
        "SELECT * FROM adops_wa_menu_deliveries WHERE message_key=$1 FOR UPDATE",
        [messageKey],
      )
    ).rows[0];
    if (
      !row?.attempted_at ||
      (row.provider_id && row.provider_id !== summary.id)
    ) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "menu_claim_or_provider_conflict" });
      return;
    }
    const saved = (
      await client.query(
        `UPDATE adops_wa_deliveries SET provider_id=$2,receipt=$3,status=CASE WHEN status IN ('delivered','read') THEN status ELSE 'accepted' END,updated_at=now() WHERE message_key=$1 AND (provider_id IS NULL OR provider_id=$2) RETURNING status`,
        [
          messageKey,
          summary.id,
          JSON.stringify({
            key: receipt.key,
            message: receipt.message,
            status: receipt.status,
          }),
        ],
      )
    ).rows[0];
    if (!saved) throw Error("registry_missing");
    await client.query(
      "UPDATE adops_wa_menu_deliveries SET provider_id=$2,status=$3,updated_at=now() WHERE message_key=$1",
      [messageKey, summary.id, saved.status],
    );
    await client.query("COMMIT");
    res.json({
      ok: true,
      messageKey,
      providerId: summary.id,
      status: saved.status,
      deliveryConfirmed: ["delivered", "read"].includes(saved.status),
      publicationEnabled: false,
    });
  } catch {
    await client.query("ROLLBACK");
    res.status(409).json({ error: "menu_receipt_conflict" });
  } finally {
    client.release();
  }
});
export default router;
