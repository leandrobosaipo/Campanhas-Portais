import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  db,
  sitesTable,
  clientsTable,
  agenciesTable,
  campaignsTable,
  insertionsTable,
  evidencesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { inferClientProfileFromPiReference } from "./lib/pi-client-cnpj";

type RawRow = {
  competencia: string;
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
};

type CampaignRecord = {
  id: number;
  key: string;
};

const SOURCE_DIR =
  process.env.PLANILHA_MARKDOWN_DIR ??
  "/Users/leandrobosaipo/.openclaw/entregaveis/fase-0-validacao-dashboard/abas-markdown";

const FILE_TO_COMPETENCIA: Record<string, string> = {
  "JULHO.md": "JULHO/2025",
  "AGOSTO.md": "AGOSTO/2025",
  "SETEMBRO.md": "SETEMBRO/2025",
  "OUTUBRO.md": "OUTUBRO/2025",
  "NOVEMBRO.md": "NOVEMBRO/2025",
  "DEZEMBRO.md": "DEZEMBRO/2025",
  "JANEIRO_.md": "JANEIRO/2026",
  "FEVEREIRO_.md": "FEVEREIRO/2026",
  "MARCO26.md": "MARÇO/2026",
  "ABRIL_2026.md": "ABRIL/2026",
};

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
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
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
  const normalized = normalizeForMatch(value);
  return [
    "SIM",
    "S",
    "OK",
    "TRUE",
    "FINALIZADO",
    "FINALIZADA",
    "CONCLUIDO",
    "CONCLUIDA",
    "V",
  ].includes(normalized);
}

function isFinishedStatus(value: string): boolean {
  const normalized = normalizeForMatch(value);
  return (
    normalized === "V" ||
    normalized.includes("FINALIZAD") ||
    normalized.includes("FINALIZADO") ||
    normalized.includes("CONCLUID")
  );
}

function normalizeStatus(value: string, flags: {
  bannerPublicadoNoSite: boolean;
  printGerado: boolean;
  processoEnviadoAgencia: boolean;
  docsEnviados: boolean;
}): string {
  if (flags.docsEnviados) return "concluido";
  if (flags.processoEnviadoAgencia) return "enviado_para_agencia";
  if (flags.printGerado) return "print_gerado";
  if (flags.bannerPublicadoNoSite) return "publicado_no_site";

  const normalized = normalizeForMatch(value);
  if (normalized.includes("ATIVA")) return "aguardando_publicacao";
  if (normalized.includes("FINALIZ") || normalized === "V") return "concluido";
  return "rascunho";
}

function normalizeFormato(value: string): string {
  const normalized = normalizeForMatch(value)
    .replace(/\./g, "")
    .replace(/\s+/g, " ");

  const direct: Record<string, string> = {
    "MEGA BANNER TOPO": "MEGABANNER TOPO",
    "MEGABANNER TOPO": "MEGABANNER TOPO",
    "MEGABANNER TPO": "MEGABANNER TOPO",
    "MEGABANER TOPO": "MEGABANNER TOPO",
    "MEGA BANNER HOME 1": "MEGABANNER HOME 1",
    "MEGA BANNER HOME 2": "MEGABANNER HOME 2",
    "MEGA BANNER HOME 3": "MEGABANNER HOME 3",
    "MEGABANNER HOME 1": "MEGABANNER HOME 1",
    "MEGABANNER HOME 2": "MEGABANNER HOME 2",
    "MEGABANNER HOME 3": "MEGABANNER HOME 3",
    "BANNER INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "BANNER INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIA": "INTERNO DE NOTICIAS",
    "INTERNO NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO DE NOTICIAS": "INTERNO DE NOTICIAS",
    "INTERNO DE MATERIAS": "INTERNO DE MATERIAS",
    "PRIMEIRA DOBRA": "PRIMEIRA DOBRA",
    "SEGUNDA DOBRA": "SEGUNDA DOBRA",
    "LATERAL PRIMEIRA DOBRA": "LATERAL PRIMEIRA DOBRA",
    "TOPO LATERAL": "TOPO LATERAL",
    "TOP BANNER": "TOP BANNER",
    "TOPO": "TOPO",
    "HOME 1": "HOME 1",
    "HOME 2": "HOME 2",
    "HOME 3": "HOME 3",
    "VIDEO": "VIDEO",
    "VIDEO - LATERAL": "VIDEO - LATERAL",
    "INSTAGRAM": "INSTAGRAM",
    "BANNER 728 X 90": "BANNER 728 X 90",
    "MEGABANNER": "MEGABANNER",
  };

  return direct[normalized] ?? titleCase(normalized);
}

