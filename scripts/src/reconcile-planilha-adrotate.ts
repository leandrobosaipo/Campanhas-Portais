import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { eq, and } from "drizzle-orm";
import { db, campaignsTable, insertionsTable, sitesTable } from "@workspace/db";
import {
  buildCampaignInsertionIdentity,
  normalizeCampaignPiIdentity,
} from "../../artifacts/api-server/src/lib/campaign-operations-matching";

type RawRow = {
  sourceSheet: string;
  competenciaSheet: string;
  competenciaResolved: string;
  siteSigla: string;
  peca: string;
  agenciaValor: string;
  campanha: string;
  periodo: string;
  local: string;
  status: string;
  processoRealizado: string;
  processoEnviado: string;
  extra: string;
  inicio: string | null;
  fim: string | null;
};

type RemoteAd = {
  siteSigla: string;
  groupId: number;
  adId: number;
  title: string;
  image: string | null;
  bannercode: string;
};

const EXPORT_URL =
  process.env.PLANILHA_XLSX_URL ??
  "https://docs.google.com/spreadsheets/d/1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu/export?format=xlsx";
const PROJECT_ROOT = process.env.ADOPS_PROJECT_ROOT ?? process.cwd();
const TMP_DIR = process.env.ADOPS_SHEET_TMP_DIR ?? path.join(os.tmpdir(), "campanhas-portais-sheet-check");
const TMP_FILE = path.join(TMP_DIR, "relacao-campanhas-latest.xlsx");
const REPORT_FILE = process.env.ADOPS_RECONCILE_REPORT_FILE ?? path.join(PROJECT_ROOT, "docs", "reconcile-planilha-adrotate-latest.md");
const SSH_HOST = process.env.ADOPS_MULTISITE_SSH_HOST ?? "66.253.112.200";
const SSH_PORT = process.env.ADOPS_MULTISITE_SSH_PORT ?? "215";
const SSH_USER = process.env.ADOPS_MULTISITE_SSH_USER ?? "facilnam";
const SSH_KEY_PATH = process.env.ADOPS_MULTISITE_SSH_KEY_PATH ?? "";

const SITE_NAMES: Record<string, string> = {
  OMT: "OMT Online",
  ROO: "ROO News",
  PERRENGUE: "Perrengue",
  AFL: "AFL Digital",
  PNMT: "Portal NMT",
  PPMT: "Portal PMT",
};

const SITE_DOMAIN_BY_SIGLA: Record<string, string> = {
  PERRENGUE: "perrenguematogrosso.com",
  OMT: "omatogrossense.com",
  AFL: "afolhalivre.com",
  PNMT: "portalnortemt.com",
  PPMT: "portalpantanalmt.com",
  ROO: "roonoticias.com",
};

type RemoteSiteSource = {
  domain: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  wpPath: string;
  tablePrefix: string;
  keyPath?: string;
};

function getRemoteSiteSource(siteSigla: string): RemoteSiteSource | null {
  if (siteSigla === "PERRENGUE") {
    return {
      domain: SITE_DOMAIN_BY_SIGLA[siteSigla]!,
      sshHost: process.env.ADOPS_PERRENGUE_SSH_HOST ?? "186.209.113.107",
      sshPort: process.env.ADOPS_PERRENGUE_SSH_PORT ?? "1157",
      sshUser: process.env.ADOPS_PERRENGUE_SSH_USER ?? "perrengu",
      wpPath: process.env.ADOPS_PERRENGUE_WP_PATH ?? "/home/perrengu/public_html/wp",
      tablePrefix: process.env.ADOPS_PERRENGUE_TABLE_PREFIX ?? "wp_",
      keyPath: process.env.ADOPS_PERRENGUE_SSH_KEY_PATH ?? "",
    };
  }

  const domain = SITE_DOMAIN_BY_SIGLA[siteSigla];
  if (!domain) return null;
  return {
    domain,
    sshHost: SSH_HOST,
    sshPort: SSH_PORT,
    sshUser: SSH_USER,
    wpPath: `/home/${SSH_USER}/public_html/${domain}/public_html/web/wp`,
    tablePrefix: "wpve_",
    keyPath: SSH_KEY_PATH,
  };
}

