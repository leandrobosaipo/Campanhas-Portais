import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

export const SHEET_CORRECTION_FIELDS = new Set(["piCodigo", "periodoOriginal", "campaignName", "localFormato"]);

const DEFAULT_SPREADSHEET_ID = "1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu";
const SHEETS_REQUEST_TIMEOUT_MS = 30_000;

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function a1Range(sheetName, cell) {
  if (typeof sheetName !== "string" || !sheetName.trim() || /[\n\r]/.test(sheetName)) throw new Error("sheetName inválido.");
  if (typeof cell !== "string" || !/^[A-Z]+[1-9]\d*$/.test(cell)) throw new Error("Célula de planilha inválida.");
  return `'${sheetName.replace(/'/g, "''")}'!${cell}`;
}
function exactCellForRow(cell, rowNumber) { const match = /^([A-Z]+)([1-9]\d*)$/.exec(cell); return Boolean(match && Number(match[2]) === rowNumber); }

async function serviceAccount(env) {
  const inline = asText(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON).trim();
  if (inline) return JSON.parse(inline);
  const file = asText(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE).trim();
  if (!file) return null;
  return JSON.parse(await readFile(file, "utf8"));
}

async function sheetsAccessToken(env, fetchImpl) {
  const account = await serviceAccount(env);
  if (!account?.client_email || !account?.private_key) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS_MISSING");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(String(account.private_key).replace(/\\n/g, "\n"));
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`GOOGLE_SHEETS_TOKEN_HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error("GOOGLE_SHEETS_TOKEN_MISSING");
  return payload.access_token;
}

export function validateSheetCorrectionPayload(payload) {
  const spreadsheetId = asText(payload?.spreadsheetId).trim(); const blockSite = asText(payload?.blockSite).trim();
  const sheetName = asText(payload?.sheetName).trim();
  const rowNumber = Number(payload?.rowNumber);
  const operation = asText(payload?.operation).trim();
  const requestFingerprint = asText(payload?.requestFingerprint).trim();
  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  const identity = Array.isArray(payload?.identity) ? payload.identity : [];
  if (!spreadsheetId || !blockSite || !sheetName || !Number.isInteger(rowNumber) || rowNumber < 1 || !changes.length || identity.length !== SHEET_CORRECTION_FIELDS.size || !["apply", "rollback"].includes(operation) || !requestFingerprint) throw new Error("sheet-correction payload inválido.");
  const seen = new Set();
  const normalized = changes.map((item) => {
    const field = asText(item?.field).trim();
    const cell = asText(item?.cell).trim();
    const expectedValue = asText(item?.expectedValue);
    const value = asText(item?.value);
    if (!SHEET_CORRECTION_FIELDS.has(field) || seen.has(field) || (operation === "apply" && !value.trim())) throw new Error("Alteração de planilha inválida.");
    seen.add(field);
    const headerCell = asText(item?.headerCell).trim(); const expectedHeader = asText(item?.expectedHeader);
    if (!exactCellForRow(cell, rowNumber) || !/^[A-Z]+[1-9]\d*$/.test(headerCell) || !expectedHeader) throw new Error("Célula não pertence à linha solicitada.");
    return { field, cell, expectedValue, value, headerCell, expectedHeader, range: a1Range(sheetName, cell), headerRange: a1Range(sheetName, headerCell) };
  });
  const normalizedIdentity = identity.map((item) => ({ field: asText(item?.field).trim(), cell: asText(item?.cell).trim(), expectedValue: asText(item?.expectedValue) }));
  if (new Set(normalizedIdentity.map((item) => item.field)).size !== SHEET_CORRECTION_FIELDS.size || new Set(normalizedIdentity.map((item) => item.cell)).size !== SHEET_CORRECTION_FIELDS.size || normalizedIdentity.some((item) => !SHEET_CORRECTION_FIELDS.has(item.field) || !exactCellForRow(item.cell, rowNumber))) throw new Error("Identidade da linha inválida.");
  for (const change of normalized) {
    if (normalizedIdentity.find((item) => item.field === change.field)?.cell !== change.cell) throw new Error("Alteração não corresponde à identidade da linha.");
  }
  return {
    spreadsheetId,
    sheetName,
    blockSite,
    rowNumber,
    operation,
    requestFingerprint,
    rollbackOf: asText(payload?.rollbackOf).trim() || null,
    changes: normalized,
    identity: normalizedIdentity.map((item) => ({ ...item, range: a1Range(sheetName, item.cell) })),
  };
}

function recoveryIntent(correction, persistedIntent) {
  if (!persistedIntent || typeof persistedIntent !== "object") throw new Error("SHEET_CORRECTION_RECOVERY_INTENT_REQUIRED");
  if (asText(persistedIntent.requestFingerprint) !== correction.requestFingerprint) throw new Error("SHEET_CORRECTION_RECOVERY_INTENT_MISMATCH");
  if (asText(persistedIntent.operation) !== correction.operation || asText(persistedIntent.spreadsheetId) !== correction.spreadsheetId || asText(persistedIntent.sheetName) !== correction.sheetName || asText(persistedIntent.blockSite) !== correction.blockSite || Number(persistedIntent.rowNumber) !== correction.rowNumber) throw new Error("SHEET_CORRECTION_RECOVERY_INTENT_MISMATCH");
  const persistedChanges = Array.isArray(persistedIntent.changes) ? persistedIntent.changes : [];
  if (persistedChanges.length !== correction.changes.length) throw new Error("SHEET_CORRECTION_RECOVERY_INTENT_MISMATCH");
  const changes = correction.changes.map((change) => {
    const persisted = persistedChanges.find((item) => item?.field === change.field);
    if (!persisted || persisted.cell !== change.cell || persisted.expectedValue !== change.expectedValue || persisted.value !== change.value || persisted.headerCell !== change.headerCell || persisted.expectedHeader !== change.expectedHeader || typeof persisted.previousValue !== "string") throw new Error("SHEET_CORRECTION_RECOVERY_INTENT_MISMATCH");
    return { ...change, previousValue: persisted.previousValue };
  });
  return { ...correction, changes };
}

async function readCells({ spreadsheetId, ranges, token, fetchImpl }) {
  const query = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
  for (const range of ranges) query.append("ranges", range);
  const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GOOGLE_SHEETS_READ_HTTP_${response.status}`);
  const payload = await response.json();
  const valueRanges = Array.isArray(payload?.valueRanges) ? payload.valueRanges : [];
  return ranges.map((range, index) => asText(valueRanges[index]?.values?.[0]?.[0]));
}

