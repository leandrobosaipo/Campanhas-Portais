import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

export const SHEET_CORRECTION_FIELDS = new Set(["piCodigo", "periodoOriginal", "campaignName", "localFormato"]);

const DEFAULT_SPREADSHEET_ID = "1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu";

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
  const sheetName = asText(payload?.sheetName).trim();
  const rowNumber = Number(payload?.rowNumber);
  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  if (!sheetName || !Number.isInteger(rowNumber) || rowNumber < 1 || !changes.length) throw new Error("sheet-correction payload inválido.");
  const seen = new Set();
  const normalized = changes.map((item) => {
    const field = asText(item?.field).trim();
    const cell = asText(item?.cell).trim();
    const expectedValue = asText(item?.expectedValue);
    const value = asText(item?.value);
    if (!SHEET_CORRECTION_FIELDS.has(field) || seen.has(field) || !value.trim()) throw new Error("Alteração de planilha inválida.");
    seen.add(field);
    if (!cell.endsWith(String(rowNumber))) throw new Error("Célula não pertence à linha solicitada.");
    return { field, cell, expectedValue, value, range: a1Range(sheetName, cell) };
  });
  return { sheetName, rowNumber, changes: normalized };
}

async function readCells({ spreadsheetId, ranges, token, fetchImpl }) {
  const query = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
  for (const range of ranges) query.append("ranges", range);
  const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`GOOGLE_SHEETS_READ_HTTP_${response.status}`);
  const payload = await response.json();
  const valueRanges = Array.isArray(payload?.valueRanges) ? payload.valueRanges : [];
  return ranges.map((range, index) => asText(valueRanges[index]?.values?.[0]?.[0]));
}

export async function executeSheetCorrection(payload, { env = process.env, fetchImpl = fetch } = {}) {
  const correction = validateSheetCorrectionPayload(payload);
  const spreadsheetId = asText(env.GOOGLE_SHEETS_SPREADSHEET_ID).trim() || DEFAULT_SPREADSHEET_ID;
  const token = await sheetsAccessToken(env, fetchImpl);
  const current = await readCells({ spreadsheetId, ranges: correction.changes.map((item) => item.range), token, fetchImpl });
  for (let index = 0; index < correction.changes.length; index += 1) {
    if (current[index] !== correction.changes[index].expectedValue) {
      throw new Error(`SHEET_CORRECTION_CONFLICT:${correction.changes[index].field}`);
    }
  }
  const response = await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: correction.changes.map((item) => ({ range: item.range, values: [[item.value]] })),
    }),
  });
  if (!response.ok) throw new Error(`GOOGLE_SHEETS_WRITE_HTTP_${response.status}`);
  const verified = await readCells({ spreadsheetId, ranges: correction.changes.map((item) => item.range), token, fetchImpl });
  for (let index = 0; index < correction.changes.length; index += 1) {
    if (verified[index] !== correction.changes[index].value) throw new Error(`SHEET_CORRECTION_READBACK_FAILED:${correction.changes[index].field}`);
  }
  return {
    ok: true,
    sheetName: correction.sheetName,
    rowNumber: correction.rowNumber,
    changes: correction.changes.map((item, index) => ({ field: item.field, cell: item.cell, previousValue: current[index], value: verified[index] })),
  };
}
