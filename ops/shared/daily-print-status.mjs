const TIME_ZONE = "America/Cuiaba";
const DAILY_SOURCE = "cloudflare-cron-daily-print";

function dateInCuiaba(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function nextRunAt(now) {
  const date = dateInCuiaba(now);
  let candidate = new Date(`${date}T18:00:00-04:00`);
  if (candidate.getTime() <= now.getTime()) candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  return candidate.toISOString();
}

function safeCounts(job) {
  const result = job?.result && typeof job.result === "object" ? job.result : {};
  const direct = result.canonicalAudit && typeof result.canonicalAudit === "object" ? result.canonicalAudit : result.audit;
  if (direct && typeof direct === "object") {
    return {
      expected: Number(direct.expected ?? result.totalCandidates ?? direct.totalEligible ?? 0),
      approved: Number(direct.approved ?? direct.ok ?? 0),
      missing: Number(direct.missing ?? 0),
      invalid: Number(direct.invalid ?? 0),
    };
  }
  const error = String(job?.error || "");
  const prefix = "daily_print_audit_incomplete:";
  const index = error.indexOf(prefix);
  if (index < 0) return null;
  try {
    const parsed = JSON.parse(error.slice(index + prefix.length));
    return {
      expected: Number(parsed.expectedTotal ?? 0),
      approved: Number(parsed.ok ?? 0),
      missing: Number(parsed.missing ?? 0),
      invalid: Number(parsed.invalid ?? 0),
    };
  } catch {
    return null;
  }
}

function summarize(counts, status) {
  if (["queued", "ready_for_runner"].includes(status)) return "A rotina está na fila e ainda não começou a gerar os prints.";
  if (status === "running") return "A rotina está gerando e conferindo os prints agora.";
  if (!counts || counts.expected <= 0) return status === "completed"
    ? "A rotina terminou, mas o resumo canônico da auditoria não está disponível."
    : "A rotina falhou antes de concluir a auditoria das campanhas.";
  if (counts.approved === counts.expected && counts.missing === 0 && counts.invalid === 0) return `${counts.approved} de ${counts.expected} inserções tiveram o print aprovado.`;
  const pending = Math.max(0, counts.expected - counts.approved);
  return `${counts.approved} de ${counts.expected} inserções tiveram o print aprovado; ${pending} ${pending === 1 ? "precisa" : "precisam"} de nova tentativa.`;
}

export function buildDailyPrintStatus({ jobs = [], now = new Date(), targetDate = null } = {}) {
  const dailyJobs = (Array.isArray(jobs) ? jobs : [])
    .filter((job) => job?.payload?.source === DAILY_SOURCE && /^\d{4}-\d{2}-\d{2}$/.test(String(job?.payload?.date || "")))
    .sort((left, right) => Date.parse(right.createdAt || right.updatedAt || 0) - Date.parse(left.createdAt || left.updatedAt || 0));
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(targetDate || "")) ? String(targetDate) : null;
  const latest = (requestedDate
    ? dailyJobs.filter((job) => String(job.payload.date) === requestedDate)
    : dailyJobs)[0] ?? null;
  const counts = latest ? safeCounts(latest) : null;
  const rawStatus = String(latest?.status || "");
  const terminal = ["completed", "failed"].includes(rawStatus);
  const full = Boolean(terminal && counts && counts.expected > 0 && counts.approved === counts.expected && counts.missing === 0 && counts.invalid === 0);
  const displayStatus = ["queued", "ready_for_runner"].includes(rawStatus)
    ? "queued"
    : rawStatus === "running"
      ? "running"
      : full
        ? "completed"
        : counts && counts.approved > 0
          ? "partial"
          : "failed";
  const lastAttempt = latest ? {
    jobId: String(latest.id),
    targetDate: String(latest.payload.date),
    status: displayStatus,
    startedAt: latest.startedAt ?? latest.createdAt ?? null,
    finishedAt: ["completed", "failed"].includes(String(latest.status)) ? latest.updatedAt ?? null : null,
    expected: counts?.expected ?? 0,
    approved: counts?.approved ?? 0,
    missing: counts?.missing ?? 0,
    invalid: counts?.invalid ?? 0,
    summary: summarize(counts, String(latest.status)),
  } : null;
  const approvedJob = dailyJobs.find((job) => {
    const item = safeCounts(job);
    return ["completed", "failed"].includes(String(job.status))
      && item && item.expected > 0 && item.approved === item.expected && item.missing === 0 && item.invalid === 0;
  });
  return {
    timeZone: TIME_ZONE,
    schedule: "18:00",
    nextRunAt: nextRunAt(now),
    ...(requestedDate ? { requestedDate } : {}),
    lastAttempt,
    lastFullyApproved: approvedJob ? { targetDate: approvedJob.payload.date, finishedAt: approvedJob.updatedAt ?? null } : null,
  };
}
