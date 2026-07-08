import { snapshot } from "../data/snapshot";
const ANALYTICS_SITE_CONFIGS = [
    {
        propertyKey: "afolhalivre-ga4",
        siteSigla: "AFL",
        siteDomain: "afolhalivre.com",
        reportConfigName: "afolhalivre",
        analyticsSource: "ga4",
        recommendedDimensions: ["city"],
        recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
        notes: [
            "A automação atual gera o relatório GA4 em modo Cidade.",
            "O período final segue a janela real da inserção/PI.",
        ],
    },
    {
        propertyKey: "omatogrossense-ga4",
        siteSigla: "OMT",
        siteDomain: "omatogrossense.com",
        reportConfigName: "omatogrossense",
        analyticsSource: "ga4",
        recommendedDimensions: ["city"],
        recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
        notes: [
            "A automação atual gera o relatório GA4 em modo Cidade.",
            "O período final segue a janela real da inserção/PI.",
        ],
    },
    {
        propertyKey: "perrenguemt-ga4",
        siteSigla: "PERRENGUE",
        siteDomain: "perrenguematogrosso.com",
        reportConfigName: "perrenguemt",
        analyticsSource: "ga4",
        recommendedDimensions: ["city"],
        recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
        notes: [
            "A automação atual gera o relatório GA4 em modo Cidade.",
            "O período final segue a janela real da inserção/PI.",
        ],
    },
    {
        propertyKey: "portalnortemt-ga4",
        siteSigla: "PNMT",
        siteDomain: "portalnortemt.com",
        reportConfigName: "portalnortemt",
        analyticsSource: "ga4",
        recommendedDimensions: ["city"],
        recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
        notes: [
            "A automação atual gera o relatório GA4 em modo Cidade.",
            "O período final segue a janela real da inserção/PI.",
        ],
    },
    {
        propertyKey: "portalpantanalmt-ga4",
        siteSigla: "PPMT",
        siteDomain: "portalpantanalmt.com",
        reportConfigName: "portalpantanalmt",
        analyticsSource: "ga4",
        recommendedDimensions: ["city"],
        recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
        notes: [
            "A automação atual gera o relatório GA4 em modo Cidade.",
            "O período final segue a janela real da inserção/PI.",
        ],
    },
    {
        propertyKey: "roonoticias-ga4",
        siteSigla: "ROO",
        siteDomain: "roonoticias.com",
        reportConfigName: "roonoticias",
        analyticsSource: "ga4",
        recommendedDimensions: ["city"],
        recommendedMetrics: ["activeUsers", "engagedSessions", "engagementRate", "userEngagementDuration"],
        notes: [
            "A automação atual gera o relatório GA4 em modo Cidade.",
            "O período final segue a janela real da inserção/PI.",
        ],
    },
];
const json = (data, init = {}) => new Response(JSON.stringify(data), {
    ...init,
    headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
        ...(init.headers || {}),
    },
});
const jsonNoStore = (data, init = {}) => json(data, {
    ...init,
    headers: {
        "cache-control": "no-store",
        ...(init.headers || {}),
    },
});
function nowIso() {
    return new Date().toISOString();
}
function notFound(message = "Not found") {
    return json({ error: message }, { status: 404 });
}
function unauthorized(message = "Unauthorized") {
    return json({ error: "unauthorized", details: message }, { status: 401 });
}
function requestDebugMeta(request) {
    const clientBuild = request.headers.get("x-adops-client-build")?.trim() ?? "";
    const authState = request.headers.get("x-adops-auth-state")?.trim() ?? "";
    return {
        ...(clientBuild ? { clientBuild } : {}),
        ...(authState ? { authState } : {}),
    };
}
function unauthorizedWithCode(code, message, meta) {
    return json({ error: "unauthorized", code, details: message, ...(meta ?? {}) }, { status: 401 });
}
function badRequest(message) {
    return json({ error: "bad_request", details: message }, { status: 400 });
}
function parseJsonSafe(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function resolveAnalyticsSiteConfig(insertion, requestedPropertyKey) {
    const wanted = requestedPropertyKey?.trim().toLowerCase() ?? "";
    const siteSigla = normalizeText(insertion.siteSigla);
    if (wanted) {
        const byProperty = ANALYTICS_SITE_CONFIGS.find((item) => item.propertyKey === wanted);
        if (byProperty)
            return byProperty;
    }
    return ANALYTICS_SITE_CONFIGS.find((item) => normalizeText(item.siteSigla) === siteSigla) ?? null;
}
function requiresAnalyticsForInsertion(insertion) {
    const agency = normalizeText(insertion.agenciaNome);
    const client = normalizeText(insertion.clienteNome);
    const campaign = normalizeText(insertion.campanhaName);
    const notes = normalizeText(insertion.observacoes);
    const pi = normalizeText(insertion.piCodigo);
    return (agency.includes("genius") ||
        (agency.includes("renca") && (client.includes("secom") || campaign.includes("secom") || notes.includes("secom"))) ||
        /\banalytics\b|\bgoogle analytics\b|\bga4\b/.test(`${notes} ${campaign} ${pi}`));
}
function parseIsoDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const parsed = new Date(`${value}T00:00:00-04:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function pad2(value) {
    return String(value).padStart(2, "0");
}
function formatIsoDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function parseCompetenciaMonth(value) {
    const normalized = normalizeText(value).toUpperCase();
    const match = normalized.match(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(\d{4})\b/);
    if (!match)
        return null;
    const months = {
        JANEIRO: 0,
        FEVEREIRO: 1,
        MARCO: 2,
        ABRIL: 3,
        MAIO: 4,
        JUNHO: 5,
        JULHO: 6,
        AGOSTO: 7,
        SETEMBRO: 8,
        OUTUBRO: 9,
        NOVEMBRO: 10,
        DEZEMBRO: 11,
    };
    const month = months[match[1] ?? ""] ?? null;
    const year = Number.parseInt(match[2] ?? "", 10);
    if (month === null || !Number.isFinite(year))
        return null;
    return { year, month };
}
function resolveAnalyticsMonthWindow(insertion) {
    const competenciaMonth = parseCompetenciaMonth(insertion.competencia);
    const base = competenciaMonth
        ? new Date(competenciaMonth.year, competenciaMonth.month, 1)
        : parseIsoDate(insertion.periodoInicio);
    if (!base)
        return { periodStart: insertion.periodoInicio ?? null, periodEnd: insertion.periodoFim ?? null };
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
    const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const today = parseIsoDate(todayInCuiaba());
    const resolvedMonthEnd = today && monthEnd > today ? today : monthEnd;
    return {
        periodStart: formatIsoDate(monthStart),
        periodEnd: formatIsoDate(resolvedMonthEnd),
    };
}
function resolveAnalyticsPeriod(insertion, mode, customStart, customEnd) {
    if (mode === "custom") {
        return {
            periodStart: customStart ?? null,
            periodEnd: customEnd ?? null,
        };
    }
    if (mode === "full_month") {
        return resolveAnalyticsMonthWindow(insertion);
    }
    return {
        periodStart: insertion.periodoInicio ?? null,
        periodEnd: insertion.periodoFim ?? null,
    };
}
function buildAnalyticsRequirements(insertion, siteConfig) {
    const requiresAnalytics = requiresAnalyticsForInsertion(insertion);
    const piPeriod = resolveAnalyticsPeriod(insertion, "pi");
    const monthPeriod = resolveAnalyticsPeriod(insertion, "full_month");
    return {
        insertionId: insertion.id,
        campaignId: insertion.campanhaId ?? null,
        piCodigo: insertion.piCodigo ?? null,
        siteSigla: insertion.siteSigla ?? null,
        requiresAnalytics,
        analyticsSource: siteConfig?.analyticsSource ?? null,
        propertyKey: siteConfig?.propertyKey ?? null,
        periodStart: piPeriod.periodStart,
        periodEnd: piPeriod.periodEnd,
        recommendedDimensions: siteConfig?.recommendedDimensions ?? [],
        recommendedMetrics: siteConfig?.recommendedMetrics ?? [],
        notes: [
            ...(requiresAnalytics
                ? ["A inserção bate em uma regra operacional que pede apoio de Analytics."]
                : ["A regra operacional não marcou Analytics como obrigatório, mas a integração pode ser solicitada se o site suportar GA4."]),
            ...(siteConfig?.notes ?? []),
        ],
        periodOptions: [
            {
                mode: "pi",
                label: "Período da PI",
                description: "Usa exatamente a janela da inserção/PI.",
                periodStart: piPeriod.periodStart,
                periodEnd: piPeriod.periodEnd,
            },
            {
                mode: "full_month",
                label: "Mês completo",
                description: "Usa o mês da competência inteira; se a competência atual ainda estiver em andamento, fecha até hoje.",
                periodStart: monthPeriod.periodStart,
                periodEnd: monthPeriod.periodEnd,
            },
            {
                mode: "custom",
                label: "Período customizado",
                description: "Permite escolher manualmente o início e o fim do relatório.",
                periodStart: null,
                periodEnd: null,
            },
        ],
    };
}
async function fetchPrivateApiJson(env, pathname) {
    const base = env.PRIVATE_ADOPS_API_BASE_URL?.trim();
    if (!base)
        return null;
    const response = await fetch(`${base.replace(/\/$/, "")}${pathname}`, {
        method: "GET",
        headers: {
            "x-adops-api-token": env.PRIVATE_ADOPS_API_TOKEN?.trim() ?? "",
        },
    });
    if (!response.ok)
        return null;
    return (await response.json());
}
function describeJob(record) {
    return {
        id: record.id,
        kind: record.kind,
        status: record.status,
        payload: parseJsonSafe(record.payload_json),
        result: parseJsonSafe(record.result_json),
        error: record.error_text,
        requestedBy: record.requested_by,
        runnerId: record.runner_id,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
    };
}
const JOB_STAGE_LABELS = {
    "print-single": {
        queued: "Na fila",
        ready_for_runner: "Aguardando runner",
        queue_received: "Fila recebida",
        running: "Capturando print",
        capture_started: "Captura iniciada",
        upload_started: "Publicando evidência",
        completed: "Print concluído",
        failed: "Falha no print",
        queue_dispatch_failed: "Falha ao despachar fila",
    },
    "print-backfill": {
        queued: "Na fila",
        ready_for_runner: "Aguardando runner",
        queue_received: "Fila recebida",
        running: "Executando retroativo",
        collecting: "Levantando pendências",
        processing: "Gerando prints pendentes",
        completed: "Retroativo concluído",
        failed: "Falha no retroativo",
        queue_dispatch_failed: "Falha ao despachar fila",
    },
    "print-batch": {
        queued: "Na fila",
        ready_for_runner: "Aguardando runner",
        queue_received: "Fila recebida",
        running: "Processando lote",
        collecting: "Levantando inserções",
        processing: "Capturando prints",
        completed: "Lote concluído",
        failed: "Falha no lote",
        queue_dispatch_failed: "Falha ao despachar fila",
    },
    "sync-planilha": {
        queued: "Na fila",
        ready_for_runner: "Aguardando runner",
        queue_received: "Fila recebida",
        running: "Sincronizando planilha",
        fetch_started: "Lendo planilha",
        applying_updates: "Aplicando ajustes",
        completed: "Sincronização concluída",
        failed: "Falha na sincronização",
        queue_dispatch_failed: "Falha ao despachar fila",
    },
    "analytics-report": {
        queued: "Na fila",
        ready_for_runner: "Aguardando runner",
        queue_received: "Fila recebida",
        running: "Gerando relatório",
        fetch_started: "Coletando métricas",
        rendering: "Montando relatório",
        upload_started: "Publicando arquivo",
        completed: "Relatório concluído",
        failed: "Falha no relatório",
        queue_dispatch_failed: "Falha ao despachar fila",
    },
    "pi-site-export": {
        queued: "Na fila",
        ready_for_runner: "Aguardando runner",
        queue_received: "Fila recebida",
        running: "Gerando pacote PI/site",
        preparing: "Preparando dados",
        compiling: "Montando pacote",
        upload_started: "Publicando pacote",
        completed: "Pacote concluído",
        failed: "Falha no pacote PI/site",
        queue_dispatch_failed: "Falha ao despachar fila",
    },
};
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
function readString(candidates, keys) {
    for (const candidate of candidates) {
        const item = asRecord(candidate);
        if (!item)
            continue;
        for (const key of keys) {
            const value = item[key];
            if (typeof value === "string" && value.trim())
                return value.trim();
        }
    }
    return null;
}
function readNumber(candidates, keys) {
    for (const candidate of candidates) {
        const item = asRecord(candidate);
        if (!item)
            continue;
        for (const key of keys) {
            const value = item[key];
            if (typeof value === "number" && Number.isFinite(value))
                return value;
            if (typeof value === "string" && value.trim()) {
                const parsed = Number(value);
                if (Number.isFinite(parsed))
                    return parsed;
            }
        }
    }
    return null;
}
function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
function titleFromStageKey(stageKey) {
    return stageKey
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
function fallbackStageByStatus(status) {
    if (status === "ready_for_runner")
        return "ready_for_runner";
    return status;
}
function fallbackPercentByStatus(status) {
    if (status === "queued")
        return 0;
    if (status === "ready_for_runner")
        return 5;
    if (status === "running")
        return 50;
    return 100;
}
function resolveStageLabel(kind, stageKey, status) {
    const byKind = JOB_STAGE_LABELS[kind] ?? {};
    const fromStage = byKind[stageKey];
    if (fromStage)
        return fromStage;
    const fromStatus = byKind[status];
    if (fromStatus)
        return fromStatus;
    return titleFromStageKey(stageKey);
}
function computeJobProgress(job) {
    const result = asRecord(job.result);
    const execution = asRecord(result?.execution);
    const progress = asRecord(result?.progress) ?? asRecord(execution?.progress);
    const candidates = [progress, execution, result];
    const stageFromResult = readString(candidates, ["stageKey", "stage", "currentStage", "step", "current_step"]);
    const stageKey = stageFromResult ?? fallbackStageByStatus(job.status);
    const itemsDoneRaw = readNumber(candidates, ["itemsDone", "done", "processed", "completedItems", "countDone"]);
    const itemsTotalRaw = readNumber(candidates, ["itemsTotal", "total", "totalItems", "countTotal"]);
    const itemsDone = Math.max(0, Math.round(itemsDoneRaw ?? 0));
    const itemsTotal = Math.max(0, Math.round(itemsTotalRaw ?? 0));
    let percentTotalRaw = readNumber(candidates, ["percentTotal", "totalPercent", "progress", "overallPercent", "percentage"]);
    let percentStageRaw = readNumber(candidates, ["percentStage", "stagePercent", "stepPercent", "currentPercent"]);
    if (percentTotalRaw === null && itemsTotal > 0) {
        percentTotalRaw = (itemsDone / itemsTotal) * 100;
    }
    if (percentTotalRaw === null) {
        percentTotalRaw = fallbackPercentByStatus(job.status);
    }
    if (percentStageRaw === null) {
        percentStageRaw = percentTotalRaw;
    }
    const startedAt = readString(candidates, ["startedAt", "started_at", "started"]) ?? (job.status === "queued" ? null : job.createdAt);
    const etaSeconds = readNumber(candidates, ["etaSeconds", "eta", "eta_seconds", "remainingSeconds", "estimatedRemainingSeconds"]);
    const runnerId = readString(candidates, ["runnerId", "runner_id"]) ?? job.runnerId ?? null;
    const error = job.error ?? readString(candidates, ["error", "errorText", "message"]);
    return {
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        stageKey,
        stageLabel: resolveStageLabel(job.kind, stageKey, job.status),
        percentStage: clampPercent(percentStageRaw),
        percentTotal: clampPercent(percentTotalRaw),
        itemsDone,
        itemsTotal,
        etaSeconds: etaSeconds === null ? null : Math.max(0, Math.round(etaSeconds)),
        startedAt,
        updatedAt: job.updatedAt,
        runnerId,
        error,
    };
}
function parseScheduledAt(payload) {
    const payloadRecord = asRecord(payload);
    const scheduledAt = typeof payloadRecord?.scheduledAt === "string" ? payloadRecord.scheduledAt : null;
    if (!scheduledAt)
        return null;
    return Number.isNaN(Date.parse(scheduledAt)) ? null : scheduledAt;
}
function toQueueItem(job) {
    return {
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        requestedBy: job.requestedBy ?? null,
        runnerId: job.runnerId ?? null,
        scheduledAt: parseScheduledAt(job.payload),
    };
}
function dateInCuiaba(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Cuiaba",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(parsed);
}
async function getQueueOverview(env) {
    const { results } = await env.adops_ops
        .prepare(`SELECT * FROM ops_jobs WHERE status IN ('running','queued','ready_for_runner') ORDER BY created_at ASC`)
        .all();
    const described = (results ?? []).map(describeJob);
    const running = described.filter((job) => job.status === "running").map(toQueueItem);
    const queue = described.filter((job) => job.status === "queued" || job.status === "ready_for_runner").map(toQueueItem);
    const nowMs = Date.now();
    const scheduled = queue.filter((job) => {
        if (!job.scheduledAt)
            return false;
        const parsed = Date.parse(job.scheduledAt);
        return !Number.isNaN(parsed) && parsed > nowMs;
    });
    const totalsRaw = await env.adops_ops
        .prepare(`SELECT
         SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
         SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN status = 'ready_for_runner' THEN 1 ELSE 0 END) AS ready_for_runner,
         SUM(CASE WHEN status = 'completed' AND date(updated_at, '-04:00') = date('now', '-04:00') THEN 1 ELSE 0 END) AS completed_today,
         SUM(CASE WHEN status = 'failed' AND date(updated_at, '-04:00') = date('now', '-04:00') THEN 1 ELSE 0 END) AS failed_today
       FROM ops_jobs`)
        .first();
    const totals = {
        running: Number(totalsRaw?.running ?? 0) || 0,
        queued: Number(totalsRaw?.queued ?? 0) || 0,
        readyForRunner: Number(totalsRaw?.ready_for_runner ?? 0) || 0,
        completedToday: Number(totalsRaw?.completed_today ?? 0) || 0,
        failedToday: Number(totalsRaw?.failed_today ?? 0) || 0,
    };
    return {
        now: running.at(0) ?? null,
        queue,
        scheduled,
        totals,
    };
}
function notSupported(message) {
    return json({
        error: "not_supported_in_cloudflare_readonly",
        details: message,
        mode: "cloudflare-public-readonly",
    }, { status: 501 });
}
function privateApiEnabled(env) {
    return Boolean(env.PRIVATE_ADOPS_API_BASE_URL?.trim());
}
async function proxyToPrivateApi(request, env, url, options = {}) {
    const base = env.PRIVATE_ADOPS_API_BASE_URL?.trim();
    if (!base) {
        return json({ error: "private_api_unavailable", details: "PRIVATE_ADOPS_API_BASE_URL não configurado no Worker." }, { status: 503 });
    }
    const target = `${base.replace(/\/$/, "")}${url.pathname}${url.search}`;
    const method = request.method.toUpperCase();
    const headers = new Headers();
    headers.set("x-adops-api-token", env.PRIVATE_ADOPS_API_TOKEN?.trim() ?? "");
    const contentType = request.headers.get("content-type");
    if (contentType)
        headers.set("content-type", contentType);
    const init = { method, headers };
    if (!["GET", "HEAD"].includes(method)) {
        init.body = await request.clone().text();
    }
    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("access-control-allow-origin", "*");
    responseHeaders.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
    responseHeaders.set("access-control-allow-headers", "content-type,authorization,x-adops-api-token,x-adops-client-build,x-adops-auth-state");
    if (options.noStore) {
        responseHeaders.set("cache-control", "no-store");
    }
    return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
    });
}
function parseIntParam(value) {
    if (!value)
        return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}
function parseDateMs(value) {
    if (!value)
        return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
}
function getJobAgeMs(record, nowMs = Date.now()) {
    const updated = parseDateMs(record.updated_at);
    const created = parseDateMs(record.created_at);
    const base = updated ?? created ?? nowMs;
    return Math.max(0, nowMs - base);
}
function getJobTimeoutMs(kind, status) {
    if (status === "queued") {
        return kind === "analytics-report" || kind === "pi-site-export" ? 30 * 60_000 : 15 * 60_000;
    }
    if (status === "ready_for_runner") {
        return kind === "analytics-report" || kind === "pi-site-export" ? 30 * 60_000 : 15 * 60_000;
    }
    if (status === "running") {
        return kind === "analytics-report" || kind === "pi-site-export" ? 120 * 60_000 : 30 * 60_000;
    }
    return Number.POSITIVE_INFINITY;
}
function buildWatchdogFailure(record, detectedAt) {
    const ageMinutes = Math.round(getJobAgeMs(record) / 60_000);
    const message = `Watchdog marcou falha automática: ${record.status} excedeu o tempo limite de ${record.kind}.`;
    return {
        error: message,
        result: {
            ok: false,
            watchdog: true,
            previousStatus: record.status,
            detectedAt,
            ageMinutes,
            timeoutMinutes: Math.round(getJobTimeoutMs(record.kind, record.status) / 60_000),
            note: "Job antigo demais para continuar como ativo. Reenvie a operação se ainda for necessária.",
        },
    };
}
function isSettingsProxyPath(path) {
    return (path === "/api/clients" ||
        path === "/api/agencies" ||
        path === "/api/sites" ||
        /^\/api\/clients\/\d+$/.test(path) ||
        /^\/api\/agencies\/\d+$/.test(path) ||
        /^\/api\/sites\/\d+$/.test(path));
}
function bearerToken(request) {
    const header = request.headers.get("authorization") ?? "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() ?? null;
}
function isMissingBearerTokenValue(value) {
    if (!value)
        return true;
    const normalized = value.trim();
    return normalized === "" || normalized === '""' || normalized === "''";
}
function requireOpsAuth(request, env) {
    const expected = env.OPS_API_TOKEN?.trim();
    const debugMeta = requestDebugMeta(request);
    const logUnauthorized = (code, message) => {
        console.warn(JSON.stringify({
            event: "protected_auth_denied",
            code,
            message,
            method: request.method,
            path: new URL(request.url).pathname,
            ...debugMeta,
        }));
    };
    if (!expected) {
        logUnauthorized("ops_api_token_not_configured", "OPS_API_TOKEN não configurado no Worker.");
        return {
            ok: false,
            response: unauthorizedWithCode("ops_api_token_not_configured", "OPS_API_TOKEN não configurado no Worker.", debugMeta),
        };
    }
    const rawHeader = request.headers.get("authorization") ?? "";
    const actual = bearerToken(request);
    if (!rawHeader.trim()) {
        logUnauthorized("missing_operator_token", "Informe o token do operador nesta sessão antes de executar ações operacionais.");
        return {
            ok: false,
            response: unauthorizedWithCode("missing_operator_token", "Informe o token do operador nesta sessão antes de executar ações operacionais.", debugMeta),
        };
    }
    if (isMissingBearerTokenValue(actual)) {
        logUnauthorized("missing_operator_token", "O header Authorization chegou vazio. Recarregue a sessão e cole novamente o token do operador.");
        return {
            ok: false,
            response: unauthorizedWithCode("missing_operator_token", "O header Authorization chegou vazio. Recarregue a sessão e cole novamente o token do operador.", debugMeta),
        };
    }
    if (actual !== expected) {
        logUnauthorized("invalid_operator_token", "O token do operador é inválido para esta ação operacional.");
        return {
            ok: false,
            response: unauthorizedWithCode("invalid_operator_token", "O token do operador é inválido para esta ação operacional.", debugMeta),
        };
    }
    return { ok: true };
}
async function readBody(request) {
    try {
        return (await request.json());
    }
    catch {
        return {};
    }
}
async function createOpsJob(env, kind, payload, requestedBy) {
    const id = crypto.randomUUID();
    const now = nowIso();
    await env.adops_ops
        .prepare(`INSERT INTO ops_jobs (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, NULL, NULL, ?, NULL, ?, ?)`)
        .bind(id, kind, JSON.stringify(payload), requestedBy, now, now)
        .run();
    try {
        await env.adops_ops_queue.send({ jobId: id, kind });
    }
    catch (error) {
        const queueError = error instanceof Error ? error.message : String(error);
        console.error("[ops_jobs] queue dispatch failed", { id, kind, queueError });
        await env.adops_ops
            .prepare(`UPDATE ops_jobs SET status = 'ready_for_runner', result_json = ?, updated_at = ? WHERE id = ?`)
            .bind(JSON.stringify({ stage: "queue_dispatch_failed", queueError }), nowIso(), id)
            .run();
    }
    return id;
}
async function listOpsJobsByFilter(env, { limit = 20, statuses, kinds, olderThanMinutes, }) {
    const where = [];
    const binds = [];
    if (statuses?.length) {
        where.push(`status IN (${statuses.map(() => "?").join(",")})`);
        binds.push(...statuses);
    }
    if (kinds?.length) {
        where.push(`kind IN (${kinds.map(() => "?").join(",")})`);
        binds.push(...kinds);
    }
    const sql = [
        "SELECT * FROM ops_jobs",
        where.length ? `WHERE ${where.join(" AND ")}` : "",
        "ORDER BY created_at DESC LIMIT ?",
    ].filter(Boolean).join(" ");
    binds.push(Math.min(limit, 200));
    const { results } = await env.adops_ops.prepare(sql).bind(...binds).all();
    const items = (results ?? []);
    if (!olderThanMinutes || olderThanMinutes <= 0) {
        return items.map(describeJob);
    }
    const thresholdMs = olderThanMinutes * 60_000;
    return items
        .filter((record) => getJobAgeMs(record) >= thresholdMs)
        .map(describeJob);
}
async function runOpsJobWatchdog(env, options = {}) {
    const dryRun = Boolean(options.dryRun);
    const limit = Math.min(options.limit ?? 200, 500);
    const statuses = ["queued", "ready_for_runner", "running"];
    const { results } = await env.adops_ops
        .prepare(`SELECT * FROM ops_jobs WHERE status IN ('queued','ready_for_runner','running') ORDER BY created_at ASC LIMIT ?`)
        .bind(limit)
        .all();
    const now = nowIso();
    const stale = (results ?? []).filter((record) => getJobAgeMs(record) >= getJobTimeoutMs(record.kind, record.status));
    const staleItems = stale.map((record) => ({
        id: record.id,
        kind: record.kind,
        status: record.status,
        ageMinutes: Math.round(getJobAgeMs(record) / 60_000),
        requestedBy: record.requested_by,
        runnerId: record.runner_id,
    }));
    if (dryRun || !stale.length) {
        return {
            ok: true,
            dryRun,
            checked: (results ?? []).length,
            staleCount: stale.length,
            failedCount: 0,
            stale: staleItems,
        };
    }
    for (const record of stale) {
        const failure = buildWatchdogFailure(record, now);
        await updateOpsJob(env, record.id, {
            status: "failed",
            error: failure.error,
            result: failure.result,
            runnerId: record.runner_id,
        });
    }
    return {
        ok: true,
        dryRun,
        checked: (results ?? []).length,
        staleCount: stale.length,
        failedCount: stale.length,
        stale: staleItems,
    };
}
async function listAnalyticsJobsForInsertion(env, insertionId, limit = 20) {
    const { results } = await env.adops_ops
        .prepare(`SELECT * FROM ops_jobs
       WHERE kind = 'analytics-report'
         AND CAST(json_extract(payload_json, '$.insertionId') AS INTEGER) = ?
       ORDER BY created_at DESC
       LIMIT ?`)
        .bind(insertionId, Math.min(limit, 100))
        .all();
    return (results ?? []).map(describeJob);
}
async function getAnalyticsJob(env, id) {
    const item = await env.adops_ops
        .prepare(`SELECT * FROM ops_jobs WHERE id = ? AND kind = 'analytics-report' LIMIT 1`)
        .bind(id)
        .first();
    return item ? describeJob(item) : null;
}
async function getPiSiteExportJob(env, id) {
    const item = await env.adops_ops
        .prepare(`SELECT * FROM ops_jobs WHERE id = ? AND kind = 'pi-site-export' LIMIT 1`)
        .bind(id)
        .first();
    return item ? describeJob(item) : null;
}
function piSiteExportJobFromOpsJob(job) {
    const payload = (job.payload ?? {});
    const result = (job.result ?? {});
    const execution = ((result.execution ?? result) || {});
    return {
        id: job.id,
        kind: "pi-site-export",
        status: job.status,
        stage: typeof execution.stage === "string" ? execution.stage : typeof result.stage === "string" ? result.stage : null,
        piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
        siteSigla: typeof payload.siteSigla === "string" ? payload.siteSigla : null,
        insertionIds: Array.isArray(execution.insertionIds)
            ? execution.insertionIds
            : Array.isArray(payload.insertionIds)
                ? payload.insertionIds
                : [],
        invalidatedEvidenceIds: Array.isArray(execution.invalidatedEvidenceIds) ? execution.invalidatedEvidenceIds : [],
        regeneratedDates: Array.isArray(execution.regeneratedDates) ? execution.regeneratedDates : [],
        analyticsPiStatus: execution.analyticsPiStatus ?? null,
        analyticsFullMonthStatus: execution.analyticsFullMonthStatus ?? null,
        downloadUrl: typeof execution.downloadUrl === "string" ? execution.downloadUrl : null,
        error: job.error ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        result: job.result,
    };
}
async function deleteAnalyticsJob(env, id) {
    const existing = await env.adops_ops
        .prepare(`SELECT * FROM ops_jobs WHERE id = ? AND kind = 'analytics-report' LIMIT 1`)
        .bind(id)
        .first();
    if (!existing)
        return false;
    await env.adops_ops
        .prepare(`DELETE FROM ops_jobs WHERE id = ? AND kind = 'analytics-report'`)
        .bind(id)
        .run();
    return true;
}
function reportFromAnalyticsJob(job) {
    const payload = (job.payload ?? {});
    const result = (job.result ?? {});
    const execution = ((result.execution ?? result) || {});
    const downloadUrl = typeof execution.downloadUrl === "string" ? execution.downloadUrl : null;
    const previewUrl = typeof execution.previewUrl === "string" ? execution.previewUrl : downloadUrl;
    let fileName = typeof execution.fileName === "string" ? execution.fileName : null;
    if (downloadUrl) {
        try {
            const pathname = new URL(downloadUrl).pathname;
            const parts = pathname.split("/").filter(Boolean);
            fileName = fileName || parts.at(-1) || null;
        }
        catch {
            fileName = fileName || null;
        }
    }
    return {
        id: job.id,
        kind: "ga4",
        propertyKey: typeof payload.propertyKey === "string" ? payload.propertyKey : null,
        campaignName: typeof payload.campaignName === "string" ? payload.campaignName : null,
        clientName: typeof payload.clientName === "string" ? payload.clientName : null,
        piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
        periodStart: typeof payload.periodStart === "string" ? payload.periodStart : null,
        periodEnd: typeof payload.periodEnd === "string" ? payload.periodEnd : null,
        periodMode: typeof payload.periodMode === "string" ? payload.periodMode : "pi",
        dimensions: Array.isArray(payload.dimensions) ? payload.dimensions : [],
        metrics: Array.isArray(payload.metrics) ? payload.metrics : [],
        status: job.status,
        downloadUrl,
        previewUrl,
        fileName,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}
function isAnalyticsRoute(path) {
    return (/^\/api\/analytics\/insertions\/\d+\/requirements$/.test(path) ||
        /^\/api\/analytics\/insertions\/\d+\/reports$/.test(path) ||
        /^\/api\/analytics\/jobs\/[^/]+$/.test(path) ||
        /^\/api\/analytics\/reports\/[^/]+\/download$/.test(path) ||
        /^\/api\/analytics\/reports\/[^/]+$/.test(path) ||
        path === "/api/analytics/jobs/request-report");
}
async function getInsertionContext(env, insertionId) {
    const privateItem = await fetchPrivateApiJson(env, `/api/insertions/${insertionId}`);
    if (privateItem)
        return privateItem;
    const item = snapshot.insertionDetails[String(insertionId)];
    return item ?? null;
}
async function updateOpsJob(env, id, patch) {
    const current = await env.adops_ops.prepare(`SELECT * FROM ops_jobs WHERE id = ? LIMIT 1`).bind(id).first();
    if (!current)
        return null;
    const status = patch.status ?? current.status;
    const resultJson = patch.result === undefined ? current.result_json : JSON.stringify(patch.result);
    const errorText = patch.error === undefined ? current.error_text : patch.error;
    const runnerId = patch.runnerId === undefined ? current.runner_id : patch.runnerId;
    const updatedAt = nowIso();
    await env.adops_ops
        .prepare(`UPDATE ops_jobs SET status = ?, result_json = ?, error_text = ?, runner_id = ?, updated_at = ? WHERE id = ?`)
        .bind(status, resultJson, errorText, runnerId, updatedAt, id)
        .run();
    return env.adops_ops.prepare(`SELECT * FROM ops_jobs WHERE id = ? LIMIT 1`).bind(id).first();
}
async function listOpsJobs(env, limit = 20) {
    const { results } = await env.adops_ops.prepare(`SELECT * FROM ops_jobs ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
    return (results ?? []).map(describeJob);
}
async function getOpsJob(env, id) {
    const item = await env.adops_ops.prepare(`SELECT * FROM ops_jobs WHERE id = ? LIMIT 1`).bind(id).first();
    return item ? describeJob(item) : null;
}
async function claimNextOpsJob(env, kinds, runnerId) {
    const placeholders = kinds?.length ? kinds.map(() => "?").join(",") : "";
    const sql = kinds?.length
        ? `SELECT * FROM ops_jobs WHERE status = 'ready_for_runner' AND kind IN (${placeholders}) ORDER BY created_at ASC LIMIT 1`
        : `SELECT * FROM ops_jobs WHERE status = 'ready_for_runner' ORDER BY created_at ASC LIMIT 1`;
    const statement = env.adops_ops.prepare(sql);
    const row = await statement.bind(...(kinds ?? [])).first();
    if (!row)
        return null;
    return updateOpsJob(env, row.id, { status: "running", runnerId, error: null });
}
function todayInCuiaba() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Cuiaba",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}
function computeDelay(ins) {
    if (ins.processoEnviadoAgencia)
        return false;
    if (["concluido", "cancelado"].includes(ins.statusNormalizado))
        return false;
    if (!ins.periodoFim)
        return false;
    const due = new Date(`${ins.periodoFim}T23:59:59-04:00`);
    due.setDate(due.getDate() + 1);
    return due.getTime() < Date.now();
}
function filterCampaigns(url) {
    const competencia = url.searchParams.get("competencia");
    const clienteId = parseIntParam(url.searchParams.get("clienteId"));
    const agenciaId = parseIntParam(url.searchParams.get("agenciaId"));
    return snapshot.campaigns.filter((item) => {
        if (competencia && item.competencia !== competencia)
            return false;
        if (clienteId && item.clienteId !== clienteId)
            return false;
        if (agenciaId && item.agenciaId !== agenciaId)
            return false;
        return true;
    });
}
function filterInsertions(url) {
    const competencia = url.searchParams.get("competencia");
    const siteId = parseIntParam(url.searchParams.get("siteId"));
    const clienteId = parseIntParam(url.searchParams.get("clienteId"));
    const agenciaId = parseIntParam(url.searchParams.get("agenciaId"));
    const status = url.searchParams.get("status");
    const atrasado = url.searchParams.get("atrasado") === "true";
    return snapshot.insertions.filter((item) => {
        if (competencia && item.competencia !== competencia)
            return false;
        if (siteId && item.siteId !== siteId)
            return false;
        if (clienteId && item.clienteId !== clienteId)
            return false;
        if (agenciaId && item.agenciaId !== agenciaId)
            return false;
        if (status && item.statusNormalizado !== status)
            return false;
        if (atrasado && !item.atrasado)
            return false;
        return true;
    });
}
function dashboardSummary(competencia) {
    if (competencia && snapshot.dashboards[competencia]) {
        return snapshot.dashboards[competencia].summary;
    }
    const items = snapshot.insertions;
    const campaigns = snapshot.campaigns;
    return {
        totalInsercoes: items.length,
        ativas: items.filter((i) => !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
        concluidas: items.filter((i) => i.statusNormalizado === "concluido").length,
        atrasadas: items.filter((i) => computeDelay(i)).length,
        aguardandoPublicacao: items.filter((i) => !i.bannerPublicadoNoSite && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
        aguardandoPrint: items.filter((i) => i.bannerPublicadoNoSite && !i.printGerado && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
        aguardandoEnvio: items.filter((i) => i.printGerado && !i.processoEnviadoAgencia && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
        aguardandoDocs: items.filter((i) => i.processoEnviadoAgencia && !i.docsEnviados && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
        valorTotalLiquido: campaigns.reduce((acc, item) => acc + Number(item.valorLiquido || 0), 0),
        totalCampanhas: campaigns.length,
    };
}
function getInsertionDetail(insertionId) {
    return snapshot.insertionDetails[String(insertionId)] ?? null;
}
function getEvidenceDateKey(title) {
    if (!title)
        return null;
    const match = title.match(/Print\s+(\d{4}-\d{2}-\d{2})/i);
    return match?.[1] ?? null;
}
function getEvidenceForDate(detail, date) {
    return detail?.evidences?.find((item) => getEvidenceDateKey(item?.titulo) === date) ?? null;
}
function getStoredCaptureStatus(insertionId, date) {
    return snapshot.captureStatuses[`${insertionId}:${date}`] ?? null;
}
function isInsertionEligibleOnDate(item, date) {
    if (["concluido", "cancelado"].includes(item.statusNormalizado))
        return false;
    if (!item.periodoInicio || !item.periodoFim)
        return false;
    return date >= item.periodoInicio && date <= item.periodoFim;
}
function buildMissingCaptureStatus(item, detail, date) {
    const evidence = getEvidenceForDate(detail, date);
    const hasMedia = Boolean(item.mediaUrl);
    const inPeriod = isInsertionEligibleOnDate(item, date);
    return {
        insertionId: item.id,
        date,
        inPeriod,
        hasMedia,
        hasEvidenceForDate: Boolean(evidence),
        hasValidUrl: false,
        isReachable: false,
        urlStatus: null,
        arquivoUrl: evidence?.arquivoUrl ?? null,
        audit: null,
        status: "missing",
    };
}
function getCaptureStatusForDate(item, date) {
    const stored = getStoredCaptureStatus(item.id, date);
    if (stored)
        return stored;
    const detail = getInsertionDetail(item.id);
    return buildMissingCaptureStatus(item, detail, date);
}
function normalizeAuditStatus(status) {
    if (status === "audited")
        return "ok";
    if (status === "invalid_audit")
        return "invalid_audit";
    if (status === "invalid_url")
        return "invalid_url";
    return "missing";
}
function buildAuditSummary(url) {
    const targetDate = url.searchParams.get("date") || todayInCuiaba();
    const eligible = filterInsertions(url).filter((item) => item.bannerPublicadoNoSite && isInsertionEligibleOnDate(item, targetDate) && item.mediaUrl);
    const items = eligible.map((item) => {
        const status = getCaptureStatusForDate(item, targetDate);
        return {
            insertionId: item.id,
            targetDate,
            campaignName: item.campanhaName,
            siteSigla: item.siteSigla,
            periodoInicio: item.periodoInicio,
            periodoFim: item.periodoFim,
            hasEvidenceForDate: Boolean(status.hasEvidenceForDate),
            hasValidUrl: Boolean(status.hasValidUrl),
            isReachable: Boolean(status.isReachable),
            urlStatus: status.urlStatus ?? null,
            arquivoUrl: status.arquivoUrl ?? null,
            audit: status.audit ?? null,
            status: normalizeAuditStatus(String(status.status ?? "missing")),
        };
    });
    return {
        date: targetDate,
        totalEligible: items.length,
        ok: items.filter((item) => item.status === "ok").length,
        missing: items.filter((item) => item.status === "missing").length,
        invalid: items.filter((item) => item.status === "invalid_audit" || item.status === "invalid_url").length,
        items,
    };
}
function buildAuditFailures(url) {
    const filters = filterInsertions(url).filter((item) => item.bannerPublicadoNoSite);
    const allowedIds = new Set(filters.map((item) => item.id));
    const items = Object.values(snapshot.captureStatuses)
        .filter(Boolean)
        .filter((status) => ["invalid_audit", "invalid_url"].includes(status.status))
        .filter((status) => allowedIds.has(status.insertionId))
        .map((status) => {
        const item = filters.find((entry) => entry.id === status.insertionId);
        return item
            ? {
                insertionId: item.id,
                campaignName: item.campanhaName,
                siteSigla: item.siteSigla,
                clienteNome: item.clienteNome,
                agenciaNome: item.agenciaNome,
                competencia: item.competencia,
                localFormato: item.localFormato,
                targetDate: status.date,
                arquivoUrl: status.arquivoUrl ?? null,
                status: status.status,
                audit: status.audit ?? null,
            }
            : null;
    })
        .filter(Boolean)
        .sort((a, b) => `${a.insertionId}:${a.targetDate}`.localeCompare(`${b.insertionId}:${b.targetDate}`));
    return {
        totalFailures: items.length,
        invalidAudit: items.filter((item) => item.status === "invalid_audit").length,
        invalidUrl: items.filter((item) => item.status === "invalid_url").length,
        items,
    };
}
function formatDateOffset(base, offsetDays) {
    const d = new Date(base);
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function buildBackfillPreview(url) {
    const insertionId = parseIntParam(url.searchParams.get("insertionId"));
    const yesterday = formatDateOffset(new Date(`${todayInCuiaba()}T00:00:00-04:00`), -1);
    const source = filterInsertions(url).filter((item) => !insertionId || item.id === insertionId);
    const grouped = source
        .map((item) => {
        const missingDates = [];
        if (!item.periodoInicio || !item.periodoFim || !item.mediaUrl) {
            return { insertionId: item.id, campaignName: item.campanhaName, siteSigla: item.siteSigla, localFormato: item.localFormato, totalMissing: 0, sampleDates: [] };
        }
        let cursor = item.periodoInicio;
        while (cursor <= item.periodoFim && cursor <= yesterday) {
            const status = getCaptureStatusForDate(item, cursor);
            if (status.status === "missing")
                missingDates.push(cursor);
            const next = new Date(`${cursor}T00:00:00-04:00`);
            next.setDate(next.getDate() + 1);
            cursor = next.toISOString().slice(0, 10);
        }
        return {
            insertionId: item.id,
            campaignName: item.campanhaName,
            siteSigla: item.siteSigla,
            localFormato: item.localFormato,
            totalMissing: missingDates.length,
            sampleDates: missingDates.slice(0, 5),
        };
    })
        .filter((item) => item.totalMissing > 0)
        .sort((a, b) => b.totalMissing - a.totalMissing);
    return {
        totalCandidates: grouped.length,
        totalJobs: grouped.reduce((acc, item) => acc + item.totalMissing, 0),
        totalSkipped: 0,
        grouped,
    };
}
function buildBackfillPreviewFromRequest(body) {
    const previewUrl = new URL("https://adops-api-public.local/api/insertions/capture-proof/backfill-overdue/preview");
    if (body.competencia)
        previewUrl.searchParams.set("competencia", body.competencia);
    if (body.siteId)
        previewUrl.searchParams.set("siteId", String(body.siteId));
    if (body.insertionId)
        previewUrl.searchParams.set("insertionId", String(body.insertionId));
    return buildBackfillPreview(previewUrl);
}
function describeLegacyBackfillJob(job) {
    const payload = (job.payload ?? {});
    const result = (job.result ?? {});
    const grouped = Array.isArray(payload.previewGrouped) ? payload.previewGrouped : [];
    const skipped = Array.isArray(payload.previewSkipped) ? payload.previewSkipped : [];
    const totalCandidates = typeof payload.previewTotalCandidates === "number" ? payload.previewTotalCandidates : grouped.length;
    const totalJobs = typeof payload.previewTotalJobs === "number" ? payload.previewTotalJobs : 0;
    const totalSkipped = typeof payload.previewTotalSkipped === "number" ? payload.previewTotalSkipped : skipped.length;
    const results = Array.isArray(result.results) ? result.results : [];
    const generated = typeof result.generated === "number" ? result.generated : results.filter((item) => item && typeof item === "object" && item.status === "ok").length;
    const errors = typeof result.errors === "number" ? result.errors : results.filter((item) => item && typeof item === "object" && item.status === "error").length;
    return {
        id: job.id,
        status: job.status,
        competencia: typeof payload.competencia === "string" ? payload.competencia : null,
        siteId: typeof payload.siteId === "number" ? payload.siteId : null,
        insertionId: typeof payload.insertionId === "number" ? payload.insertionId : null,
        totalCandidates,
        totalJobs,
        totalSkipped,
        generated,
        errors,
        skipped,
        grouped,
        results,
        current: typeof result.stage === "string" ? result.stage : null,
        runnerId: job.runnerId ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error ?? null,
    };
}
function emptySyncDiagnostics() {
    return {
        invalidDates: [],
        competenciaMismatch: [],
        campaignReview: [],
        summary: {
            invalidDates: 0,
            competenciaMismatch: 0,
            safeCampaignUpdates: 0,
            needsManualReview: 0,
        },
    };
}
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, "") || "/";
        const analyticsRoute = isAnalyticsRoute(path);
        const publicInsertionBackfillRoute = request.method === "POST" && path === "/api/insertions/capture-proof/backfill-overdue/jobs";
        const publicSingleCaptureMatch = request.method === "POST" ? path.match(/^\/api\/insertions\/(\d+)\/capture-proof$/) : null;
        const publicOperationalDocumentsRoute = (request.method === "POST" && /^\/api\/insertions\/\d+\/operational-documents\/regenerate$/.test(path)) ||
            (request.method === "DELETE" && /^\/api\/insertions\/\d+\/operational-documents\/[^/]+$/.test(path));
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "access-control-allow-origin": "*",
                    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
                    "access-control-allow-headers": "content-type,authorization,x-adops-api-token,x-adops-client-build,x-adops-auth-state",
                },
            });
        }
        if (["POST", "PATCH", "DELETE"].includes(request.method)) {
            if (isSettingsProxyPath(path)) {
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
                return json({ error: "private_api_unavailable", details: "As configurações dependem da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
            }
            if (!path.startsWith("/api/ops/") && path !== "/api/pi-site-exports/jobs" && !analyticsRoute && !isSettingsProxyPath(path) && !publicInsertionBackfillRoute && !publicSingleCaptureMatch && !publicOperationalDocumentsRoute) {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
            }
        }
        if (request.method === "POST") {
            if (publicOperationalDocumentsRoute) {
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
                return json({ error: "private_api_unavailable", details: "Os documentos operacionais dependem da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
            }
            if (path === "/api/insertions/capture-proof/batch" ||
                path === "/api/sync/planilha/latest" ||
                path === "/api/sync/competencia/apply-safe" ||
                /^\/api\/insertions\/\d+\/capture-proof\/fix-invalid$/.test(path) ||
                /^\/api\/insertions\/\d+\/evidences$/.test(path) ||
                /^\/api\/evidences\/\d+$/.test(path)) {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
                return json({ error: "private_api_unavailable", details: "A mutação protegida depende da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
            }
            if (path === "/api/ops/jobs/print-batch") {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const jobId = await createOpsJob(env, "print-batch", {
                    competencia: typeof body.competencia === "string" ? body.competencia : null,
                    siteId: typeof body.siteId === "number" ? body.siteId : null,
                    date: typeof body.date === "string" ? body.date : null,
                    captureAt: typeof body.captureAt === "string" ? body.captureAt : null,
                    source: "cloudflare-protected-api",
                }, "ops-api");
                return json({ ok: true, jobId, kind: "print-batch", status: "queued" }, { status: 202 });
            }
            if (path === "/api/ops/jobs/print-backfill") {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const jobId = await createOpsJob(env, "print-backfill", {
                    competencia: typeof body.competencia === "string" ? body.competencia : null,
                    siteId: typeof body.siteId === "number" ? body.siteId : null,
                    insertionId: typeof body.insertionId === "number" ? body.insertionId : null,
                    source: "cloudflare-protected-api",
                }, "ops-api");
                return json({ ok: true, jobId, kind: "print-backfill", status: "queued" }, { status: 202 });
            }
            if (path === "/api/ops/jobs/print-single") {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const insertionId = typeof body.insertionId === "number" ? body.insertionId : null;
                if (!insertionId)
                    return badRequest("Informe insertionId para gerar o print individual.");
                const jobId = await createOpsJob(env, "print-single", {
                    insertionId,
                    date: typeof body.date === "string" ? body.date : null,
                    captureAt: typeof body.captureAt === "string" ? body.captureAt : null,
                    replace: typeof body.replace === "boolean" ? body.replace : false,
                    force: typeof body.force === "boolean" ? body.force : false,
                    source: "cloudflare-protected-api",
                }, "ops-api");
                return json({ ok: true, jobId, kind: "print-single", status: "queued" }, { status: 202 });
            }
            if (path === "/api/ops/jobs/watchdog") {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const result = await runOpsJobWatchdog(env, {
                    dryRun: typeof body.dryRun === "boolean" ? body.dryRun : false,
                    limit: typeof body.limit === "number" ? body.limit : 200,
                });
                return jsonNoStore(result);
            }
            if (path === "/api/ops/jobs/sync-planilha") {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const jobId = await createOpsJob(env, "sync-planilha", {
                    mode: typeof body.mode === "string" ? body.mode : "latest",
                    campaignIds: Array.isArray(body.campaignIds) ? body.campaignIds : null,
                    source: "cloudflare-protected-api",
                }, "ops-api");
                return json({ ok: true, jobId, kind: "sync-planilha", status: "queued" }, { status: 202 });
            }
            if (path === "/api/analytics/jobs/request-report") {
                const body = await readBody(request);
                const insertionId = typeof body.insertionId === "number" ? body.insertionId : parseIntParam(String(body.insertionId ?? ""));
                if (!insertionId)
                    return badRequest("Informe insertionId para solicitar o relatório de Analytics.");
                const insertion = await getInsertionContext(env, insertionId);
                if (!insertion)
                    return notFound("Insertion not found");
                const siteConfig = resolveAnalyticsSiteConfig(insertion, typeof body.propertyKey === "string" ? body.propertyKey : null);
                if (!siteConfig) {
                    return badRequest("O site desta inserção ainda não possui configuração de Analytics por API.");
                }
                const requirements = buildAnalyticsRequirements(insertion, siteConfig);
                const requestedMode = typeof body.periodMode === "string" ? body.periodMode : "pi";
                const periodMode = ["pi", "full_month", "custom"].includes(requestedMode) ? requestedMode : "pi";
                const customPeriodStart = typeof body.customPeriodStart === "string" ? body.customPeriodStart : null;
                const customPeriodEnd = typeof body.customPeriodEnd === "string" ? body.customPeriodEnd : null;
                const resolvedPeriod = resolveAnalyticsPeriod(insertion, periodMode, customPeriodStart, customPeriodEnd);
                if (!resolvedPeriod.periodStart || !resolvedPeriod.periodEnd) {
                    return badRequest("A inserção não possui período suficiente para gerar o relatório.");
                }
                if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedPeriod.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedPeriod.periodEnd)) {
                    return badRequest("O período informado para Analytics está inválido.");
                }
                if (resolvedPeriod.periodStart > resolvedPeriod.periodEnd) {
                    return badRequest("A data inicial do relatório não pode ser maior que a data final.");
                }
                const payload = {
                    campaignId: insertion.campanhaId ?? null,
                    campaignName: insertion.campanhaName ?? null,
                    insertionId: insertion.id,
                    piCodigo: insertion.piCodigo ?? null,
                    siteSigla: insertion.siteSigla ?? null,
                    siteNome: insertion.siteNome ?? null,
                    clientName: insertion.clienteNome ?? null,
                    agencyName: insertion.agenciaNome ?? null,
                    propertyKey: siteConfig.propertyKey,
                    reportConfigName: siteConfig.reportConfigName,
                    periodMode,
                    periodStart: resolvedPeriod.periodStart,
                    periodEnd: resolvedPeriod.periodEnd,
                    dimensions: requirements.recommendedDimensions,
                    metrics: requirements.recommendedMetrics,
                    requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "adops-ui-public",
                    source: typeof body.source === "string" ? body.source : "cloudflare-pages-public",
                    analyticsSource: requirements.analyticsSource,
                    notes: requirements.notes,
                };
                const jobId = await createOpsJob(env, "analytics-report", payload, payload.requestedBy);
                return jsonNoStore({ ok: true, jobId, status: "queued", payload }, { status: 202 });
            }
            if (path === "/api/pi-site-exports/jobs") {
                const body = await readBody(request);
                const piCodigo = typeof body.piCodigo === "string" ? body.piCodigo.trim() : "";
                const siteSigla = typeof body.siteSigla === "string" ? body.siteSigla.trim().toUpperCase() : "";
                if (!piCodigo || !siteSigla) {
                    return badRequest("Informe piCodigo e siteSigla para gerar o pacote PI/site.");
                }
                const jobId = await createOpsJob(env, "pi-site-export", {
                    piCodigo,
                    siteSigla,
                    requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "adops-public-api",
                    source: typeof body.source === "string" ? body.source : "cloudflare-public-api",
                }, typeof body.requestedBy === "string" ? body.requestedBy : "adops-public-api");
                return jsonNoStore({
                    ok: true,
                    jobId,
                    kind: "pi-site-export",
                    status: "queued",
                    piCodigo,
                    siteSigla,
                }, { status: 202 });
            }
            if (path === "/api/insertions/capture-proof/backfill-overdue/jobs") {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                try {
                    const body = await readBody(request.clone());
                    const insertionId = typeof body.insertionId === "number" ? body.insertionId : parseIntParam(String(body.insertionId ?? ""));
                    if (!insertionId) {
                        return notSupported("O lote amplo de retroativos continua protegido no Cloudflare. Para o Pages público, esta rota agora aceita apenas retroativo por inserção.");
                    }
                    if (privateApiEnabled(env)) {
                        return proxyToPrivateApi(request, env, url, { noStore: true });
                    }
                    const payload = {
                        competencia: typeof body.competencia === "string" ? body.competencia : null,
                        siteId: typeof body.siteId === "number" ? body.siteId : null,
                        insertionId,
                        source: typeof body.source === "string" ? body.source : "cloudflare-pages-public",
                        requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "insertion-detail-public",
                    };
                    const preview = buildBackfillPreviewFromRequest(payload);
                    const jobId = await createOpsJob(env, "print-backfill", {
                        ...payload,
                        previewTotalCandidates: preview.totalCandidates,
                        previewTotalJobs: preview.totalJobs,
                        previewTotalSkipped: preview.totalSkipped,
                        previewGrouped: preview.grouped,
                        previewSkipped: [],
                    }, payload.requestedBy);
                    return jsonNoStore({
                        ok: true,
                        jobId,
                        status: "queued",
                        preview: {
                            totalCandidates: preview.totalCandidates,
                            totalJobs: preview.totalJobs,
                            totalSkipped: preview.totalSkipped,
                            grouped: preview.grouped,
                        },
                    }, { status: 202 });
                }
                catch (error) {
                    const details = error instanceof Error ? error.message : String(error);
                    console.error("[backfill-overdue/jobs] failed", { details });
                    return jsonNoStore({ error: "internal_error", details: "Falha ao enfileirar retroativos vencidos para a inserção.", cause: details }, { status: 500 });
                }
            }
            if (publicSingleCaptureMatch) {
                const body = await readBody(request);
                const insertionId = Number.parseInt(publicSingleCaptureMatch[1] ?? "", 10);
                if (!insertionId) {
                    return badRequest("Informe insertionId para gerar o print individual.");
                }
                const requestedBy = typeof body.requestedBy === "string" ? body.requestedBy : "insertion-detail-public";
                const captureAt = typeof body.captureAt === "string" ? body.captureAt : null;
                const date = typeof body.date === "string" ? body.date : captureAt && /^\d{4}-\d{2}-\d{2}/.test(captureAt) ? captureAt.slice(0, 10) : null;
                const jobId = await createOpsJob(env, "print-single", {
                    insertionId,
                    date,
                    captureAt,
                    replace: typeof body.replace === "boolean" ? body.replace : false,
                    force: typeof body.force === "boolean" ? body.force : false,
                    source: typeof body.source === "string" ? body.source : "cloudflare-pages-public",
                }, requestedBy);
                return jsonNoStore({ ok: true, jobId, kind: "print-single", status: "queued" }, { status: 202 });
            }
            if (path === "/api/ops/runner/claim-next") {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const requestedKinds = Array.isArray(body.kinds)
                    ? body.kinds.filter((item) => ["print-batch", "print-backfill", "print-single", "sync-planilha", "analytics-report", "pi-site-export"].includes(String(item)))
                    : null;
                const runnerId = typeof body.runnerId === "string" ? body.runnerId : null;
                const job = await claimNextOpsJob(env, requestedKinds?.length ? requestedKinds : null, runnerId);
                return json({ ok: true, job: job ? describeJob(job) : null });
            }
            const completeMatch = path.match(/^\/api\/ops\/runner\/jobs\/([^/]+)\/complete$/);
            if (completeMatch) {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const updated = await updateOpsJob(env, completeMatch[1], {
                    status: "completed",
                    result: body.result ?? { ok: true },
                    error: null,
                    runnerId: typeof body.runnerId === "string" ? body.runnerId : undefined,
                });
                return updated ? json({ ok: true, job: describeJob(updated) }) : notFound("Job not found");
            }
            const progressMatch = path.match(/^\/api\/ops\/runner\/jobs\/([^/]+)\/progress$/);
            if (progressMatch) {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const updated = await updateOpsJob(env, progressMatch[1], {
                    result: body.result ?? null,
                    runnerId: typeof body.runnerId === "string" ? body.runnerId : undefined,
                });
                return updated ? json({ ok: true, job: describeJob(updated) }) : notFound("Job not found");
            }
            const failMatch = path.match(/^\/api\/ops\/runner\/jobs\/([^/]+)\/fail$/);
            if (failMatch) {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                const body = await readBody(request);
                const updated = await updateOpsJob(env, failMatch[1], {
                    status: "failed",
                    result: body.result ?? null,
                    error: typeof body.error === "string" ? body.error : "Runner reportou falha sem detalhe.",
                    runnerId: typeof body.runnerId === "string" ? body.runnerId : undefined,
                });
                return updated ? json({ ok: true, job: describeJob(updated) }) : notFound("Job not found");
            }
            if (path === "/api/clients" ||
                path === "/api/agencies" ||
                path === "/api/sites" ||
                /^\/api\/clients\/\d+$/.test(path) ||
                /^\/api\/agencies\/\d+$/.test(path) ||
                /^\/api\/sites\/\d+$/.test(path)) {
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
                return json({ error: "private_api_unavailable", details: "As configurações dependem da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
            }
            return notFound();
        }
        if (request.method === "PATCH") {
            if (/^\/api\/evidences\/\d+$/.test(path)) {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
                return json({ error: "private_api_unavailable", details: "A edição da evidência depende da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
            }
            return notFound();
        }
        if (request.method === "DELETE") {
            if (publicOperationalDocumentsRoute) {
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
                return json({ error: "private_api_unavailable", details: "Os documentos operacionais dependem da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
            }
            const analyticsReportMatch = path.match(/^\/api\/analytics\/reports\/([^/]+)$/);
            if (analyticsReportMatch) {
                const deleted = await deleteAnalyticsJob(env, analyticsReportMatch[1]);
                return deleted ? jsonNoStore({ ok: true, id: analyticsReportMatch[1] }) : notFound("Analytics report not found");
            }
            if (/^\/api\/evidences\/\d+$/.test(path)) {
                const auth = requireOpsAuth(request, env);
                if (!auth.ok)
                    return auth.response;
                if (privateApiEnabled(env)) {
                    return proxyToPrivateApi(request, env, url, { noStore: true });
                }
                return json({ error: "private_api_unavailable", details: "A exclusão da evidência depende da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
            }
            return notFound();
        }
        if (request.method === "GET" &&
            !path.startsWith("/api/ops/") &&
            path !== "/api/healthz" &&
            !analyticsRoute &&
            !/^\/api\/pi-site-exports\/jobs\/[^/]+(?:\/download)?$/.test(path) &&
            !/^\/api\/insertions\/capture-proof\/backfill-overdue\/jobs\/[^/]+$/.test(path) &&
            privateApiEnabled(env)) {
            return proxyToPrivateApi(request, env, url, { noStore: true });
        }
        if (request.method !== "GET") {
            return notFound();
        }
        if (path === "/api/healthz")
            return json({ status: "ok", mode: privateApiEnabled(env) ? "cloudflare-public-live-proxy" : "cloudflare-public-readonly", generatedAt: snapshot.generatedAt, opsApiAvailable: true, privateApiEnabled: privateApiEnabled(env) });
        const analyticsRequirementsMatch = path.match(/^\/api\/analytics\/insertions\/(\d+)\/requirements$/);
        if (analyticsRequirementsMatch) {
            const insertionId = Number.parseInt(analyticsRequirementsMatch[1] ?? "", 10);
            const insertion = await getInsertionContext(env, insertionId);
            if (!insertion)
                return notFound("Insertion not found");
            const siteConfig = resolveAnalyticsSiteConfig(insertion, null);
            return jsonNoStore(buildAnalyticsRequirements(insertion, siteConfig));
        }
        if (path === "/api/analytics/jobs/request-report") {
            return badRequest("Use POST para solicitar um relatório de Analytics.");
        }
        const analyticsJobMatch = path.match(/^\/api\/analytics\/jobs\/([^/]+)$/);
        if (analyticsJobMatch) {
            const job = await getAnalyticsJob(env, analyticsJobMatch[1]);
            if (!job)
                return notFound("Analytics job not found");
            const payload = (job.payload ?? {});
            return jsonNoStore({
                id: job.id,
                status: job.status,
                kind: "analytics-report",
                campaignId: typeof payload.campaignId === "number" ? payload.campaignId : null,
                insertionId: typeof payload.insertionId === "number" ? payload.insertionId : null,
                piCodigo: typeof payload.piCodigo === "string" ? payload.piCodigo : null,
                siteSigla: typeof payload.siteSigla === "string" ? payload.siteSigla : null,
                result: job.result,
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
            });
        }
        const analyticsReportsMatch = path.match(/^\/api\/analytics\/insertions\/(\d+)\/reports$/);
        if (analyticsReportsMatch) {
            const insertionId = Number.parseInt(analyticsReportsMatch[1] ?? "", 10);
            const reports = await listAnalyticsJobsForInsertion(env, insertionId, 50);
            return jsonNoStore({
                insertionId,
                reports: reports.map(reportFromAnalyticsJob),
            });
        }
        const analyticsDownloadMatch = path.match(/^\/api\/analytics\/reports\/([^/]+)\/download$/);
        if (analyticsDownloadMatch) {
            const job = await getAnalyticsJob(env, analyticsDownloadMatch[1]);
            if (!job)
                return notFound("Analytics report not found");
            const report = reportFromAnalyticsJob(job);
            if (!report.downloadUrl) {
                return jsonNoStore({ error: "report_not_ready", details: "O relatório ainda não possui artefato publicado para download." }, { status: 409 });
            }
            return Response.redirect(report.downloadUrl, 302);
        }
        const piSiteExportJobMatch = path.match(/^\/api\/pi-site-exports\/jobs\/([^/]+)$/);
        if (piSiteExportJobMatch) {
            const job = await getPiSiteExportJob(env, piSiteExportJobMatch[1]);
            if (!job)
                return notFound("PI/site export job not found");
            return jsonNoStore(piSiteExportJobFromOpsJob(job));
        }
        const piSiteExportDownloadMatch = path.match(/^\/api\/pi-site-exports\/jobs\/([^/]+)\/download$/);
        if (piSiteExportDownloadMatch) {
            const job = await getPiSiteExportJob(env, piSiteExportDownloadMatch[1]);
            if (!job)
                return notFound("PI/site export job not found");
            const payload = piSiteExportJobFromOpsJob(job);
            if (payload.status !== "completed" || !payload.downloadUrl) {
                return jsonNoStore({
                    error: "export_not_ready",
                    details: "O pacote PI/site ainda não terminou de ser montado.",
                    job: payload,
                }, { status: 409 });
            }
            return Response.redirect(payload.downloadUrl, 302);
        }
        if (path === "/api/ops/jobs") {
            const limit = Math.min(parseIntParam(url.searchParams.get("limit")) ?? 20, 100);
            const statuses = (url.searchParams.get("status") ?? "")
                .split(",")
                .map((item) => item.trim())
                .filter((item) => ["queued", "ready_for_runner", "running", "completed", "failed"].includes(item));
            const kinds = (url.searchParams.get("kind") ?? "")
                .split(",")
                .map((item) => item.trim())
                .filter((item) => ["print-batch", "print-backfill", "print-single", "sync-planilha", "analytics-report", "pi-site-export"].includes(item));
            const olderThanMinutes = parseIntParam(url.searchParams.get("olderThanMinutes"));
            return jsonNoStore({
                items: await listOpsJobsByFilter(env, {
                    limit,
                    statuses: statuses.length ? statuses : null,
                    kinds: kinds.length ? kinds : null,
                    olderThanMinutes,
                }),
            });
        }
        if (path === "/api/ops/queue/overview") {
            return jsonNoStore(await getQueueOverview(env));
        }
        const opsJobProgressMatch = path.match(/^\/api\/ops\/jobs\/([^/]+)\/progress$/);
        if (opsJobProgressMatch) {
            const job = await getOpsJob(env, opsJobProgressMatch[1]);
            return job ? jsonNoStore(computeJobProgress(job)) : notFound("Job not found");
        }
        const opsJobMatch = path.match(/^\/api\/ops\/jobs\/([^/]+)$/);
        if (opsJobMatch) {
            const job = await getOpsJob(env, opsJobMatch[1]);
            return job ? jsonNoStore(job) : notFound("Job not found");
        }
        const opsJobLogMatch = path.match(/^\/api\/ops\/jobs\/([^/]+)\/log$/);
        if (opsJobLogMatch) {
            const job = await getOpsJob(env, opsJobLogMatch[1]);
            if (!job)
                return notFound("Job not found");
            const directResult = job.result;
            const nestedCapture = directResult?.capture;
            const nestedExecution = directResult?.execution;
            const nestedExecutionCapture = nestedExecution?.capture;
            const captureLogId = typeof directResult?.captureLogId === "string"
                ? directResult.captureLogId
                : typeof nestedCapture?.captureLogId === "string"
                    ? nestedCapture.captureLogId
                    : typeof nestedExecutionCapture?.captureLogId === "string"
                        ? nestedExecutionCapture.captureLogId
                        : null;
            if (!captureLogId) {
                return jsonNoStore({
                    error: "capture_log_not_found",
                    details: "Este job ainda não publicou um log estruturado de captura.",
                    job,
                }, { status: 404 });
            }
            if (!privateApiEnabled(env)) {
                return json({ error: "private_api_unavailable", details: "O detalhamento do log depende da API principal hospedada e ela não está configurada neste Worker." }, { status: 503, headers: { "cache-control": "no-store" } });
            }
            const privateUrl = new URL(`${request.url}`);
            privateUrl.pathname = `/api/capture-proof-logs/${encodeURIComponent(captureLogId)}`;
            privateUrl.search = "";
            return proxyToPrivateApi(request, env, privateUrl, { noStore: true });
        }
        if (path === "/api/sites")
            return json(snapshot.sites);
        if (path === "/api/clients")
            return json(snapshot.clients);
        if (path === "/api/agencies")
            return json(snapshot.agencies);
        if (path === "/api/campaigns")
            return json(filterCampaigns(url));
        if (path === "/api/insertions")
            return json(filterInsertions(url));
        if (path === "/api/dashboard/summary")
            return json(dashboardSummary(url.searchParams.get("competencia")));
        if (path === "/api/dashboard/by-site") {
            const competencia = url.searchParams.get("competencia");
            return json(competencia && snapshot.dashboards[competencia]
                ? snapshot.dashboards[competencia].bySite
                : snapshot.sites.map((site) => ({
                    siteId: site.id,
                    siteNome: site.nome,
                    siteSigla: site.sigla,
                    total: snapshot.insertions.filter((i) => i.siteId === site.id).length,
                    ativas: snapshot.insertions.filter((i) => i.siteId === site.id && !["concluido", "cancelado"].includes(i.statusNormalizado)).length,
                    concluidas: snapshot.insertions.filter((i) => i.siteId === site.id && i.statusNormalizado === "concluido").length,
                    atrasadas: snapshot.insertions.filter((i) => i.siteId === site.id && computeDelay(i)).length,
                })));
        }
        if (path === "/api/dashboard/by-client") {
            const competencia = url.searchParams.get("competencia");
            return json(competencia && snapshot.dashboards[competencia]
                ? snapshot.dashboards[competencia].byClient
                : []);
        }
        if (path === "/api/dashboard/by-competencia")
            return json(snapshot.byCompetencia);
        if (path === "/api/dashboard/critical") {
            const competencia = url.searchParams.get("competencia");
            return json(competencia && snapshot.dashboards[competencia]
                ? snapshot.dashboards[competencia].critical
                : []);
        }
        if (path === "/api/insertions/capture-proof/audit")
            return json(buildAuditSummary(url));
        if (path === "/api/insertions/capture-proof/audit/failures")
            return json(buildAuditFailures(url));
        if (path === "/api/insertions/capture-proof/backfill-overdue/preview") {
            if (privateApiEnabled(env)) {
                return proxyToPrivateApi(request, env, url, { noStore: true });
            }
            return json(buildBackfillPreview(url));
        }
        if (path === "/api/sync/planilha/diagnostics")
            return json(snapshot.syncDiagnostics ?? emptySyncDiagnostics());
        if (path === "/api/sync/planilha/preview") {
            return snapshot.syncPreview
                ? json(snapshot.syncPreview)
                : notSupported("O preview completo da planilha ainda não foi incluído no snapshot público. Use a leitura pública já publicada e o sync operacional continua na camada privada enquanto a migração é concluída.");
        }
        const campaignMatch = path.match(/^\/api\/campaigns\/(\d+)$/);
        if (campaignMatch) {
            const item = snapshot.campaignDetails[campaignMatch[1]];
            return item ? json(item) : notFound("Campaign not found");
        }
        const insertionMatch = path.match(/^\/api\/insertions\/(\d+)$/);
        if (insertionMatch) {
            if (privateApiEnabled(env)) {
                return proxyToPrivateApi(request, env, url, { noStore: true });
            }
            const item = snapshot.insertionDetails[insertionMatch[1]];
            return item ? json(item) : notFound("Insertion not found");
        }
        const relationMatch = path.match(/^\/api\/integrations\/adrotate\/insertions\/(\d+)\/relation$/);
        if (relationMatch) {
            const item = snapshot.relations?.[relationMatch[1]] ?? null;
            return item ? json(item) : notFound("Relação com AdRotate não encontrada.");
        }
        const captureStatusMatch = path.match(/^\/api\/insertions\/(\d+)\/capture-proof\/status$/);
        if (captureStatusMatch) {
            if (privateApiEnabled(env)) {
                return proxyToPrivateApi(request, env, url, { noStore: true });
            }
            const insertionId = Number(captureStatusMatch[1]);
            const date = url.searchParams.get("date") || todayInCuiaba();
            const item = snapshot.insertions.find((entry) => entry.id === insertionId);
            if (!item)
                return notFound("Insertion not found");
            return json(getCaptureStatusForDate(item, date));
        }
        const captureLogsMatch = path.match(/^\/api\/insertions\/(\d+)\/capture-proof\/logs$/);
        if (captureLogsMatch) {
            if (privateApiEnabled(env)) {
                return proxyToPrivateApi(request, env, url, { noStore: true });
            }
            return json({ error: "private_api_unavailable", details: "Os logs de captura dependem da API principal hospedada e ela não está configurada neste Worker." }, { status: 503, headers: { "cache-control": "no-store" } });
        }
        const captureProofLogMatch = path.match(/^\/api\/capture-proof-logs\/([^/]+)$/);
        if (captureProofLogMatch) {
            if (privateApiEnabled(env)) {
                return proxyToPrivateApi(request, env, url, { noStore: true });
            }
            return json({ error: "private_api_unavailable", details: "Os logs de captura dependem da API principal hospedada e ela não está configurada neste Worker." }, { status: 503, headers: { "cache-control": "no-store" } });
        }
        const plannedMatch = path === "/api/integrations/adrotate/planned";
        if (plannedMatch) {
            const competencia = url.searchParams.get("competencia") ?? "";
            const siteSigla = url.searchParams.get("siteSigla") ?? "";
            return json((snapshot.adrotatePlanned?.[`${competencia}|||${siteSigla}`] ?? []));
        }
        const livePreviewMatch = path === "/api/integrations/adrotate/live-preview";
        if (livePreviewMatch) {
            const siteSigla = url.searchParams.get("siteSigla") ?? "";
            const payload = snapshot.adrotateLivePreview?.[siteSigla] ?? null;
            return payload ? json(payload) : notFound("Prévia pública do site não encontrada.");
        }
        const zipExportMatch = path.match(/^\/api\/insertions\/(\d+)\/evidences\/export\.zip$/);
        if (zipExportMatch) {
            if (privateApiEnabled(env)) {
                return proxyToPrivateApi(request, env, url, { noStore: true });
            }
            return json({ error: "private_api_unavailable", details: "A exportação de ZIP depende da API principal hospedada e ela não está configurada neste Worker." }, { status: 503 });
        }
        if (path === "/api/pi-site-exports") {
            if (privateApiEnabled(env)) {
                return proxyToPrivateApi(request, env, url, { noStore: true });
            }
            return json({ error: "private_api_unavailable", details: "A exportação consolidada por PI/site depende da API principal hospedada e ela não está configurada neste Worker." }, { status: 503, headers: { "cache-control": "no-store" } });
        }
        const backfillJobMatch = path.match(/^\/api\/insertions\/capture-proof\/backfill-overdue\/jobs\/([^/]+)$/);
        if (backfillJobMatch) {
            const job = await getOpsJob(env, backfillJobMatch[1]);
            if (!job || job.kind !== "print-backfill")
                return notFound("Lote não encontrado.");
            return jsonNoStore(describeLegacyBackfillJob(job));
        }
        return notFound();
    },
    async queue(batch, env) {
        for (const message of batch.messages) {
            const body = message.body;
            if (!body?.jobId) {
                message.ack();
                continue;
            }
            await updateOpsJob(env, body.jobId, {
                status: "ready_for_runner",
                result: {
                    stage: "queue_received",
                    note: "Job aceito no Cloudflare e aguardando runner remoto para claim.",
                    queuedAt: nowIso(),
                },
                error: null,
            });
            message.ack();
        }
    },
};
