import crypto from "node:crypto";

export const MONTHLY_REPORT_SOURCE_TIMEOUT_MS = 120_000;
export const MONTHLY_REPORT_PORTAINER_TIMEOUT_MS = 60_000;
export const MONTHLY_REPORT_EXPORT_CREATE_TIMEOUT_MS = 180_000;
export const MONTHLY_REPORT_CAMPAIGN_BATCH_TIMEOUT_MS = 360_000;
export const EVIDENCE_ZIP_VALIDATION_PYTHON = String.raw`
import hashlib, pathlib, sys, zipfile
archive = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(archive) as package:
    names = [name for name in package.namelist() if not name.endswith('/')]
    images = [name for name in names if name.lower().endswith(('.jpg', '.jpeg'))]
    checksum_names = [name for name in names if name == 'SHA256SUMS.txt' or name.endswith('/SHA256SUMS.txt')]
    if not images or len(checksum_names) != 1:
        raise SystemExit('missing images or SHA256SUMS.txt')
    if len(sys.argv) > 2 and sys.argv[2] == 'complete':
        if checksum_names != ['SHA256SUMS.txt']:
            raise SystemExit('complete ZIP checksum must be at root')
        if any(len(pathlib.PurePosixPath(name).parts) < 3 for name in images):
            raise SystemExit('complete ZIP image must be organized by portal/format/date')
    if any(not name.lower().endswith(('.jpg', '.jpeg')) and name not in checksum_names for name in names):
        raise SystemExit('unexpected file in ZIP')
    if package.testzip() is not None:
        raise SystemExit('corrupt member')
    base = checksum_names[0].rsplit('/', 1)[0] + '/' if '/' in checksum_names[0] else ''
    listed = set()
    for line in package.read(checksum_names[0]).decode('utf-8').splitlines():
        digest, relative = line.split(None, 1)
        member = base + relative.lstrip(' *./')
        listed.add(member)
        if hashlib.sha256(package.read(member)).hexdigest() != digest:
            raise SystemExit('checksum mismatch: ' + member)
    if set(images) != listed:
        raise SystemExit('SHA256SUMS.txt must list every JPEG exactly once')
    if len(sys.argv) > 3 and int(sys.argv[3]) != len(images):
        raise SystemExit('unexpected image count')
`;

export function buildDeliveryProbeOptions() {
  return { method: "GET", headers: { range: "bytes=0-1023" }, redirect: "follow" };
}

export function shouldRetryDeliveryStatus(status) {
  return status === 429 || status >= 500;
}

export function takeDeliverySamples(values) {
  return Array.from(new Set(values || [])).filter(Boolean).slice(0, 3);
}

export function canonicalCommercialPi(value) {
  const match = String(value || "").trim().match(/^(?:PI\s*[-:]?\s*)?(\d+)(?:\s*[-–—:]\s*[^\d].*)?$/i);
  return match ? match[1].replace(/^0+(?=\d)/, "") : null;
}

