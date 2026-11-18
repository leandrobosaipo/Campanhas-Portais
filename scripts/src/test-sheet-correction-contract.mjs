import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  executeSheetCorrection,
  validateSheetCorrectionPayload,
} from "../../ops/cloudflare-remote-runner/src/sheet-correction.mjs";

const spreadsheetId = "1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu";
const sheetName = "SETEMBRO 2026";
const requestFingerprint = "fingerprint-sheet-correction-42059";
const payload = {
  spreadsheetId,
  sheetName,
  blockSite: "OMT",
  rowNumber: 42,
  operation: "apply",
  requestFingerprint,
  identity: [
    { field: "piCodigo", cell: "B42", expectedValue: "ativo" },
    { field: "campaignName", cell: "C42", expectedValue: "DENGUE" },
    { field: "periodoOriginal", cell: "D42", expectedValue: "01/09-15/09" },
    { field: "localFormato", cell: "E42", expectedValue: "MEGABANNER TOPO" },
  ],
  changes: [
    {
      field: "piCodigo",
      cell: "B42",
      headerCell: "B3",
      expectedHeader: "PEÇA",
      expectedValue: "ativo",
      value: "PI 42059 - GOV",
    },
  ],
};

const valid = validateSheetCorrectionPayload(payload);
assert.equal(valid.changes[0].range, "'SETEMBRO 2026'!B42");
assert.equal(valid.requestFingerprint, requestFingerprint);

assert.throws(
  () => validateSheetCorrectionPayload({ ...payload, changes: [{ ...payload.changes[0], cell: "B41" }] }),
  /não pertence/,
);

await assert.rejects(() => executeSheetCorrection(payload, { env: {} }), /GOOGLE_SHEETS_CREDENTIALS_MISSING/);

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  GOOGLE_SHEETS_SPREADSHEET_ID: spreadsheetId,
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "sheet-test@example.invalid",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }),
};

function fakeSheets(initial, options = {}) {
  const cells = new Map(Object.entries(initial));
  const calls = [];
  let writes = 0;
  const fetchImpl = async (url, init = {}) => {
    const value = String(url);
    if (value === "https://oauth2.googleapis.com/token") {
      return { ok: true, status: 200, json: async () => ({ access_token: "test-token" }) };
    }
    if (value.includes("/values:batchGet?")) {
      const ranges = new URL(value).searchParams.getAll("ranges");
      calls.push({ kind: "read", ranges });
      return {
        ok: true,
        status: 200,
        json: async () => ({ valueRanges: ranges.map((range) => ({ values: [[cells.get(range) ?? ""]] })) }),
      };
    }
    if (value.includes("/values:batchUpdate")) {
      writes += 1;
      const body = JSON.parse(String(init.body));
      calls.push({ kind: "write", body });
      for (const item of body.data) cells.set(item.range, item.values[0][0]);
      if (options.loseWriteResponse) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ updatedCells: body.data.length }) };
    }
    throw new Error(`unexpected fetch: ${value}`);
  };
  return { cells, calls, fetchImpl, get writes() { return writes; } };
}

function initialCells(piValue = "ativo") {
  return {
    [`'${sheetName}'!B42`]: piValue,
    [`'${sheetName}'!C42`]: "DENGUE",
    [`'${sheetName}'!D42`]: "01/09-15/09",
    [`'${sheetName}'!E42`]: "MEGABANNER TOPO",
    [`'${sheetName}'!B3`]: "PEÇA",
  };
}

{
  const sheets = fakeSheets(initialCells());
  await assert.rejects(
    () => executeSheetCorrection(payload, { env, fetchImpl: sheets.fetchImpl }),
    /SHEET_CORRECTION_INTENT_PERSISTENCE_REQUIRED/,
  );
  assert.equal(sheets.writes, 0, "não deve escrever sem callback durável");
}