const MONTH_INDEX: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
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

const ADROTATE_GROUPS: Record<string, Record<string, number>> = {
  PERRENGUE: {
    "MEGABANNER TOPO": 1,
    "BANNER TOPO LATERAL": 10,
    "TOPO LATERAL": 10,
    "HOME 1": 2,
    "PRIMEIRA DOBRA": 2,
    "HOME 2": 3,
    "SEGUNDA DOBRA": 3,
    "HOME 3": 4,
    "VIDEO": 6,
    "VIDEO LATERAL": 6,
    "LATERAL": 6,
    "LATERAL PRIMEIRA DOBRA": 6,
    "INTERNO DE NOTICIAS": 11,
    "BANNER INTERNO NOTICIAS": 11,
  },
  OMT: {
    "MEGABANNER TOPO": 1,
    "MEGABANNER HOME 1": 2,
    "HOME 1": 2,
    "MEGABANNER HOME 2": 4,
    "HOME 2": 4,
    "MEGABANNER HOME 3": 5,
    "HOME 3": 5,
    "VIDEO": 6,
    "INTERNO DE NOTICIAS": 9,
    "BANNER INTERNO NOTICIAS": 9,
  },
  AFL: {
    "MEGABANNER TOPO": 1,
    "HOME 1": 2,
    "MEGABANNER HOME 1": 2,
    "HOME 2": 3,
    "MEGABANNER HOME 2": 3,
    "VIDEO": 6,
    "INTERNO DE NOTICIAS": 14,
    "BANNER INTERNO NOTICIAS": 14,
  },
  PNMT: {
    "MEGABANNER TOPO": 1,
    "HOME 1": 2,
    "MEGABANNER HOME 1": 2,
    "HOME 2": 3,
    "MEGABANNER HOME 2": 3,
    "HOME 3": 4,
    "MEGABANNER HOME 3": 4,
    "VIDEO": 6,
    "INTERNO DE NOTICIAS": 14,
    "BANNER INTERNO NOTICIAS": 14,
  },
  PPMT: {
    "MEGABANNER TOPO": 1,
    "HOME 1": 2,
    "MEGABANNER HOME 1": 2,
    "HOME 2": 3,
    "MEGABANNER HOME 2": 3,
    "VIDEO": 6,
    "INTERNO DE NOTICIAS": 14,
    "BANNER INTERNO NOTICIAS": 14,
  },
  ROO: {
    "MEGABANNER TOPO": 1,
    "HOME 1": 2,
    "MEGABANNER HOME 1": 2,
    "BANNER 728 X 90": 2,
    "HOME 2": 3,
    "MEGABANNER HOME 2": 3,
    "TOPO LATERAL": 3,
    "VIDEO": 6,
    "INTERNO DE NOTICIAS": 8,
    "BANNER INTERNO NOTICIAS": 8,
  },
};

