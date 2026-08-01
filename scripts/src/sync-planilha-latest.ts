import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  sitesTable,
  clientsTable,
  agenciesTable,
  campaignsTable,
  insertionsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { inferClientProfileFromPiReference, type InferredClientProfile } from "./lib/pi-client-cnpj";

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

const EXPORT_URL =
  process.env.PLANILHA_XLSX_URL ??
  "https://docs.google.com/spreadsheets/d/1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu/export?format=xlsx";

const TMP_DIR = process.env.ADOPS_SHEET_TMP_DIR ?? path.join(os.tmpdir(), "campanhas-portais-sheet-check");
const TMP_FILE = path.join(TMP_DIR, "relacao-campanhas-latest.xlsx");

const SITE_NAMES: Record<string, string> = {
  OMT: "OMT Online",
  ROO: "ROO News",
  PERRENGUE: "Perrengue",
  AFL: "AFL Digital",
  PNMT: "Portal NMT",
  PPMT: "Portal PMT",
};

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

const AGENCY_ALIASES: Array<[RegExp, string]> = [
  [/\bRENCA(?: COMUNICACAO LTDA)?\b/, "Renca"],
  [/\bDMD\b/, "DMD"],
  [/\bSOUL\b/, "Soul"],
  [/\bGENIUS\b/, "Genius"],
  [/\bZF(?: COMUNICACAO)?\b/, "ZF"],
  [/\bIMAGINE\b/, "Imagine"],
  [/\bGANZA\b/, "Ganza"],
  [/\bART&C\b/, "ART&C"],
  [/\bZ3\b/, "Z3"],
];

