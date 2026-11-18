import { pool } from "@workspace/db";
import { createHash } from "node:crypto";
import { getEvidenceDateKey } from "./capture-audit";
import {
  validateAuditChecklist,
  loadAuditChecklistMetadata,
} from "./audit-checklist";
import { reviewReportUrl } from "./evidence-review-messages.mjs";
import {
  assertPublicUrl,
  fetchPublicPreviewResource,
} from "./visual-preview-policy.mjs";
import {
  parsePrintQuery,
  selectPrintRows,
  auditedPrintHelp,
} from "./audited-print-menu.mjs";
export async function auditedPrintSelection(
  query: string,
  today: string,
  includeSource = false,
) {
  const q = parsePrintQuery(query, today);
  if (q.help) return { text: auditedPrintHelp };
  const rows = (
    await pool.query(
      `SELECT i.id,i.campanha_id AS "campaignId",c.nome AS "campaignName",c.pi_codigo AS pi,s.sigla AS site,i.local_formato AS format,i.local_formato_normalizado AS "normalizedFormat",i.media_url AS "mediaUrl",i.banner_publicado_no_site AS published,i.periodo_inicio AS "periodStart",i.periodo_fim AS "periodEnd" FROM insertions i JOIN campaigns c ON c.id=i.campanha_id JOIN sites s ON s.id=i.site_id WHERE i.periodo_inicio<=$1 AND i.periodo_fim>=$1 AND i.archived_at IS NULL AND i.superseded_by_insertion_id IS NULL AND COALESCE(i.status_normalizado,'') NOT IN ('cancelado','arquivado') ORDER BY s.sigla,i.local_formato,i.id`,
      [q.date],
    )
  ).rows;
  const selected = selectPrintRows(rows, q);
  if (selected.length !== 1)
    return {
      text: !selected.length
        ? `Nenhuma posição vigente localizada para esse pedido em ${q.date}. Confira portal, posição, data ou #ID. Isso não comprova ausência de cadastro ou publicação.\n${auditedPrintHelp}`
        : [
            `Escolha uma posição/campanha para ${q.date}:`,
            ...selected
              .slice(0, 15)
              .map(
                (r: any) =>
                  `${r.site} · ${r.format || "posição não informada"} · ${r.campaignName || "campanha não informada"} · PI ${r.pi || "não informada"}: menu 7 ${q.date} #${r.id}`,
              ),
            ...(selected.length > 15
              ? [
                  "Há outras posições; acrescente o nome exato da posição ao portal.",
                ]
              : []),
          ].join("\n"),
    };
  const row = selected[0],
    evidences = (
      await pool.query(
        "SELECT id,titulo,arquivo_url FROM evidences WHERE insercao_id=$1",
        [row.id],
      )
    ).rows.filter((e: any) => getEvidenceDateKey(e.titulo) === q.date);
  // Resolve the canonical receipt through the existing server provenance gate.
  // Raw log metadata alone is deliberately not trusted by the audit evaluator.
  const metadata: any = await loadAuditChecklistMetadata(row.id, q.date),
    validation = await validateAuditChecklist({ insertionId: row.id, date: q.date, metadata }),
    audit = validation.audit;
  const logs = (
    await pool.query(
      "SELECT id,metadata,artifacts,uploaded_url FROM capture_proof_logs WHERE insertion_id=$1 AND target_date=$2 AND status='ok' ORDER BY created_at DESC",
      [row.id, q.date],
    )
  ).rows;
  const log = logs.find(
      (l: any) =>
        l.metadata?.capturedAt === metadata?.capturedAt &&
        l.metadata?.sourceJobId === metadata?.sourceJobId &&
        l.metadata?.finalPng === metadata?.finalPng &&
        l.uploaded_url === evidences[0]?.arquivo_url,
    );
  // Historical promotion has its own immutable digest receipt. Bind it to the
  // exact final log and source job; an unrelated candidate cannot authorize bytes.
  const promotions = log && metadata?.captureClass === "historical_recovery"
    ? (await pool.query(
        `SELECT candidate_sha256 AS artifact_sha256,candidate_bytes AS artifact_bytes FROM capture_proof_candidate_promotions
         WHERE insertion_id=$1 AND target_date=$2 AND final_log_id=$3
           AND source_job_id=$4 AND candidate_url=$5 AND status='approved'`,
        [row.id, q.date, log.id, metadata.sourceJobId, log.uploaded_url],
      )).rows
    : [];
  const promotion = promotions.length === 1 ? promotions[0] : null;
  const sha = log?.artifacts?.final?.sha256 ?? promotion?.artifact_sha256;
  const digestVerified = log?.artifacts?.remoteFinal?.sha256 === sha &&
    log?.artifacts?.remoteFinal?.ok === true;
  const promotionVerified = promotion?.artifact_sha256 === sha &&
    Number(promotion?.artifact_bytes) > 8;
  const approved =
    evidences.length === 1 &&
    validation.approved === true &&
    audit?.ok === true &&
    !audit.issues?.length &&
    audit.visualAudit?.frameSelectionDowngraded !== true &&
    /^[a-f0-9]{64}$/.test(sha ?? "") &&
    (digestVerified || promotionVerified);
  if (!approved)
    return {
      text: `${row.site} · ${row.format || "posição não informada"} · ${row.campaignName || "campanha não informada"} · ${q.date}: não há print real aprovado com bytes auditados verificáveis disponível para envio.\n${evidences.length !== 1 ? "Registro de evidência ausente ou duplicado." : !validation.approved ? "A auditoria não confirmou todos os critérios." : "Digest do arquivo auditado ausente ou incompatível com a fonte."}\nResponsável: equipe AdOps confere a fonte e o relatório. Nenhuma captura foi solicitada e nenhuma prévia será enviada.\n${reviewReportUrl(q.date, row.campaignId, row.site)}`,
    };
  await assertPublicUrl(evidences[0].arquivo_url);
  return {
    text: `Print real auditado · ${row.site} · ${row.format || "posição não informada"} · ${row.campaignName || "campanha não informada"} · PI ${row.pi || "não informada"} · ${q.date}${metadata.captureClass === "historical_recovery" ? " · reconstrução histórica; não comprova exibição original" : ""}. Aprovação desta posição/data, sem confirmar toda a campanha.`,
    print: {
      insertionId: row.id,
      date: q.date,
      evidenceId: evidences[0].id,
      sha256: sha,
    },
    ...(includeSource ? { sourceUrl: evidences[0].arquivo_url } : {}),
  };
}
export async function auditedPrintBytes(descriptor: any) {
  if (
    !Number.isSafeInteger(descriptor?.insertionId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(descriptor?.date ?? "")
  )
    throw Error("audited_print_invalid_descriptor");
  const selected = await auditedPrintSelection(
    `${descriptor.date} #${descriptor.insertionId}`,
    descriptor.date,
    true,
  );
  if (
    !selected.print ||
    String(selected.print.evidenceId) !== String(descriptor.evidenceId) ||
    selected.print.sha256 !== descriptor.sha256
  )
    throw Error("audited_print_no_longer_approved");
  const resource = await fetchPublicPreviewResource(selected.sourceUrl);
  if (
    resource.status !== 200 ||
    resource.body.length < 8 ||
    !resource.body
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("audited_print_invalid_png");
  const sha256 = createHash("sha256").update(resource.body).digest("hex");
  if (sha256 !== descriptor.sha256) throw Error("audited_print_bytes_changed");
  return {
    body: resource.body,
    sha256,
    caption: selected.text,
    filename: `print-${descriptor.insertionId}-${descriptor.date}.png`,
  };
}