{
  const sheets = fakeSheets(initialCells());
  await assert.rejects(
    () => executeSheetCorrection(payload, {
      env,
      fetchImpl: sheets.fetchImpl,
      onIntent: async () => { throw new Error("progress unavailable"); },
    }),
    /progress unavailable/,
  );
  assert.equal(sheets.writes, 0, "falha ao persistir intenção deve abortar antes da escrita");
}

let durableIntent;
{
  const sheets = fakeSheets(initialCells(), { loseWriteResponse: true });
  const result = await executeSheetCorrection(payload, {
    env,
    fetchImpl: sheets.fetchImpl,
    onIntent: async (intent) => { durableIntent = intent; sheets.calls.push({ kind: "intent" }); },
  });
  assert.equal(sheets.writes, 1);
  assert.equal(result.recoveredWrite, true);
  assert.equal(result.changes[0].previousValue, "ativo");
  const write = sheets.calls.find((call) => call.kind === "write");
  assert.ok(sheets.calls.findIndex((call) => call.kind === "intent") < sheets.calls.findIndex((call) => call.kind === "write"));
  assert.equal(write.body.valueInputOption, "RAW");
  assert.equal(write.body.data[0].values[0][0], "PI 42059 - GOV");
  assert.equal(durableIntent.requestFingerprint, requestFingerprint);
  assert.equal(durableIntent.changes[0].previousValue, "ativo");
}

{
  const sheets = fakeSheets(initialCells("PI 42059 - GOV"));
  await assert.rejects(
    () => executeSheetCorrection(payload, {
      env,
      fetchImpl: sheets.fetchImpl,
      onIntent: async () => assert.fail("não deve substituir intenção no retry"),
    }),
    /SHEET_CORRECTION_RECOVERY_INTENT_REQUIRED/,
  );
  assert.equal(sheets.writes, 0);
}

{
  const rollbackPayload = {
    ...payload,
    operation: "rollback",
    requestFingerprint: "fingerprint-rollback-42059",
    rollbackOf: "original-job-id",
    identity: payload.identity.map((item) => item.field === "piCodigo" ? { ...item, expectedValue: "PI 42059 - GOV" } : item),
    changes: payload.changes.map((item) => ({ ...item, expectedValue: "PI 42059 - GOV", value: "ativo" })),
  };
  const sheets = fakeSheets(initialCells("PI 42059 - GOV"));
  const result = await executeSheetCorrection(rollbackPayload, {
    env,
    fetchImpl: sheets.fetchImpl,
    onIntent: async () => undefined,
  });
  assert.equal(result.changes[0].value, "ativo", "rollback deve restaurar literalmente valor anterior inválido");
  assert.equal(sheets.writes, 1);
}

{
  const sheets = fakeSheets(initialCells("PI 42059 - GOV"));
  const result = await executeSheetCorrection(payload, {
    env,
    fetchImpl: sheets.fetchImpl,
    persistedIntent: durableIntent,
    onIntent: async () => assert.fail("intenção existente não deve ser regravada"),
  });
  assert.equal(sheets.writes, 0, "retry reconciliado não deve repetir batchUpdate");
  assert.equal(result.recoveredWrite, true);
  assert.equal(result.changes[0].previousValue, "ativo", "rollback deve preservar o valor anterior original");
}

{
  const sheets = fakeSheets(initialCells("PI 42059 - GOV"));
  await assert.rejects(
    () => executeSheetCorrection(payload, {
      env,
      fetchImpl: sheets.fetchImpl,
      persistedIntent: { ...durableIntent, requestFingerprint: "different-job" },
    }),
    /SHEET_CORRECTION_RECOVERY_INTENT_MISMATCH/,
  );
  assert.equal(sheets.writes, 0);
}

const runnerSource = readFileSync(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
assert.match(runnerSource, /import\s+\{\s*executeSheetCorrection\s*\}\s+from\s+["']\.\/sheet-correction\.mjs["']/);
assert.match(runnerSource, /persistedIntent:\s*job\?\.result\?\.sheetCorrection/);

console.log("ok: durable intent, RAW write, lost-response reconciliation and rollback history");
