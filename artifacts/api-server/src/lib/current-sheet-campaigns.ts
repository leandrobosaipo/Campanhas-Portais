import * as XLSX from "xlsx";

export const CAMPAIGN_SHEET_VERSION = "current-sheet-campaigns-v1" as const;

const DEFAULT_EXPORT_URL =
  "https://docs.google.com/spreadsheets/d/1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu/export?format=xlsx";

const SITE_NAMES: Record<string, string> = {
  OMT: "OMT",
  ROO: "ROO",
  PERRENGUE: "PERRENGUE",
  AFL: "AFL",
  PNMT: "PNMT",
  PPMT: "PPMT",
  PMMT: "PPMT",
};

const MONTH_LABELS = [
  "",
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
] as const;

const MONTH_INDEX: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARÇO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

export type CurrentSheetCampaignRow = {
  version: typeof CAMPAIGN_SHEET_VERSION;
  sheetName: string;
  blockSite: string;
  rowNumber: number;
  piCodigo: string;
  agenciaValor: string;
  campaignName: string;
  periodoOriginal: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  localFormato: string;
  localFormatoNormalizado: string;
  status: string;
  processoRealizado: string;
  processoEnviado: string;
  dataEnvioAgencia: string;
};

export type CurrentSheetCampaignResult = {
  version: typeof CAMPAIGN_SHEET_VERSION;
  date: string;
  sheetName: string;
  rows: CurrentSheetCampaignRow[];
  upcomingRows: CurrentSheetCampaignRow[];
  source: {
    exportUrl: string;
    downloadedAt: string;
  };
};

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function normalizeForMatch(value: string | null | undefined) {
  return normalizeSpaces(String(value ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return normalizeSpaces(String(value));
}

function isMeaningful(value: string) {
  const normalized = normalizeSpaces(value);
  return normalized !== "" && normalized !== "-" && normalized !== "—";
}

function canonicalSite(value: unknown) {
  const normalized = normalizeForMatch(String(value ?? ""));
  return SITE_NAMES[normalized] ?? null;
}

function isPieceHeader(value: string) {
  return normalizeForMatch(value).startsWith("PECA");
}

function currentSheetNameForDate(dateKey: string) {
  const parsed = parseDateOnly(dateKey);
  if (!parsed) throw new Error(`Data inválida: ${dateKey}`);
  return `${MONTH_LABELS[parsed.month]} ${parsed.year}`;
}

function parseDateOnly(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, key: dateKey };
}

export function todayInCuiaba() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function extractDateParts(value: string): Array<{ day: number; month: number; year?: number }> {
  const normalized = normalizeSpaces(value);
  const isoMatches = [...normalized.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)];
  if (isoMatches.length > 0) {
    return isoMatches.map((match) => ({
      year: Number.parseInt(match[1]!, 10),
      month: Number.parseInt(match[2]!, 10),
      day: Number.parseInt(match[3]!, 10),
    }));
  }

  const fullMatches = [...normalized.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g)];
  if (fullMatches.length > 0) {
    return fullMatches.map((match) => {
      let year = Number.parseInt(match[3]!, 10);
      if (year < 100) year += 2000;
      return {
        day: Number.parseInt(match[1]!, 10),
        month: Number.parseInt(match[2]!, 10),
        year,
      };
    });
  }

  const compactRange = normalized.match(/(\d{1,2})[./](\d{1,2})\s*-\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (compactRange) {
    let endYear = compactRange[5] ? Number.parseInt(compactRange[5], 10) : undefined;
    if (endYear != null && endYear < 100) endYear += 2000;
    return [
      {
        day: Number.parseInt(compactRange[1]!, 10),
        month: Number.parseInt(compactRange[2]!, 10),
      },
      {
        day: Number.parseInt(compactRange[3]!, 10),
        month: Number.parseInt(compactRange[4]!, 10),
        year: endYear,
      },
    ];
  }

  return [...normalized.matchAll(/\b(\d{1,2})[./](\d{1,2})\b/g)].map((match) => ({
    day: Number.parseInt(match[1]!, 10),
    month: Number.parseInt(match[2]!, 10),
  }));
}