function normalizeSpaces(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return normalizeSpaces(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function titleCase(value: string): string {
  const normalized = normalizeSpaces(value.toLowerCase());
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMeaningful(value: string): boolean {
  const normalized = normalizeSpaces(value);
  return normalized !== "" && normalized !== "-" && normalized !== "—";
}

function isTruthy(value: string): boolean {
  return ["SIM", "S", "OK", "TRUE", "FINALIZADO", "FINALIZADA", "CONCLUIDO", "CONCLUIDA", "V"].includes(
    normalizeForMatch(value),
  );
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

function deriveCompetenciaFromPeriodo(
  competenciaSheet: string,
  inicio: string | null,
  fim: string | null,
): string {
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
    "INTERNO DE NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO DE MATERIAS": "INTERNO DE MATERIAS",
    "PRIMEIRA DOBRA": "PRIMEIRA DOBRA",
    "SEGUNDA DOBRA": "SEGUNDA DOBRA",
    "LATERAL": "LATERAL",
    "LATERAL PRIMEIRA DOBRA": "LATERAL PRIMEIRA DOBRA",
    "TOPO LATERAL": "TOPO LATERAL",
    TOPO: "MEGABANNER TOPO",
    "HOME 1": "HOME 1",
    "HOME 2": "HOME 2",
    "HOME 3": "HOME 3",
    "VIDEO - LATERAL": "VIDEO - LATERAL",
    "INSTAGRAM": "INSTAGRAM",
  };
  return direct[normalized] ?? titleCase(normalized);
}

function isSocialOnlyFormato(value: string): boolean {
  return /\b(INSTAGRAM|STORIES?|REELS?|SOCIAL|BONIFICACAO|BONIFICACAO SOCIAL)\b/.test(normalizeForMatch(value));
}

function findAgencyName(value: string): string | null {
  const normalized = normalizeForMatch(value);
  for (const [pattern, label] of AGENCY_ALIASES) {
    if (pattern.test(normalized)) return label;
  }
  return null;
}

function parseBrazilianNumber(value: string): string {
  const cleaned = normalizeSpaces(value).replace(/[R$\s]/g, "");
  let normalized = cleaned;
  if (cleaned.includes(".") && cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else if (/,\d{2}$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function splitAgencyValue(value: string): { agencyName: string; valorLiquido: string | null } {
  const cleaned = normalizeSpaces(value);
  if (!cleaned) return { agencyName: "Não informado", valorLiquido: null };
  const explicitAgency = findAgencyName(cleaned);
  const numericChunks = [...cleaned.matchAll(/\d[\d.,]*/g)].map((match) => match[0]);
  const lastNumericChunk = numericChunks.at(-1) ?? null;
  const amountLooksReliable =
    lastNumericChunk != null &&
    (/[A-Za-z].*[+\-]/.test(cleaned) || cleaned.includes("R$") || /[.,]\d{2}$/.test(cleaned) || /\d[.,]\d{3}/.test(cleaned));
  const agencyRaw =
    lastNumericChunk && amountLooksReliable
      ? cleaned.slice(0, cleaned.lastIndexOf(lastNumericChunk)).replace(/[+\-]\s*$/, "")
      : cleaned;
  const agencyName = explicitAgency ?? titleCase(agencyRaw.trim() || "Não informado");
  const valorLiquido = amountLooksReliable && lastNumericChunk ? parseBrazilianNumber(lastNumericChunk) : null;
  return { agencyName, valorLiquido };
}

function normalizePi(value: string, fallback = ""): string | null {
  const cleaned = normalizeSpaces(value);
  if (cleaned) return cleaned;
  const fallbackCleaned = normalizeSpaces(fallback);
  const match = fallbackCleaned.match(/^(PI|P\\.I\\.|P\\.I:)?\\s*[-:]?\\s*\\d+/i);
  return match ? normalizeSpaces(match[0]) : null;
}

function inferClientName(piece: string, campaign: string): string {
  const combined = normalizeForMatch(`${piece} ${campaign}`);
  const rules: Array<[RegExp, string]> = [
    [/\bPREF CBA\b|\bPREFEITURA DE CUIABA\b|\bCUIABA\b/, "Prefeitura de Cuiabá"],
    [/\bPREF VG\b|\bVARZEA GRANDE\b/, "Prefeitura de Várzea Grande"],
    [/\bPREF PVA\b|\bPVA\b/, "Prefeitura PVA"],
    [/\bSECOM\b|\bGOV\b/, "Governo do Estado"],
    [/\bENERGISA\b/, "Energisa"],
  ];
  for (const [pattern, label] of rules) {
    if (pattern.test(combined)) return label;
  }
  return isMeaningful(campaign) ? titleCase(campaign) : "Não informado";
}

function normalizeStatus(
  value: string,
  flags: { bannerPublicadoNoSite: boolean; printGerado: boolean; processoEnviadoAgencia: boolean; docsEnviados: boolean },
): string {
  if (flags.docsEnviados) return "concluido";
  if (flags.processoEnviadoAgencia) return "enviado_para_agencia";
  if (flags.printGerado) return "print_gerado";
  if (flags.bannerPublicadoNoSite) return "publicado_no_site";
  const normalized = normalizeForMatch(value);
  if (normalized.includes("ATIVA") || normalized.includes("AGENDADO")) return "aguardando_publicacao";
  if (normalized.includes("FINALIZ") || normalized === "V") return "concluido";
  return "rascunho";
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

function computeAtrasado(ins: { periodoFim?: string | null; processoEnviadoAgencia: boolean; statusNormalizado: string }): boolean {
  if (ins.processoEnviadoAgencia) return false;
  if (["concluido", "cancelado"].includes(ins.statusNormalizado)) return false;
  if (!ins.periodoFim) return false;
  const due = new Date(`${ins.periodoFim}T23:59:59`);
  due.setDate(due.getDate() + 1);
  return due < new Date();
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

async function ensureSite(sigla: string) {
  const [existing] = await db.select().from(sitesTable).where(eq(sitesTable.sigla, sigla));
  if (existing) return existing.id;
  const [inserted] = await db.insert(sitesTable).values({ sigla, nome: SITE_NAMES[sigla] ?? sigla, ativo: true }).returning();
  return inserted!.id;
}

async function ensureByName(
  table: typeof clientsTable | typeof agenciesTable,
  nome: string,
  options?: { profile?: InferredClientProfile | null },
) {
  const [existing] = await db.select().from(table).where(eq(table.nome, nome));
  if (existing) {
    if (table === clientsTable && options?.profile) {
      const current = existing as typeof clientsTable.$inferSelect;
      const updateData: Record<string, unknown> = {};
      if (options.profile.razaoSocial && !current.razaoSocial) updateData.razaoSocial = options.profile.razaoSocial;
      if (options.profile.cnpj && !current.cnpj) updateData.cnpj = options.profile.cnpj;
      if (options.profile.telefone && !current.telefone) updateData.telefone = options.profile.telefone;
      if (options.profile.email && !current.email) updateData.email = options.profile.email;
      if (options.profile.endereco && !current.endereco) updateData.endereco = options.profile.endereco;
      if (options.profile.cidade && !current.cidade) updateData.cidade = options.profile.cidade;
      if (options.profile.uf && !current.uf) updateData.uf = options.profile.uf;
      if (options.profile.cep && !current.cep) updateData.cep = options.profile.cep;
      if (Object.keys(updateData).length > 0) {
        await db.update(clientsTable).set(updateData).where(eq(clientsTable.id, existing.id));
      }
    }
    return existing.id;
  }
  const [inserted] = await db.insert(table).values({
    nome,
    ativo: true,
    ...(table === clientsTable && options?.profile
      ? {
          razaoSocial: options.profile.razaoSocial ?? null,
          cnpj: options.profile.cnpj ?? null,
          telefone: options.profile.telefone ?? null,
          email: options.profile.email ?? null,
          endereco: options.profile.endereco ?? null,
          cidade: options.profile.cidade ?? null,
          uf: options.profile.uf ?? null,
          cep: options.profile.cep ?? null,
        }
      : {}),
  }).returning();
  return inserted!.id;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.SYNC_DRY_RUN === "1";
  const rawRows = await loadRawRows();
  const warnings: string[] = [];
  const processedInsertionKeys = new Set<string>();
  let createdCampaigns = 0;
  let updatedCampaigns = 0;
  let createdInsertions = 0;
  let updatedInsertions = 0;
  const changes: Array<Record<string, unknown>> = [];

  for (const row of rawRows) {
    if (isSocialOnlyFormato(row.local)) {
      warnings.push(`${row.sourceSheet}: ${row.campanha} / ${row.local} registrada como ação social fora do escopo de inserções de site.`);
      continue;
    }
    const agencyInfo = splitAgencyValue(row.agenciaValor);
    const clientName = inferClientName(row.peca, row.campanha);
    const piCodigo = normalizePi(row.peca, row.agenciaValor);
    const siteId = await ensureSite(row.siteSigla);
    const clientProfile = await inferClientProfileFromPiReference(piCodigo, clientName);
    const clientId = await ensureByName(clientsTable, clientName, { profile: clientProfile });
    const agencyId = await ensureByName(agenciesTable, agencyInfo.agencyName);
    const normalizedCampaignName = normalizeSpaces(row.campanha);
    const normalizedPiCode = piCodigo ?? "";

    if (row.competenciaResolved !== row.competenciaSheet) {
      warnings.push(
        `${row.sourceSheet}: ${row.campanha} (${row.periodo}) movida de ${row.competenciaSheet} para ${row.competenciaResolved} porque o período está todo em outro mês.`,
      );
    }

    const matchingCampaigns = (await db.select().from(campaignsTable)).sort((a, b) => a.id - b.id);
    const exactCampaignCandidates = matchingCampaigns.filter((item) =>
      item.nome === normalizedCampaignName &&
      (item.piCodigo ?? "") === normalizedPiCode &&
      item.agenciaId === agencyId &&
      item.competencia === row.competenciaResolved,
    );
    let campaign = exactCampaignCandidates[0] ?? null;

    if (exactCampaignCandidates.length > 1) {
      warnings.push(
        `${row.sourceSheet}: campanha duplicada detectada para ${normalizedCampaignName} / ${piCodigo ?? "sem-pi"} / ${row.siteSigla}. Mantendo campanha ${exactCampaignCandidates[0]!.id} como canônica para não criar novo duplicado.`,
      );
    }

    if (!campaign) {
      const sameIdentityCandidates = matchingCampaigns.filter((item) =>
        item.nome === normalizedCampaignName &&
        (item.piCodigo ?? "") === normalizedPiCode &&
        item.agenciaId === agencyId,
      );
      const sameIdentity = sameIdentityCandidates[0] ?? null;
      if (sameIdentityCandidates.length > 1) {
        warnings.push(
          `${row.sourceSheet}: identidade repetida em múltiplas campanhas para ${normalizedCampaignName} / ${piCodigo ?? "sem-pi"} / ${row.siteSigla}. Reaproveitando campanha ${sameIdentity?.id ?? "desconhecida"} em vez de criar outra.`,
        );
      }
      if (sameIdentity) {
        if (dryRun) {
          campaign = {
            ...sameIdentity,
            competencia: row.competenciaResolved,
            valorLiquido: agencyInfo.valorLiquido,
            origem: "planilha_sincronizada",
          };
          changes.push({
            type: "campaign_update",
            campaignId: sameIdentity.id,
            campaignName: sameIdentity.nome,
            fromCompetencia: sameIdentity.competencia,
            toCompetencia: row.competenciaResolved,
          });
        } else {
          const [updated] = await db
            .update(campaignsTable)
            .set({
              competencia: row.competenciaResolved,
              valorLiquido: agencyInfo.valorLiquido,
              origem: "planilha_sincronizada",
            })
            .where(eq(campaignsTable.id, sameIdentity.id))
            .returning();
          campaign = updated!;
        }
        updatedCampaigns += 1;
      }
    }

    if (!campaign) {
      if (dryRun) {
        campaign = {
          id: -1,
          nome: normalizeSpaces(row.campanha),
          clienteId: clientId,
          agenciaId: agencyId,
          piCodigo,
          valorLiquido: agencyInfo.valorLiquido,
          competencia: row.competenciaResolved,
          origem: "planilha_sincronizada",
          observacoes: `Sincronizado da planilha (${row.sourceSheet})`,
          createdAt: new Date(),
          updatedAt: new Date(),
          projeto: null,
          plano: null,
          planilhaRef: null,
          produto: null,
          praca: null,
          condicaoPagamento: null,
          faturamentoTipo: null,
        } as typeof campaignsTable.$inferSelect;
        changes.push({
          type: "campaign_create",
          campaignName: normalizeSpaces(row.campanha),
          competencia: row.competenciaResolved,
          piCodigo,
          clienteId: clientId,
          agenciaId: agencyId,
        });
      } else {
        const [created] = await db.insert(campaignsTable).values({
          nome: normalizedCampaignName,
          clienteId: clientId,
          agenciaId: agencyId,
          piCodigo,
          valorLiquido: agencyInfo.valorLiquido,
          competencia: row.competenciaResolved,
          origem: "planilha_sincronizada",
          observacoes: `Sincronizado da planilha (${row.sourceSheet})`,
        }).returning();
        campaign = created!;
      }
      createdCampaigns += 1;
    }

    const localFormatoNormalizado = normalizeFormato(row.local);
    const insertionIdentityInBatch = `${campaign.id}|${siteId}|${localFormatoNormalizado}|${row.inicio}|${row.fim}`;
    if (processedInsertionKeys.has(insertionIdentityInBatch)) {
      warnings.push(
        `${row.sourceSheet}: linha duplicada no mesmo lote para ${normalizedCampaignName} / ${piCodigo ?? "sem-pi"} / ${row.siteSigla} / ${localFormatoNormalizado} (${row.inicio} a ${row.fim}). Ignorando repetição para evitar duplicado.`,
      );
      continue;
    }
    processedInsertionKeys.add(insertionIdentityInBatch);

    const candidateCampaignIds =
      exactCampaignCandidates.length > 0
        ? exactCampaignCandidates.map((item) => item.id)
        : [campaign.id];
    const existingInsertions = await db
      .select()
      .from(insertionsTable)
      .where(
        candidateCampaignIds.length === 1
          ? eq(insertionsTable.campanhaId, candidateCampaignIds[0]!)
          : inArray(insertionsTable.campanhaId, candidateCampaignIds),
      );
    const existing = existingInsertions.find((item) =>
      item.siteId === siteId &&
      normalizeFormato(item.localFormatoNormalizado ?? item.localFormato ?? "") === localFormatoNormalizado &&
      item.periodoInicio === row.inicio &&
      item.periodoFim === row.fim,
    );

    const bannerPublicadoNoSite = isTruthy(row.processoEnviado);
    const printGerado = isTruthy(row.processoRealizado);
    const processoEnviadoAgencia = false;
    const docsEnviados = false;
    const statusNormalizado = normalizeStatus(row.status, {
      bannerPublicadoNoSite,
      printGerado,
      processoEnviadoAgencia,
      docsEnviados,
    });

    if (existing) {
      if (existing.campanhaId !== campaign.id) {
        warnings.push(
          `${row.sourceSheet}: inserção ${existing.id} já existe em campanha duplicada ${existing.campanhaId} para ${normalizedCampaignName} / ${piCodigo ?? "sem-pi"} / ${row.siteSigla}. Atualizando o registro existente e evitando nova duplicação.`,
        );
      }
      if (dryRun) {
        changes.push({
          type: "insertion_update",
          insertionId: existing.id,
          campaignId: existing.campanhaId,
          campaignName: campaign.nome,
          siteId,
          localFormato: localFormatoNormalizado,
          periodoInicio: row.inicio,
          periodoFim: row.fim,
        });
      } else {
        await db.update(insertionsTable).set({
          siteId,
          localFormato: normalizeSpaces(row.local),
          localFormatoNormalizado,
          periodoInicio: row.inicio,
          periodoFim: row.fim,
          periodoOriginal: normalizeSpaces(row.periodo),
          statusLegado: normalizeSpaces(row.status),
          statusNormalizado:
            existing.bannerPublicadoNoSite || existing.printGerado || existing.processoEnviadoAgencia || existing.docsEnviados
              ? existing.statusNormalizado
              : statusNormalizado,
          atrasado: computeAtrasado({
            periodoFim: row.fim,
            processoEnviadoAgencia: existing.processoEnviadoAgencia,
            statusNormalizado: existing.statusNormalizado,
          }),
          observacoes: existing.observacoes || `Sincronizado da planilha (${row.sourceSheet})`,
        }).where(eq(insertionsTable.id, existing.id));
      }
      updatedInsertions += 1;
      continue;
    }

    if (dryRun) {
      changes.push({
        type: "insertion_create",
        campaignId: campaign.id,
        campaignName: campaign.nome,
        siteId,
        localFormato: localFormatoNormalizado,
        periodoInicio: row.inicio,
        periodoFim: row.fim,
      });
    } else {
      await db.insert(insertionsTable).values({
        campanhaId: campaign.id,
        siteId,
        localFormato: normalizeSpaces(row.local),
        localFormatoNormalizado,
        periodoInicio: row.inicio,
        periodoFim: row.fim,
        periodoOriginal: normalizeSpaces(row.periodo),
        statusLegado: normalizeSpaces(row.status),
        statusNormalizado,
        bannerPublicadoNoSite,
        printGerado,
        processoEnviadoAgencia,
        docsEnviados,
        mediaUrl: null,
        atrasado: computeAtrasado({ periodoFim: row.fim, processoEnviadoAgencia, statusNormalizado }),
        observacoes: `Sincronizado da planilha (${row.sourceSheet})`,
      });
    }
    createdInsertions += 1;
  }

  const invalidPeriods = dryRun
    ? []
    : await db
        .select()
        .from(insertionsTable)
        .where(eq(insertionsTable.id, insertionsTable.id));

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    source: TMP_FILE,
    rawRows: rawRows.length,
    createdCampaigns,
    updatedCampaigns,
    createdInsertions,
    updatedInsertions,
    warnings,
    sampleChanges: changes.slice(0, 50),
    invalidDateCount: invalidPeriods.filter((item) => item.periodoInicio?.startsWith("00")).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
