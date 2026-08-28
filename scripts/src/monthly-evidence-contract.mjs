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

export function resolveMonthlyReportApiBases(env = process.env) {
  return {
    operationsBase: String(env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api-public.leandro471.workers.dev").replace(/\/$/, ""),
    deliveryBase: String(env.ADOPS_DELIVERY_API_BASE_URL || "https://adops-api.codigo5.com.br").replace(/\/$/, ""),
  };
}

function addIsoDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function localDateHour(value, timeZone = "America/Cuiaba") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour) };
}

export function resolveEvidenceWindow({ reportDate, now = new Date(), dailyPrintStatus = null } = {}) {
  const { date: localDate, hour } = localDateHour(now);
  if (reportDate < localDate) return { evidenceCutoffDate: reportDate, phase: "historical" };
  if (reportDate > localDate) return { evidenceCutoffDate: addIsoDays(localDate, -1), phase: "future" };
  const attempt = dailyPrintStatus?.lastAttempt;
  const sameDayAttempt = attempt?.targetDate === reportDate ? attempt : null;
  if (sameDayAttempt?.status === "completed") return { evidenceCutoffDate: reportDate, phase: "completed" };
  if (hour < 18) return { evidenceCutoffDate: addIsoDays(reportDate, -1), phase: "awaiting_capture" };
  if (hour < 22 || ["queued", "running"].includes(String(sameDayAttempt?.status || ""))) {
    return { evidenceCutoffDate: addIsoDays(reportDate, -1), phase: "processing" };
  }
  return { evidenceCutoffDate: reportDate, phase: "routine_overdue" };
}

export function liveReportPollingDelay({ active = false, terminal = false, nextRecoveryAt = null, consecutiveErrors = 0 } = {}) {
  if (consecutiveErrors > 0) return [30_000, 60_000, 120_000][Math.min(consecutiveErrors, 3) - 1];
  if (active) return 15_000;
  if (terminal && !nextRecoveryAt) return null;
  return nextRecoveryAt ? 60_000 : null;
}

// While today's capture window is still open, never create a missing-day debt
// in the report.  Evidence that has already passed the canonical audit is safe
// to show immediately, so operators can follow the batch incrementally.
export function selectReportEvidenceDates(requiredDates, { evidenceCutoffDate, targetDate, statusByDate = new Map() } = {}) {
  return Array.from(new Set(requiredDates || []))
    .filter((date) => date <= evidenceCutoffDate || (
      date <= targetDate && classifyEvidenceStatus(statusByDate.get(date) || { status: "missing" }).startsWith("audited")
    ))
    .sort();
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
    if (item?.publicationHealth?.status === "blocked_upstream" || item?.state === "blocked_upstream") publicationStates.add("blocked_upstream");
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
    const missingDates = item?.missingDates || [];
    if ((item?.invalidDates || []).length > 0) evidenceStates.add("invalid");
    if (missingDates.length > 0) evidenceStates.add("missing");
    if (missingDates.some((date) => typeof date === "string" && date < targetDate)) {
      evidenceStates.add("retroactive_missing");
    }
  }

  return {
    publicationStates: Array.from(publicationStates).join(" "),
    evidenceStates: Array.from(evidenceStates).join(" "),
  };
}

export function buildPublicationHealthFingerprint({ insertionId, publicationHealth } = {}) {
  if (publicationHealth?.status !== "blocked_upstream") return null;
  const id = Number(insertionId);
  const reason = String(publicationHealth.reason || "").trim();
  const groupId = Number(publicationHealth.expectedGroupId);
  if (!Number.isInteger(id) || !reason || !Number.isInteger(groupId)) return null;
  return `publication-health:${id}:${reason}:${groupId}`;
}