function parsePeriodo(periodo: string, sheetName: string): { inicio: string | null; fim: string | null } {
  const sheetMatch = normalizeForMatch(sheetName).match(
    /^(JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+(20\d{2})$/,
  );
  if (!sheetMatch) return { inicio: null, fim: null };
  const competenciaMonth = MONTH_INDEX[sheetMatch[1]!] ?? 1;
  const competenciaYear = Number.parseInt(sheetMatch[2]!, 10);
  const parts = extractDateParts(periodo);
  if (parts.length === 0) return { inicio: null, fim: null };

  const start = parts[0]!;
  const end = parts[1] ?? parts[0]!;
  let startYear = start.year ?? competenciaYear;
  if (!start.year && competenciaMonth === 1 && start.month === 12) startYear = competenciaYear - 1;
  let endYear = end.year ?? startYear;
  if (!end.year && end.month < start.month) endYear = startYear + 1;

  return {
    inicio: `${String(startYear).padStart(4, "0")}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`,
    fim: `${String(endYear).padStart(4, "0")}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`,
  };
}

export function normalizeFormato(value: string | null | undefined) {
  const normalized = normalizeForMatch(value).replace(/\./g, "").replace(/\s+/g, " ");
  const direct: Record<string, string> = {
    "MEGA BANNER TOPO": "MEGABANNER TOPO",
    "MEGABANNER TOPO": "MEGABANNER TOPO",
    "MEGA BANNER HOME 1": "MEGABANNER HOME 1",
    "MEGABANNER HOME 1": "MEGABANNER HOME 1",
    "MEGA BANNER HOME 2": "MEGABANNER HOME 2",
    "MEGABANNER HOME 2": "MEGABANNER HOME 2",
    "MEGA BANNER HOME 3": "MEGABANNER HOME 3",
    "MEGABANNER HOME 3": "MEGABANNER HOME 3",
    "BANNER INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "BANNER INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO DE NOTICIAS": "INTERNO DE NOTICIAS",
    "PRIMEIRA DOBRA": "PRIMEIRA DOBRA",
    "SEGUNDA DOBRA": "SEGUNDA DOBRA",
    LATERAL: "LATERAL",
    "LATERAL PRIMEIRA DOBRA": "LATERAL PRIMEIRA DOBRA",
    "TOPO LATERAL": "TOPO LATERAL",
    TOPO: "TOPO",
    "HOME 1": "HOME 1",
    "HOME 2": "HOME 2",
    "HOME 3": "HOME 3",
    VIDEO: "VIDEO",
    "VIDEO - LATERAL": "VIDEO - LATERAL",
    INSTAGRAM: "INSTAGRAM",
  };
  return direct[normalized] ?? normalizeSpaces(normalized);
}

function isSocialOnlyFormato(value: string) {
  return /\b(INSTAGRAM|STORIES?|REELS?|SOCIAL|BONIFICACAO|BONIFICACAO SOCIAL)\b/.test(normalizeForMatch(value));
}

function findHeaderOffset(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.some((candidate) => normalizeForMatch(header).includes(candidate)));
}

function readBlockSite(siteRow: string[] | null, start: number, nextStart: number) {
  if (!siteRow) return null;
  const from = Math.max(0, start - 2);
  const to = Math.min(siteRow.length, nextStart + 3);
  for (let index = from; index < to; index += 1) {
    const site = canonicalSite(siteRow[index]);
    if (site) return site;
  }
  return null;
}

function rowHasSite(cells: string[]) {
  return cells.some((cell) => canonicalSite(cell));
}

function rowHeaderStarts(cells: string[]) {
  return cells.map((cell, index) => (isPieceHeader(cell) ? index : -1)).filter((index) => index >= 0);
}

function rowToStrings(row: unknown[]) {
  return row.map((cell) => normalizeCell(cell));
}

