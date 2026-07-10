import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListInsertions, useListSites, useListClients, useListAgencies,
  getListInsertionsQueryKey,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/adops/Layout";
import { StatusBadge, DelayBadge } from "@/components/adops/StatusBadge";
import { InsertionChecks } from "@/components/adops/InsertionChecks";
import { CaptureProofButton } from "@/components/adops/CaptureProofButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ExternalLink, Filter, Image, Link2, PlayCircle, Camera, ClipboardCheck, Loader2, Clock, AlertTriangle, CheckCircle2, FileText, ChevronRight } from "lucide-react";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-base";
import { usePersistentState } from "@/lib/usePersistentState";
import { formatInsertionPeriodCompact } from "@/lib/insertion-period";
import {
  COMPETENCIAS,
  DEFAULT_COMPETENCIA,
  getMediaKind,
  INSERTION_MEDIA_OVERRIDES,
  MEDIA_KIND_META,
  PRINT_COVERAGE_META,
  SITE_LOGOS,
  STATUS_OPTIONS,
  STATUS_META,
  resetToCurrentCompetencia,
} from "@/lib/adops-config";
import { getOperationalProfileSummary, getOperationalToneMeta, resolveOperationalProfile } from "@/lib/adops-requirements";
import { useApiMode } from "@/lib/use-api-mode";
import { getKindLabel, getStatusClassName, getStatusLabel, useOpsQueueOverview } from "@/lib/ops-queue";
import { JobProgressBar } from "@/components/adops/ops-queue/JobProgressBar";

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yy", { locale: ptBR }); } catch { return s; }
}