function findAgencyName(value: string): string | null {
  const normalized = normalizeForMatch(value);
  for (const [pattern, label] of AGENCY_ALIASES) {
    if (pattern.test(normalized)) return label;
  }
  return null;
}

function splitAgencyValue(value: string): { agencyName: string; valorLiquido: string | null } {
  const cleaned = normalizeSpaces(value);
  if (!cleaned) return { agencyName: "Não informado", valorLiquido: null };

  const explicitAgency = findAgencyName(cleaned);
  const numericChunks = [...cleaned.matchAll(/\d[\d.,]*/g)].map((match) => match[0]);
  const lastNumericChunk = numericChunks.at(-1) ?? null;
  const amountLooksReliable =
    lastNumericChunk != null &&
    (/[A-Za-z].*[+\-]/.test(cleaned) ||
      cleaned.includes("R$") ||
      /[.,]\d{2}$/.test(cleaned) ||
      /\d[.,]\d{3}/.test(cleaned));

  const agencyRaw =
    lastNumericChunk && amountLooksReliable
      ? cleaned.slice(0, cleaned.lastIndexOf(lastNumericChunk)).replace(/[+\-]\s*$/, "")
      : cleaned;
  const agencyName =
    explicitAgency ??
    titleCase(
      agencyRaw
        .replace(/^PI\s+/i, "")
        .replace(/^\d+\s*-\s*/g, "")
        .trim() || "Não informado",
    );
  const valorLiquido =
    amountLooksReliable && lastNumericChunk ? parseBrazilianNumber(lastNumericChunk) : null;
  return { agencyName, valorLiquido };
}

