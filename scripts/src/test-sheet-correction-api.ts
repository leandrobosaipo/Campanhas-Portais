import assert from "node:assert/strict";
import * as XLSX from "xlsx";

const spreadsheetId = "1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu";
const worksheet = XLSX.utils.aoa_to_sheet([]);
XLSX.utils.sheet_add_aoa(worksheet, [["OMT"]], { origin: "C3" });
XLSX.utils.sheet_add_aoa(worksheet, [["PECA", "CAMPANHA", "PERIODO", "LOCAL", "STATUS"]], { origin: "C4" });
XLSX.utils.sheet_add_aoa(worksheet, [["ativo", "DENGUE", "01/09-15/09", "MEGABANNER TOPO", "ativo"]], { origin: "C7" });
worksheet["!ref"] = "C3:G7";
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "SETEMBRO 2026");
process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:9/adops-sheet-test";
process.env.GOOGLE_SHEETS_SPREADSHEET_ID = spreadsheetId;
process.env.PLANILHA_XLSX_URL = `data:application/octet-stream;base64,${XLSX.write(workbook, { type: "base64", bookType: "xlsx" })}`;

const [{ pool }, opsModule] = await Promise.all([
  import("../../lib/db/src/index.ts"),
  import("../../artifacts/api-server/src/routes/ops.ts"),
]);
const router = opsModule.default as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> };
const route = router.stack.find((layer) => layer.route?.path === "/ops/jobs/sheet-correction")?.route;
const rollbackRoute = router.stack.find((layer) => layer.route?.path === "/ops/jobs/sheet-correction/:id/rollback")?.route;
assert.ok(route, "rota sheet-correction deve estar registrada");
assert.ok(rollbackRoute, "rota de rollback deve estar registrada");
const handler = route.stack.at(-1)!.handle;
const rollbackHandler = rollbackRoute.stack.at(-1)!.handle;

const baseBody = {
  spreadsheetId,
  sheetName: "SETEMBRO 2026",
  blockSite: "OMT",
  rowNumber: 7,
  sourceDate: "2026-09-14",
  reason: "Correção conferida na PI original",
  evidenceRef: "evidencia-interna-42059",
  changes: [{ field: "piCodigo", expectedValue: "ativo", value: "PI 42059 - GOV" }],
};

function responseCapture() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

async function invoke(body: Record<string, unknown>, key = "sheet-correction-42059-v1") {
  const res = responseCapture();
  await handler({ body, headers: { "idempotency-key": key } }, res);
  return res;
}