export function buildPublicationGuidance({ operation, publicationHealth } = {}) {
  const resolvedHealth = publicationHealth || operation?.publicationHealth || null;
  const actions = Array.isArray(operation?.requiredActions) ? operation.requiredActions : [];
  const blockers = Array.isArray(operation?.blockingIssues) ? operation.blockingIssues : [];
  const reason = String(resolvedHealth?.reason || operation?.sourceIdentity?.reason || "").trim();
  const requiredAction = String(resolvedHealth?.requiredAction || "").trim() || null;
  const blocker = blockers.map((issue) => issue?.message || issue?.label || issue?.code || issue).find(Boolean)
    || reason
    || (actions.includes("confirm_source_identity") ? "A identidade da campanha ainda precisa ser confirmada." : "A publicação ainda não passou pelo preflight operacional.");
  const action = reason === "expected_media_not_observed"
    ? "Verificar a mídia esperada no grupo publicado e executar novo preflight."
    : requiredAction === "resolve_media" || actions.includes("locate_or_upload_media")
      ? "Confirmar mídia e destino HTTPS e executar novo preflight."
      : requiredAction === "publish_adrotate" || actions.includes("publish_on_site")
        ? "Executar o preflight e publicar o banner no portal."
        : requiredAction === "verify_publication"
          ? "Verificar a publicação no portal e executar novo preflight."
          : requiredAction === "reconcile_duplicate"
            ? "Reconciliar a identidade duplicada antes de gerar evidências."
            : actions.includes("confirm_source_identity")
              ? "Confirmar a PI no documento autoritativo e executar novo preflight."
              : actions.includes("review_site_divergence")
                ? "Revisar o portal com a PI, a planilha e a inserção canônica."
                : actions.includes("review_period_divergence") || actions.includes("review_format_divergence")
                  ? "Corrigir a divergência indicada e executar novo preflight."
                  : "Reconciliar a campanha antes de gerar evidências.";
  return { blocker, action, requiredAction };
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

export function findHistoricalAuditRegressions(previousData, nextData) {
  const nextByInsertion = new Map(
    (nextData?.insertions ?? []).map((insertion) => [String(insertion.id), insertion]),
  );
  const auditedStatuses = new Set(["audited", "audited_best_effort"]);
  const regressions = [];

  for (const previousInsertion of previousData?.insertions ?? []) {
    const nextInsertion = nextByInsertion.get(String(previousInsertion.id));
    const nextByDate = new Map(
      (nextInsertion?.evidenceDays ?? []).map((day) => [day.date, day]),
    );
    for (const previousDay of previousInsertion.evidenceDays ?? []) {
      if (!auditedStatuses.has(previousDay.status)) continue;
      const nextDay = nextByDate.get(previousDay.date);
      if (nextDay && auditedStatuses.has(nextDay.status)) continue;
      regressions.push({
        insertionId: previousInsertion.id,
        date: previousDay.date,
        previousStatus: previousDay.status,
        nextStatus: nextDay?.status ?? "missing",
      });
    }
  }

  return regressions;
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
    .map((item) => ({ fingerprint: String(item.id ?? item.evidenceId ?? item.url ?? ""), date: String(item.date || "") }))
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

export function buildMonthlyDeliveryFingerprint(item) {
  const canonicalPi = canonicalCommercialPi(item?.piCodigo);
  if (!canonicalPi) return null;
  return buildCampaignExportIdempotencyKey({
    piCodigo: canonicalPi,
    siteSigla: item.siteSigla,
    competencia: item.competencia,
    evidences: (item.evidenceDays || []).filter((day) => String(day.status || "").startsWith("audited") && day.url),
  });
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch {
    return false;
  }
}

function monthlyDeliveryKey(item, includePortal = true) {
  const piCodigo = canonicalCommercialPi(item?.piCodigo);
  const competencia = normalizeFilterValue(item?.competencia);
  const siteSigla = normalizeFilterValue(item?.siteSigla);
  return piCodigo && competencia && (!includePortal || siteSigla)
    ? [piCodigo, ...(includePortal ? [siteSigla] : []), competencia].join("\u0000")
    : null;
}

function groupMonthlyDeliveries(items, includePortal) {
  const groups = new Map();
  for (const item of items || []) {
    const key = monthlyDeliveryKey(item, includePortal);
    if (!key) continue;
    const group = groups.get(key) || { key, item: { ...item, evidenceDays: [] }, items: [] };
    group.items.push(item);
    group.item.evidenceDays.push(...(item.evidenceDays || []));
    groups.set(key, group);
  }
  return groups;
}

function monthlyPortalFingerprint(group) {
  return buildMonthlyDeliveryFingerprint(group.item);
}

function reusableHttpsUrl(items, field) {
  const urls = new Set(items.map((item) => String(item?.[field] || "")).filter(isHttpsUrl));
  return urls.size === 1 ? urls.values().next().value : "";
}

export function indexReusableMonthlyDownloads(previousData) {
  const portal = new Map();
  const complete = new Map();
  const insertions = Array.isArray(previousData?.insertions) ? previousData.insertions : [];
  const portalGroups = groupMonthlyDeliveries(insertions, true);
  for (const group of portalGroups.values()) {
    portal.set(group.key, {
      fingerprint: monthlyPortalFingerprint(group),
      url: reusableHttpsUrl(group.items, "batchDownloadUrl"),
    });
  }
  for (const group of groupMonthlyDeliveries(insertions, false).values()) {
    const portalFingerprints = Array.from(groupMonthlyDeliveries(group.items, true).values(), monthlyPortalFingerprint)
      .filter(Boolean)
      .sort();
    complete.set(group.key, {
      fingerprints: JSON.stringify(portalFingerprints),
      url: reusableHttpsUrl(group.items, "completeCampaignDownloadUrl"),
    });
  }
  return { portal, complete };
}

export function reuseMonthlyDownloadUrls(items, previousData) {
  const reusable = indexReusableMonthlyDownloads(previousData);
  const portalGroups = groupMonthlyDeliveries(items, true);
  const portalUrls = new Map();
  for (const group of portalGroups.values()) {
    const previous = reusable.portal.get(group.key);
    portalUrls.set(group.key, previous?.fingerprint === monthlyPortalFingerprint(group) ? previous.url : "");
  }
  const completeUrls = new Map();
  for (const group of groupMonthlyDeliveries(items, false).values()) {
    const fingerprints = Array.from(groupMonthlyDeliveries(group.items, true).values(), monthlyPortalFingerprint)
      .filter(Boolean)
      .sort();
    const previous = reusable.complete.get(group.key);
    completeUrls.set(group.key, previous?.fingerprints === JSON.stringify(fingerprints) ? previous.url : "");
  }
  return (items || []).map((item) => ({
    ...item,
    batchDownloadUrl: portalUrls.get(monthlyDeliveryKey(item, true)) || "",
    completeCampaignDownloadUrl: completeUrls.get(monthlyDeliveryKey(item, false)) || "",
  }));
}

export function shouldMaterializeOptionalMonthlyExports({ scheduled = false, skipRequested = false } = {}) {
  return !skipRequested;
}

export function isScheduledMonthlyReportPayload(payload) {
  const source = String(payload?.source || "");
  return source === "cloudflare-cron-evidence-monthly-report"
    || (source === "macmini-canonical-scheduler" && payload?.routineKind === "evidence-monthly-report");
}

export function isReusableAuditedEvidence(status) {
  const checklist = status?.checklistValidation;
  return status?.status === "audited"
    && status?.hasValidUrl === true
    && status?.isReachable === true
    && checklist?.approved === true
    && checklist?.preliminary !== true
    && checklist?.evidenceStatus === "approved"
    && Array.isArray(checklist?.blockingIssues)
    && checklist.blockingIssues.length === 0;
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