function parseBrazilianNumber(value: string): string {
  const cleaned = normalizeSpaces(value).replace(/[R$\s]/g, "");
  let normalized = cleaned;

  if (cleaned.includes(".") && cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else if (/^\d{1,3}(?:,\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/,/g, "");
  } else if (/,\d{2}$/.test(cleaned)) {
    normalized = cleaned.replace(".", "").replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function normalizePi(value: string, fallback = ""): string | null {
  const cleaned = normalizeSpaces(value);
  if (cleaned) return cleaned;
  const fallbackCleaned = normalizeSpaces(fallback);
  if (!fallbackCleaned) return null;
  const match = fallbackCleaned.match(/^(PI|P\.I\.|P\.I:)?\s*[-:]?\s*\d+/i);
  return match ? normalizeSpaces(match[0]) : null;
}

function inferClientName(piece: string, campaign: string): string {
  const combined = normalizeForMatch(`${piece} ${campaign}`);

  const rules: Array<[RegExp, string]> = [
    [/\bPREF CBA\b|\bPREFEITURA DE CUIABA\b|\bCUIABA\b/, "Prefeitura de Cuiabá"],
    [/\bPREF ROO\b|\bPREF ROO\b|\bRONDONOPOLIS\b/, "Prefeitura de Rondonópolis"],
    [/\bPREF VG\b|\bVARZEA GRANDE\b/, "Prefeitura de Várzea Grande"],
    [/\bPREF CACERES\b|\bCACERES\b/, "Prefeitura de Cáceres"],
    [/\bPREF PVA\b|\bPREF PVL\b|\bPVA\b/, "Prefeitura PVA"],
    [/\bALMT\b/, "ALMT"],
    [/\bTCE\b/, "TCE-MT"],
    [/\bUNEMAT\b/, "UNEMAT"],
    [/\bENERGISA\b/, "Energisa"],
    [/\bSANEAR\b/, "Sanear"],
    [/\bDETRAN\b|\bTRANSITO\b/, "DETRAN-MT"],
    [/\bHOSPITAL CENTRAL\b|\bHOSPITAL - CENTRAL\b/, "Hospital Central"],
    [/\bSECOM\b|\bGOV\b/, "Governo do Estado"],
  ];

  for (const [pattern, label] of rules) {
    if (pattern.test(combined)) return label;
  }

  const suffixMatch = normalizeSpaces(piece).match(/-\s*(.+)$/);
  if (suffixMatch?.[1]) return titleCase(suffixMatch[1]);
  if (isMeaningful(campaign)) return titleCase(campaign);
  return "Não informado";
}

function extractDateParts(value: string): Array<{ day: number; month: number; year?: number }> {
  const normalized = normalizeSpaces(value);
  const parts: Array<{ day: number; month: number; year?: number }> = [];

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
    parts.push({
      day: Number.parseInt(compactRange[1]!, 10),
      month: Number.parseInt(compactRange[2]!, 10),
    });
    parts.push({
      day: Number.parseInt(compactRange[3]!, 10),
      month: Number.parseInt(compactRange[4]!, 10),
      year: endYear,
    });
    return parts;
  }

  const shortMatches = [...normalized.matchAll(/\b(\d{1,2})[./](\d{1,2})\b/g)];
  return shortMatches.map((match) => ({
    day: Number.parseInt(match[1]!, 10),
    month: Number.parseInt(match[2]!, 10),
  }));
}

function parsePeriodo(periodo: string, competencia: string): { inicio: string | null; fim: string | null } {
  const [competenciaMes, competenciaAno] = competencia.split("/");
  const competenciaMonth = MONTH_INDEX[competenciaMes] ?? 1;
  const competenciaYear = Number.parseInt(competenciaAno, 10);
  const parts = extractDateParts(periodo);
  if (parts.length === 0) return { inicio: null, fim: null };

  const start = parts[0];
  const end = parts[1] ?? parts[0];

  let startYear = start.year ?? competenciaYear;
  if (!start.year && competenciaMonth === 1 && start.month === 12) {
    startYear = competenciaYear - 1;
  }

  let endYear = end.year ?? startYear;
  if (!end.year && end.month < start.month) {
    endYear = startYear + 1;
  }

  const inicio = `${startYear.toString().padStart(4, "0")}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`;
  const fim = `${endYear.toString().padStart(4, "0")}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`;
  return { inicio, fim };
}

function inferDocs(extra: string, finished: boolean, processoEnviadoAgencia: boolean): boolean {
  const normalized = normalizeForMatch(extra);
  if (normalized === "SIM") return true;
  if (normalized === "NAO" || normalized === "NÃO") return false;
  if (extra.match(/^\d{4}-\d{2}-\d{2}/)) return finished && processoEnviadoAgencia;
  return false;
}

function inferDataEnvio(extra: string): string | null {
  const cleaned = normalizeSpaces(extra);
  if (!cleaned) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned;
  return null;
}

function parseCells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => normalizeSpaces(cell));
}

function buildRowsFromMarkdown(content: string, competencia: string): RawRow[] {
  const lines = content.split("\n").filter((line) => line.startsWith("|"));
  const rows: RawRow[] = [];
  let siteRowCells: string[] | null = null;
  let blockStarts: number[] = [];
  let blockSites: string[] = [];

  for (const line of lines) {
    const cells = parseCells(line);
    if (cells.length === 0) continue;

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

    const detectedSites = cells.filter((cell) => cell in SITE_NAMES);
    if (detectedSites.length > 0 && detectedSites.length <= 2 && cells.some((cell) => cell in SITE_NAMES)) {
      siteRowCells = cells;
      continue;
    }

    if (blockStarts.length === 0) continue;

    blockStarts.forEach((start, index) => {
      const nextStart = blockStarts[index + 1] ?? cells.length;
      const slice = cells.slice(start, nextStart);
      const [peca = "", agenciaValor = "", campanha = "", periodo = "", local = "", status = "", processoRealizado = "", processoEnviado = "", extra = ""] = slice;
      if (!isMeaningful(campanha) && !isMeaningful(local) && !isMeaningful(periodo)) return;
      const siteSigla = blockSites[index];
      if (!siteSigla) return;
      rows.push({
        competencia,
        siteSigla,
        peca,
        agenciaValor,
        campanha,
        periodo,
        local,
        status,
        processoRealizado,
        processoEnviado,
        extra,
      });
    });
  }

  return rows.filter((row) => isMeaningful(row.campanha) || isMeaningful(row.local));
}