const originalQuery = pool.query.bind(pool);
const originalConnect = pool.connect.bind(pool);
let queryCalls = 0;
(pool as unknown as { query: Function }).query = async () => {
  queryCalls += 1;
  return { rows: [] };
};
try {
  const preview = await invoke({ ...baseBody, apply: false });
  assert.equal(preview.statusCode, 200);
  assert.equal((preview.body as { preview: boolean }).preview, true);
  assert.equal(queryCalls, 0, "preview não deve consultar/criar job");

  assert.equal((await invoke({ ...baseBody, apply: false, changes: [{ ...baseBody.changes[0], value: "ativo" }] })).statusCode, 422, "PI não numérica deve falhar");
  assert.equal((await invoke({ ...baseBody, apply: false, changes: [{ field: "periodoOriginal", expectedValue: "01/09-15/09", value: "20/09-01/09" }] })).statusCode, 422, "período invertido deve falhar");
  assert.equal((await invoke({ ...baseBody, apply: false, changes: [{ field: "localFormato", expectedValue: "MEGABANNER TOPO", value: "FORMATO UNIVERSAL" }] })).statusCode, 422, "formato fora do catálogo deve falhar");

  const normalized = opsModule.normalizeSheetCorrectionRequest(baseBody);
  const fingerprint = opsModule.sheetFingerprint(normalized);
  const record = {
    id: "existing-job",
    kind: "sheet-correction",
    status: "completed",
    payload_json: JSON.stringify({ ...normalized, requestFingerprint: fingerprint, idempotencyKey: "sheet-correction-42059-v1" }),
    result_json: null,
    error_text: null,
    requested_by: "test",
    runner_id: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
  (pool as unknown as { query: Function }).query = async () => ({ rows: [record] });
  const replay = await invoke({ ...baseBody, apply: true });
  assert.equal(replay.statusCode, 200);
  assert.equal((replay.body as { jobId: string }).jobId, "existing-job");

  const conflict = await invoke({ ...baseBody, apply: true, reason: "Outra razão operacional válida" });
  assert.equal(conflict.statusCode, 409, "mesma chave com outro fingerprint deve falhar sem reler/escrever");

  let retryQuery = 0;
  let retryUpdateSql = "";
  (pool as unknown as { query: Function }).query = async (sql: string) => {
    retryQuery += 1;
    return { rows: [{ ...record, status: "failed", result_json: JSON.stringify({ sheetCorrection: { state: "intent_durable" } }) }] };
  };
  (pool as unknown as { connect: Function }).connect = async () => ({
    query: async (sql: string) => {
      if (sql.includes("AND id <>")) return { rows: [] };
      if (sql.includes("UPDATE ops_jobs")) {
        retryUpdateSql = sql;
        return { rows: [{ ...record, status: "ready_for_runner" }] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  });
  const retry = await invoke({ ...baseBody, apply: true, retryFailed: true });
  assert.equal(retry.statusCode, 202);
  assert.equal((retry.body as { retried: boolean }).retried, true);
  assert.doesNotMatch(retryUpdateSql, /result_json\s*=/, "retry do mesmo job deve preservar intenção/result_json");

  const appliedSheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(appliedSheet, [["OMT"]], { origin: "C3" });
  XLSX.utils.sheet_add_aoa(appliedSheet, [["PECA", "CAMPANHA", "PERIODO", "LOCAL", "STATUS"]], { origin: "C4" });
  XLSX.utils.sheet_add_aoa(appliedSheet, [["PI 42059 - GOV", "DENGUE", "01/09-15/09", "MEGABANNER TOPO", "ativo"]], { origin: "C7" });
  appliedSheet["!ref"] = "C3:G7";
  const appliedWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(appliedWorkbook, appliedSheet, "SETEMBRO 2026");
  process.env.PLANILHA_XLSX_URL = `data:application/octet-stream;base64,${XLSX.write(appliedWorkbook, { type: "base64", bookType: "xlsx" })}`;
  const failedRecord = {
    ...record,
    id: "failed-after-write",
    status: "failed",
    payload_json: JSON.stringify({
      spreadsheetId,
      sheetName: "SETEMBRO 2026",
      blockSite: "OMT",
      rowNumber: 7,
      sourceDate: "2026-09-14",
      operation: "apply",
      requestFingerprint: "apply-fingerprint",
      identity: [
        { field: "piCodigo", cell: "C7", expectedValue: "ativo" },
        { field: "campaignName", cell: "D7", expectedValue: "DENGUE" },
        { field: "periodoOriginal", cell: "E7", expectedValue: "01/09-15/09" },
        { field: "localFormato", cell: "F7", expectedValue: "MEGABANNER TOPO" },
      ],
      changes: [{ field: "piCodigo", cell: "C7", headerCell: "C4", expectedHeader: "PECA", expectedValue: "ativo", value: "PI 42059 - GOV" }],
      idempotencyKey: "apply-key",
    }),
    result_json: JSON.stringify({
      sheetCorrection: {
        state: "intent_durable",
        requestFingerprint: "apply-fingerprint",
        changes: [{ field: "piCodigo", cell: "C7", headerCell: "C4", expectedHeader: "PECA", expectedValue: "ativo", previousValue: "ativo", value: "PI 42059 - GOV" }],
      },
    }),
  };
  await opsModule.verifySheetCorrectionExport(failedRecord as never, JSON.parse(failedRecord.result_json));
  let rollbackQuery = 0;
  (pool as unknown as { query: Function }).query = async () => ({ rows: rollbackQuery++ === 0 ? [] : [failedRecord] });
  let insertedRollbackPayload: Record<string, unknown> | null = null;
  let activeTargetGuardSeen = false;
  (pool as unknown as { connect: Function }).connect = async () => ({
    query: async (sql: string, values: unknown[]) => {
      if (sql.includes("status IN ('queued', 'ready_for_runner', 'running')")) activeTargetGuardSeen = true;
      if (sql.includes("SELECT id, status, payload_json")) return { rows: [] };
      if (sql.includes("INSERT INTO ops_jobs")) insertedRollbackPayload = JSON.parse(String(values[2]));
      return { rows: [] };
    },
    release: () => undefined,
  });
  const rollbackResponse = responseCapture();
  await rollbackHandler({
    params: { id: failedRecord.id },
    body: { confirmationNote: "Rollback após falha de transporte" },
    headers: { "idempotency-key": "rollback-failed-write-v1" },
  }, rollbackResponse);
  assert.equal(rollbackResponse.statusCode, 202, `job failed com intenção durável deve permitir rollback guardado: ${JSON.stringify(rollbackResponse.body)}`);
  assert.equal(activeTargetGuardSeen, true, "criação deve bloquear outro job ativo na mesma linha/bloco");
  assert.ok(insertedRollbackPayload, "rollback deve persistir um payload de job");
  const rollbackChanges = (insertedRollbackPayload as { changes: Array<{ expectedValue: string; value: string }> }).changes;
  assert.deepEqual(rollbackChanges.map((item) => [item.expectedValue, item.value]), [["PI 42059 - GOV", "ativo"]]);
} finally {
  (pool as unknown as { query: typeof pool.query }).query = originalQuery;
  (pool as unknown as { connect: typeof pool.connect }).connect = originalConnect;
  await pool.end();
}

console.log("ok: preview read-only, field guards and idempotency fingerprint");