const COMPETENCIA_MONTHS = [
  "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

export function competenciaMonthKey(value) {
  const normalized = normalizeFilterValue(value);
  const iso = normalized.match(/^(\d{4}) (0?[1-9]|1[0-2])$/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}`;
  const numeric = normalized.match(/^(0?[1-9]|1[0-2]) (\d{4})$/);
  if (numeric) return `${numeric[2]}-${String(Number(numeric[1])).padStart(2, "0")}`;
  const named = normalized.match(/^([A-Z]+) (\d{4})$/);
  const monthIndex = named ? COMPETENCIA_MONTHS.indexOf(named[1]) : -1;
  return monthIndex >= 0 ? `${named[2]}-${String(monthIndex + 1).padStart(2, "0")}` : null;
}

export function competenciaMatchesMonth(value, expectedCompetencia, targetMonth) {
  if (!value) return true;
  const expectedKey = competenciaMonthKey(targetMonth) || competenciaMonthKey(expectedCompetencia);
  return Boolean(expectedKey && competenciaMonthKey(value) === expectedKey);
}

export function resolveReportPortainerUrl(env) {
  return String(env?.ADOPS_REPORT_PORTAINER_URL || env?.PORTAINER_URL || "").replace(/\/$/, "");
}

export function resolveReportsPublishMount(env) {
  return String(env?.ADOPS_REPORTS_PUBLISH_MOUNT || "").replace(/\/$/, "");
}

export function isJsonContentType(value) {
  return /(^|\/)json(?:;|$)/i.test(String(value || ""));
}

export function buildPiSiteExportDownloadUrl(baseUrl, jobId) {
  const base = String(baseUrl || "").replace(/\/$/, "").replace(/\/api$/, "");
  return `${base}/api/pi-site-exports/jobs/${encodeURIComponent(String(jobId || ""))}/download`;
}

export function buildCampaignEvidenceExportDownloadUrl(baseUrl, jobId) {
  const base = String(baseUrl || "").replace(/\/$/, "").replace(/\/api$/, "");
  return `${base}/api/campaign-evidence-exports/jobs/${encodeURIComponent(String(jobId || ""))}/download`;
}

function addIsoDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function normalizeFilterValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function buildPortalFilterOptions(portals) {
  const unique = new Map();
  for (const portal of portals || []) {
    const value = String(portal?.key || "").trim().toUpperCase();
    if (!value || unique.has(value)) continue;
    unique.set(value, String(portal?.label || value).trim());
  }
  return [
    { value: "ALL", label: "Todos os portais" },
    ...Array.from(unique, ([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label, "pt-BR")),
  ];
}

export function campaignMatchesFilters(campaign, filters) {
  const selectedPortal = String(filters?.portal || "ALL").trim().toUpperCase();
  const portalMatches = selectedPortal === "ALL" || String(campaign?.portal || "").trim().toUpperCase() === selectedPortal;
  const state = String(filters?.state || "all").trim().toLowerCase();
  const stateMatches = state === "all" || String(campaign?.states || "").split(/\s+/).includes(state);
  const publication = String(filters?.publication || "all").trim().toLowerCase();
  const publicationMatches = publication === "all" || String(campaign?.publicationStates || "").split(/\s+/).includes(publication);
  const evidence = String(filters?.evidence || "all").trim().toLowerCase();
  const evidenceMatches = evidence === "all" || String(campaign?.evidenceStates || "").split(/\s+/).includes(evidence);
  const needle = normalizeFilterValue(filters?.search);
  const searchMatches = !needle || normalizeFilterValue(campaign?.search).includes(needle);
  return portalMatches && stateMatches && publicationMatches && evidenceMatches && searchMatches;
}

export function buildCampaignFilterMetadata(campaign, targetDate) {
  const items = Array.isArray(campaign?.items) ? campaign.items : [];
  const publicationStates = new Set();
  const evidenceStates = new Set();
  const endingWindowDate = addIsoDays(targetDate, 7);

  for (const item of items) {
    if (item?.state === "not_published") publicationStates.add("not_published");
    if (item?.state === "scheduled") publicationStates.add("scheduled");
    if (item?.bannerPublicadoNoSite === true && item?.periodoInicio <= targetDate && item?.periodoFim >= targetDate) {
      publicationStates.add("active");
    }
    if (item?.periodoFim < targetDate) publicationStates.add("ended");
    if (item?.bannerPublicadoNoSite === true && item?.periodoFim > targetDate && item?.periodoFim <= endingWindowDate) {
      publicationStates.add("ending");
    }
    const requiredCount = Array.isArray(item?.requiredDays) ? item.requiredDays.length : 0;
    const auditedCount = Number.isFinite(Number(item?.auditedDays))
      ? Number(item.auditedDays)
      : Array.isArray(item?.evidenceDays)
        ? item.evidenceDays.filter((day) => String(day?.status || "").startsWith("audited") && day?.url).length
        : 0;
    if (requiredCount > 0
      && auditedCount >= requiredCount
      && (item?.missingDates || []).length === 0
      && (item?.invalidDates || []).length === 0) {
      evidenceStates.add("complete");
    }
    if ((item?.invalidDates || []).length > 0) evidenceStates.add("invalid");
    if ((item?.missingDates || []).some((date) => typeof date === "string" && date < targetDate)) {
      evidenceStates.add("retroactive_missing");
    }
  }

  return {
    publicationStates: Array.from(publicationStates).join(" "),
    evidenceStates: Array.from(evidenceStates).join(" "),
  };
}

export function selectCanonicalInsertions(activeInsertions, monthInsertions) {
  const canonicalIds = new Set((activeInsertions || []).map((item) => Number(item.id)).filter(Number.isFinite));
  return (monthInsertions || []).filter((item) => canonicalIds.has(Number(item.id)));
}

export function classifyEvidenceStatus(status) {
  if (!status || status.status === "missing" || status.hasEvidenceForDate === false) return "missing";
  const approvedState = status.status === "ok" || status.status === "ok_best_effort" || status.status === "audited" || status.status === "audited_best_effort";
  const approvedChecklist = status.checklistValidation?.approved === true;
  const reachable = status.isReachable === true;
  if (approvedState && approvedChecklist && reachable) {
    return status.status === "ok_best_effort" || status.status === "audited_best_effort"
      ? "audited_best_effort"
      : "audited";
  }
  return "invalid";
}

export function adaptAggregatedEvidenceDay(day) {
  const approved = day?.status === "audited" || day?.status === "audited_best_effort";
  return {
    ...day,
    arquivoUrl: day?.url || null,
    checklistValidation: { approved, blockingIssues: day?.blockingIssues || [] },
    isReachable: approved && Boolean(day?.url),
    issues: (day?.blockingIssues || []).map((code) => ({ code })),
  };
}

export function canonicalRequiredDates(item) {
  if (Array.isArray(item?.evidence?.requiredDates)) return [...item.evidence.requiredDates];
  return Array.isArray(item?.evidenceDays) ? item.evidenceDays.map((day) => day?.date).filter(Boolean) : [];
}

export function buildSevenDayForecast(insertions, targetDate) {
  const windowStart = addIsoDays(targetDate, 1);
  const windowEnd = addIsoDays(targetDate, 7);
  const inWindow = (value) => typeof value === "string" && value >= windowStart && value <= windowEnd;
  const sortByDate = (field) => (left, right) => String(left[field]).localeCompare(String(right[field])) || Number(left.id) - Number(right.id);
  return {
    windowStart,
    windowEnd,
    starting: (insertions || []).filter((item) => inWindow(item.periodoInicio)).sort(sortByDate("periodoInicio")),
    ending: (insertions || []).filter((item) => inWindow(item.periodoFim)).sort(sortByDate("periodoFim")),
  };
}

export function buildMonthlyReportManifest({ slug, title, generatedAt }) {
  return {
    slug,
    title,
    description: "Evidências auditadas das campanhas AdOps, com downloads individuais e pacotes por campanha e portal.",
    generatedAt,
    visibility: "unlisted",
    publication: {
      preset: "corporate-base",
      density: "medium",
      hero: "compact",
      typography: "sans",
      accent: "institutional-blue",
      radius: 4,
      metricsColumns: 4,
      tableMode: "standard",
      evidenceLayout: "grid",
      motion: "reduced",
      audience: "mixed",
    },
  };
}

export function buildCampaignExportIdempotencyKey({ piCodigo, siteSigla, competencia, evidences }) {
  const approved = (evidences || [])
    .map((item) => ({ fingerprint: String(item.id ?? item.url ?? ""), date: String(item.date || "") }))
    .filter((item) => item.fingerprint && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .sort((left, right) => left.date.localeCompare(right.date) || left.fingerprint.localeCompare(right.fingerprint));
  const canonical = JSON.stringify({
    piCodigo: String(piCodigo || "").trim(),
    siteSigla: String(siteSigla || "").trim().toUpperCase(),
    competencia: String(competencia || "").trim().toUpperCase(),
    evidences: approved,
  });
  return `monthly-evidence-v2-${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

export function isMonthlyReportPublishable(summary) {
  return Number(summary?.missing || 0) === 0 && Number(summary?.invalid || 0) === 0;
}

export function buildMonthlyPublicationGate(insertions) {
  return (insertions || [])
    .filter((item) => item?.bannerPublicadoNoSite === true)
    .reduce(
      (summary, item) => ({
        missing: summary.missing + (Array.isArray(item.missingDates) ? item.missingDates.length : 0),
        invalid: summary.invalid + (Array.isArray(item.invalidDates) ? item.invalidDates.length : 0),
      }),
      { missing: 0, invalid: 0 },
    );
}

export function isAuditFailureJob(job) {
  return job?.status === "failed" && /capture_audit_failed|invalid_audit/i.test(String(job?.error || job?.error_text || ""));
}

export function findReportsMountSource(mounts) {
  const reportsMount = (mounts || []).find(
    (mount) => mount?.Type === "bind" && mount?.Destination === "/app/reports" && typeof mount?.Source === "string" && mount.Source,
  );
  if (!reportsMount?.Source) throw new Error("Bind mount /app/reports do sites-index nao encontrado.");
  return reportsMount.Source;
}

export function buildAtomicPublishCommand({ slug, stagingName, backupName }) {
  const cod5_names = [slug, stagingName, backupName].map((value) => String(value || ""));
  if (cod5_names.some((value) => !/^[A-Za-z0-9._-]+$/.test(value))) {
    throw new Error("Nome de publicação inválido.");
  }
  const [cod5_slug, cod5_staging, cod5_backup] = cod5_names;
  return [
    "cd /target",
    `test -d '${cod5_staging}'`,
    `if [ -d '${cod5_slug}' ]; then mv -- '${cod5_slug}' '${cod5_backup}'; fi`,
    `mv -- '${cod5_staging}' '${cod5_slug}'`,
  ].join(" && ");
}