export async function executeSheetCorrection(payload, { env = process.env, fetchImpl = fetch, onIntent, persistedIntent } = {}) {
  const correction = validateSheetCorrectionPayload(payload);
  const spreadsheetId = asText(env.GOOGLE_SHEETS_SPREADSHEET_ID).trim() || DEFAULT_SPREADSHEET_ID;
  if (correction.spreadsheetId !== spreadsheetId) throw new Error("SHEET_CORRECTION_SPREADSHEET_MISMATCH");
  const token = await sheetsAccessToken(env, fetchImpl);
  const current = await readCells({ spreadsheetId, ranges: correction.changes.map((item) => item.range), token, fetchImpl });
  const identity = await readCells({ spreadsheetId, ranges: correction.identity.map((item) => item.range), token, fetchImpl });
  const headers = await readCells({ spreadsheetId, ranges: correction.changes.map((item) => item.headerRange), token, fetchImpl });
  let recoveredWrite = current.every((value, index) => value === correction.changes[index].value);
  for (let index = 0; index < correction.changes.length; index += 1) {
    if (current[index] !== correction.changes[index].expectedValue && current[index] !== correction.changes[index].value) {
      throw new Error(`SHEET_CORRECTION_CONFLICT:${correction.changes[index].field}`);
    }
    if (headers[index] !== correction.changes[index].expectedHeader) throw new Error(`SHEET_CORRECTION_HEADER_CONFLICT:${correction.changes[index].field}`);
  }
  if (!recoveredWrite && current.some((value, index) => value === correction.changes[index].value)) throw new Error("SHEET_CORRECTION_PARTIAL_PREVIOUS_WRITE");
  for (let index = 0; index < correction.identity.length; index += 1) { const changed = correction.changes.find((item) => item.field === correction.identity[index].field); if (identity[index] !== correction.identity[index].expectedValue && identity[index] !== changed?.value) throw new Error(`SHEET_CORRECTION_ROW_IDENTITY_CONFLICT:${correction.identity[index].field}`); }
  const intent = recoveredWrite
    ? recoveryIntent(correction, persistedIntent)
    : { ...correction, changes: correction.changes.map((item, index) => ({ ...item, previousValue: current[index] })) };
  if (!recoveredWrite) {
    if (typeof onIntent !== "function") throw new Error("SHEET_CORRECTION_INTENT_PERSISTENCE_REQUIRED");
    await onIntent(intent);
  }
  if (!recoveredWrite) try { await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    signal: AbortSignal.timeout(SHEETS_REQUEST_TIMEOUT_MS),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: correction.changes.map((item) => ({ range: item.range, values: [[item.value]] })),
    }),
  }).then((response) => { if (!response.ok) throw new Error(`GOOGLE_SHEETS_WRITE_HTTP_${response.status}`); }); } catch (error) { const after = await readCells({ spreadsheetId, ranges: correction.changes.map((item) => item.range), token, fetchImpl }).catch(() => null); if (!after || after.some((value, index) => value !== correction.changes[index].value)) throw error; recoveredWrite = true; }
  const verified = await readCells({ spreadsheetId, ranges: correction.changes.map((item) => item.range), token, fetchImpl });
  for (let index = 0; index < correction.changes.length; index += 1) {
    if (verified[index] !== correction.changes[index].value) throw new Error(`SHEET_CORRECTION_READBACK_FAILED:${correction.changes[index].field}`);
  }
  return {
    ok: true,
    spreadsheetId: correction.spreadsheetId, sheetName: correction.sheetName, blockSite: correction.blockSite, recoveredWrite,
    rowNumber: correction.rowNumber,
    changes: correction.changes.map((item, index) => ({ field: item.field, cell: item.cell, previousValue: intent.changes[index].previousValue, value: verified[index] })),
  };
}