function normalizeSpaces(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeForMatch(value: string | null | undefined): string {
  return normalizeSpaces(String(value ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeTextKey(value: string | null | undefined): string {
  return normalizeForMatch(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

function normalizeSheetCompetencia(sheetName: string): string | null {
  const normalized = normalizeForMatch(sheetName);
  if (normalized.startsWith("PAGINA")) return null;
  if (normalized === "MARCO26" || normalized === "MARÇO26") return "MARÇO/2026";
  const monthMatch = normalized.match(
    /^(JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*(\d{2,4})?$/,
  );
  if (!monthMatch) return null;
  const month = monthMatch[1] === "MARCO" ? "MARÇO" : monthMatch[1];
  const rawYear = monthMatch[2];
  let year = 2025;
  if (rawYear) {
    const parsed = Number.parseInt(rawYear, 10);
    year = parsed < 100 ? 2000 + parsed : parsed;
  } else if (["JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"].includes(month)) {
    year = 2025;
  } else {
    year = 2026;
  }
  return `${month}/${year}`;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;
    const next = content[i + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      rows.push(row.map((cell) => normalizeSpaces(cell)));
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row.map((cell) => normalizeSpaces(cell)));
  }

  return rows;
}

function isMeaningful(value: string): boolean {
  const normalized = normalizeSpaces(value);
  return normalized !== "" && normalized !== "-" && normalized !== "—";
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
      return { day: Number.parseInt(match[1]!, 10), month: Number.parseInt(match[2]!, 10), year };
    });
  }
  const compactRange = normalized.match(/(\d{1,2})[./](\d{1,2})\s*-\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (compactRange) {
    let endYear = compactRange[5] ? Number.parseInt(compactRange[5], 10) : undefined;
    if (endYear != null && endYear < 100) endYear += 2000;
    return [
      { day: Number.parseInt(compactRange[1]!, 10), month: Number.parseInt(compactRange[2]!, 10) },
      { day: Number.parseInt(compactRange[3]!, 10), month: Number.parseInt(compactRange[4]!, 10), year: endYear },
    ];
  }
  return [...normalized.matchAll(/\b(\d{1,2})[./](\d{1,2})\b/g)].map((match) => ({
    day: Number.parseInt(match[1]!, 10),
    month: Number.parseInt(match[2]!, 10),
  }));
}

function parsePeriodo(periodo: string, competencia: string): { inicio: string | null; fim: string | null } {
  const [competenciaMes, competenciaAno] = competencia.split("/");
  const competenciaMonth = MONTH_INDEX[competenciaMes!] ?? 1;
  const competenciaYear = Number.parseInt(competenciaAno!, 10);
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

function deriveCompetenciaFromPeriodo(competenciaSheet: string, inicio: string | null, fim: string | null): string {
  if (!inicio || !fim) return competenciaSheet;
  const [sheetMonth, sheetYear] = competenciaSheet.split("/");
  const [startYear, startMonth] = inicio.split("-").map(Number);
  const [endYear, endMonth] = fim.split("-").map(Number);
  const targetMonth = Object.entries(MONTH_INDEX).find(([, month]) => month === startMonth)?.[0] ?? sheetMonth!;
  if (startYear === endYear && startMonth === endMonth) {
    const resolved = `${targetMonth}/${startYear}`;
    if (resolved !== competenciaSheet) return resolved;
  }
  return `${sheetMonth}/${sheetYear}`;
}

function normalizeFormato(value: string): string {
  const normalized = normalizeForMatch(value).replace(/\./g, "").replace(/\s+/g, " ");
  const direct: Record<string, string> = {
    "MEGA BANNER TOPO": "MEGABANNER TOPO",
    "MEGABANNER TOPO": "MEGABANNER TOPO",
    "MEGA BANNER HOME 1": "MEGABANNER HOME 1",
    "MEGA BANNER HOME 2": "MEGABANNER HOME 2",
    "MEGA BANNER HOME 3": "MEGABANNER HOME 3",
    "BANNER INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "BANNER INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO DE NOTICIAS": "INTERNO DE NOTICIAS",
    "PRIMEIRA DOBRA": "PRIMEIRA DOBRA",
    "SEGUNDA DOBRA": "SEGUNDA DOBRA",
    "LATERAL": "LATERAL",
    "LATERAL PRIMEIRA DOBRA": "LATERAL PRIMEIRA DOBRA",
    "TOPO LATERAL": "TOPO LATERAL",
    "HOME 1": "HOME 1",
    "HOME 2": "HOME 2",
    "HOME 3": "HOME 3",
    "VIDEO - LATERAL": "VIDEO - LATERAL",
    "INSTAGRAM": "INSTAGRAM",
  };
  return direct[normalized] ?? normalizeSpaces(normalized);
}

function normalizePi(value: string, fallback = ""): string | null {
  const cleaned = normalizeSpaces(value);
  if (cleaned) return cleaned;
  const fallbackCleaned = normalizeSpaces(fallback);
  const match = fallbackCleaned.match(/^(PI|P\\.I\\.|P\\.I:)?\\s*[-:]?\\s*\\d+/i);
  return match ? normalizeSpaces(match[0]) : null;
}

function buildRowsFromSheetCsv(csv: string, sheetName: string, competenciaSheet: string): RawRow[] {
  const lines = parseCsv(csv).filter((row) => row.some((cell) => isMeaningful(cell)));
  const rows: RawRow[] = [];
  let siteRowCells: string[] | null = null;
  let blockStarts: number[] = [];
  let blockSites: string[] = [];

  for (const cells of lines) {
    const headerStarts = cells
      .map((cell, index) => (normalizeForMatch(cell).startsWith("PECA") ? index : -1))
      .filter((index) => index >= 0);
    if (headerStarts.length > 0) {
      blockStarts = headerStarts;
      blockSites = headerStarts.map((start, index) => {
        const nextStart = headerStarts[index + 1] ?? cells.length;
        const search = (siteRowCells ?? []).slice(start, nextStart + 1);
        return search.find((cell) => cell in SITE_NAMES) ?? "";
      });
      continue;
    }
    if (cells.some((cell) => cell in SITE_NAMES)) {
      siteRowCells = cells;
      continue;
    }
    if (blockStarts.length === 0) continue;
    blockStarts.forEach((start, index) => {
      const nextStart = blockStarts[index + 1] ?? cells.length;
      const slice = cells.slice(start, nextStart);
      const [peca = "", agenciaValor = "", campanha = "", periodo = "", local = "", status = "", processoRealizado = "", processoEnviado = "", extra = ""] = slice;
      if (!isMeaningful(campanha) && !isMeaningful(local) && !isMeaningful(periodo)) return;
      const { inicio, fim } = parsePeriodo(periodo, competenciaSheet);
      const competenciaResolved = deriveCompetenciaFromPeriodo(competenciaSheet, inicio, fim);
      rows.push({
        sourceSheet: sheetName,
        competenciaSheet,
        competenciaResolved,
        siteSigla: blockSites[index] ?? "",
        peca,
        agenciaValor,
        campanha,
        periodo,
        local,
        status,
        processoRealizado,
        processoEnviado,
        extra,
        inicio,
        fim,
      });
    });
  }
  return rows.filter((row) => row.siteSigla && (isMeaningful(row.campanha) || isMeaningful(row.local)));
}

async function downloadLatestXlsx() {
  await mkdir(TMP_DIR, { recursive: true });
  const response = await fetch(EXPORT_URL);
  if (!response.ok) throw new Error(`Falha ao baixar planilha: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(TMP_FILE, buffer);
}

async function loadRawRows() {
  await downloadLatestXlsx();
  const workbook = XLSX.read(await readFile(TMP_FILE), { type: "buffer" });
  const rows: RawRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const competenciaSheet = normalizeSheetCompetencia(sheetName);
    const worksheet = workbook.Sheets[sheetName];
    if (!competenciaSheet || !worksheet || !worksheet["!ref"]) continue;
    const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ",", RS: "\n", blankrows: false });
    rows.push(...buildRowsFromSheetCsv(csv, sheetName, competenciaSheet));
  }
  return rows;
}

function localGroupId(siteSigla: string | null | undefined, formato: string | null | undefined) {
  if (!siteSigla || !formato) return null;
  const bySite = ADROTATE_GROUPS[siteSigla];
  if (!bySite) return null;
  return bySite[normalizeFormato(formato)] ?? null;
}

function extractPiNumber(value: string | null | undefined) {
  const match = normalizeForMatch(value).match(/\bPI\s*([0-9]+)/) ?? normalizeForMatch(value).match(/\b([0-9]{4,})\b/);
  return match?.[1] ?? null;
}

function parseRemoteTsv(content: string, siteSigla: string): RemoteAd[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [groupId, adId, title, image, bannercode] = line.split("\t");
      return {
        siteSigla,
        groupId: Number(groupId),
        adId: Number(adId),
        title: title ?? "",
        image: image ? image.trim() : null,
        bannercode: bannercode ? bannercode.trim() : "",
      };
    })
    .filter((row) => Number.isFinite(row.groupId) && Number.isFinite(row.adId));
}

function hasUsableAdrotateAssetCode(ad: RemoteAd): boolean {
  return Boolean(ad.image && !/placehold\.co/i.test(ad.image) && ad.bannercode.includes("%asset%"));
}

function fetchRemoteAds(siteSigla: string): RemoteAd[] {
  const source = getRemoteSiteSource(siteSigla);
  if (!source) return [];
  const sql = `SELECT lm.group AS group_id,a.id AS ad_id,a.title,a.image,REPLACE(REPLACE(a.bannercode, CHAR(10), ' '), CHAR(9), ' ') AS bannercode FROM ${source.tablePrefix}adrotate a JOIN ${source.tablePrefix}adrotate_linkmeta lm ON lm.ad=a.id WHERE lm.group > 0 ORDER BY lm.group,a.id;`;
  const sshArgs = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=no",
  ];
  if (source.keyPath) {
    sshArgs.push("-i", source.keyPath);
  }
  const stdout = execFileSync(
    "ssh",
    [
      ...sshArgs,
      "-p",
      source.sshPort,
      `${source.sshUser}@${source.sshHost}`,
      `php /home/${source.sshUser}/wp-cli.phar --path=${source.wpPath} --allow-root db query "${sql}" --skip-column-names`,
    ],
    { encoding: "utf8" },
  );
  return parseRemoteTsv(stdout, siteSigla);
}

async function ensureSite(sigla: string) {
  const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.sigla, sigla));
  if (existing) return existing.id;
  const [inserted] = await db.insert(sitesTable).values({ sigla, nome: SITE_NAMES[sigla] ?? sigla, ativo: true }).returning();
  return inserted!.id;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const rawRows = await loadRawRows();
  const allSites = await db.select().from(sitesTable);
  const allCampaigns = await db.select().from(campaignsTable);
  const allInsertions = await db.select().from(insertionsTable);
  const siteById = new Map(allSites.map((site) => [site.id, site]));

  const groupedRows = new Map<string, RawRow[]>();
  for (const row of rawRows) {
    const key = [
      row.siteSigla,
      normalizeTextKey(row.campanha),
      normalizeCampaignPiIdentity(normalizePi(row.peca, row.agenciaValor)) ?? "",
      normalizeTextKey(normalizeFormato(row.local)),
      row.competenciaResolved,
    ].join("|");
    const current = groupedRows.get(key) ?? [];
    current.push(row);
    groupedRows.set(key, current);
  }

  const periodUpdates: Array<Record<string, unknown>> = [];
  const periodSkipped: Array<Record<string, unknown>> = [];
  const insertionIdsByIdentity = new Map<string, number[]>();
  for (const insertion of allInsertions) {
    const campaign = allCampaigns.find((item) => item.id === insertion.campanhaId);
    const site = insertion.siteId ? siteById.get(insertion.siteId) : null;
    const identity = buildCampaignInsertionIdentity({
      piCodigo: campaign?.piCodigo,
      siteSigla: site?.sigla,
      localFormato: insertion.localFormatoNormalizado ?? insertion.localFormato,
      periodoInicio: insertion.periodoInicio,
      periodoFim: insertion.periodoFim,
    });
    if (identity) insertionIdsByIdentity.set(identity, [...(insertionIdsByIdentity.get(identity) ?? []), insertion.id]);
  }
  const duplicateIdentities = [...insertionIdsByIdentity]
    .filter(([, insertionIds]) => insertionIds.length > 1)
    .map(([identity, insertionIds]) => ({ identity, insertionIds }));

  for (const campaign of allCampaigns) {
    const campaignInsertions = allInsertions.filter((item) => item.campanhaId === campaign.id);
    if (!campaignInsertions.length) continue;
    const sampleInsertion = campaignInsertions[0]!;
    const site = sampleInsertion.siteId ? siteById.get(sampleInsertion.siteId) : null;
    const piKey = normalizeCampaignPiIdentity(campaign.piCodigo) ?? "";
    const sameCompetenciaKeys = [...groupedRows.keys()].filter((key) => {
      const [siteSigla, campaignNameKey, piCodeKey, , competenciaResolved] = key.split("|");
      return (
        siteSigla === site?.sigla &&
        campaignNameKey === normalizeTextKey(campaign.nome) &&
        piCodeKey === piKey &&
        competenciaResolved === (campaign.competencia ?? null)
      );
    });

    for (const groupKey of sameCompetenciaKeys) {
      const rows = [...(groupedRows.get(groupKey) ?? [])].sort((a, b) => `${a.inicio ?? ""}|${a.fim ?? ""}`.localeCompare(`${b.inicio ?? ""}|${b.fim ?? ""}`));
      const [, , , formatKey, competenciaResolved] = groupKey.split("|");
      const candidates = campaignInsertions
        .filter((item) => {
          const candidateSite = item.siteId ? siteById.get(item.siteId) : null;
          return candidateSite?.sigla === site?.sigla && normalizeTextKey(normalizeFormato(item.localFormatoNormalizado ?? item.localFormato ?? "")) === formatKey;
        })
        .sort((a, b) => `${a.periodoInicio ?? ""}|${a.periodoFim ?? ""}|${a.id}`.localeCompare(`${b.periodoInicio ?? ""}|${b.periodoFim ?? ""}|${b.id}`));

      if (candidates.length !== rows.length) {
        periodSkipped.push({
          campaignId: campaign.id,
          campaignName: campaign.nome,
          siteSigla: site?.sigla ?? null,
          formato: formatKey,
          competenciaResolved,
          reason: `Contagem diferente entre planilha (${rows.length}) e sistema (${candidates.length}).`,
        });
        continue;
      }

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const candidate = candidates[index]!;
        if (candidate.periodoInicio === row.inicio && candidate.periodoFim === row.fim && candidate.periodoOriginal === normalizeSpaces(row.periodo)) {
          continue;
        }
        periodUpdates.push({
          insertionId: candidate.id,
          campaignId: campaign.id,
          campaignName: campaign.nome,
          siteSigla: site?.sigla ?? null,
          fromInicio: candidate.periodoInicio,
          fromFim: candidate.periodoFim,
          toInicio: row.inicio,
          toFim: row.fim,
          periodoOriginal: row.periodo,
        });
        if (!dryRun) {
          await db
            .update(insertionsTable)
            .set({
              periodoInicio: row.inicio,
              periodoFim: row.fim,
              periodoOriginal: normalizeSpaces(row.periodo),
              updatedAt: new Date(),
            })
            .where(eq(insertionsTable.id, candidate.id));
        }
      }
    }
  }

  const remoteAds = Object.keys(SITE_DOMAIN_BY_SIGLA).flatMap(fetchRemoteAds);
  const refreshedCampaigns = await db.select().from(campaignsTable);
  const refreshedInsertions = await db.select().from(insertionsTable);
  const refreshedSites = await db.select().from(sitesTable);
  const refreshedSiteById = new Map(refreshedSites.map((site) => [site.id, site]));
  const campaignById = new Map(refreshedCampaigns.map((campaign) => [campaign.id, campaign]));

  const mediaUpdates: Array<Record<string, unknown>> = [];
  const mediaSkipped: Array<Record<string, unknown>> = [];

  for (const insertion of refreshedInsertions) {
    if (insertion.mediaUrl) continue;
    const site = insertion.siteId ? refreshedSiteById.get(insertion.siteId) : null;
    if (!site?.sigla) continue;
    const campaign = campaignById.get(insertion.campanhaId);
    if (!campaign) continue;
    const groupId = localGroupId(site.sigla, insertion.localFormatoNormalizado ?? insertion.localFormato);
    if (!groupId) continue;
    const piNumber = extractPiNumber(campaign.piCodigo);
    if (!piNumber) {
      mediaSkipped.push({ insertionId: insertion.id, siteSigla: site.sigla, reason: "Sem PI identificável." });
      continue;
    }
    const candidates = remoteAds
      .filter((ad) => ad.siteSigla === site.sigla && ad.groupId === groupId)
      .filter((ad) => normalizeForMatch(ad.title).includes(piNumber))
      .filter(hasUsableAdrotateAssetCode);

    if (candidates.length !== 1) {
      const invalidAssetCodeMatches = remoteAds
        .filter((ad) => ad.siteSigla === site.sigla && ad.groupId === groupId)
        .filter((ad) => normalizeForMatch(ad.title).includes(piNumber))
        .filter((ad) => ad.image && !/placehold\.co/i.test(ad.image) && !ad.bannercode.includes("%asset%"));
      mediaSkipped.push({
        insertionId: insertion.id,
        siteSigla: site.sigla,
        reason: invalidAssetCodeMatches.length > 0
          ? "Anúncio AdRotate com mídia, mas AdCode sem %asset%; corrigir plugin antes de sincronizar mediaUrl."
          : candidates.length === 0 ? "Nenhum anúncio administrativo correspondente." : "Mais de um anúncio administrativo correspondente.",
        invalidAssetCodeMatches: invalidAssetCodeMatches.map((ad) => ({ adId: ad.adId, groupId: ad.groupId, title: ad.title })),
      });
      continue;
    }
    const candidate = candidates[0]!;
    mediaUpdates.push({
      insertionId: insertion.id,
      siteSigla: site.sigla,
      adId: candidate.adId,
      groupId: candidate.groupId,
      mediaUrl: candidate.image,
      title: candidate.title,
    });
    if (!dryRun) {
      await db.update(insertionsTable).set({ mediaUrl: candidate.image, updatedAt: new Date() }).where(eq(insertionsTable.id, insertion.id));
    }
  }

  const manualReview = refreshedInsertions
    .map((insertion) => {
      const site = insertion.siteId ? refreshedSiteById.get(insertion.siteId) : null;
      const campaign = campaignById.get(insertion.campanhaId);
      if (!site?.sigla || !campaign) return null;
      const rawGroup = localGroupId(site.sigla, insertion.localFormatoNormalizado ?? insertion.localFormato);
      const piNumber = extractPiNumber(campaign.piCodigo);
      return {
        insertionId: insertion.id,
        siteSigla: site.sigla,
        campaignName: campaign.nome,
        piCodigo: campaign.piCodigo,
        groupId: rawGroup,
        mediaUrl: insertion.mediaUrl,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .filter((item) => !item.mediaUrl && item.groupId != null);

  const report = {
    ok: true,
    dryRun,
    source: TMP_FILE,
    periodUpdates,
    periodSkipped,
    mediaUpdates,
    mediaSkipped,
    duplicateIdentities,
    manualReview,
  };

  const lines = [
    "# Reconciliação Planilha + AdRotate",
    "",
    `Data: 2026-04-09`,
    "",
    `- Atualizações de período: ${periodUpdates.length}`,
    `- Atualizações de mídia: ${mediaUpdates.length}`,
    `- Pendências manuais: ${manualReview.length}`,
    "",
    "## Períodos atualizados",
    "",
    ...periodUpdates.map((item) => `- inserção ${item.insertionId} | ${item.siteSigla} | ${item.campaignName} | ${item.fromInicio}..${item.fromFim} -> ${item.toInicio}..${item.toFim}`),
    "",
    "## Mídias atualizadas",
    "",
    ...mediaUpdates.map((item) => `- inserção ${item.insertionId} | ${item.siteSigla} | ad ${item.adId} grupo ${item.groupId} | ${item.mediaUrl}`),
    "",
    "## Pendências manuais",
    "",
    ...manualReview.map((item) => `- inserção ${item.insertionId} | ${item.siteSigla} | ${item.campaignName} | PI ${item.piCodigo} | grupo ${item.groupId}`),
    "",
  ];

  await writeFile(REPORT_FILE, `${lines.join("\n")}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
