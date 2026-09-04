const VALID_PORTALS = new Set(["OMT", "ROO", "PERRENGUE", "AFL", "PNMT", "PPMT"]);
const VALID_PUBLICATION_FILTERS = new Set(["all", "active", "not_published", "scheduled", "ending", "ended"]);
const VALID_EVIDENCE_FILTERS = new Set(["all", "complete", "missing", "retroactive_missing", "invalid"]);
const PUBLIC_INSERTION_FIELDS = [
  "id", "campanhaId", "campanhaName", "clienteNome", "agenciaNome", "piCodigo", "competencia",
  "siteSigla", "siteNome", "siteLogoUrl", "localFormato", "localFormatoNormalizado", "periodoInicio",
  "periodoFim", "statusNormalizado", "bannerPublicadoNoSite", "mediaUrl", "portalUrl", "adrotateGroupId", "adrotateGroupUrl",
] as const;

export function normalizeMonthlyReportMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
}

export function currentMonthInTimeZone(date = new Date(), timeZone = "America/Cuiaba") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function monthBounds(month: string, today: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, evidenceEnd: today >= start && today <= end ? today : today < start ? start : end };
}

export function classifyMonthlyInsertion(options: {
  published: boolean;
  periodStart: string;
  periodEnd: string;
  today: string;
  evidenceDays: Array<{ date: string; status: string }>;
}) {
  const publicationStates: string[] = [];
  if (options.periodStart > options.today) publicationStates.push("scheduled");
  else if (options.periodEnd < options.today) publicationStates.push("ended");
  else if (options.published) publicationStates.push("active");
  else publicationStates.push("not_published");
  const endingLimit = new Date(`${options.today}T12:00:00.000Z`);
  endingLimit.setUTCDate(endingLimit.getUTCDate() + 7);
  if (options.periodEnd >= options.today && options.periodEnd <= endingLimit.toISOString().slice(0, 10)) publicationStates.push("ending");

  const invalid = options.evidenceDays.some((day) => !["audited", "audited_best_effort", "missing"].includes(day.status));
  const missing = options.evidenceDays.some((day) => day.status === "missing");
  const retroactiveMissing = options.evidenceDays.some((day) => day.status === "missing" && day.date < options.today);
  const evidenceStates = invalid
    ? ["invalid"]
    : missing
      ? ["missing", ...(retroactiveMissing ? ["retroactive_missing"] : [])]
      : ["complete"];
  return { publicationStates, evidenceStates };
}

export function publicMonthlyInsertion(item: Record<string, unknown>) {
  return Object.fromEntries(PUBLIC_INSERTION_FIELDS.flatMap((field) => field in item ? [[field, item[field]]] : []));
}

export function pageMonthlyInsertions<T>(items: T[], offset: number, limit: number) {
  return items.slice(offset, offset + limit);
}

export function excludeSupersededMonthlyInsertions<T extends { archivedAt?: unknown; supersededByInsertionId?: unknown }>(items: T[]) {
  return items.filter((item) => item.archivedAt == null && item.supersededByInsertionId == null);
}

type MonthlyCanonicalCandidate = {
  id: number;
  campanhaName?: string | null;
  piCodigo?: string | null;
  siteId?: number | null;
  siteSigla?: string | null;
  localFormato?: string | null;
  localFormatoNormalizado?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  mediaUrl?: string | null;
  bannerPublicadoNoSite?: boolean | null;
  statusNormalizado?: string | null;
  canonicalIdentityKey?: string | null;
};

function canonicalFormatKey(value: unknown) {
  const key = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  if (key === "TOPO" || key.startsWith("MEGABANNER TOPO") || key.startsWith("MEGA BANNER TOPO")) return "MEGABANNER TOPO";
  if (key.startsWith("LATERAL 02") || key === "BANNER LATERAL SEGUNDA DOBRA") return "BANNER LATERAL SEGUNDA DOBRA";
  if (key.startsWith("VIDEO")) return "VIDEO";
  return key;
}

function monthlyLogicalKey(item: MonthlyCanonicalCandidate) {
  const pi = String(item.piCodigo ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const campaign = String(item.campanhaName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const site = item.siteId != null ? String(item.siteId) : String(item.siteSigla ?? "").toUpperCase();
  const format = canonicalFormatKey(item.localFormatoNormalizado ?? item.localFormato);
  const identity = pi || campaign;
  return identity && site && format ? `${identity}:${site}:${format}` : null;
}

function sameMonthlyIdentity(left: MonthlyCanonicalCandidate, right: MonthlyCanonicalCandidate) {
  const leftPi = String(left.piCodigo ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const rightPi = String(right.piCodigo ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const campaignKey = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const sameCampaign = campaignKey(left.campanhaName) && campaignKey(left.campanhaName) === campaignKey(right.campanhaName);
  const sameSite = (left.siteId ?? left.siteSigla) === (right.siteId ?? right.siteSigla);
  const sameFormat = canonicalFormatKey(left.localFormatoNormalizado ?? left.localFormato) === canonicalFormatKey(right.localFormatoNormalizado ?? right.localFormato);
  return sameSite && sameFormat && ((leftPi && rightPi && leftPi === rightPi) || ((!leftPi || !rightPi) && sameCampaign));
}

function periodsOverlap(left: MonthlyCanonicalCandidate, right: MonthlyCanonicalCandidate) {
  return Boolean(left.periodoInicio && left.periodoFim && right.periodoInicio && right.periodoFim
    && left.periodoInicio <= right.periodoFim && left.periodoFim >= right.periodoInicio);
}

function monthlyCanonicalScore(item: MonthlyCanonicalCandidate) {
  const status = String(item.statusNormalizado ?? "").toUpperCase();
  return (item.bannerPublicadoNoSite === true ? 100 : 0)
    + (item.mediaUrl ? 50 : 0)
    + (["PUBLICADO", "EM_VEICULACAO", "PUBLICADO_NO_SITE"].includes(status) ? 10 : 0)
    + (item.canonicalIdentityKey ? 1 : 0);
}

export function selectCanonicalMonthlyInsertions<T extends MonthlyCanonicalCandidate>(items: T[]) {
  const groups: T[][] = [];
  for (const item of items) {
    const logicalKey = monthlyLogicalKey(item);
    const group = logicalKey ? groups.find((candidate) => (
      sameMonthlyIdentity(candidate[0]!, item) && candidate.some((member) => periodsOverlap(member, item))
    )) : null;
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups.map((group) => [...group].sort((left, right) => (
    monthlyCanonicalScore(right) - monthlyCanonicalScore(left) || right.id - left.id
  ))[0]!);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function buildMonthlyReportQuery(query: Record<string, unknown>) {
  const month = normalizeMonthlyReportMonth(query.month);
  if (!month) throw new Error("month deve estar no formato YYYY-MM.");
  const requestedPortal = typeof query.portal === "string" ? query.portal.trim().toUpperCase() : "";
  const publication = typeof query.publication === "string" && VALID_PUBLICATION_FILTERS.has(query.publication)
    ? query.publication
    : "all";
  const evidence = typeof query.evidence === "string" && VALID_EVIDENCE_FILTERS.has(query.evidence)
    ? query.evidence
    : "all";
  return {
    month,
    portal: VALID_PORTALS.has(requestedPortal) ? requestedPortal : null,
    publication,
    evidence,
    search: typeof query.search === "string" ? query.search.trim().slice(0, 160) : "",
    offset: boundedInteger(query.cursor, 0, 0, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(query.limit, 12, 1, 12),
  };
}
