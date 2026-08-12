import crypto from "node:crypto";

export const MONTHLY_REPORT_SOURCE_TIMEOUT_MS = 120_000;
export const MONTHLY_REPORT_PORTAINER_TIMEOUT_MS = 60_000;
export const EVIDENCE_ZIP_VALIDATION_PYTHON = String.raw`
import hashlib, pathlib, sys, zipfile
archive = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(archive) as package:
    names = [name for name in package.namelist() if not name.endswith('/')]
    images = [name for name in names if name.lower().endswith(('.jpg', '.jpeg'))]
    checksum_names = [name for name in names if name == 'SHA256SUMS.txt' or name.endswith('/SHA256SUMS.txt')]
    if not images or len(checksum_names) != 1:
        raise SystemExit('missing images or SHA256SUMS.txt')
    if any(not name.lower().endswith(('.jpg', '.jpeg')) and name not in checksum_names for name in names):
        raise SystemExit('unexpected file in ZIP')
    if package.testzip() is not None:
        raise SystemExit('corrupt member')
    base = checksum_names[0].rsplit('/', 1)[0] + '/' if '/' in checksum_names[0] else ''
    for line in package.read(checksum_names[0]).decode('utf-8').splitlines():
        digest, relative = line.split(None, 1)
        member = base + relative.lstrip(' *./')
        if hashlib.sha256(package.read(member)).hexdigest() != digest:
            raise SystemExit('checksum mismatch: ' + member)
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

function addIsoDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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