export async function loadCurrentSheetCampaigns(options: {
  date?: string;
  exportUrl?: string;
  siteSigla?: string | null;
  includeUpcoming?: boolean;
  upcomingDays?: number;
} = {}): Promise<CurrentSheetCampaignResult> {
  const targetDate = options.date ?? todayInCuiaba();
  const expectedSheet = currentSheetNameForDate(targetDate);
  const upcomingDays = Math.max(0, Math.min(options.upcomingDays ?? 45, 370));
  const upcomingLimit = addDays(targetDate, upcomingDays);
  const exportUrl = options.exportUrl ?? process.env.PLANILHA_XLSX_URL ?? DEFAULT_EXPORT_URL;
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error(`Falha ao baixar planilha: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => normalizeForMatch(name) === normalizeForMatch(expectedSheet));
  if (!sheetName) throw new Error(`Aba corrente não encontrada: ${expectedSheet}`);
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Aba corrente vazia: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, blankrows: false, raw: false }).map(rowToStrings);

  const parsedRows: CurrentSheetCampaignRow[] = [];
  const upcomingRows: CurrentSheetCampaignRow[] = [];
  let siteRowCells: string[] | null = null;
  let blockStarts: number[] = [];
  let blockSites: Array<string | null> = [];
  let blockHeaders: string[][] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex] ?? [];
    const headerStarts = rowHeaderStarts(cells);
    if (headerStarts.length > 0) {
      blockStarts = headerStarts;
      blockSites = headerStarts.map((start, index) => readBlockSite(siteRowCells, start, headerStarts[index + 1] ?? cells.length));
      blockHeaders = headerStarts.map((start, index) => cells.slice(start, headerStarts[index + 1] ?? cells.length));
      continue;
    }
    if (rowHasSite(cells)) {
      siteRowCells = cells;
      continue;
    }
    if (!blockStarts.length) continue;

    blockStarts.forEach((start, index) => {
      const site = blockSites[index];
      if (!site) return;
      if (options.siteSigla && normalizeForMatch(options.siteSigla) !== site) return;
      const nextStart = blockStarts[index + 1] ?? cells.length;
      const slice = cells.slice(start, nextStart);
      const headers = blockHeaders[index] ?? [];
      const offPiece = findHeaderOffset(headers, ["PECA"]);
      const offAgency = findHeaderOffset(headers, ["AGENCIA"]);
      const offCampaign = findHeaderOffset(headers, ["CAMPANHA"]);
      const offPeriod = findHeaderOffset(headers, ["PERIODO"]);
      const offLocal = findHeaderOffset(headers, ["LOCAL"]);
      const offStatus = findHeaderOffset(headers, ["STATUS"]);
      const offProcessoRealizado = findHeaderOffset(headers, ["PROCESSO REALIZADO"]);
      const offProcessoEnviado = findHeaderOffset(headers, ["PROCESSO ENVIADO", "DOCS ENVIADOS"]);
      const offDataEnvio = findHeaderOffset(headers, ["DATA DE ENVIO"]);

      if (offCampaign < 0 || offPeriod < 0 || offLocal < 0) return;
      const piCodigo = offPiece >= 0 ? normalizeSpaces(slice[offPiece] ?? "") : "";
      const agenciaValor = offAgency >= 0 ? normalizeSpaces(slice[offAgency] ?? "") : "";
      const campaignName = normalizeSpaces(slice[offCampaign] ?? "");
      const periodoOriginal = normalizeSpaces(slice[offPeriod] ?? "");
      const localFormato = normalizeSpaces(slice[offLocal] ?? "");
      const status = offStatus >= 0 ? normalizeSpaces(slice[offStatus] ?? "") : "";
      const processoRealizado = offProcessoRealizado >= 0 ? normalizeSpaces(slice[offProcessoRealizado] ?? "") : "";
      const processoEnviado = offProcessoEnviado >= 0 ? normalizeSpaces(slice[offProcessoEnviado] ?? "") : "";
      const dataEnvioAgencia = offDataEnvio >= 0 ? normalizeSpaces(slice[offDataEnvio] ?? "") : "";
      if (!isMeaningful(campaignName) && !isMeaningful(localFormato) && !isMeaningful(periodoOriginal)) return;
      if (isSocialOnlyFormato(localFormato)) return;

      const parsedPeriod = parsePeriodo(periodoOriginal, sheetName);
      if (!parsedPeriod.inicio || !parsedPeriod.fim) return;

      const parsedRow: CurrentSheetCampaignRow = {
        version: CAMPAIGN_SHEET_VERSION,
        sheetName,
        blockSite: site,
        rowNumber: rowIndex + 1,
        piCodigo,
        agenciaValor,
        campaignName,
        periodoOriginal,
        periodoInicio: parsedPeriod.inicio,
        periodoFim: parsedPeriod.fim,
        localFormato,
        localFormatoNormalizado: normalizeFormato(localFormato),
        status,
        processoRealizado,
        processoEnviado,
        dataEnvioAgencia,
      };

      if (parsedPeriod.inicio <= targetDate && parsedPeriod.fim >= targetDate) {
        parsedRows.push(parsedRow);
      } else if (options.includeUpcoming && parsedPeriod.inicio > targetDate && parsedPeriod.inicio <= upcomingLimit) {
        upcomingRows.push(parsedRow);
      }
    });
  }

  return {
    version: CAMPAIGN_SHEET_VERSION,
    date: targetDate,
    sheetName,
    rows: parsedRows,
    upcomingRows,
    source: {
      exportUrl,
      downloadedAt: new Date().toISOString(),
    },
  };
}

function addDays(dateKey: string, days: number) {
  const parsed = parseDateOnly(dateKey);
  if (!parsed) throw new Error(`Data inválida: ${dateKey}`);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days, 12));
  return date.toISOString().slice(0, 10);
}

export function extractPiDigits(value: string | null | undefined) {
  const normalized = normalizeForMatch(value);
  const piMatch = normalized.match(/\bPI\s*0*([0-9]+)\b/);
  if (piMatch) return piMatch[1] ?? null;
  const anyMatch = normalized.match(/\b0*([0-9]{3,})\b/);
  return anyMatch?.[1] ?? null;
}