async function loadRawRows(): Promise<RawRow[]> {
  const entries = await readdir(SOURCE_DIR);
  const rows: RawRow[] = [];

  for (const fileName of entries.sort()) {
    const competencia = FILE_TO_COMPETENCIA[fileName];
    if (!competencia) continue;
    const content = await readFile(path.join(SOURCE_DIR, fileName), "utf8");
    rows.push(...buildRowsFromMarkdown(content, competencia));
  }

  return rows;
}

async function resetDatabase(): Promise<void> {
  await db.delete(evidencesTable);
  await db.delete(insertionsTable);
  await db.delete(campaignsTable);
  await db.delete(clientsTable);
  await db.delete(agenciesTable);
  await db.delete(sitesTable);
}

async function main(): Promise<void> {
  const rawRows = await loadRawRows();
  if (rawRows.length === 0) {
    throw new Error(`Nenhuma linha encontrada em ${SOURCE_DIR}`);
  }

  await resetDatabase();

  const insertedSites = await db
    .insert(sitesTable)
    .values(
      Object.entries(SITE_NAMES).map(([sigla, nome]) => ({
        sigla,
        nome,
        ativo: true,
      })),
    )
    .returning();

  const siteBySigla = new Map(insertedSites.map((site) => [site.sigla, site.id]));

  const clientNames = [...new Set(rawRows.map((row) => inferClientName(row.peca, row.campanha)))].sort();
  const agencyNames = [
    ...new Set(rawRows.map((row) => splitAgencyValue(row.agenciaValor).agencyName).filter(Boolean)),
  ].sort();

  const insertedClients = await db
    .insert(clientsTable)
    .values(await Promise.all(clientNames.map(async (nome) => {
      const sampleRow = rawRows.find((row) => inferClientName(row.peca, row.campanha) === nome);
      const clientProfile = await inferClientProfileFromPiReference(
        sampleRow ? normalizePi(sampleRow.peca, sampleRow.agenciaValor) : null,
        nome,
      );
      return {
        nome,
        ativo: true,
        razaoSocial: clientProfile?.razaoSocial ?? null,
        cnpj: clientProfile?.cnpj ?? null,
        telefone: clientProfile?.telefone ?? null,
        email: clientProfile?.email ?? null,
        endereco: clientProfile?.endereco ?? null,
        cidade: clientProfile?.cidade ?? null,
        uf: clientProfile?.uf ?? null,
        cep: clientProfile?.cep ?? null,
      };
    })))
    .returning();
  const insertedAgencies = await db
    .insert(agenciesTable)
    .values(agencyNames.map((nome) => ({ nome, ativo: true })))
    .returning();

  const clientByName = new Map(insertedClients.map((client) => [client.nome, client.id]));
  const agencyByName = new Map(insertedAgencies.map((agency) => [agency.nome, agency.id]));

  for (const row of rawRows) {
    const clientName = inferClientName(row.peca, row.campanha);
    const clientProfile = await inferClientProfileFromPiReference(normalizePi(row.peca, row.agenciaValor), clientName);
    const clientId = clientByName.get(clientName);
    if (!clientId || !clientProfile) continue;
    await db
      .update(clientsTable)
      .set({
        ...(clientProfile.razaoSocial ? { razaoSocial: clientProfile.razaoSocial } : {}),
        ...(clientProfile.cnpj ? { cnpj: clientProfile.cnpj } : {}),
        ...(clientProfile.telefone ? { telefone: clientProfile.telefone } : {}),
        ...(clientProfile.email ? { email: clientProfile.email } : {}),
        ...(clientProfile.endereco ? { endereco: clientProfile.endereco } : {}),
        ...(clientProfile.cidade ? { cidade: clientProfile.cidade } : {}),
        ...(clientProfile.uf ? { uf: clientProfile.uf } : {}),
        ...(clientProfile.cep ? { cep: clientProfile.cep } : {}),
      })
      .where(eq(clientsTable.id, clientId));
  }

  const campaignMap = new Map<string, CampaignRecord>();
  const insertedCampaigns: CampaignRecord[] = [];

  for (const row of rawRows) {
    const campaignName = normalizeSpaces(row.campanha);
    const piCodigo = normalizePi(row.peca, row.agenciaValor);
    const agencyInfo = splitAgencyValue(row.agenciaValor);
    const clientName = inferClientName(row.peca, row.campanha);
    const key = [
      row.competencia,
      normalizeForMatch(campaignName),
      normalizeForMatch(piCodigo ?? ""),
      normalizeForMatch(clientName),
      normalizeForMatch(agencyInfo.agencyName),
    ].join("::");

    if (campaignMap.has(key)) continue;

    const [inserted] = await db
      .insert(campaignsTable)
      .values({
        nome: campaignName,
        clienteId: clientByName.get(clientName) ?? null,
        agenciaId: agencyByName.get(agencyInfo.agencyName) ?? null,
        piCodigo,
        valorLiquido: agencyInfo.valorLiquido,
        competencia: row.competencia,
        origem: "planilha_importada",
        observacoes: `Importado de ${path.basename(SOURCE_DIR)}`,
      })
      .returning();

    const record = { id: inserted!.id, key };
    campaignMap.set(key, record);
    insertedCampaigns.push(record);
  }

  let insertedInsertions = 0;

  for (const row of rawRows) {
    const agencyInfo = splitAgencyValue(row.agenciaValor);
    const clientName = inferClientName(row.peca, row.campanha);
    const key = [
      row.competencia,
      normalizeForMatch(row.campanha),
      normalizeForMatch(normalizePi(row.peca, row.agenciaValor) ?? ""),
      normalizeForMatch(clientName),
      normalizeForMatch(agencyInfo.agencyName),
    ].join("::");

    const campaign = campaignMap.get(key);
    if (!campaign) continue;

    const finished = isFinishedStatus(row.status);
    let bannerPublicadoNoSite = isTruthy(row.processoEnviado);
    let processoEnviadoAgencia = isTruthy(row.processoRealizado);
    let docsEnviados = inferDocs(row.extra, finished, processoEnviadoAgencia);
    let printGerado = bannerPublicadoNoSite && (processoEnviadoAgencia || docsEnviados || finished);

    if (finished) {
      bannerPublicadoNoSite = true;
      printGerado = true;
      processoEnviadoAgencia = true;
    }

    const statusNormalizado = normalizeStatus(row.status, {
      bannerPublicadoNoSite,
      printGerado,
      processoEnviadoAgencia,
      docsEnviados,
    });

    const periodo = parsePeriodo(row.periodo, row.competencia);
    const inicioDate = periodo.inicio ? new Date(`${periodo.inicio}T00:00:00`) : null;
    const atrasado = !bannerPublicadoNoSite && statusNormalizado !== "concluido" && inicioDate != null && inicioDate < new Date();

    await db.insert(insertionsTable).values({
      campanhaId: campaign.id,
      siteId: siteBySigla.get(row.siteSigla) ?? null,
      localFormato: normalizeSpaces(row.local) || null,
      localFormatoNormalizado: normalizeFormato(row.local),
      periodoInicio: periodo.inicio,
      periodoFim: periodo.fim,
      periodoOriginal: normalizeSpaces(row.periodo) || null,
      statusLegado: normalizeSpaces(row.status) || null,
      statusNormalizado,
      bannerPublicadoNoSite,
      printGerado,
      processoEnviadoAgencia,
      docsEnviados,
      dataEnvioAgencia: inferDataEnvio(row.extra),
      atrasado,
      observacoes: null,
    });

    insertedInsertions += 1;
  }

  const countByCompetencia = rawRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.competencia] = (acc[row.competencia] ?? 0) + 1;
    return acc;
  }, {});

  console.log("Importação concluída.");
  console.log(`Sites: ${insertedSites.length}`);
  console.log(`Clientes: ${insertedClients.length}`);
  console.log(`Agências: ${insertedAgencies.length}`);
  console.log(`Campanhas: ${insertedCampaigns.length}`);
  console.log(`Inserções: ${insertedInsertions}`);
  console.log("Inserções por competência:");
  Object.entries(countByCompetencia)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([competencia, total]) => {
      console.log(`- ${competencia}: ${total}`);
    });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
