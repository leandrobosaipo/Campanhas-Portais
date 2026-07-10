import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetInsertion, useUpdateInsertion, useCreateEvidence, useListInsertions,
  getListInsertionsQueryKey, getGetInsertionQueryKey,
} from "@workspace/api-client-react";
import type { InsertionDetail as InsertionDetailData } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { StatusBadge, DelayBadge } from "@/components/adops/StatusBadge";
import { CaptureProofButton } from "@/components/adops/CaptureProofButton";
import { ArrowLeft, Plus, Trash2, Check, Image, ExternalLink, AlertTriangle, Clock3, PlayCircle, FileText, RefreshCw } from "lucide-react";
import { addDays, eachDayOfInterval, endOfDay, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/api-base";
import { EVIDENCE_STATUS_META, getMediaKind, INSERTION_MEDIA_OVERRIDES, SITE_LOGOS, STATUS_LABELS, STATUS_META } from "@/lib/adops-config";
import { getOperationalProfileSummary, getOperationalStageGuides, getOperationalToneMeta, resolveOperationalProfile } from "@/lib/adops-requirements";
import { formatInsertionPeriodCompact, formatInsertionPeriodLong } from "@/lib/insertion-period";
import { useApiMode } from "@/lib/use-api-mode";
import { useOpsOperator } from "@/lib/useOpsOperator";

type AdrotateRelation = {
  insertionId: number;
  campaignName: string | null;
  competencia: string | null;
  siteSigla: string | null;
  localFormato: string | null;
  positionLabel: string | null;
  pageLabel: string | null;
  adrotateGroupId: number | null;
  mediaUrl: string | null;
  mediaBasename: string | null;
  plannedSelf: {
    insertionId: number;
    adrotateGroupId: number | null;
    mediaBasename: string | null;
  } | null;
  historicalAdminMatches: Array<{
    adId: number;
    title: string | null;
    groupId: number;
    adopsInsertionId: number | null;
    adopsExternalKey: string | null;
    adopsMediaBasename: string | null;
    adminEditUrl: string | null;
  }>;
  exactLiveMatches: Array<{
    pageUrl: string;
    adminEditUrl: string | null;
    groupId: number;
    adId: number;
    mediaUrl: string | null;
    mediaBasename: string | null;
  }>;
  fallbackCandidates: Array<{
    insertionId: number;
    campaignId: number;
    campaignName: string | null;
    adrotateGroupId: number | null;
    mediaBasename: string | null;
    mediaUrl: string | null;
    liveMatches: Array<{
      pageUrl: string;
      adminEditUrl: string | null;
      groupId: number;
      adId: number;
      mediaUrl: string | null;
      mediaBasename: string | null;
    }>;
  }>;
};

type CaptureAuditStatus = {
  insertionId: number;
  date: string;
  status: "audited" | "audited_best_effort" | "invalid_audit" | "invalid_url" | "missing";
  arquivoUrl: string | null;
  audit?: {
    requestedCaptureAt?: string | null;
    systemDateTime?: string;
    pageDateText?: string;
    isVideoCapture?: boolean;
    desktopMatches?: boolean;
    pageMatches?: boolean;
    playerProofOk?: boolean;
    visualsOk?: boolean;
    playerProof?: {
      ok?: boolean;
      currentTime?: number;
      duration?: number;
      controlsVisible?: boolean;
      progressVisible?: boolean;
      playResolved?: boolean;
    };
    visualAudit?: {
      viewportImagesTotal?: number;
      viewportImagesLoaded?: number;
      slotImagesTotal?: number;
      slotImagesLoaded?: number;
      viewportBackgroundsTotal?: number;
      viewportBackgroundsLoaded?: number;
      viewportVideosTotal?: number;
      viewportVideosLoaded?: number;
      frameSelectionMode?: string | null;
      gifSourceUrl?: string | null;
      gifChosenFrameIndex?: number | null;
      gifChosenDurationMs?: number | null;
      frameSelectionDowngraded?: boolean;
      frameSelectionDowngradeReason?: string | null;
    };
    issues?: Array<{ code: string; label: string; detail: string }>;
  } | null;
};

type AnalyticsRequirementsPayload = {
  insertionId: number;
  campaignId: number | null;
  piCodigo: string | null;
  siteSigla: string | null;
  requiresAnalytics: boolean;
  analyticsSource: string | null;
  propertyKey: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  recommendedDimensions: string[];
  recommendedMetrics: string[];
  notes: string[];
  periodOptions: Array<{
    mode: "pi" | "full_month" | "custom";
    label: string;
    description: string;
    periodStart: string | null;
    periodEnd: string | null;
  }>;
};

type AnalyticsReportItem = {
  id: string;
  kind: string;
  propertyKey: string | null;
  campaignName?: string | null;
  clientName?: string | null;
  piCodigo?: string | null;
  periodMode?: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dimensions: string[];
  metrics: string[];
  status: string;
  downloadUrl: string | null;
  previewUrl: string | null;
  fileName?: string | null;
  createdAt: string;
  updatedAt: string;
};

type AnalyticsJobPayload = {
  id: string;
  status: string;
  kind: string;
  campaignId: number | null;
  insertionId: number | null;
  piCodigo: string | null;
  siteSigla?: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type CaptureProofStage = {
  stage: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  summary?: Record<string, unknown>;
  errorCode?: string | null;
  errorDetail?: string | null;
};

type CaptureProofLogItem = {
  id: string;
  insertionId: number;
  targetDate: string;
  jobId: string | null;
  runnerJobId: string | null;
  captureAt: string | null;
  siteSigla: string | null;
  status: string;
  uploadedUrl: string | null;
  cacheBustedUrl: string | null;
  frameSelectionMode: string | null;
  frameSelectionDowngraded: boolean;
  probableCause: string | null;
  confidence: number | null;
  nextAction: string | null;
  summary: Record<string, unknown>;
  stages: CaptureProofStage[];
  artifacts: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string | null;
  updatedAt: string | null;
};

type CaptureProofLogsPayload = {
  insertionId: number;
  date: string;
  latest: CaptureProofLogItem | null;
  attempts: CaptureProofLogItem[];
};

type OperationalDocumentItem = {
  kind: "declaracao-execucao" | "anexo-v";
  title: string;
  description: string;
  docxFileName: string;
  pdfFileName: string;
  placeholders: string[];
  downloadDocxUrl: string;
  downloadPdfUrl: string;
  previewDocxUrl: string;
  previewPdfUrl: string;
};

type OperationalDocumentsPayload = {
  insertionId: number;
  generatedAt: string;
  documents: OperationalDocumentItem[];
};

async function fetchRelation(id: number): Promise<AdrotateRelation> {
  const response = await apiFetch(`/api/integrations/adrotate/insertions/${id}/relation`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar relação com AdRotate.");
  return payload;
}

async function fetchOperationalDocuments(id: number): Promise<OperationalDocumentsPayload> {
  const response = await apiFetch(`/api/insertions/${id}/operational-documents`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar os documentos operacionais.");
  return payload;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd MMM yyyy", { locale: ptBR }); } catch { return s; }
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return s; }
}

const STATUS_SEQUENCE = [
  "rascunho", "aguardando_publicacao", "publicado_no_site",
  "print_gerado", "enviado_para_agencia", "docs_enviados", "concluido",
];

type EvidencePlanItem = {
  key: string;
  title: string;
  dateLabel: string;
  dueDate: Date;
  evidenceId: number | null;
  url: string;
  status: "concluido" | "pendente" | "atrasado";
};

function parseDateOnly(s: string | null | undefined) {
  if (!s) return null;
  const parsed = new Date(`${s}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractGoogleDriveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([^/]+)/,
    /[?&]id=([^&]+)/,
    /\/d\/([^/]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function getPreviewUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const driveId = extractGoogleDriveFileId(url);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w1200`;
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url)) return url;
  return null;
}

function formatPlayerSeconds(value: number | null | undefined) {
  const safe = Math.max(0, Math.floor(Number(value ?? 0)));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getAuditIssueCodes(audit: CaptureAuditStatus["audit"]) {
  return Array.isArray(audit?.issues)
    ? audit.issues.map((issue) => issue?.code).filter(Boolean)
    : [];
}

function getAuditCauseBadges(audit: CaptureAuditStatus["audit"]) {
  const codes = new Set(getAuditIssueCodes(audit));
  const labels: string[] = [];
  if (codes.has("capture_metadata_missing")) labels.push("Legado sem metadata");
  if (codes.has("slot_frame_illegible")) labels.push("Banner ilegível");
  if (codes.has("slot_frame_unstable")) labels.push("Frame em transição");
  if (codes.has("desktop_time_mismatch") || codes.has("page_time_mismatch")) labels.push("Horário divergente");
  if (
    codes.has("viewport_images_incomplete") ||
    codes.has("slot_images_incomplete") ||
    codes.has("viewport_backgrounds_incomplete") ||
    codes.has("viewport_videos_incomplete")
  ) labels.push("Carregamento incompleto");
  if (codes.has("video_player_proof_incomplete")) labels.push("Player incompleto");
  return labels;
}

function describeOperationalCaptureError(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "Não consegui gerar a evidência.";
  const normalized = text.replace(/^Command failed:\s*/i, "").trim();
  if (normalized.includes("capture_legibility_failed:")) {
    return normalized.replace("capture_legibility_failed:", "Banner sem leitura suficiente:").trim();
  }
  return normalized;
}

function isValidEvidenceUrl(url: string) {
  return /^https?:\/\/\S+/i.test(url.trim());
}

function formatDayLabel(date: Date) {
  return format(date, "dd/MM/yyyy (EEE)", { locale: ptBR });
}

function getDayEvidenceTitle(date: Date) {
  return `Print ${format(date, "yyyy-MM-dd")} - ${formatDayLabel(date)}`;
}

function getEvidenceDateKey(title: string | null | undefined) {
  if (!title) return null;
  const match = title.match(/Print\s+(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getDayEvidencePlan(insertion: InsertionDetailData): EvidencePlanItem[] {
  const start = parseDateOnly(insertion.periodoInicio);
  const end = parseDateOnly(insertion.periodoFim);
  if (!start || !end || end < start) return [];

  const today = startOfDay(new Date());
  return eachDayOfInterval({ start, end }).map((date) => {
    const title = getDayEvidenceTitle(date);
    const dateKey = format(date, "yyyy-MM-dd");
    const matched = insertion.evidences?.find((evidence) =>
      evidence.titulo === title || getEvidenceDateKey(evidence.titulo) === dateKey
    ) ?? null;
    const hasValidUrl = isValidEvidenceUrl(matched?.arquivoUrl ?? "");
    const status: EvidencePlanItem["status"] =
      hasValidUrl ? "concluido" : endOfDay(date) < today ? "atrasado" : "pendente";

    return {
      key: format(date, "yyyy-MM-dd"),
      title,
      dateLabel: formatDayLabel(date),
      dueDate: endOfDay(date),
      evidenceId: matched?.id ?? null,
      url: matched?.arquivoUrl ?? "",
      status,
    };
  });
}

async function fetchCaptureAuditStatus(insertionId: number, date: string): Promise<CaptureAuditStatus> {
  const response = await apiFetch(`/api/insertions/${insertionId}/capture-proof/status?date=${encodeURIComponent(date)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui conferir a evidência.");
  return payload;
}

async function fetchAnalyticsRequirements(insertionId: number): Promise<AnalyticsRequirementsPayload> {
  const response = await apiFetch(`/api/analytics/insertions/${insertionId}/requirements`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar requisitos de Analytics.");
  return payload;
}

async function fetchAnalyticsReports(insertionId: number): Promise<AnalyticsReportItem[]> {
  const response = await apiFetch(`/api/analytics/insertions/${insertionId}/reports`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar relatórios de Analytics.");
  return Array.isArray(payload?.reports) ? payload.reports : [];
}

async function fetchAnalyticsJob(jobId: string): Promise<AnalyticsJobPayload> {
  const response = await apiFetch(`/api/analytics/jobs/${encodeURIComponent(jobId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar job de Analytics.");
  return payload;
}

async function fetchCaptureProofLogs(insertionId: number, date: string): Promise<CaptureProofLogsPayload> {
  const response = await apiFetch(`/api/insertions/${insertionId}/capture-proof/logs?date=${encodeURIComponent(date)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui carregar o histórico da evidência.");
  return payload;
}

function formatProbableCauseLabel(value: string | null | undefined) {
  switch (value) {
    case "creative_not_found":
      return "Banner não encontrado";
    case "placeholder_only":
      return "Apenas placeholder";
    case "slot_without_useful_content":
      return "Slot sem conteúdo útil";
    case "compose_mismatch":
      return "Banner sumiu na composição";
    case "upload_or_cache_mismatch":
      return "Divergência entre local e publicado";
    case "slot_visibility_partial":
      return "Slot parcial no viewport";
    default:
      return value || "Sem causa provável";
  }
}

export function InsertionDetail() {
  const {
    isReadonlyPublic,
    isCloudflarePublic,
    readonlyMessage,
    canRunProtectedMutations,
    protectedMutationMessage,
  } = useApiMode();
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { token, setToken, hasToken } = useOpsOperator();

  const { data: insertion, isLoading, refetch: refetchInsertion } = useGetInsertion(numId, {
    query: { queryKey: getGetInsertionQueryKey(numId), enabled: !!numId },
  });
  const { data: relatedInsertions } = useListInsertions(
    insertion?.campanhaId ? { campanhaId: insertion.campanhaId, competencia: insertion.competencia ?? undefined } as any : undefined,
    { query: { queryKey: getListInsertionsQueryKey(insertion?.campanhaId ? { campanhaId: insertion.campanhaId, competencia: insertion.competencia ?? undefined } as any : undefined), enabled: !!insertion?.campanhaId } },
  );
  const { data: adrotateRelation, refetch: refetchAdrotateRelation } = useQuery({
    queryKey: ["insertion-adrotate-relation", numId],
    queryFn: () => fetchRelation(numId),
    enabled: !!numId,
    staleTime: 15_000,
  });
  const { data: retroPreview, refetch: refetchRetroPreview } = useQuery({
    queryKey: ["insertion-retro-preview", numId],
    queryFn: async () => {
      const response = await apiFetch(`/api/insertions/capture-proof/backfill-overdue/preview?insertionId=${numId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui conferir as evidências retroativas desta inserção.");
      return payload as {
        totalJobs: number;
        totalSkipped: number;
        grouped: Array<{ insertionId: number; totalMissing: number; sampleDates: string[] }>;
      };
    },
    enabled: !!numId,
    staleTime: 30_000,
  });
  const { data: operationalDocumentsPayload, refetch: refetchOperationalDocuments } = useQuery({
    queryKey: ["insertion-operational-documents", numId],
    queryFn: () => fetchOperationalDocuments(numId),
    enabled: !!numId,
    staleTime: 30_000,
  });
  const [analyticsRequirements, setAnalyticsRequirements] = useState<AnalyticsRequirementsPayload | null>(null);
  const [analyticsReports, setAnalyticsReports] = useState<AnalyticsReportItem[]>([]);
  const [analyticsJob, setAnalyticsJob] = useState<AnalyticsJobPayload | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsRequesting, setAnalyticsRequesting] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [deletingAnalyticsReportId, setDeletingAnalyticsReportId] = useState<string | null>(null);
  const [analyticsPeriodMode, setAnalyticsPeriodMode] = useState<"pi" | "full_month" | "custom">("pi");
  const [analyticsCustomStart, setAnalyticsCustomStart] = useState("");
  const [analyticsCustomEnd, setAnalyticsCustomEnd] = useState("");

  useEffect(() => {
    if (!numId) return;
    let active = true;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    Promise.all([fetchAnalyticsRequirements(numId), fetchAnalyticsReports(numId)])
      .then(([requirements, reports]) => {
        if (!active) return;
        setAnalyticsRequirements(requirements);
        setAnalyticsReports(reports);
        const defaultMode = requirements.periodOptions?.some((item) => item.mode === "pi") ? "pi" : (requirements.periodOptions?.[0]?.mode ?? "pi");
        setAnalyticsPeriodMode(defaultMode);
        setAnalyticsCustomStart(requirements.periodStart ?? "");
        setAnalyticsCustomEnd(requirements.periodEnd ?? "");
      })
      .catch((error) => {
        if (!active) return;
        setAnalyticsError(error instanceof Error ? error.message : "Falha ao carregar Analytics.");
      })
      .finally(() => {
        if (active) setAnalyticsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [numId]);

  useEffect(() => {
    if (!analyticsJob?.id) return;
    if (!["queued", "ready_for_runner", "running"].includes(analyticsJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await fetchAnalyticsJob(analyticsJob.id);
        setAnalyticsJob(latest);
        if (!["queued", "ready_for_runner", "running"].includes(latest.status)) {
          const reports = await fetchAnalyticsReports(numId);
          setAnalyticsReports(reports);
          window.clearInterval(timer);
        }
      } catch {
        window.clearInterval(timer);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [analyticsJob?.id, analyticsJob?.status, numId]);

  const selectedAnalyticsPeriod = analyticsRequirements?.periodOptions?.find((item) => item.mode === analyticsPeriodMode) ?? null;

  async function requestAnalyticsReport() {
    if (!numId) return;
    if (!canRunProtectedMutations) {
      setAnalyticsError(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    setAnalyticsRequesting(true);
    setAnalyticsError("");
    try {
      const response = await apiFetch("/api/analytics/jobs/request-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insertionId: numId,
          periodMode: analyticsPeriodMode,
          ...(analyticsPeriodMode === "custom" ? {
            customPeriodStart: analyticsCustomStart || null,
            customPeriodEnd: analyticsCustomEnd || null,
          } : {}),
          requestedBy: "adops-ui",
          source: typeof window !== "undefined" ? window.location.hostname : "cloudflare-pages",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Falha ao solicitar relatório de Analytics.");
      }
      if (payload?.jobId) {
        const job = await fetchAnalyticsJob(payload.jobId);
        setAnalyticsJob(job);
      }
      const reports = await fetchAnalyticsReports(numId);
      setAnalyticsReports(reports);
    } catch (error) {
      const fallback = "Falha ao solicitar relatório de Analytics.";
      if (error instanceof TypeError) {
        const periodHint = analyticsPeriodMode === "custom"
          ? ` (${analyticsCustomStart || "sem-inicio"} a ${analyticsCustomEnd || "sem-fim"})`
          : "";
        setAnalyticsError(`Falha de rede ao falar com a API pública${periodHint}. Recarregue a página e tente novamente; se persistir, valide CORS/deploy do Pages.`);
      } else {
        setAnalyticsError(error instanceof Error ? error.message : fallback);
      }
    } finally {
      setAnalyticsRequesting(false);
    }
  }

  async function deleteAnalyticsReport(reportId: string) {
    if (!canRunProtectedMutations) {
      setAnalyticsError(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    if (!window.confirm("Excluir este relatório da lista da inserção? O arquivo já publicado pode continuar existindo no storage.")) return;
    setDeletingAnalyticsReportId(reportId);
    setAnalyticsError("");
    try {
      const response = await apiFetch(`/api/analytics/reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Falha ao excluir relatório de Analytics.");
      }
      const reports = await fetchAnalyticsReports(numId);
      setAnalyticsReports(reports);
      if (analyticsJob?.id === reportId) setAnalyticsJob(null);
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : "Falha ao excluir relatório de Analytics.");
    } finally {
      setDeletingAnalyticsReportId(null);
    }
  }
  const evidencePlan = insertion ? getDayEvidencePlan(insertion) : [];
  const { data: evidenceAuditStatuses } = useQuery({
    queryKey: ["insertion-evidence-audit-statuses", numId, evidencePlan.map((item) => `${item.key}:${item.evidenceId ?? "none"}`).join("|")],
    queryFn: async () => {
      const relevantDays = evidencePlan.filter((item) => item.evidenceId || item.url);
      const statuses = await Promise.all(relevantDays.map((item) => fetchCaptureAuditStatus(numId, item.key)));
      return Object.fromEntries(statuses.map((status) => [status.date, status])) as Record<string, CaptureAuditStatus>;
    },
    enabled: !!numId && evidencePlan.length > 0,
    staleTime: 15_000,
  });

  const updateMutation = useUpdateInsertion();
  const createEvidence = useCreateEvidence();

  const [newEvidenceTitle, setNewEvidenceTitle] = useState("");
  const [newEvidenceUrl, setNewEvidenceUrl] = useState("");
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [editingObs, setEditingObs] = useState(false);
  const [obs, setObs] = useState("");
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [editingMedia, setEditingMedia] = useState(false);
  const [mediaUrlDraft, setMediaUrlDraft] = useState("");
  const [replacingToday, setReplacingToday] = useState(false);
  const [confirmReplaceToday, setConfirmReplaceToday] = useState(false);
  const [captureAt, setCaptureAt] = useState("");
  const [retroJobId, setRetroJobId] = useState<string | null>(null);
  const [retroState, setRetroState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [retroMessage, setRetroMessage] = useState("");
  const [fixingInvalid, setFixingInvalid] = useState(false);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [regeneratingDocuments, setRegeneratingDocuments] = useState(false);
  const [downloadingDocumentKey, setDownloadingDocumentKey] = useState<string | null>(null);
  const [deletingDocumentKind, setDeletingDocumentKind] = useState<OperationalDocumentItem["kind"] | null>(null);
  const [captureLogsByDate, setCaptureLogsByDate] = useState<Record<string, CaptureProofLogsPayload | null>>({});
  const [captureLogLoadingDate, setCaptureLogLoadingDate] = useState<string | null>(null);
  const [captureLogErrorByDate, setCaptureLogErrorByDate] = useState<Record<string, string>>({});
  const [expandedCaptureLogDate, setExpandedCaptureLogDate] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetInsertionQueryKey(numId) });
    qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
    qc.invalidateQueries({ queryKey: ["insertion-evidence-audit-statuses", numId] });
    qc.invalidateQueries({ queryKey: ["insertion-operational-documents", numId] });
    qc.invalidateQueries({ queryKey: ["insertion-adrotate-relation", numId] });
    void refetchInsertion();
    void refetchAdrotateRelation();
    refetchRetroPreview();
    setCaptureLogsByDate({});
    setCaptureLogErrorByDate({});
  };

  const toggleCaptureLog = async (date: string) => {
    if (expandedCaptureLogDate === date) {
      setExpandedCaptureLogDate(null);
      return;
    }
    setExpandedCaptureLogDate(date);
    if (captureLogsByDate[date] || captureLogLoadingDate === date) return;
    setCaptureLogLoadingDate(date);
    setCaptureLogErrorByDate((current) => ({ ...current, [date]: "" }));
    try {
      const payload = await fetchCaptureProofLogs(numId, date);
      setCaptureLogsByDate((current) => ({ ...current, [date]: payload }));
    } catch (error) {
      setCaptureLogErrorByDate((current) => ({
        ...current,
        [date]: error instanceof Error ? error.message : "Não consegui carregar o histórico da evidência.",
      }));
    } finally {
      setCaptureLogLoadingDate((current) => (current === date ? null : current));
    }
  };

  useEffect(() => {
    if (!editingMedia) {
      setMediaUrlDraft((insertion as any)?.mediaUrl ?? "");
    }
  }, [editingMedia, insertion?.id, (insertion as any)?.mediaUrl]);

  useEffect(() => {
    if (!editingObs) {
      setObs(insertion?.observacoes ?? "");
    }
  }, [editingObs, insertion?.id, insertion?.observacoes]);

  useEffect(() => {
    if (!retroJobId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const response = await apiFetch(`/api/insertions/capture-proof/backfill-overdue/jobs/${retroJobId}`);
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        if (payload.status === "running" || payload.status === "queued") {
          setRetroState("running");
          setRetroMessage(`Gerando em segundo plano: ${payload.generated}/${payload.totalJobs} evidências prontas.${payload.current ? ` Agora: ${payload.current}` : ""}`);
          return;
        }
        if (payload.status === "completed") {
          setRetroState("success");
          setRetroMessage(`Retroativos concluídos: ${payload.generated} evidências geradas, ${payload.errors} com falha, ${payload.totalSkipped} já existentes.`);
          setRetroJobId(null);
          invalidate();
          clearInterval(interval);
          return;
        }
        if (payload.status === "failed") {
          setRetroState("error");
          const failedResult = Array.isArray(payload.results)
            ? [...payload.results].reverse().find((item: any) => item?.status === "error")
            : null;
          setRetroMessage(
            `Geração interrompida: ${describeOperationalCaptureError(failedResult?.error || payload.current || "falha inesperada")}`,
          );
          setRetroJobId(null);
          clearInterval(interval);
        }
      } catch {}
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [retroJobId]);

  const setStatus = (s: string) => {
    if (!canRunProtectedMutations) {
      window.alert(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    const updates: Record<string, unknown> = { statusNormalizado: s };
    if (s === "publicado_no_site" || STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("publicado_no_site")) {
      updates.bannerPublicadoNoSite = true;
    }
    if (STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("print_gerado")) {
      updates.printGerado = true;
    }
    if (STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("enviado_para_agencia")) {
      updates.processoEnviadoAgencia = true;
      if (!insertion?.dataEnvioAgencia) updates.dataEnvioAgencia = new Date().toISOString().split("T")[0];
    }
    if (STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("docs_enviados")) {
      updates.docsEnviados = true;
    }
    updateMutation.mutate({ id: numId, data: updates as any }, { onSuccess: invalidate });
  };

  const handleAddEvidence = () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    if (!newEvidenceTitle && !newEvidenceUrl) return;
    createEvidence.mutate({
      insertionId: numId,
      data: { tipo: "print", titulo: newEvidenceTitle || null, arquivoUrl: newEvidenceUrl || null },
    }, {
      onSuccess: () => {
        setNewEvidenceTitle("");
        setNewEvidenceUrl("");
        setAddingEvidence(false);
        invalidate();
      },
    });
  };

  const handleSaveObs = () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    updateMutation.mutate({ id: numId, data: { observacoes: obs } }, {
      onSuccess: () => { setEditingObs(false); invalidate(); },
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Carregando...</div>;
  if (!insertion) return <div className="p-6 text-muted-foreground text-sm">Inserção não encontrada.</div>;

  const currentIdx = STATUS_SEQUENCE.indexOf(insertion.statusNormalizado);
  const profile = resolveOperationalProfile({
    agenciaNome: insertion.agenciaNome,
    clienteNome: insertion.clienteNome,
    campaignName: insertion.campanhaName,
    observacoes: insertion.observacoes,
  });
  const profileSummary = getOperationalProfileSummary(profile);
  const profileTone = getOperationalToneMeta(profileSummary.tone);
  const stageGuides = getOperationalStageGuides({
    periodoInicio: insertion.periodoInicio,
    periodoFim: insertion.periodoFim,
    clienteNome: insertion.clienteNome,
    agenciaNome: insertion.agenciaNome,
    campanhaName: insertion.campanhaName,
    observacoes: insertion.observacoes,
    recebidoEm: (insertion as any).recebidoEm ?? null,
    receivedAt: (insertion as any).receivedAt ?? null,
  }, profile);
  const assumptions = stageGuides.filter(stage => stage.assumption);
  const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd");
  const todayPlanItem = evidencePlan.find((item) => item.key === todayKey) ?? null;
  const totalPlannedPrints = evidencePlan.length;
  const totalPeriodInsertions = relatedInsertions?.filter((item) =>
    item.periodoInicio === insertion.periodoInicio && item.periodoFim === insertion.periodoFim
  ).length ?? 1;
  const headerWindow = formatInsertionPeriodLong(insertion as any);
  const siteLogo = (insertion as any).siteLogoUrl ?? (insertion.siteSigla ? SITE_LOGOS[insertion.siteSigla] : null);
  const insertionMediaUrl = (insertion as any).mediaUrl ?? INSERTION_MEDIA_OVERRIDES[insertion.id] ?? null;
  const insertionMediaKind = getMediaKind(insertionMediaUrl);
  const positionLabel = adrotateRelation?.positionLabel ?? insertion.localFormatoNormalizado ?? insertion.localFormato ?? "Posição não mapeada";
  const pageLabel = adrotateRelation?.pageLabel ?? "Página não identificada";
  const adrotatePlaybook = [
    {
      title: "Publicação / Publicado",
      detail: `Confirme a posição ${positionLabel} na ${pageLabel.toLowerCase()} do portal ${insertion.siteSigla ?? "sem site"}, alinhada ao grupo ${adrotateRelation?.adrotateGroupId ?? "não mapeado"} e ao criativo certo antes de marcar como publicado.`,
    },
    {
      title: "Evidência gerada",
      detail: `Gere a prova só depois de validar a mídia final nessa posição. Para GIF ou banner animado, espere o criativo sair do frame inicial; para vídeo, o player deve aparecer com progresso visível.`,
    },
    {
      title: "Enviado",
      detail: `${profileSummary.envioLabel}. Use a janela e o padrão de comprovação desta PI, sem consolidar prazos por conveniência.`,
    },
    {
      title: "Docs Enviados",
      detail: `${profileSummary.docsLabel}. Se o perfil exigir analytics, aceite, NF ou checklist adicional, trate isso antes de concluir a inserção.`,
    },
  ];
  const protectedActionTitle = protectedMutationMessage ?? readonlyMessage ?? undefined;

  const saveMediaUrl = () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    updateMutation.mutate(
      { id: numId, data: { mediaUrl: mediaUrlDraft.trim() || null } as any },
      {
        onSuccess: () => {
          setEditingMedia(false);
          invalidate();
        },
      },
    );
  };

  const removeMediaUrl = () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    updateMutation.mutate(
      { id: numId, data: { mediaUrl: null } as any },
      {
        onSuccess: () => {
          setMediaUrlDraft("");
          setEditingMedia(false);
          invalidate();
        },
      },
    );
  };

  const saveEvidenceUrl = async (planItem: EvidencePlanItem) => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    const nextUrl = (draftUrls[planItem.key] ?? planItem.url).trim();
    if (!isValidEvidenceUrl(nextUrl)) return;

    const payload = {
      tipo: "print",
      titulo: planItem.title,
      arquivoUrl: nextUrl,
    };

    if (planItem.evidenceId) {
      await apiFetch(`/api/evidences/${planItem.evidenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await createEvidence.mutateAsync({
        insertionId: numId,
        data: payload,
      });
    }

    if (!insertion.printGerado) {
      await updateMutation.mutateAsync({ id: numId, data: { printGerado: true, statusNormalizado: insertion.processoEnviadoAgencia ? insertion.statusNormalizado : "print_gerado" } as any });
    }

    invalidate();
  };

  const replaceTodayCapture = async () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    if (!todayPlanItem) return;
    setReplacingToday(true);
    try {
      const response = await apiFetch(`/api/insertions/${numId}/capture-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayPlanItem.key, replace: true, ...(captureAt ? { captureAt } : {}) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Não consegui gerar novamente a evidência do dia.");
      }
      setConfirmReplaceToday(false);
      invalidate();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não consegui gerar novamente a evidência do dia.");
    } finally {
      setReplacingToday(false);
    }
  };

  const removeEvidenceForDay = async (planItem: EvidencePlanItem) => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    if (!planItem.evidenceId) return;
    const confirmed = window.confirm(`Remover a evidência de ${planItem.dateLabel}? Depois disso, você poderá gerar uma nova evidência para este dia.`);
    if (!confirmed) return;

    try {
      const response = await apiFetch(`/api/evidences/${planItem.evidenceId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.details || payload?.error || "Falha ao remover a evidência deste dia.");
      }
      setDraftUrls((current) => {
        const next = { ...current };
        delete next[planItem.key];
        return next;
      });
      if (todayPlanItem?.key === planItem.key) {
        setConfirmReplaceToday(false);
      }
      invalidate();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao remover a evidência deste dia.");
    }
  };

  const runInsertionRetroBackfill = async () => {
    if (!canRunProtectedMutations) {
      setRetroState("error");
      setRetroMessage(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    try {
      const preview = await refetchRetroPreview();
      const summary = preview.data;
      if (!summary) throw new Error("Não foi possível carregar a prévia desta inserção.");
      if (summary.totalJobs === 0) {
        setRetroState("success");
        setRetroMessage("Esta inserção não tem retroativos vencidos pendentes.");
        return;
      }
      const sample = summary.grouped[0]?.sampleDates?.slice(0, 6).join(", ") ?? "";
      const confirmed = window.confirm(
        `Esta inserção tem ${summary.totalJobs} evidência(s) retroativa(s) faltando.` +
        `\nExemplos: ${sample || "sem amostra"}` +
        `\nOs horários serão variados entre 18h e 20h.` +
        `\nDeseja iniciar a geração em segundo plano?`
      );
      if (!confirmed) return;
      setRetroState("running");
      setRetroMessage("Geração iniciada em segundo plano. Você pode continuar navegando.");
      const response = await apiFetch("/api/insertions/capture-proof/backfill-overdue/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insertionId: numId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui iniciar as evidências retroativas desta inserção.");
      setRetroJobId(payload.jobId ?? null);
    } catch (error) {
      setRetroState("error");
      setRetroMessage(error instanceof Error ? error.message : "Não consegui iniciar as evidências retroativas desta inserção.");
    }
  };

  const fixInvalidEvidences = async () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    setFixingInvalid(true);
    try {
      const response = await apiFetch(`/api/insertions/${numId}/capture-proof/fix-invalid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao corrigir as evidências inválidas.");
      const problemDates = Array.isArray(payload?.items) ? payload.items.map((item: any) => item.date).filter(Boolean).join(", ") : "";
      window.alert(
        payload?.failed
          ? `A rotina refez ${payload?.regenerated ?? 0} evidência(s), mas ${payload?.failed ?? 0} ainda falharam.${problemDates ? `\nDatas tratadas: ${problemDates}` : ""}`
          : `Falhas corrigidas com sucesso.${problemDates ? `\nDatas tratadas: ${problemDates}` : ""}`,
      );
      invalidate();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao corrigir as evidências inválidas.");
    } finally {
      setFixingInvalid(false);
    }
  };

  const downloadEvidenceBundle = async () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    setExportingBundle(true);
    try {
      let debugRequestId = "";
      try {
        const debugResponse = await apiFetch(`/api/insertions/${numId}/evidences/export.debug?source=adops-ui`);
        const debugPayload = await debugResponse.json().catch(() => null);
        if (debugResponse.ok) {
          debugRequestId = typeof debugPayload?.requestId === "string" ? debugPayload.requestId : "";
        }
      } catch {
        // Diagnóstico é auxiliar: não bloqueia o download principal.
      }

      const downloadPath = `/api/insertions/${numId}/evidences/export.zip?source=adops-ui${debugRequestId ? `&requestId=${encodeURIComponent(debugRequestId)}` : ""}`;
      const objectUrl = apiUrl(downloadPath);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `insercao-${numId}-evidencias.zip`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao gerar o pacote das evidências.");
    } finally {
      setExportingBundle(false);
    }
  };

  const downloadOperationalDocument = async (item: OperationalDocumentItem, format: "docx" | "pdf") => {
    const key = `${item.kind}:${format}`;
    setDownloadingDocumentKey(key);
    try {
      const response = await apiFetch(format === "docx" ? item.downloadDocxUrl : item.downloadPdfUrl);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.details || payload?.error || "Falha ao baixar o documento operacional.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const fallbackName = format === "docx" ? item.docxFileName : item.pdfFileName;
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      anchor.href = objectUrl;
      anchor.download = match?.[1] ?? fallbackName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao baixar o documento operacional.");
    } finally {
      setDownloadingDocumentKey(null);
    }
  };

  const regenerateOperationalDocuments = async () => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    setRegeneratingDocuments(true);
    try {
      const response = await apiFetch(`/api/insertions/${numId}/operational-documents/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Falha ao regerar os documentos operacionais.");
      }
      await refetchOperationalDocuments();
      window.alert("Documentos operacionais regerados com sucesso.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao regerar os documentos operacionais.");
    } finally {
      setRegeneratingDocuments(false);
    }
  };

  const deleteOperationalDocument = async (item: OperationalDocumentItem) => {
    if (!canRunProtectedMutations) {
      window.alert(protectedActionTitle ?? "Acao operacional protegida.");
      return;
    }
    if (!window.confirm(`Excluir ${item.title} da lista e do ZIP desta inserção?`)) return;
    setDeletingDocumentKind(item.kind);
    try {
      const response = await apiFetch(`/api/insertions/${numId}/operational-documents/${item.kind}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Falha ao excluir o documento operacional.");
      }
      await refetchOperationalDocuments();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao excluir o documento operacional.");
    } finally {
      setDeletingDocumentKind(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Inserção #${insertion.id}`}
        subtitle={`${insertion.campanhaName} · ${insertion.siteSigla ?? "—"} · ${totalPlannedPrints} evidências previstas no período · ${formatInsertionPeriodCompact(insertion as any)}`}
        actions={
          <div className="hidden w-full flex-wrap items-stretch gap-2 sm:w-auto sm:items-center sm:justify-end md:flex">
            <input
              type="datetime-local"
              value={captureAt}
              onChange={(event) => setCaptureAt(event.target.value)}
              className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
              title="Opcional: escolha a data e hora para gerar uma prova retroativa."
            />
            <CaptureProofButton insertionId={numId} hasMedia={Boolean(insertionMediaUrl)} onSuccess={invalidate} captureAt={captureAt || undefined} />
            <button
              onClick={runInsertionRetroBackfill}
              disabled={!canRunProtectedMutations}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/15 sm:whitespace-nowrap"
              title={!canRunProtectedMutations ? protectedActionTitle : undefined}
            >
              <Clock3 className="h-3.5 w-3.5" />
              Retroativos vencidos
            </button>
            <button
              onClick={fixInvalidEvidences}
              disabled={fixingInvalid || !canRunProtectedMutations}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:whitespace-nowrap"
              title={!canRunProtectedMutations ? protectedActionTitle : undefined}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {fixingInvalid ? "Corrigindo falhas..." : "Corrigir evidências com falha"}
            </button>
            <button
              onClick={downloadEvidenceBundle}
              disabled={exportingBundle || !canRunProtectedMutations}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:whitespace-nowrap"
              title={!canRunProtectedMutations ? protectedActionTitle : undefined}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {exportingBundle ? "Preparando ZIP..." : "Baixar ZIP + TXT"}
            </button>
            {todayPlanItem?.url ? (
            <button
              onClick={() => setConfirmReplaceToday((current) => !current)}
              disabled={!canRunProtectedMutations}
                className="inline-flex items-center justify-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/15 sm:whitespace-nowrap"
                title={!canRunProtectedMutations ? protectedActionTitle : undefined}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Gerar novamente hoje
              </button>
            ) : null}
            <button onClick={() => navigate(-1 as any)} className="inline-flex items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:whitespace-nowrap">
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar
            </button>
          </div>
        }
      />

      <div className="border-b border-border bg-card/25 px-3 py-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-foreground">Evidência</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {(insertion.evidences?.length ?? 0)}/{totalPlannedPrints} salvas
            </div>
          </div>
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            todayPlanItem?.url
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-100",
          )}>
            {todayPlanItem?.url ? "Status em dia" : "Falta evidência hoje"}
          </span>
        </div>
        <div className="mt-3">
          {todayPlanItem?.url ? (
            <button
              onClick={() => setConfirmReplaceToday(true)}
              disabled={!canRunProtectedMutations}
              className="min-h-11 w-full rounded border border-amber-500/30 bg-amber-500/10 px-3 text-sm font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              title={!canRunProtectedMutations ? protectedActionTitle : undefined}
            >
              Gerar novamente
            </button>
          ) : (
            <CaptureProofButton
              insertionId={numId}
              hasMedia={Boolean(insertionMediaUrl)}
              onSuccess={invalidate}
              captureAt={captureAt || undefined}
              label="Gerar evidência"
              auditedLabel="Status em dia"
              missingMediaLabel="Sem mídia"
              showBadge={false}
              className="min-h-11 w-full text-sm"
            />
          )}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Use o botão acima para gerar ou refazer a evidência de hoje.
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-5 md:px-6">
        {isCloudflarePublic && !canRunProtectedMutations ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
            <div className="font-semibold">Modo público no Cloudflare</div>
            <div className="mt-1 text-sky-100/90">{protectedMutationMessage ?? readonlyMessage ?? "Ações operacionais protegidas exigem token do operador."}</div>
            <div className="mt-2 text-xs text-sky-100/75">
              Esta página já mostra a relação com AdRotate, o histórico e o status das evidências. Para apagar, corrigir ou gerar novamente, informe o token do operador neste navegador.
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Cole o token de operador"
                className="min-w-0 flex-1 rounded border border-sky-400/30 bg-slate-950/40 px-3 py-2 text-xs text-sky-50 placeholder:text-sky-200/40 focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button
                type="button"
                onClick={() => setToken("")}
                className="rounded border border-sky-400/30 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-500/10"
              >
                Limpar token
              </button>
              <button
                type="button"
                onClick={() => navigate("/configuracoes")}
                className="rounded border border-sky-400/30 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-500/10"
              >
                Abrir configurações
              </button>
            </div>
            <div className="mt-2 text-[11px] text-sky-100/70">
              Status do token: {hasToken ? "configurado neste navegador" : "ainda não informado"}.
            </div>
          </div>
        ) : null}
        {(retroMessage || retroPreview) ? (
          <div className="rounded border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="text-sm font-semibold text-foreground">Retroativos desta inserção</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {retroPreview?.totalJobs
                ? `Faltam ${retroPreview.totalJobs} evidência(s) retroativa(s) para esta inserção.`
                : "Nenhum retroativo vencido pendente para esta inserção."}
            </div>
            {retroPreview?.grouped?.[0]?.sampleDates?.length ? (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Exemplos de datas faltando: {retroPreview.grouped[0].sampleDates.join(", ")}
              </div>
            ) : null}
            {retroMessage ? (
              <div className={cn(
                "mt-3 rounded border px-3 py-2 text-xs",
                retroState === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : retroState === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-100"
              )}>
                {retroMessage}
              </div>
            ) : null}
          </div>
        ) : null}

        {confirmReplaceToday && todayPlanItem ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-amber-100">Gerar novamente a evidência de hoje</div>
                <p className="mt-1 text-xs leading-relaxed text-amber-50/90">
                  Essa ação cria uma nova evidência para <strong>{todayPlanItem.dateLabel}</strong>.
                  O link atual será substituído pela nova URL gerada, mantendo o registro do dia.
                </p>
              </div>
              <button onClick={() => setConfirmReplaceToday(false)} className="text-xs text-amber-100/80 hover:text-amber-50">
                Fechar
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-amber-50/90">
              <span>URL atual:</span>
              <a href={todayPlanItem.url} target="_blank" rel="noreferrer" className="break-all text-amber-100 underline-offset-2 hover:underline">
                {todayPlanItem.url}
              </a>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={replaceTodayCapture}
                disabled={replacingToday}
                className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {replacingToday ? "Gerando..." : "Gerar nova evidência"}
              </button>
              <button
                onClick={() => setConfirmReplaceToday(false)}
                className="rounded border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {/* Meta */}
        <div className={cn("rounded border p-3 sm:p-5", STATUS_META[insertion.statusNormalizado]?.boxClass ?? "bg-card border-border")}>
          <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white px-3 py-2">
                {siteLogo ? (
                  <img src={siteLogo} alt={insertion.siteSigla ?? "Logo do site"} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs font-bold tracking-wide text-primary">{insertion.siteSigla ?? "SITE"}</span>
                )}
              </div>
              <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">{insertion.localFormatoNormalizado ?? insertion.localFormato ?? "—"}</h2>
              <div className="mt-1 text-xs text-muted-foreground">{insertion.campanhaName} · {insertion.clienteNome} · {insertion.agenciaNome}</div>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <DelayBadge atrasado={insertion.atrasado} />
              <StatusBadge status={insertion.statusNormalizado} />
            </div>
          </div>
          {insertionMediaUrl && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-slate-950/70">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] text-white/80">
                <div className="flex items-center gap-2">
                  {insertionMediaKind === "video" ? <PlayCircle className="h-3.5 w-3.5" /> : <Image className="h-3.5 w-3.5" />}
                  <span>Mídia do anúncio</span>
                  <span className="rounded border border-white/10 px-1.5 py-0.5 uppercase tracking-wide text-[10px]">
                    {insertionMediaKind === "video" ? "vídeo" : insertionMediaKind === "gif" ? "gif" : insertionMediaKind === "image" ? "imagem" : "link"}
                  </span>
                </div>
                <a href={insertionMediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-foreground/90 hover:underline">
                  Abrir original
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)] p-4">
                {insertionMediaKind === "video" ? (
                  <video
                    src={insertionMediaUrl}
                    controls
                    preload="metadata"
                    className="max-h-[320px] w-full rounded-xl border border-white/10 bg-slate-950 object-contain"
                  />
                ) : insertionMediaKind === "image" || insertionMediaKind === "gif" ? (
                  <img
                    src={insertionMediaUrl}
                    alt={`Mídia da inserção ${insertion.id}`}
                    className="max-h-[320px] w-full rounded-xl border border-white/10 bg-white object-contain"
                  />
                ) : (
                  <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/70">
                    Preview indisponível para este link. Use "Abrir original" para visualizar a mídia.
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mb-4 rounded border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">Mídia da inserção</div>
                <div className="text-[11px] text-muted-foreground">Adicione, atualize ou remova a mídia exibida no cabeçalho desta inserção.</div>
              </div>
              {!editingMedia && (
                <button
                  onClick={() => {
                    setMediaUrlDraft((insertion as any).mediaUrl ?? "");
                    setEditingMedia(true);
                  }}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  {insertionMediaUrl ? "Atualizar mídia" : "Adicionar mídia"}
                </button>
              )}
            </div>
            <div className="mt-3 rounded border border-primary/15 bg-primary/5 p-3 text-[11px] text-muted-foreground">
              <div className="font-semibold text-foreground">Como vincular a mídia à inserção</div>
              <div className="mt-1">
                Cole a URL pública exata do criativo que está veiculando no portal. A automação procura o <strong>nome do arquivo</strong> dessa URL dentro do slot do site para identificar qual banner deve aparecer na evidência.
              </div>
              <div className="mt-1">
                Exemplo: se a mídia for <code>.../825x120-pref-3.gif</code>, o robô tenta encontrar esse mesmo <code>825x120-pref-3.gif</code> no HTML do portal antes de capturar a primeira dobra.
              </div>
              <div className="mt-1">
                Se o arquivo exibido no site tiver outro nome, a evidência não é validada para esta inserção.
              </div>
            </div>
            {editingMedia && (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  value={mediaUrlDraft}
                  onChange={(event) => setMediaUrlDraft(event.target.value)}
                  placeholder="Cole a URL da imagem, GIF ou vídeo"
                  className="rounded border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button onClick={saveMediaUrl} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                    Salvar mídia
                  </button>
                  <button onClick={() => { setEditingMedia(false); setMediaUrlDraft((insertion as any).mediaUrl ?? ""); }} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                    Cancelar
                  </button>
                  {((insertion as any).mediaUrl ?? null) && (
                    <button onClick={removeMediaUrl} className="px-2 py-1.5 text-xs text-destructive hover:opacity-80">
                      Remover
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Site</div>
              <div className="font-medium">{insertion.siteNome ?? "—"} ({insertion.siteSigla ?? "—"})</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Cliente</div>
              <div className="font-medium">{insertion.clienteNome ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Agência</div>
              <div className="font-medium">{insertion.agenciaNome ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Competência</div>
              <div className="font-medium">{insertion.competencia ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">PI</div>
              <div className="font-medium">{(insertion as any).piCodigo ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Valor</div>
              <div className="font-medium">{formatMoney((insertion as any).valorLiquido)}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Status Atual</div>
              <div className="font-medium">{STATUS_META[insertion.statusNormalizado]?.label ?? insertion.statusNormalizado}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Evidências no período</div>
              <div className="font-medium">{totalPlannedPrints} evidências previstas</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Inserções Iguais</div>
              <div className="font-medium">{totalPeriodInsertions} inserções com mesmo período</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Período PI</div>
              <div className="font-medium">{formatInsertionPeriodCompact(insertion as any)}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Período Início</div>
              <div className="font-medium">{formatDayLabel(parseDateOnly(insertion.periodoInicio) ?? new Date())}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Período Fim</div>
              <div className="font-medium">{formatDayLabel(parseDateOnly(insertion.periodoFim) ?? new Date())}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Envio Agência</div>
              <div className="font-medium">{fmtDate(insertion.dataEnvioAgencia)}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Origem</div>
              <div className="font-medium">{(insertion as any).origemCampanha ?? "—"}</div>
            </div>
          </div>
        </div>

        {/* Status timeline */}
        <div className="rounded border border-border bg-card p-3 sm:p-5">
          <div className={cn("mb-5 rounded border p-4", profileTone.cardClass)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Perfil operacional ativo</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {profileSummary.title} · {profile.matchLabel}
                </div>
                <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                  {profileSummary.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={cn("rounded-full border px-2 py-1 text-[10px] font-medium", profileTone.badgeClass)}>
                  {profileTone.label}
                </span>
                <span className="rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] font-medium text-foreground">
                  {profileSummary.envioLabel}
                </span>
                <span className="rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] font-medium text-foreground">
                  {profileSummary.docsLabel}
                </span>
                {profileSummary.badges.map((badge) => (
                  <span key={badge} className="rounded-full border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] font-medium text-primary">
                    {badge}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded border border-border bg-background/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{profileSummary.recommendationTitle}</div>
                <p className="mt-2 text-[11px] leading-relaxed text-foreground">{profileSummary.recommendedNextStep}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{profileSummary.riscoPrincipal}</p>
              </div>
              <div className="rounded border border-border bg-background/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tratamento de prazo desta PI</div>
                <p className="mt-2 text-[11px] leading-relaxed text-foreground">{profileSummary.prazoPrincipal}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{profileSummary.prazoOperacional}</p>
              </div>
              <div className="rounded border border-border bg-background/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Checklist desta inserção</div>
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {profileSummary.checklist.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded border border-border bg-background/50 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">O que já sabemos pela PI</div>
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {profileSummary.formHints.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="mb-5 rounded border border-border bg-muted/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Analytics por API</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Esta frente dispara o relatório GA4 a partir da própria inserção/PI, preservando período e configuração do site no backend.
                </p>
              </div>
              <button
                onClick={requestAnalyticsReport}
                disabled={
                  analyticsRequesting ||
                  !canRunProtectedMutations ||
                  !analyticsRequirements?.analyticsSource ||
                  (analyticsPeriodMode === "custom" && (!analyticsCustomStart || !analyticsCustomEnd))
                }
                className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                title={!canRunProtectedMutations ? protectedActionTitle : undefined}
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {analyticsRequesting ? "Solicitando..." : "Pedir relatório"}
              </button>
            </div>
            {analyticsError ? (
              <div className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-3 text-[11px] text-destructive">
                {analyticsError}
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Exigência operacional</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {analyticsRequirements?.requiresAnalytics ? "Obrigatório" : "Sob demanda"}
                </div>
              </div>
              <div className="rounded border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fonte</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {analyticsRequirements?.analyticsSource?.toUpperCase() ?? (analyticsLoading ? "Carregando..." : "Indisponível")}
                </div>
              </div>
              <div className="rounded border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Período usado</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {selectedAnalyticsPeriod?.periodStart && selectedAnalyticsPeriod?.periodEnd
                    ? `${selectedAnalyticsPeriod.periodStart} a ${selectedAnalyticsPeriod.periodEnd}`
                    : "Sem período"}
                </div>
              </div>
              <div className="rounded border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Property key</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {analyticsRequirements?.propertyKey ?? "Sem mapeamento"}
                </div>
              </div>
            </div>
            {analyticsRequirements?.periodOptions?.length ? (
              <div className="mt-3 rounded border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Modo do período</div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {analyticsRequirements.periodOptions.map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => {
                        setAnalyticsPeriodMode(option.mode);
                        if (option.mode !== "custom") {
                          setAnalyticsCustomStart(option.periodStart ?? "");
                          setAnalyticsCustomEnd(option.periodEnd ?? "");
                        }
                      }}
                      className={cn(
                        "rounded border px-3 py-2 text-left text-[11px] transition-colors",
                        analyticsPeriodMode === option.mode
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-background/40 text-muted-foreground hover:bg-background/70",
                      )}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="mt-1 leading-relaxed">{option.description}</div>
                      {option.periodStart && option.periodEnd ? (
                        <div className="mt-1 text-[10px] text-foreground/80">{option.periodStart} a {option.periodEnd}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
                {analyticsPeriodMode === "custom" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-[11px] text-muted-foreground">
                      <div className="mb-1 font-medium text-foreground">Data inicial</div>
                      <input
                        type="date"
                        value={analyticsCustomStart}
                        onChange={(event) => setAnalyticsCustomStart(event.target.value)}
                        className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </label>
                    <label className="text-[11px] text-muted-foreground">
                      <div className="mb-1 font-medium text-foreground">Data final</div>
                      <input
                        type="date"
                        value={analyticsCustomEnd}
                        onChange={(event) => setAnalyticsCustomEnd(event.target.value)}
                        className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
            {analyticsRequirements?.notes?.length ? (
              <div className="mt-3 rounded border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Regras da API</div>
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {analyticsRequirements.notes.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {analyticsJob ? (
              <div className="mt-3 rounded border border-border bg-background/60 p-3 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">Job atual</span>
                  <span className="rounded-full border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] font-medium text-primary">
                    {analyticsJob.status}
                  </span>
                  <span className="font-mono text-muted-foreground">{analyticsJob.id}</span>
                </div>
                {analyticsJob.error ? (
                  <div className="mt-2 text-destructive">{analyticsJob.error}</div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Relatórios já gerados</div>
              {analyticsReports.length ? (
                analyticsReports.map((report) => (
                  <div key={report.id} className="rounded border border-border bg-background/60 p-3 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-foreground">
                          {report.periodStart ?? "—"} a {report.periodEnd ?? "—"}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {report.propertyKey ?? "sem property"} · {report.kind} · {report.status}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          Gerado em {fmtDateTime(report.createdAt)} · modo {report.periodMode ?? "pi"}
                        </div>
                        {report.fileName ? (
                          <div className="mt-1 break-all text-muted-foreground">
                            Arquivo: {report.fileName}
                          </div>
                        ) : null}
                        {(report.campaignName || report.clientName || report.piCodigo) ? (
                          <div className="mt-1 text-muted-foreground">
                            {[report.campaignName, report.clientName, report.piCodigo].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {report.downloadUrl ? (
                          <a href={report.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Baixar
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        {report.previewUrl ? (
                          <a href={report.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Abrir
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => deleteAnalyticsReport(report.id)}
                          disabled={deletingAnalyticsReportId === report.id || !canRunProtectedMutations}
                          className="inline-flex items-center gap-1 text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          title={!canRunProtectedMutations ? protectedActionTitle : undefined}
                        >
                          <Trash2 className="h-3 w-3" />
                          {deletingAnalyticsReportId === report.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
                  Nenhum relatório de Analytics registrado para esta inserção até agora.
                </div>
              )}
            </div>
          </div>
          <div className="mb-5 rounded border border-border bg-muted/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Documentos operacionais</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Modelos baseados no manual e na pasta de referência, preenchidos com os dados da PI e preservando campos destacados para complemento manual e assinatura.
                </p>
              </div>
              <button
                onClick={regenerateOperationalDocuments}
                disabled={regeneratingDocuments || !canRunProtectedMutations}
                className="inline-flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={!canRunProtectedMutations ? protectedActionTitle : undefined}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", regeneratingDocuments && "animate-spin")} />
                {regeneratingDocuments ? "Regerando..." : "Regerar documentos"}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {operationalDocumentsPayload?.documents?.length ? (
                operationalDocumentsPayload.documents.map((item) => (
                  <div key={item.kind} className="rounded border border-border bg-background/60 p-3 text-[11px]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <div className="font-medium text-foreground">{item.title}</div>
                        </div>
                        <div className="mt-1 text-muted-foreground">{item.description}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded-full border border-border bg-background px-2 py-1">{item.docxFileName}</span>
                          <span className="rounded-full border border-border bg-background px-2 py-1">{item.pdfFileName}</span>
                        </div>
                        {item.placeholders.length ? (
                          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-100">
                            Campos ainda destacados no modelo: {item.placeholders.join(", ")}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={apiUrl(item.previewDocxUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-background/80"
                        >
                          Abrir DOCX
                        </a>
                        <a
                          href={apiUrl(item.previewPdfUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-background/80"
                        >
                          Abrir PDF
                        </a>
                        <button
                          onClick={() => downloadOperationalDocument(item, "docx")}
                          disabled={downloadingDocumentKey === `${item.kind}:docx`}
                          className="rounded border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {downloadingDocumentKey === `${item.kind}:docx` ? "Baixando DOCX..." : "Baixar DOCX"}
                        </button>
                        <button
                          onClick={() => downloadOperationalDocument(item, "pdf")}
                          disabled={downloadingDocumentKey === `${item.kind}:pdf`}
                          className="rounded border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {downloadingDocumentKey === `${item.kind}:pdf` ? "Baixando PDF..." : "Baixar PDF"}
                        </button>
                        <button
                          onClick={() => void deleteOperationalDocument(item)}
                          disabled={deletingDocumentKind === item.kind || !canRunProtectedMutations}
                          className="rounded border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] font-medium text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                          title={!canRunProtectedMutations ? protectedActionTitle : undefined}
                        >
                          {deletingDocumentKind === item.kind ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
                  Os documentos operacionais serão listados aqui assim que a PI estiver carregada.
                </div>
              )}
            </div>
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Relação com AdRotate</h3>
          <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
            <div className="rounded border border-border bg-muted/15 p-4 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Posição</div>
                  <div className="font-medium">{positionLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Página</div>
                  <div className="font-medium">{pageLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Grupo</div>
                  <div className="font-medium">{adrotateRelation?.adrotateGroupId ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Mídia</div>
                  <div className="font-medium break-all">{adrotateRelation?.mediaBasename ?? "Sem mídia salva"}</div>
                </div>
              </div>
              {adrotateRelation?.exactLiveMatches?.length ? (
                <div className="mt-4 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Correspondências públicas da mesma mídia
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Set(adrotateRelation.exactLiveMatches.map((item) => item.adId)).size} anúncio(s) no admin aparecendo em {new Set(adrotateRelation.exactLiveMatches.map((item) => item.pageUrl)).size} página(s) pública(s).
                  </div>
                  {adrotateRelation.exactLiveMatches.map((item) => (
                    <div key={`${item.pageUrl}-${item.adId}`} className="rounded border border-emerald-500/25 bg-emerald-500/8 p-3">
                      <div className="font-medium text-foreground">Ad {item.adId} · Grupo {item.groupId}</div>
                      <div className="mt-1 text-muted-foreground break-all">{item.mediaBasename}</div>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {item.adminEditUrl ? (
                          <a href={item.adminEditUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Abrir anúncio no admin
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        <a href={item.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          Abrir página real
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded border border-amber-500/25 bg-amber-500/8 p-3 text-amber-100">
                  Nenhum match exato do anúncio foi encontrado no site público com a mídia desta inserção.
                </div>
              )}
              {adrotateRelation?.historicalAdminMatches?.length ? (
                <div className="mt-4 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Anúncio histórico no admin</div>
                  {adrotateRelation.historicalAdminMatches.map((item) => (
                    <div key={`historical-${item.adId}`} className="rounded border border-sky-500/25 bg-sky-500/8 p-3 text-sky-100">
                      <div className="font-medium text-foreground">Ad {item.adId} · Grupo {item.groupId}</div>
                      <div className="mt-1 text-muted-foreground">{item.title ?? "Sem título"}</div>
                      <div className="mt-1 text-muted-foreground break-all">{item.adopsMediaBasename ?? "Sem mídia vinculada"}</div>
                      <div className="mt-2 text-[11px] text-sky-100/90">
                        Esse vínculo foi encontrado no admin mesmo com o anúncio já expirado no site público.
                      </div>
                      {item.adminEditUrl ? (
                        <a href={item.adminEditUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
                          Abrir anúncio histórico no admin
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="rounded border border-border bg-muted/15 p-4 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Sugestões equivalentes</div>
              {adrotateRelation?.fallbackCandidates?.length ? (
                <div className="space-y-3">
                  {adrotateRelation.fallbackCandidates.map((candidate) => (
                    <div key={candidate.insertionId} className="rounded border border-border bg-background/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">Inserção {candidate.insertionId}</div>
                          <div className="mt-1 text-muted-foreground break-all">{candidate.mediaBasename ?? "Sem basename"}</div>
                        </div>
                        <a href={`/insercoes/${candidate.insertionId}`} className="text-primary hover:underline">Abrir equivalente</a>
                      </div>
                      {candidate.liveMatches?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {candidate.liveMatches.map((match) => (
                            <div key={`${candidate.insertionId}-${match.pageUrl}-${match.adId}`} className="flex flex-wrap gap-2">
                              {match.adminEditUrl ? (
                                <a href={match.adminEditUrl} target="_blank" rel="noreferrer" className="rounded border border-emerald-500/25 bg-emerald-500/8 px-2 py-1 text-[11px] text-emerald-100 hover:underline">
                                  Ad {match.adId} · grupo {match.groupId} no admin
                                </a>
                              ) : null}
                              <a href={match.pageUrl} target="_blank" rel="noreferrer" className="rounded border border-border bg-background/50 px-2 py-1 text-[11px] text-foreground hover:underline">
                                Ver página real
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">Sem equivalentes encontrados para reaproveitar vínculo ou mídia.</div>
              )}
            </div>
          </div>
        </div>

        {/* Status timeline */}
        <div className="rounded border border-border bg-card p-3 sm:p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Linha do Tempo</h3>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STATUS_SEQUENCE.map((s, i) => {
              const done = i <= currentIdx;
              const current = i === currentIdx;
              return (
                <div key={s} className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setStatus(s)}
                    className={cn(
                      "flex flex-col items-center gap-1 px-2 py-1.5 rounded transition-colors text-center border",
                      done
                        ? (STATUS_META[s]?.boxClass ?? "bg-primary/10 border-primary/30")
                        : "bg-muted/30 border-border hover:bg-muted/50",
                      current && "ring-1 ring-primary/40"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      done ? "bg-primary border-primary" : "border-border bg-muted"
                    )}>
                      {done && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className={cn("text-[9px] font-medium", done ? "text-foreground" : "text-muted-foreground")}>
                      {STATUS_LABELS[s]}
                    </span>
                  </button>
                  {i < STATUS_SEQUENCE.length - 1 && (
                    <div className={cn("w-8 h-0.5 shrink-0", i < currentIdx ? "bg-primary" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            {STATUS_SEQUENCE.filter((_, i) => i !== currentIdx).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className="text-[10px] px-2 py-1 bg-muted border border-border rounded hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Marcar: {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {stageGuides.map(stage => {
              const idx = STATUS_SEQUENCE.indexOf(stage.key);
              const done = idx !== -1 && idx <= currentIdx;
              const current = idx === currentIdx;
              return (
                <div
                  key={stage.key}
                  className={cn(
                    "rounded border p-3",
                    stage.critical ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/20",
                    current && "ring-1 ring-primary/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{stage.label}</span>
                        {stage.critical && (
                          <span className="inline-flex items-center gap-1 rounded border border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                            <AlertTriangle className="h-3 w-3" />
                            Prazo crítico
                          </span>
                        )}
                        {stage.assumption && (
                          <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            Exemplo para validar
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{stage.action}</p>
                    </div>
                    {idx !== -1 && (
                      <StatusBadge status={done ? "concluido" : current ? insertion.statusNormalizado : "rascunho"} size="sm" showDot={false} />
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    Fazer até: <span className="font-medium text-foreground">{stage.deadlineLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {assumptions.length > 0 && (
            <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                Exemplos para validar com o cliente
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-amber-100/90">
                {assumptions.map(stage => (
                  <li key={stage.key}>
                    <strong>{stage.label}:</strong> prazo sugerido em {stage.deadlineLabel.toLowerCase()}.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 rounded border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold text-foreground">Playbook desta inserção</div>
            <div className="mt-2 space-y-2">
              {adrotatePlaybook.map((item) => (
                <div key={item.title} className="rounded border border-border bg-background/50 p-2.5">
                  <div className="text-[11px] font-medium text-foreground">{item.title}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>
                </div>
              ))}
              <div className="rounded border border-border bg-background/50 p-2.5">
                <div className="text-[11px] font-medium text-foreground">Concluído</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Feche esta inserção só quando posição, período, evidência, envio e documentação estiverem coerentes com a PI e com a configuração operacional do portal.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Evidences */}
        <div className="rounded border border-border bg-card p-3 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Evidências <span className="text-muted-foreground font-normal">({insertion.evidences?.length ?? 0})</span>
            </h3>
            <button
              onClick={() => setAddingEvidence(v => !v)}
              disabled={!canRunProtectedMutations}
              className="hidden items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 md:flex"
              title={!canRunProtectedMutations ? protectedActionTitle : undefined}
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </button>
          </div>

          {addingEvidence && (
            <div className="bg-muted/50 border border-border rounded p-3 mb-3 flex flex-col gap-2">
              <input
                placeholder="Título (ex: Evidência home 06/04)"
                value={newEvidenceTitle}
                onChange={e => setNewEvidenceTitle(e.target.value)}
                className="text-xs bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                placeholder="URL da evidência no Google Drive ou imagem pública (opcional)"
                value={newEvidenceUrl}
                onChange={e => setNewEvidenceUrl(e.target.value)}
                className="text-xs bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Dica: o link fica salvo no banco em <code>arquivoUrl</code>. Se for Google Drive, a tela tenta montar uma miniatura automaticamente.
              </p>
              <div className="flex gap-2">
                <button onClick={handleAddEvidence} disabled={!canRunProtectedMutations} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" title={!canRunProtectedMutations ? protectedActionTitle : undefined}>Salvar</button>
                <button onClick={() => setAddingEvidence(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">Cancelar</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="rounded border border-border bg-muted/20 p-3">
              <div className="mb-3 text-xs font-semibold text-foreground">Checklist de evidências por dia do período</div>
              <div className="space-y-2">
                {evidencePlan.map((item) => {
                  const currentUrl = draftUrls[item.key] ?? item.url;
                  const previewUrl = getPreviewUrl(currentUrl);
                  const itemStatusMeta = EVIDENCE_STATUS_META[item.status];
                  const isToday = item.key === todayKey;
                  const auditStatus = evidenceAuditStatuses?.[item.key];
                  const auditIssues = auditStatus?.audit?.issues ?? [];
                  const hasOnlyLegacyMetadataIssues =
                    auditIssues.length > 0 &&
                    auditIssues.every((issue) => issue?.code === "capture_metadata_missing");
                  const visualAudit = auditStatus?.audit?.visualAudit;
                  const playerProof = auditStatus?.audit?.playerProof;
                  const captureLogs = captureLogsByDate[item.key];
                  const captureLog = captureLogs?.latest ?? null;
                  const captureLogExpanded = expandedCaptureLogDate === item.key;
                  const captureLogError = captureLogErrorByDate[item.key];
                  const slotArtifactUrl = captureLog?.artifacts?.diagnosticUploads?.slot ?? null;
                  const finalArtifactUrl = captureLog?.artifacts?.diagnosticUploads?.final ?? captureLog?.cacheBustedUrl ?? captureLog?.uploadedUrl ?? null;
                  const remoteArtifactUrl = captureLog?.cacheBustedUrl ?? captureLog?.uploadedUrl ?? null;
                  return (
                    <div key={item.key} className={cn("rounded border p-3", itemStatusMeta.boxClass)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-foreground">{item.dateLabel}</div>
                          <div className="text-[11px] text-muted-foreground">Evidência obrigatória deste dia</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={itemStatusMeta.badgeStatus} size="sm" />
                          <span className="text-[10px] font-medium text-muted-foreground">{itemStatusMeta.label}</span>
                        </div>
                      </div>
                      <div className="mt-3 hidden flex-col gap-2 md:flex md:flex-row md:items-center">
                        <input
                          value={currentUrl}
                          onChange={(event) => setDraftUrls((current) => ({ ...current, [item.key]: event.target.value }))}
                          placeholder="Cole a URL pública da evidência"
                          className="flex-1 rounded border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                          <button
                            onClick={() => saveEvidenceUrl(item)}
                            disabled={!isValidEvidenceUrl(currentUrl) || !canRunProtectedMutations}
                            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            title={!canRunProtectedMutations ? protectedActionTitle : undefined}
                          >
                          Salvar URL
                        </button>
                        {item.evidenceId ? (
                          <button
                            onClick={() => removeEvidenceForDay(item)}
                            disabled={!canRunProtectedMutations}
                            className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/15"
                            title={!canRunProtectedMutations ? protectedActionTitle : undefined}
                          >
                            Apagar evidência
                          </button>
                        ) : null}
                        {isToday && item.url ? (
                          <button
                            onClick={() => setConfirmReplaceToday(true)}
                            disabled={!canRunProtectedMutations}
                            className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/15"
                            title={!canRunProtectedMutations ? protectedActionTitle : undefined}
                          >
                            Gerar novamente hoje
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 hidden items-center gap-3 text-[11px] text-muted-foreground md:flex">
                        <span>Prazo da evidência: {item.dateLabel}</span>
                        {currentUrl && (
                          <a href={currentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            Abrir
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <button
                          onClick={() => toggleCaptureLog(item.key)}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {captureLogExpanded ? "Ocultar histórico" : "Ver histórico"}
                        </button>
                      </div>
                      {(auditStatus?.status === "audited" || auditStatus?.status === "audited_best_effort") && auditStatus.audit && (
                        <div className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-[11px] text-emerald-100">
                          <div className="font-medium">
                            {auditStatus.status === "audited_best_effort" ? "Aprovada com revisão recomendada" : "Evidência aprovada"}
                          </div>
                          <div className="mt-1 text-emerald-100/90">
                            Moldura: {auditStatus.audit.systemDateTime || "—"} · Site: {auditStatus.audit.pageDateText || "—"}
                          </div>
                          {auditStatus.audit.visualAudit?.frameSelectionDowngraded && (
                            <div className="mt-2 rounded border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-100">
                              A imagem foi aceita, mas merece revisão manual.
                              {auditStatus.audit.visualAudit.frameSelectionMode ? ` Motor: ${auditStatus.audit.visualAudit.frameSelectionMode}.` : ""}
                              {typeof auditStatus.audit.visualAudit.gifChosenFrameIndex === "number" ? ` Frame ${auditStatus.audit.visualAudit.gifChosenFrameIndex}.` : ""}
                            </div>
                          )}
                          {auditStatus.audit.isVideoCapture && (
                            <div className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-100">
                              <PlayCircle className="h-3 w-3" />
                              Vídeo com controles visíveis · {formatPlayerSeconds(playerProof?.currentTime)}/{formatPlayerSeconds(playerProof?.duration)}
                            </div>
                          )}
                          {visualAudit && (
                            <div className="mt-1 text-emerald-100/90">
                              Imagens viewport {visualAudit.viewportImagesLoaded ?? 0}/{visualAudit.viewportImagesTotal ?? 0} ·
                              Slot {visualAudit.slotImagesLoaded ?? 0}/{visualAudit.slotImagesTotal ?? 0} ·
                              Backgrounds {visualAudit.viewportBackgroundsLoaded ?? 0}/{visualAudit.viewportBackgroundsTotal ?? 0} ·
                              Vídeos/posters {visualAudit.viewportVideosLoaded ?? 0}/{visualAudit.viewportVideosTotal ?? 0}
                            </div>
                          )}
                        </div>
                      )}
                      {auditStatus?.status === "invalid_audit" && (
                        <div
                          className={cn(
                            "mt-3 rounded border p-2 text-[11px]",
                            hasOnlyLegacyMetadataIssues
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                              : "border-red-500/30 bg-red-500/10 text-red-100",
                          )}
                        >
                          <div className="font-medium">
                            {hasOnlyLegacyMetadataIssues ? "Evidência antiga sem histórico completo" : "Evidência precisa de revisão"}
                          </div>
                          {getAuditCauseBadges(auditStatus.audit).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {getAuditCauseBadges(auditStatus.audit).map((label) => (
                                <span
                                  key={`${item.key}-${label}`}
                                  className={cn(
                                    "rounded border px-2 py-0.5 text-[10px] font-medium",
                                    hasOnlyLegacyMetadataIssues
                                      ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
                                      : "border-red-400/25 bg-red-400/10 text-red-100",
                                  )}
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-1">Hora da moldura: {auditStatus.audit?.systemDateTime || "não encontrada"}</div>
                          <div>Hora do site: {auditStatus.audit?.pageDateText || "não encontrada"}</div>
                          {visualAudit && (
                            <div className="mt-1">
                              Imagens viewport {visualAudit.viewportImagesLoaded ?? 0}/{visualAudit.viewportImagesTotal ?? 0} ·
                              Slot {visualAudit.slotImagesLoaded ?? 0}/{visualAudit.slotImagesTotal ?? 0} ·
                              Backgrounds {visualAudit.viewportBackgroundsLoaded ?? 0}/{visualAudit.viewportBackgroundsTotal ?? 0} ·
                              Vídeos/posters {visualAudit.viewportVideosLoaded ?? 0}/{visualAudit.viewportVideosTotal ?? 0}
                            </div>
                          )}
                          {auditStatus.audit?.isVideoCapture && (
                            <div className="mt-1">
                              Player do vídeo: {auditStatus.audit?.playerProofOk ? "ok" : "pendente"} ·
                              tempo {formatPlayerSeconds(playerProof?.currentTime)}/{formatPlayerSeconds(playerProof?.duration)} ·
                              controles {playerProof?.controlsVisible ? "visíveis" : "não visíveis"} ·
                              progresso {playerProof?.progressVisible ? "visível" : "não visível"}
                            </div>
                          )}
                          {!!auditIssues.length && (
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              {auditIssues.map((issue) => (
                                <li key={`${item.key}-${issue.code}`}>
                                  <strong>{issue.label}:</strong> {issue.detail}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {previewUrl && (
                        <a href={currentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block">
                          <img src={previewUrl} alt={`Preview ${item.dateLabel}`} className="h-20 w-32 rounded border border-border object-cover" />
                        </a>
                      )}
                      {captureLogExpanded && (
                        <div className="mt-3 rounded border border-border bg-background/50 p-3 text-[11px]">
                          {captureLogLoadingDate === item.key && (
                            <div className="text-muted-foreground">Carregando log estruturado da captura...</div>
                          )}
                          {captureLogError && (
                            <div className="text-red-200">{captureLogError}</div>
                          )}
                          {!captureLogLoadingDate && !captureLogError && !captureLog && (
                            <div className="text-muted-foreground">
                              {hasOnlyLegacyMetadataIssues
                                ? "Esta evidência é antiga e não possui histórico completo. Gerar novamente esta data cria o histórico completo."
                                : "Nenhum log estruturado encontrado para esta data."}
                            </div>
                          )}
                          {captureLog && (
                            <div className="space-y-3">
                              <div className="grid gap-2 md:grid-cols-2">
                                <div className="rounded border border-border bg-card/60 p-2">
                                  <div className="font-medium text-foreground">Diagnóstico</div>
                                  <div className="mt-1 text-muted-foreground">
                                    Causa provável: {formatProbableCauseLabel(captureLog.probableCause)}
                                    {captureLog.confidence ? ` · confiança ${captureLog.confidence}%` : ""}
                                  </div>
                                  <div className="mt-1 text-muted-foreground">Próxima ação: {captureLog.nextAction || "—"}</div>
                                  <div className="mt-1 text-muted-foreground">Status: {captureLog.status} · Motor: {captureLog.frameSelectionMode || "—"}</div>
                                </div>
                                <div className="rounded border border-border bg-card/60 p-2">
                                  <div className="font-medium text-foreground">Seleção e publicação</div>
                                  <div className="mt-1 text-muted-foreground">Frame escolhido: {String(captureLog.summary?.gifChosenFrameIndex ?? captureLog.metadata?.gifChosenFrameIndex ?? "—")}</div>
                                  <div className="mt-1 text-muted-foreground">Frames fortes: {String(captureLog.summary?.gifStrongFrameCount ?? "—")}</div>
                                  <div className="mt-1 text-muted-foreground">Proof style: {String(captureLog.summary?.finalProofStyle ?? "—")}</div>
                                  <div className="mt-1 text-muted-foreground">Audit status: {String(captureLog.summary?.auditStatus ?? "—")}</div>
                                </div>
                              </div>
                              {!!captureLog.stages?.length && (
                                <div className="rounded border border-border bg-card/60 p-2">
                                  <div className="font-medium text-foreground">Etapas</div>
                                  <div className="mt-2 space-y-1">
                                    {captureLog.stages.map((stage) => (
                                      <div key={`${captureLog.id}-${stage.stage}`} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground">{stage.stage}</span>
                                        <span>{stage.status}</span>
                                        <span>{stage.durationMs != null ? `${stage.durationMs} ms` : "—"}</span>
                                        {stage.errorCode ? <span className="text-red-200">{stage.errorCode}</span> : null}
                                        {stage.errorDetail ? <span className="text-red-200">{stage.errorDetail}</span> : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded border border-border bg-card/60 p-2">
                                  <div className="mb-2 font-medium text-foreground">Slot capturado</div>
                                  {slotArtifactUrl ? <img src={slotArtifactUrl} alt={`Slot ${item.dateLabel}`} className="h-28 w-full rounded border border-border object-contain bg-slate-950/20" /> : <div className="text-muted-foreground">Sem artefato salvo</div>}
                                </div>
                                <div className="rounded border border-border bg-card/60 p-2">
                                  <div className="mb-2 font-medium text-foreground">PNG final</div>
                                  {finalArtifactUrl ? <img src={finalArtifactUrl} alt={`Final ${item.dateLabel}`} className="h-28 w-full rounded border border-border object-contain bg-slate-950/20" /> : <div className="text-muted-foreground">Sem artefato salvo</div>}
                                </div>
                                <div className="rounded border border-border bg-card/60 p-2">
                                  <div className="mb-2 font-medium text-foreground">Publicado</div>
                                  {remoteArtifactUrl ? <img src={remoteArtifactUrl} alt={`Publicado ${item.dateLabel}`} className="h-28 w-full rounded border border-border object-contain bg-slate-950/20" /> : <div className="text-muted-foreground">Sem URL publicada</div>}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded border border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
              O checklist acima já é a lista oficial das evidências do período. Cada dia mostra a URL salva, o status e a miniatura quando disponível.
            </div>
            <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3 text-[11px]">
              <div className="font-semibold text-foreground">Pacote desta inserção</div>
              <div className="mt-1 text-muted-foreground">
                Gere um ZIP com todas as evidências baixadas e um <code>relatorio-auditoria.txt</code> detalhado para salvar no processo.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={downloadEvidenceBundle}
                  disabled={exportingBundle || !canRunProtectedMutations}
                  className="rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-sky-950 disabled:cursor-not-allowed disabled:opacity-60"
                  title={!canRunProtectedMutations ? protectedActionTitle : undefined}
                >
                  {exportingBundle ? "Preparando ZIP..." : "Baixar ZIP + TXT da inserção"}
                </button>
                <button
                  onClick={fixInvalidEvidences}
                  disabled={fixingInvalid || !canRunProtectedMutations}
                  className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                  title={!canRunProtectedMutations ? protectedActionTitle : undefined}
                >
                  {fixingInvalid ? "Corrigindo falhas..." : "Refazer evidências com falha"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Observations */}
        <div className="rounded border border-border bg-card p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Observações</h3>
            {!editingObs && (
              <button onClick={() => { setObs(insertion.observacoes ?? ""); setEditingObs(true); }} disabled={!canRunProtectedMutations} className="text-xs text-primary hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60" title={!canRunProtectedMutations ? protectedActionTitle : undefined}>Editar</button>
            )}
          </div>
          {editingObs ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={3}
                placeholder="Observações sobre esta inserção..."
                className="text-sm bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none w-full"
              />
              <div className="flex gap-2">
                <button onClick={handleSaveObs} disabled={!canRunProtectedMutations} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium disabled:cursor-not-allowed disabled:opacity-60" title={!canRunProtectedMutations ? protectedActionTitle : undefined}>Salvar</button>
                <button onClick={() => setEditingObs(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">Cancelar</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-foreground/80">{insertion.observacoes || <span className="text-muted-foreground italic">Sem observações</span>}</p>
          )}
        </div>
      </div>
    </div>
  );
}