function parseDateOnly(s: string | null | undefined) {
  if (!s) return null;
  const date = new Date(`${s}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPeriodDayCount(start: string | null | undefined, end: string | null | undefined) {
  const from = parseDateOnly(start);
  const to = parseDateOnly(end);
  if (!from || !to || to < from) return 0;
  return differenceInCalendarDays(to, from) + 1;
}

function getRequiredPrintsUntilToday(start: string | null | undefined, end: string | null | undefined) {
  const from = parseDateOnly(start);
  const to = parseDateOnly(end);
  const today = startOfDay(new Date());
  if (!from || !to || to < from) return 0;
  if (today < from) return 0;
  if (today > to) return differenceInCalendarDays(to, from) + 1;
  return differenceInCalendarDays(today, from) + 1;
}

function getPrintCoverage(totalEvidencias: number, start: string | null | undefined, end: string | null | undefined) {
  const total = getPeriodDayCount(start, end);
  const required = getRequiredPrintsUntilToday(start, end);
  const today = startOfDay(new Date());
  const from = parseDateOnly(start);
  const to = parseDateOnly(end);

  if (!from || !to || to < from) {
    return { total, actual: totalEvidencias, state: "future" as const };
  }
  if (today < from) {
    return { total, actual: totalEvidencias, state: "future" as const };
  }
  if (today > to && totalEvidencias < total) {
    return { total, actual: totalEvidencias, state: "late" as const };
  }
  if (totalEvidencias >= required) {
    return { total, actual: totalEvidencias, state: "on_track" as const };
  }
  if (required - totalEvidencias > 1) {
    return { total, actual: totalEvidencias, state: "late" as const };
  }
  return { total, actual: totalEvidencias, state: "attention" as const };
}

function getAuditIssueLines(audit: any): string[] {
  return Array.isArray(audit?.issues) ? audit.issues.map((issue: any) => String(issue?.label || issue?.detail || "Falha sem detalhe")) : [];
}

function getInsertionAuditEmojiSummary(summary: any) {
  const ok = Number(summary?.auditedCount ?? 0);
  const bestEffort = Number(summary?.bestEffortCount ?? 0);
  const failed = Number(summary?.failedCount ?? 0);
  return `🟢 ${ok}${bestEffort > 0 ? ` · 🟡 ${bestEffort}` : ""} · 🔴 ${failed}`;
}

function getInsertionAuditCauseSummary(summary: any) {
  const rootCauseCounts = summary?.rootCauseCounts ?? {};
  const parts: string[] = [];
  if (Number(rootCauseCounts.legacyMissingMetadata ?? 0) > 0) parts.push(`${rootCauseCounts.legacyMissingMetadata} legado sem metadata`);
  if (Number(rootCauseCounts.visualLegibility ?? 0) > 0) parts.push(`${rootCauseCounts.visualLegibility} banner ilegível`);
  if (Number(rootCauseCounts.visualStability ?? 0) > 0) parts.push(`${rootCauseCounts.visualStability} frame em transição`);
  if (Number(rootCauseCounts.timeMismatch ?? 0) > 0) parts.push(`${rootCauseCounts.timeMismatch} horário divergente`);
  if (Number(summary?.bestEffortCount ?? 0) > 0) parts.push(`${summary.bestEffortCount} melhor esforço`);
  return parts.join(" · ");
}

async function downloadOperationalDocument(insertionId: number, kind: "declaracao-execucao" | "anexo-v", format: "pdf" | "docx") {
  const response = await apiFetch(`/api/insertions/${insertionId}/operational-documents/${kind}/${format}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.details || payload?.error || "Falha ao baixar o documento operacional.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const disposition = response.headers.get("content-disposition") ?? "";
  const fallbackName = `${kind}.${format}`;
  const match = disposition.match(/filename="?([^"]+)"?/i);
  anchor.href = objectUrl;
  anchor.download = match?.[1] ?? fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function Insertions() {
  const { isReadonlyPublic, readonlyMessage, canRunProtectedMutations, protectedMutationMessage } = useApiMode();
  const FILTERS_KEY = "adops.insertions.filters.v1";
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const initAtrasado = urlParams.get("atrasado") === "true";
  const [filters, setFilters] = usePersistentState(FILTERS_KEY, {
    searchText: "",
    onlyPendingVideoPlayer: false,
    competencia: DEFAULT_COMPETENCIA,
    captureAt: "",
    siteId: "",
    clienteId: "",
    agenciaId: "",
    status: "",
    atrasado: initAtrasado,
    onlyMissingPrints: false,
  });
  const searchText = filters.searchText;
  const onlyPendingVideoPlayer = filters.onlyPendingVideoPlayer;
  const competencia = filters.competencia;
  const captureAt = filters.captureAt;
  const siteId = filters.siteId;
  const clienteId = filters.clienteId;
  const agenciaId = filters.agenciaId;
  const status = filters.status;
  const atrasado = filters.atrasado;
  const onlyMissingPrints = filters.onlyMissingPrints;
  const [batchState, setBatchState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [batchMessage, setBatchMessage] = useState<string>("");
  const [backfillState, setBackfillState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [backfillMessage, setBackfillMessage] = useState<string>("");
  const [backfillJobId, setBackfillJobId] = useState<string | null>(null);
  const [auditState, setAuditState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [auditMessage, setAuditMessage] = useState<string>("");
  const [fixingInsertionId, setFixingInsertionId] = useState<number | null>(null);
  const [downloadingDocKey, setDownloadingDocKey] = useState<string | null>(null);

  const params: Record<string, string | number | boolean | undefined> = {};
  if (competencia) params.competencia = competencia;
  if (siteId) params.siteId = parseInt(siteId);
  if (clienteId) params.clienteId = parseInt(clienteId);
  if (agenciaId) params.agenciaId = parseInt(agenciaId);
  if (status) params.status = status;
  if (atrasado) params.atrasado = true;

  const { data: insertions, isLoading } = useListInsertions(params as any);
  const { data: sites } = useListSites();
  const { data: clients } = useListClients();
  const { data: agencies } = useListAgencies();
  const queueOverview = useOpsQueueOverview(true);
  const auditDate = captureAt ? captureAt.slice(0, 10) : format(startOfDay(new Date()), "yyyy-MM-dd");
  const { data: captureAudit } = useQuery({
    queryKey: ["insertions-capture-audit", competencia, siteId, clienteId, agenciaId, auditDate],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (competencia) query.set("competencia", competencia);
      if (siteId) query.set("siteId", siteId);
      if (clienteId) query.set("clienteId", clienteId);
      if (agenciaId) query.set("agenciaId", agenciaId);
      if (auditDate) query.set("date", auditDate);
      const response = await apiFetch(`/api/insertions/capture-proof/audit?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui conferir as evidências do dia.");
      return payload as {
        items: Array<{
          insertionId: number;
          status: "ok" | "ok_best_effort" | "missing" | "invalid_url" | "invalid_audit";
          audit: any;
          arquivoUrl: string | null;
        }>;
      };
    },
    staleTime: 20_000,
  });
  const { data: backfillPreview, refetch: refetchBackfillPreview, isFetching: isBackfillPreviewLoading } = useQuery({
    queryKey: ["insertions-backfill-preview", competencia, siteId],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (competencia) query.set("competencia", competencia);
      if (siteId) query.set("siteId", siteId);
      const response = await apiFetch(`/api/insertions/capture-proof/backfill-overdue/preview?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui conferir as evidências retroativas pendentes.");
      return payload as {
        totalCandidates: number;
        totalJobs: number;
        totalSkipped: number;
        grouped: Array<{ insertionId: number; campaignName: string | null; siteSigla: string | null; localFormato: string | null; totalMissing: number; sampleDates: string[] }>;
      };
    },
    staleTime: 30_000,
  });
  const missingByInsertion = useMemo(() => new Map((backfillPreview?.grouped ?? []).map((item) => [item.insertionId, item])), [backfillPreview]);
  const auditByInsertion = useMemo(() => new Map((captureAudit?.items ?? []).map((item) => [item.insertionId, item])), [captureAudit]);

  useEffect(() => {
    if (!backfillJobId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const response = await apiFetch(`/api/insertions/capture-proof/backfill-overdue/jobs/${backfillJobId}`);
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        if (payload.status === "running" || payload.status === "queued") {
          setBackfillState("running");
          setBackfillMessage(`Gerando em segundo plano: ${payload.generated}/${payload.totalJobs} evidências prontas, ${payload.errors} com falha.${payload.current ? ` Agora: ${payload.current}` : ""}`);
          return;
        }
        if (payload.status === "completed") {
          setBackfillState("success");
          setBackfillMessage(`Retroativos concluídos: ${payload.generated} evidências geradas, ${payload.errors} com falha, ${payload.totalSkipped} já existentes.`);
          setBackfillJobId(null);
          qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
          refetchBackfillPreview();
          clearInterval(interval);
          return;
        }
        if (payload.status === "failed") {
          setBackfillState("error");
          setBackfillMessage(`Geração interrompida: ${payload.current || "falha inesperada"}`);
          setBackfillJobId(null);
          clearInterval(interval);
        }
      } catch {
        // mantém polling silencioso até a próxima tentativa
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [backfillJobId, qc, refetchBackfillPreview]);

  const filtered = useMemo(() => insertions?.filter(ins => {
    if (onlyPendingVideoPlayer) {
      const auditInfo = auditByInsertion.get(ins.id);
      const isPendingVideo = Boolean(auditInfo?.audit?.isVideoCapture && !auditInfo?.audit?.playerProofOk);
      if (!isPendingVideo) return false;
    }
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      ins.campanhaName?.toLowerCase().includes(q) ||
      ins.clienteNome?.toLowerCase().includes(q) ||
      ins.siteSigla?.toLowerCase().includes(q) ||
      ins.localFormatoNormalizado?.toLowerCase().includes(q) ||
      ins.agenciaNome?.toLowerCase().includes(q)
    );
  }), [insertions, searchText, onlyPendingVideoPlayer, auditByInsertion]);

  const activeProfiles = useMemo(() => {
    const counts = new Map<string, { label: string; total: number; risk: string; nextStep: string; badgeClass: string; toneLabel: string }>();
    (filtered ?? []).forEach((ins) => {
      const profile = resolveOperationalProfile({
        agenciaNome: ins.agenciaNome,
        clienteNome: ins.clienteNome,
        campaignName: ins.campanhaName,
      });
      const summary = getOperationalProfileSummary(profile);
      const toneMeta = getOperationalToneMeta(summary.tone);
      const current = counts.get(profile.id) ?? { label: profile.label, total: 0, risk: summary.riscoPrincipal, nextStep: summary.recommendedNextStep, badgeClass: toneMeta.badgeClass, toneLabel: toneMeta.label };
      current.total += 1;
      counts.set(profile.id, current);
    });
    return Array.from(counts.entries()).map(([id, value]) => ({ id, ...value })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const insertionRows = (filtered ?? []).filter((ins) => !onlyMissingPrints || missingByInsertion.has(ins.id));

  const runBatchCapture = async () => {
    if (!canRunProtectedMutations) {
      setBatchState("error");
      setBatchMessage(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    setBatchState("running");
    setBatchMessage("Gerando as evidências do dia para as campanhas elegíveis.");
    try {
      const response = await apiFetch("/api/insertions/capture-proof/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, ...(siteId ? { siteId: Number(siteId) } : {}), ...(captureAt ? { captureAt } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui gerar as evidências do dia.");
      setBatchState("success");
      setBatchMessage(`Evidências do dia concluídas: ${payload.ok ?? 0} salvas, ${payload.error ?? 0} com falha, ${payload.results?.filter((item: any) => item.status === "skipped").length ?? 0} já existentes.`);
      qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
    } catch (error) {
      setBatchState("error");
      setBatchMessage(error instanceof Error ? error.message : "Não consegui gerar as evidências do dia.");
    }
  };

  const runAudit = async () => {
    setAuditState("running");
    setAuditMessage("Conferindo se as evidências do dia existem, abrem e estão válidas.");
    try {
      const query = new URLSearchParams();
      if (competencia) query.set("competencia", competencia);
      if (siteId) query.set("siteId", siteId);
      if (captureAt) query.set("date", captureAt.slice(0, 10));
      const response = await apiFetch(`/api/insertions/capture-proof/audit?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui conferir as evidências.");
      setAuditState("success");
      setAuditMessage(`Status do dia: ${payload.ok} em dia, ${payload.missing} faltando, ${payload.invalid} precisam de revisão.`);
    } catch (error) {
      setAuditState("error");
      setAuditMessage(error instanceof Error ? error.message : "Não consegui conferir as evidências do dia.");
    }
  };

  const runOverdueBackfill = async () => {
    if (!canRunProtectedMutations) {
      setBackfillState("error");
      setBackfillMessage(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    try {
      const preview = await refetchBackfillPreview();
      const summary = preview.data;
      if (!summary) throw new Error("Não foi possível carregar a prévia dos retroativos.");
      if (summary.totalJobs === 0) {
        setBackfillState("success");
        setBackfillMessage("Não há retroativos vencidos neste recorte.");
        return;
      }
      const confirmed = window.confirm(
        `Este lote vai gerar ${summary.totalJobs} evidência(s) faltando em ${summary.grouped.length} inserção(ões).` +
        `${siteId ? `\\nFiltro atual: site ${sites?.find((s) => String(s.id) === siteId)?.sigla ?? siteId}.` : ""}` +
        `\\nOs horários serão variados entre 18h e 20h.` +
        `\\nDeseja continuar?`
      );
      if (!confirmed) return;

      setBackfillState("running");
      setBackfillMessage("Geração iniciada em segundo plano. Você pode navegar sem interromper.");
      const response = await apiFetch("/api/insertions/capture-proof/backfill-overdue/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, ...(siteId ? { siteId: Number(siteId) } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Não consegui iniciar as evidências retroativas.");
      setBackfillJobId(payload.jobId ?? null);
    } catch (error) {
      setBackfillState("error");
      setBackfillMessage(error instanceof Error ? error.message : "Não consegui gerar as evidências retroativas.");
    }
  };

  const fixInvalidEvidences = async (insertionId: number) => {
    if (!canRunProtectedMutations) {
      window.alert(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    setFixingInsertionId(insertionId);
    try {
      const response = await apiFetch(`/api/insertions/${insertionId}/capture-proof/fix-invalid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao corrigir as evidências inválidas.");
      const okCount = Number(payload?.regenerated ?? 0);
      const errorCount = Number(payload?.failed ?? 0);
      const problemDates = Array.isArray(payload?.items) ? payload.items.map((item: any) => item.date).filter(Boolean).join(", ") : "";
      window.alert(
        errorCount === 0
          ? `Falhas corrigidas com sucesso. ${okCount} evidência(s) refeita(s).${problemDates ? `\nDatas tratadas: ${problemDates}` : ""}`
          : `A rotina refez ${okCount} evidência(s), mas ${errorCount} ainda falharam.${problemDates ? `\nDatas tratadas: ${problemDates}` : ""}`,
      );
      qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
      qc.invalidateQueries({ queryKey: ["insertions-capture-audit"] });
      qc.invalidateQueries({ queryKey: ["insertions-backfill-preview"] });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao corrigir as evidências inválidas.");
    } finally {
      setFixingInsertionId(null);
    }
  };

  const handleDownloadOperationalDoc = async (
    insertionId: number,
    kind: "declaracao-execucao" | "anexo-v",
    format: "pdf" | "docx",
  ) => {
    const key = `${insertionId}:${kind}:${format}`;
    setDownloadingDocKey(key);
    try {
      await downloadOperationalDocument(insertionId, kind, format);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao baixar o documento operacional.");
    } finally {
      setDownloadingDocKey(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Fila Operacional"
        subtitle={`${filtered?.length ?? 0} inserções${competencia ? ` em ${competencia}` : ""}`}
        actions={
          <div className="hidden w-full flex-wrap items-stretch gap-2 sm:w-auto sm:items-center sm:justify-end md:flex">
            <button
              onClick={runBatchCapture}
              disabled={batchState === "running" || !canRunProtectedMutations}
              className="inline-flex items-center justify-center gap-1.5 rounded border bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors disabled:opacity-60 sm:whitespace-nowrap"
              title={!canRunProtectedMutations ? protectedMutationMessage ?? readonlyMessage ?? undefined : undefined}
            >
              {batchState === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              Evidências do dia
            </button>
            <button
              onClick={runOverdueBackfill}
              disabled={backfillState === "running" || !canRunProtectedMutations}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 transition-colors disabled:opacity-60 sm:whitespace-nowrap"
              title={!canRunProtectedMutations ? protectedMutationMessage ?? readonlyMessage ?? undefined : undefined}
            >
              {backfillState === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              Retroativos vencidos
            </button>
            <input
              type="datetime-local"
              value={captureAt}
              onChange={(e) => setFilters((prev) => ({ ...prev, captureAt: e.target.value }))}
              className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
              title="Opcional: use para gerar evidências retroativas de uma data e hora específicas."
            />
            <button
              onClick={runAudit}
              disabled={auditState === "running"}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 sm:whitespace-nowrap"
            >
              {auditState === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
              Conferir evidências
            </button>
            <button
              onClick={() => refetchBackfillPreview()}
              disabled={isBackfillPreviewLoading}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 sm:whitespace-nowrap"
            >
              {isBackfillPreviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
              Prévia dos vencidos
            </button>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, atrasado: !prev.atrasado }))}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors sm:whitespace-nowrap",
                atrasado
                  ? "bg-red-500/15 text-red-300 border-red-500/30"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              {atrasado ? "Atrasadas" : "Com atraso"}
            </button>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, onlyMissingPrints: !prev.onlyMissingPrints }))}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors sm:whitespace-nowrap",
                onlyMissingPrints
                  ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              {onlyMissingPrints ? "Com pendências" : "Ver pendências"}
            </button>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, onlyPendingVideoPlayer: !prev.onlyPendingVideoPlayer }))}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors sm:whitespace-nowrap",
                onlyPendingVideoPlayer
                  ? "bg-sky-500/15 text-sky-200 border-sky-500/30"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              {onlyPendingVideoPlayer ? "Vídeos com player pendente" : "Filtrar player de vídeo"}
            </button>
          </div>
        }
      />

      <div className="border-b border-border bg-card/25 px-3 py-3 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-foreground">Evidências</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Gere, refaça e acompanhe o status das campanhas.
            </div>
          </div>
          <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {filtered?.length ?? 0} itens
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, onlyMissingPrints: !prev.onlyMissingPrints }))}
            className={cn(
              "min-h-10 rounded border px-3 text-xs font-medium transition-colors",
              onlyMissingPrints
                ? "border-amber-500/30 bg-amber-500/15 text-amber-100"
                : "border-border bg-background/70 text-foreground",
            )}
          >
            {onlyMissingPrints ? "Pendentes" : "Ver pendentes"}
          </button>
          <button
            onClick={runAudit}
            disabled={auditState === "running"}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded border border-border bg-background/70 px-3 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {auditState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
            Atualizar status
          </button>
        </div>
      </div>

      {(batchMessage || backfillMessage || auditMessage) && (
        <div className="space-y-2 px-3 pt-3 sm:px-4 md:px-6">
          {batchMessage && (
            <div className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              batchState === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : batchState === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-500/30 bg-slate-700/15 text-slate-200",
            )}>
              <div className="flex items-center gap-2 font-medium">
                {batchState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                Geração em lote
              </div>
              <div className="mt-1">{batchMessage}</div>
            </div>
          )}
          {backfillMessage && (
            <div className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              backfillState === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : backfillState === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-100",
            )}>
              <div className="flex items-center gap-2 font-medium">
                {backfillState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                Retroativos vencidos
              </div>
              <div className="mt-1">{backfillMessage}</div>
            </div>
          )}
          {auditMessage && (
            <div className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              auditState === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : auditState === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-500/30 bg-slate-700/15 text-slate-200",
            )}>
              <div className="flex items-center gap-2 font-medium">
                {auditState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                Status do dia
              </div>
              <div className="mt-1">{auditMessage}</div>
            </div>
          )}
        </div>
      )}

      {isReadonlyPublic && readonlyMessage ? (
        <div className="px-3 pt-3 sm:px-4 md:px-6">
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
            <div className="font-semibold">Modo público no Cloudflare</div>
            <div className="mt-1 text-sky-100/90">{readonlyMessage}</div>
            <div className="mt-2 text-xs text-sky-100/75">
              A fila, os status e as falhas já aparecem aqui. As ações de correção e geração ainda estão sendo movidas para a camada pública.
            </div>
          </div>
        </div>
      ) : null}

      {backfillPreview && (
        <div className="px-3 pt-3 sm:px-4 md:px-6">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-foreground">Prévia dos retroativos vencidos</div>
                <div className="text-xs text-muted-foreground mt-1">
                  O recorte atual tem <strong>{backfillPreview.totalJobs}</strong> evidência(s) faltando em <strong>{backfillPreview.grouped.length}</strong> inserção(ões).
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-background/70 px-2 py-1 text-muted-foreground">Elegíveis: {backfillPreview.totalCandidates}</span>
                <span className="rounded-full bg-background/70 px-2 py-1 text-muted-foreground">Já existentes: {backfillPreview.totalSkipped}</span>
              </div>
            </div>
            {backfillPreview.grouped.length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {backfillPreview.grouped.slice(0, 6).map((item) => (
                  <div key={item.insertionId} className="rounded-lg border border-border/60 bg-background/70 p-3 text-xs">
                    <div className="font-medium text-foreground">{item.campaignName || `Inserção ${item.insertionId}`}</div>
                    <div className="mt-1 text-muted-foreground">{item.siteSigla} · {item.localFormato || "Sem posição"}</div>
                    <div className="mt-2 font-medium text-amber-200">{item.totalMissing} dia(s) faltando</div>
                    <div className="mt-1 text-muted-foreground">Exemplos: {item.sampleDates.join(", ")}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                Nenhuma inserção do recorte está com evidência retroativa vencida.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 border-b border-border bg-card/30 px-3 py-3 sm:px-4 md:flex-row md:flex-wrap md:items-center md:gap-3 md:px-6">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar campanha, cliente, site..."
            value={searchText}
            onChange={e => setFilters((prev) => ({ ...prev, searchText: e.target.value }))}
            className="w-full rounded border border-border bg-card py-1.5 pr-3 pl-7 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary md:w-64"
          />
        </div>
        <select
          value={competencia}
          onChange={e => setFilters((prev) => ({ ...prev, competencia: e.target.value }))}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Competência</option>
          {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={siteId}
          onChange={e => setFilters((prev) => ({ ...prev, siteId: e.target.value }))}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Site</option>
          {sites?.map(s => <option key={s.id} value={String(s.id)}>{s.sigla}</option>)}
        </select>
        <select
          value={clienteId}
          onChange={e => setFilters((prev) => ({ ...prev, clienteId: e.target.value }))}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Cliente</option>
          {clients?.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
        </select>
        <select
          value={agenciaId}
          onChange={e => setFilters((prev) => ({ ...prev, agenciaId: e.target.value }))}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Agência</option>
          {agencies?.map(a => <option key={a.id} value={String(a.id)}>{a.nome}</option>)}
        </select>
        <select
          value={status}
          onChange={e => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(competencia || siteId || clienteId || agenciaId || status || atrasado || searchText || onlyPendingVideoPlayer) && (
          <button
            onClick={() => setFilters({
              searchText: "",
              onlyPendingVideoPlayer: false,
              competencia: resetToCurrentCompetencia(),
              captureAt: "",
              siteId: "",
              clienteId: "",
              agenciaId: "",
              status: "",
              atrasado: false,
              onlyMissingPrints: false,
            })}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}
        <div className="text-[11px] text-muted-foreground md:ml-auto">
          Ordem operacional baseada na PI: publicar certo → comprovar no padrão exigido → enviar no prazo → fechar documentação.
        </div>
      </div>

      {activeProfiles.length ? (
        <div className="border-b border-border bg-card/20 px-3 py-4 sm:px-4 md:px-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeProfiles.slice(0, 3).map((profile) => (
              <div key={profile.id} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{profile.label}</div>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", profile.badgeClass)}>
                    {profile.toneLabel}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{profile.risk}</div>
                <div className="mt-2 text-[11px] text-foreground">{profile.nextStep}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {queueOverview.data ? (
        <div className="border-b border-border bg-card/20 px-3 py-4 sm:px-4 md:px-6">
          <div className="grid gap-3 lg:grid-cols-[1.1fr,1fr,1fr]">
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <div className="text-xs font-semibold text-foreground">Rotina executando agora</div>
              {queueOverview.data.now ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-foreground">{getKindLabel(queueOverview.data.now.kind)}</div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", getStatusClassName(queueOverview.data.now.status))}>
                      {getStatusLabel(queueOverview.data.now.status)}
                    </span>
                  </div>
                  <JobProgressBar progress={queueOverview.data.now} compact />
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">Nenhuma execução em andamento.</div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <div className="text-xs font-semibold text-foreground">Fila</div>
              {(queueOverview.data.queue ?? []).length ? (
                <div className="mt-2 space-y-2">
                  {queueOverview.data.queue.slice(0, 3).map((job) => (
                    <div key={job.jobId} className="rounded border border-border/50 bg-card/40 px-2 py-1.5">
                      <div className="text-[11px] font-medium text-foreground">{getKindLabel(job.kind)}</div>
                      <div className="text-[10px] text-muted-foreground">{job.stageLabel}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">Sem tarefas aguardando.</div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <div className="text-xs font-semibold text-foreground">Próximo agendamento</div>
              {(queueOverview.data.scheduled ?? []).length ? (
                <div className="mt-2 text-xs">
                  <div className="font-medium text-foreground">{getKindLabel(queueOverview.data.scheduled[0].kind)}</div>
                  <div className="text-muted-foreground">Programado para iniciar em seguida.</div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">Sem rotinas agendadas.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-b border-border bg-muted/10 px-3 py-3 sm:px-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Perfis ativos neste recorte:</span>
          {activeProfiles.length ? activeProfiles.map((profile) => (
            <span key={profile.id} className="rounded-full border border-border bg-card px-2 py-1">
              {profile.label} · {profile.total}
            </span>
          )) : (
            <span>Nenhuma inserção carregada.</span>
          )}
        </div>
      </div>

      <div className="space-y-3 px-3 py-3 sm:px-4 md:hidden">
        {isLoading && (
          <div className="rounded border border-border bg-card/30 px-3 py-6 text-center text-xs text-muted-foreground">Carregando...</div>
        )}
        {!isLoading && insertionRows.length === 0 && (
          <div className="rounded border border-border bg-card/30 px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma inserção encontrada</div>
        )}
        {insertionRows.map((ins) => {
          const mediaUrl = (ins as any).mediaUrl ?? INSERTION_MEDIA_OVERRIDES[ins.id] ?? "";
          const mediaKind = getMediaKind(mediaUrl);
          const printCoverage = getPrintCoverage(ins.totalEvidencias, ins.periodoInicio, ins.periodoFim);
          const printMeta = PRINT_COVERAGE_META[printCoverage.state];
          const missingInfo = missingByInsertion.get(ins.id) ?? null;
          const auditInfo = auditByInsertion.get(ins.id) ?? null;
          const auditSummary = (ins as any).auditSummary ?? null;
          const problemDates = Array.isArray(auditSummary?.problemDates) ? auditSummary.problemDates : [];
          const evidenceStatusLabel = problemDates.length > 0
            ? "Precisa refazer"
            : missingInfo
              ? "Falta evidência"
              : auditInfo?.status === "ok" || auditInfo?.status === "ok_best_effort"
                ? "Status em dia"
                : printMeta.label;
          const profile = resolveOperationalProfile({
            agenciaNome: ins.agenciaNome,
            clienteNome: ins.clienteNome,
            campaignName: ins.campanhaName,
          });
          const profileSummary = getOperationalProfileSummary(profile);
          const toneMeta = getOperationalToneMeta(profileSummary.tone);

          return (
            <div
              key={`mobile-${ins.id}`}
              className={cn(
                "overflow-hidden rounded-lg border shadow-sm",
                STATUS_META[ins.statusNormalizado]?.boxClass ?? "bg-card border-border",
                ins.atrasado && "bg-red-500/8",
              )}
            >
              <button
                type="button"
                onClick={() => navigate(`/insercoes/${ins.id}`)}
                className="w-full px-3 pt-3 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white px-2 py-1.5">
                    {ins.siteSigla && SITE_LOGOS[ins.siteSigla] ? (
                      <img src={SITE_LOGOS[ins.siteSigla]} alt={ins.siteSigla} className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-mono text-[10px] font-bold text-primary">{ins.siteSigla ?? "—"}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{ins.campanhaName}</div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">{ins.clienteNome}</div>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        problemDates.length > 0
                          ? "border-red-500/30 bg-red-500/10 text-red-200"
                          : missingInfo
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                      )}>
                        {evidenceStatusLabel}
                      </span>
                      <StatusBadge status={ins.statusNormalizado} size="sm" />
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 pb-3 text-[11px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">PI</span>
                    <span className="font-medium text-foreground">{(ins as any).piCodigo ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Período</span>
                    <span className="font-medium text-foreground">{formatInsertionPeriodCompact(ins as any)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Posição</span>
                    <span className="max-w-[62%] text-right font-medium leading-snug text-foreground">
                      {ins.localFormatoNormalizado ?? ins.localFormato ?? "—"}
                    </span>
                  </div>
                </div>
              </button>

              <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-3 py-2 text-[10px]">
                {mediaKind === "none" ? (
                  <span className="inline-flex items-center gap-1 rounded border border-slate-500/30 bg-slate-600/20 px-1.5 py-0.5 font-medium text-slate-300">
                    <Link2 className="h-3 w-3" />
                    Sem mídia
                  </span>
                ) : (
                  <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium", MEDIA_KIND_META[mediaKind].badgeClass)}>
                    {mediaKind === "video" ? <PlayCircle className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                    {MEDIA_KIND_META[mediaKind].label}
                  </span>
                )}
                <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 font-medium", printMeta.badgeClass)}>
                  {printCoverage.actual}/{printCoverage.total} · {printMeta.label}
                </span>
                {missingInfo && (
                  <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-200">
                    {missingInfo.totalMissing} dia(s) faltando
                  </span>
                )}
                <span className="rounded border border-border bg-card px-1.5 py-0.5 text-foreground/85">
                  {getInsertionAuditEmojiSummary(auditSummary)}
                </span>
                {problemDates.length > 0 && (
                  <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-red-200">
                    {problemDates.length} com falha
                  </span>
                )}
                {ins.atrasado ? <DelayBadge atrasado={ins.atrasado} /> : null}
              </div>

              <div className="border-t border-border/70 bg-background/45 px-3 py-3" onClick={(event) => event.stopPropagation()}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-foreground">Evidência da campanha</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {printCoverage.actual}/{printCoverage.total} evidências salvas
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{getInsertionAuditEmojiSummary(auditSummary)}</span>
                </div>
                <CaptureProofButton
                  insertionId={ins.id}
                  hasMedia={Boolean(mediaUrl)}
                  compact
                  label={problemDates.length > 0 || missingInfo ? "Gerar novamente" : "Gerar evidência"}
                  auditedLabel="Em dia"
                  missingMediaLabel="Sem mídia"
                  showBadge={false}
                  className="min-h-10 w-full text-xs"
                  onSuccess={() => {
                    qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
                    qc.invalidateQueries({ queryKey: ["insertions-capture-audit"] });
                    qc.invalidateQueries({ queryKey: ["insertions-backfill-preview"] });
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Table desktop */}
      <div className="hidden overflow-auto md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20 sticky top-0">
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Site</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Campanha</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">PI / Valor</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Formato</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Período</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Competência</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Progresso</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Evidência</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
            )}
            {insertionRows.map(ins => {
              const mediaUrl = (ins as any).mediaUrl ?? INSERTION_MEDIA_OVERRIDES[ins.id] ?? "";
              const mediaKind = getMediaKind(mediaUrl);
              const printCoverage = getPrintCoverage(ins.totalEvidencias, ins.periodoInicio, ins.periodoFim);
              const printMeta = PRINT_COVERAGE_META[printCoverage.state];
              const missingInfo = missingByInsertion.get(ins.id) ?? null;
              const auditInfo = auditByInsertion.get(ins.id) ?? null;
              const auditIssueLines = getAuditIssueLines(auditInfo?.audit);
              const auditSummary = (ins as any).auditSummary ?? null;
              const problemDates = Array.isArray(auditSummary?.problemDates) ? auditSummary.problemDates : [];
              const profile = resolveOperationalProfile({
                agenciaNome: ins.agenciaNome,
                clienteNome: ins.clienteNome,
                campaignName: ins.campanhaName,
              });
              const profileSummary = getOperationalProfileSummary(profile);
              const toneMeta = getOperationalToneMeta(profileSummary.tone);
              return (
              <tr
                key={ins.id}
                onClick={() => navigate(`/insercoes/${ins.id}`)}
                className={cn(
                "border-b border-border/40 hover:bg-muted/15 transition-colors group cursor-pointer",
                STATUS_META[ins.statusNormalizado]?.boxClass,
                ins.atrasado && "bg-red-500/8"
              )}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white px-1.5 py-1">
                      {ins.siteSigla && SITE_LOGOS[ins.siteSigla] ? (
                        <img src={SITE_LOGOS[ins.siteSigla]} alt={ins.siteSigla} className="h-full w-full object-contain" />
                      ) : (
                        <span className="font-mono text-[10px] font-bold text-primary">{ins.siteSigla ?? "—"}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-mono text-[11px] font-bold text-primary">{ins.siteSigla ?? "—"}</span>
                      <span className="text-[10px] text-muted-foreground">{ins.siteNome ?? "—"}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground truncate max-w-[200px]">{ins.campanhaName}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{ins.clienteNome} · {ins.agenciaNome}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", toneMeta.badgeClass)}>
                      {toneMeta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">{profile.label} · {profileSummary.docsLabel}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {mediaKind === "none" ? (
                      <span className="inline-flex items-center gap-1 rounded border border-slate-500/30 bg-slate-600/20 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                        <Link2 className="h-3 w-3" />
                        Sem mídia
                      </span>
                    ) : (
                      <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium", MEDIA_KIND_META[mediaKind].badgeClass)}>
                        {mediaKind === "video" ? <PlayCircle className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                        {MEDIA_KIND_META[mediaKind].label}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-[10px] text-foreground/80">{(ins as any).piCodigo ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {(ins as any).valorLiquido != null
                      ? Number((ins as any).valorLiquido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground/75 max-w-[130px] truncate">{ins.localFormatoNormalizado ?? ins.localFormato ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-foreground/70 whitespace-nowrap">
                  {formatInsertionPeriodCompact(ins as any)}
                </td>
                <td className="px-4 py-3">
                  {ins.competencia ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-muted border border-border rounded text-muted-foreground">{ins.competencia}</span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={ins.statusNormalizado} size="sm" />
                    <DelayBadge atrasado={ins.atrasado} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium", printMeta.badgeClass)}>
                        {printCoverage.actual}/{printCoverage.total}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{printMeta.label}</span>
                      {missingInfo && (
                        <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                          {missingInfo.totalMissing} dia(s) faltando
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-snug">
                      {profileSummary.prazoPrincipal}. {profile.dashboardHint}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px]">
                      <span className="rounded border border-border bg-card px-1.5 py-0.5 text-foreground/85">
                        {getInsertionAuditEmojiSummary(auditSummary)}
                      </span>
                      {problemDates.length > 0 && (
                        <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-red-200">
                          {problemDates.length} evidência(s) com falha
                        </span>
                      )}
                    </div>
                    {getInsertionAuditCauseSummary(auditSummary) && (
                      <div className="text-[10px] text-muted-foreground leading-snug">
                        {getInsertionAuditCauseSummary(auditSummary)}
                      </div>
                    )}
                    <div className="text-[10px] text-foreground/85 leading-snug">
                      {profileSummary.riscoPrincipal}
                    </div>
                    <InsertionChecks
                      id={ins.id}
                      bannerPublicadoNoSite={ins.bannerPublicadoNoSite}
                      printGerado={ins.printGerado}
                      processoEnviadoAgencia={ins.processoEnviadoAgencia}
                      docsEnviados={ins.docsEnviados}
                    />
                  </div>
                </td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="space-y-2">
                    <CaptureProofButton
                      insertionId={ins.id}
                      hasMedia={Boolean(mediaUrl)}
                      compact
                      onSuccess={() => {
                        qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
                        qc.invalidateQueries({ queryKey: ["insertions-capture-audit"] });
                        qc.invalidateQueries({ queryKey: ["insertions-backfill-preview"] });
                      }}
                    />
                    {(auditInfo?.status === "ok" || auditInfo?.status === "ok_best_effort") && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          {auditInfo?.status === "ok_best_effort" ? "Melhor esforço" : "Auditado"} em {auditDate.split("-").reverse().join("/")}
                        </div>
                        {auditInfo?.status === "ok_best_effort" && (
                          <div className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-100">
                            <AlertTriangle className="h-3 w-3" />
                            Revisar banner
                          </div>
                        )}
                        {auditInfo.audit?.isVideoCapture && auditInfo.audit?.playerProofOk && (
                          <div className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-200">
                            <PlayCircle className="h-3 w-3" />
                            Vídeo com controles
                          </div>
                        )}
                      </div>
                    )}
                    {(auditInfo?.status === "invalid_audit" || auditInfo?.status === "invalid_url") && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-200 hover:bg-red-500/15">
                            <AlertTriangle className="h-3 w-3" />
                            Ver motivo da falha
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-96 space-y-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">Evidência com falha</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {auditInfo.status === "invalid_url"
                                ? "A evidência existe, mas a URL não abriu corretamente."
                                : `A evidência do dia ${auditDate.split("-").reverse().join("/")} abriu, mas precisa de revisão.`}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                              <div className="text-muted-foreground">Desktop</div>
                              <div className="mt-1 text-foreground">{auditInfo.audit?.systemDateTime || "—"}</div>
                            </div>
                            <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                              <div className="text-muted-foreground">Site</div>
                              <div className="mt-1 text-foreground">{auditInfo.audit?.pageDateText || "—"}</div>
                            </div>
                            <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                              <div className="text-muted-foreground">Primeira dobra</div>
                              <div className="mt-1 text-foreground">
                                {auditInfo.audit?.visualAudit?.viewportImagesLoaded ?? 0}/{auditInfo.audit?.visualAudit?.viewportImagesTotal ?? 0} imagens
                              </div>
                            </div>
                            <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                              <div className="text-muted-foreground">Anúncio</div>
                              <div className="mt-1 text-foreground">
                                {auditInfo.audit?.visualAudit?.slotImagesLoaded ?? 0}/{auditInfo.audit?.visualAudit?.slotImagesTotal ?? 0} imagens
                              </div>
                            </div>
                            <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                              <div className="text-muted-foreground">Fundos</div>
                              <div className="mt-1 text-foreground">
                                {auditInfo.audit?.visualAudit?.viewportBackgroundsLoaded ?? 0}/{auditInfo.audit?.visualAudit?.viewportBackgroundsTotal ?? 0}
                              </div>
                            </div>
                            <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                              <div className="text-muted-foreground">Vídeos / posters</div>
                              <div className="mt-1 text-foreground">
                                {auditInfo.audit?.visualAudit?.viewportVideosLoaded ?? 0}/{auditInfo.audit?.visualAudit?.viewportVideosTotal ?? 0}
                              </div>
                            </div>
                            {auditInfo.audit?.isVideoCapture && (
                              <div className="col-span-2 rounded border border-border bg-muted/20 px-2 py-1.5">
                                <div className="text-muted-foreground">Player do vídeo</div>
                                <div className="mt-1 text-foreground">
                                  {auditInfo.audit?.playerProofOk ? "Controles e progresso visíveis" : "Controles/progresso pendentes"} · {String(Math.max(0, Math.floor(Number(auditInfo.audit?.playerProof?.currentTime ?? 0)))).padStart(2, "0")}s / {String(Math.max(0, Math.floor(Number(auditInfo.audit?.playerProof?.duration ?? 0)))).padStart(2, "0")}s
                                </div>
                              </div>
                            )}
                          </div>
                          {auditIssueLines.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold text-foreground">Regras que falharam</div>
                              <ul className="space-y-1 text-[11px] text-red-200">
                                {auditIssueLines.map((issue, index) => (
                                  <li key={`${ins.id}-${index}`} className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1">
                                    {issue}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                    {problemDates.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-200 hover:bg-red-500/15">
                            <AlertTriangle className="h-3 w-3" />
                            {fixingInsertionId === ins.id ? "Corrigindo..." : "Corrigir falhas"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[26rem] space-y-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">Evidências com falha nesta inserção</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              A rotina apaga só as evidências problemáticas e gera novamente as datas com falha usando o horário retroativo salvo ou um horário variado entre 18h e 20h.
                            </div>
                          </div>
                          <div className="space-y-2">
                            {problemDates.map((problem: any) => (
                              <div key={`${ins.id}-${problem.date}`} className="rounded border border-border bg-muted/20 px-3 py-2 text-[11px]">
                                <div className="font-medium text-foreground">{problem.date}</div>
                                <div className="mt-1 text-muted-foreground">{problem.status === "invalid_url" ? "Link não abriu" : "Precisa de revisão"}</div>
                                {Array.isArray(problem.issues) && problem.issues.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {problem.issues.map((issue: any, index: number) => (
                                      <div key={index} className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-200">
                                        {issue?.label || issue?.detail || "Falha sem detalhe"}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            disabled={fixingInsertionId === ins.id || !canRunProtectedMutations}
                            onClick={() => void fixInvalidEvidences(ins.id)}
                            className="w-full rounded bg-red-500 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                            title={!canRunProtectedMutations ? protectedMutationMessage ?? readonlyMessage ?? undefined : undefined}
                          >
                            {fixingInsertionId === ins.id ? "Corrigindo..." : "Refazer evidências com falha"}
                          </button>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted/40">
                        <FileText className="h-3 w-3" />
                        Docs
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 space-y-2">
                      <div>
                        <div className="text-[11px] font-semibold text-foreground">Downloads rápidos</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Gera e baixa o documento individual sem precisar abrir a inserção.
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="rounded border border-border bg-muted/20 p-2">
                          <div className="text-[10px] font-medium text-foreground">Declaração de Execução</div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => void handleDownloadOperationalDoc(ins.id, "declaracao-execucao", "pdf")}
                              disabled={downloadingDocKey === `${ins.id}:declaracao-execucao:pdf`}
                              className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {downloadingDocKey === `${ins.id}:declaracao-execucao:pdf` ? "Baixando..." : "PDF"}
                            </button>
                            <button
                              onClick={() => void handleDownloadOperationalDoc(ins.id, "declaracao-execucao", "docx")}
                              disabled={downloadingDocKey === `${ins.id}:declaracao-execucao:docx`}
                              className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {downloadingDocKey === `${ins.id}:declaracao-execucao:docx` ? "Baixando..." : "DOCX"}
                            </button>
                          </div>
                        </div>
                        <div className="rounded border border-border bg-muted/20 p-2">
                          <div className="text-[10px] font-medium text-foreground">Anexo V</div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => void handleDownloadOperationalDoc(ins.id, "anexo-v", "pdf")}
                              disabled={downloadingDocKey === `${ins.id}:anexo-v:pdf`}
                              className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {downloadingDocKey === `${ins.id}:anexo-v:pdf` ? "Baixando..." : "PDF"}
                            </button>
                            <button
                              onClick={() => void handleDownloadOperationalDoc(ins.id, "anexo-v", "docx")}
                              disabled={downloadingDocKey === `${ins.id}:anexo-v:docx`}
                              className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {downloadingDocKey === `${ins.id}:anexo-v:docx` ? "Baixando..." : "DOCX"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </td>
              </tr>
            )})}
            {!isLoading && insertionRows.length === 0 && (
              <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">Nenhuma inserção encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
