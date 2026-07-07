import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetDashboardBySite,
  useGetDashboardByClient,
  useGetDashboardByCompetencia,
  useGetDashboardCritical,
} from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { PageHeader } from "@/components/adops/Layout";
import { StatusBadge, DelayBadge } from "@/components/adops/StatusBadge";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-base";
import { AlertTriangle, TrendingUp, CheckCircle2, Clock, FileText, Send, Inbox, Camera, ClipboardCheck, Loader2, PlayCircle } from "lucide-react";
import { COMPETENCIAS, DEFAULT_COMPETENCIA } from "@/lib/adops-config";
import { getOperationalProfileSummary, getOperationalToneMeta, resolveOperationalProfile } from "@/lib/adops-requirements";
import { usePersistentState } from "@/lib/usePersistentState";
import { useApiMode } from "@/lib/use-api-mode";
import { useOpsOperator } from "@/lib/useOpsOperator";
import { getKindLabel, getStatusClassName, getStatusLabel, useOpsQueueOverview } from "@/lib/ops-queue";
import { JobProgressBar } from "@/components/adops/ops-queue/JobProgressBar";

const CHART_COLORS = {
  active: "#38bdf8",
  done: "#34d399",
  late: "#fb7185",
  grid: "hsl(var(--border))",
  tick: "hsl(var(--muted-foreground))",
};

function KpiCard({ label, value, icon: Icon, variant = "default", sub }: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  variant?: "default" | "danger" | "success" | "warning" | "info";
  sub?: string;
}) {
  const variantStyles = {
    default: "border-border text-foreground",
    danger: "border-red-500/30 bg-red-500/5",
    success: "border-emerald-500/30 bg-emerald-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    info: "border-blue-500/30 bg-blue-500/5",
  };
  const iconStyles = {
    default: "text-muted-foreground",
    danger: "text-red-400",
    success: "text-emerald-400",
    warning: "text-amber-400",
    info: "text-blue-400",
  };

  return (
    <div className={cn("bg-card border rounded p-4 flex flex-col gap-2", variantStyles[variant])}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        <Icon className={cn("w-4 h-4", iconStyles[variant])} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded p-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill || p.stroke }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export function Dashboard() {
  const { isReadonlyPublic, isCloudflarePublic, readonlyMessage, canRunProtectedMutations, protectedMutationMessage } = useApiMode();
  const { token, setToken, hasToken, createJob } = useOpsOperator();
  const [filters, setFilters] = usePersistentState("adops.dashboard.filters.v1", {
    competencia: DEFAULT_COMPETENCIA as string | null,
    captureAt: "",
  });
  const competencia = filters.competencia;
  const captureAt = filters.captureAt;
  const [batchState, setBatchState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [batchMessage, setBatchMessage] = useState("");
  const [backfillState, setBackfillState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [backfillMessage, setBackfillMessage] = useState("");
  const [backfillJobId, setBackfillJobId] = useState<string | null>(null);
  const [auditState, setAuditState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [auditMessage, setAuditMessage] = useState("");
  const params = competencia ? { competencia } : {};

  const { data: summary } = useGetDashboardSummary({ ...params });
  const { data: bySite } = useGetDashboardBySite({ ...params });
  const { data: byClient } = useGetDashboardByClient({ ...params });
  const { data: byComp } = useGetDashboardByCompetencia();
  const { data: critical } = useGetDashboardCritical({ ...params });
  const queueOverview = useOpsQueueOverview(true);
  const { data: backfillPreview, refetch: refetchBackfillPreview, isFetching: isBackfillPreviewLoading } = useQuery({
    queryKey: ["dashboard-backfill-preview", competencia],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (competencia) query.set("competencia", competencia);
      const response = await apiFetch(`/api/insertions/capture-proof/backfill-overdue/preview?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar a prévia dos retroativos.");
      return payload as {
        totalCandidates: number;
        totalJobs: number;
        totalSkipped: number;
        grouped: Array<{ insertionId: number; campaignName: string | null; siteSigla: string | null; localFormato: string | null; totalMissing: number; sampleDates: string[] }>;
      };
    },
    staleTime: 30_000,
  });
  const { data: auditSummary } = useQuery({
    queryKey: ["dashboard-print-audit", competencia],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (competencia) query.set("competencia", competencia);
      if (captureAt) query.set("date", captureAt.slice(0, 10));
      const response = await apiFetch(`/api/insertions/capture-proof/audit?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar a auditoria dos prints.");
      return payload as {
        date: string;
        totalEligible: number;
        ok: number;
        missing: number;
        invalid: number;
        items: Array<{
          status: "ok" | "missing" | "invalid_url" | "invalid_audit";
          audit?: { isVideoCapture?: boolean; playerProofOk?: boolean } | null;
        }>;
      };
    },
    staleTime: 30_000,
  });

  const videoAuditSummary = (auditSummary?.items ?? []).reduce(
    (acc, item) => {
      if (!item.audit?.isVideoCapture) return acc;
      acc.total += 1;
      if (item.status === "ok" && item.audit?.playerProofOk) acc.ok += 1;
      if (!item.audit?.playerProofOk) acc.pending += 1;
      return acc;
    },
    { total: 0, ok: 0, pending: 0 },
  );

  useEffect(() => {
    if (!backfillJobId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const endpoint = isReadonlyPublic ? `/api/ops/jobs/${backfillJobId}` : `/api/insertions/capture-proof/backfill-overdue/jobs/${backfillJobId}`;
        const response = await apiFetch(endpoint);
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        if (payload.status === "running" || payload.status === "queued" || payload.status === "ready_for_runner") {
          setBackfillState("running");
          if (isReadonlyPublic) {
            setBackfillMessage(`Job remoto em andamento no Cloudflare: ${payload.status}.${payload.runnerId ? ` Runner: ${payload.runnerId}.` : ""}`);
          } else {
            setBackfillMessage(`Executando em segundo plano: ${payload.generated}/${payload.totalJobs} gerados, ${payload.errors} falhas.${payload.current ? ` Agora: ${payload.current}` : ""}`);
          }
          return;
        }
        if (payload.status === "completed") {
          setBackfillState("success");
          setBackfillMessage(isReadonlyPublic ? `Job remoto concluído no Cloudflare: ${payload.id}.` : `Retroativos concluídos: ${payload.generated} gerados, ${payload.errors} com falha, ${payload.totalSkipped} já existentes.`);
          setBackfillJobId(null);
          refetchBackfillPreview();
          clearInterval(interval);
          return;
        }
        if (payload.status === "failed") {
          setBackfillState("error");
          setBackfillMessage(`Lote interrompido: ${payload.current || "falha inesperada"}`);
          setBackfillJobId(null);
          clearInterval(interval);
        }
      } catch {
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [backfillJobId, isReadonlyPublic, refetchBackfillPreview]);

  const runBatchCapture = async () => {
    if (!canRunProtectedMutations) {
      setBatchState("error");
      setBatchMessage(protectedMutationMessage ?? "Informe o token de operador para disparar os prints do dia no Cloudflare.");
      return;
    }
    setBatchState("running");
    setBatchMessage(isReadonlyPublic ? "Criando job protegido de prints do dia no Cloudflare." : "Gerando os prints do dia para todas as inserções ativas do recorte atual.");
    try {
      if (isReadonlyPublic) {
        const payload = await createJob("print-batch", { ...(competencia ? { competencia } : {}), ...(captureAt ? { captureAt } : {}) });
        setBatchState("success");
        setBatchMessage(`Job de prints do dia criado no Cloudflare: ${payload.jobId}. Acompanhe em Sincronização > Jobs operacionais.`);
        return;
      }
      const response = await apiFetch("/api/insertions/capture-proof/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(competencia ? { competencia } : {}), ...(captureAt ? { captureAt } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha no lote.");
      const skipped = payload.results?.filter((item: any) => item.status === "skipped").length ?? 0;
      setBatchState("success");
      setBatchMessage(`Lote concluído: ${payload.ok ?? 0} gerados, ${payload.error ?? 0} com falha, ${skipped} já existentes.`);
    } catch (error) {
      setBatchState("error");
      setBatchMessage(error instanceof Error ? error.message : "Falha ao gerar os prints do dia.");
    }
  };

  const runAudit = async () => {
    setAuditState("running");
    setAuditMessage("Auditando se todos os prints do dia foram gerados e se as URLs estão válidas.");
    try {
      const query = new URLSearchParams();
      if (competencia) query.set("competencia", competencia);
      if (captureAt) query.set("date", captureAt.slice(0, 10));
      const response = await apiFetch(`/api/insertions/capture-proof/audit?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha na auditoria.");
      setAuditState("success");
      setAuditMessage(`Auditoria: ${payload.ok} válidos, ${payload.missing} faltando, ${payload.invalid} inválidos.`);
    } catch (error) {
      setAuditState("error");
      setAuditMessage(error instanceof Error ? error.message : "Falha ao auditar os prints do dia.");
    }
  };

  const runOverdueBackfill = async () => {
    if (!canRunProtectedMutations) {
      setBackfillState("error");
      setBackfillMessage(protectedMutationMessage ?? "Informe o token de operador para disparar os retroativos protegidos no Cloudflare.");
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
        `Este lote vai gerar ${summary.totalJobs} print(s) faltando em ${summary.grouped.length} inserção(ões).` +
        `\nOs horários serão variados entre 18h e 20h.` +
        `\nDeseja continuar?`
      );
      if (!confirmed) return;

      setBackfillState("running");
      setBackfillMessage(isReadonlyPublic ? "Job remoto criado no Cloudflare. Você pode acompanhar o status sem sair do painel." : "Lote iniciado em segundo plano. Você pode continuar navegando.");
      if (isReadonlyPublic) {
        const payload = await createJob("print-backfill", { ...(competencia ? { competencia } : {}) });
        setBackfillJobId(payload.jobId ?? null);
        return;
      }
      const response = await apiFetch("/api/insertions/capture-proof/backfill-overdue/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(competencia ? { competencia } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao iniciar os retroativos vencidos.");
      setBackfillJobId(payload.jobId ?? null);
    } catch (error) {
      setBackfillState("error");
      setBackfillMessage(error instanceof Error ? error.message : "Falha ao gerar os retroativos vencidos.");
    }
  };

  const fmt = (n: number | undefined) => n?.toLocaleString("pt-BR") ?? "—";
  const fmtR = (n: number | undefined) =>
    n != null ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const byCompetencia = [...(byComp ?? [])].sort((a, b) => {
    const indexA = COMPETENCIAS.indexOf(a.competencia);
    const indexB = COMPETENCIAS.indexOf(b.competencia);
    if (indexA === -1 && indexB === -1) return a.competencia.localeCompare(b.competencia);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  const activeProfiles = (critical ?? []).reduce<Array<{ id: string; label: string; total: number; hint: string; recommendation: string; toneLabel: string; toneClass: string }>>((acc, item) => {
    const profile = resolveOperationalProfile({
      agenciaNome: item.agenciaNome,
      clienteNome: item.clienteNome,
      campaignName: item.campanhaName,
    });
    const summary = getOperationalProfileSummary(profile);
    const toneMeta = getOperationalToneMeta(summary.tone);
    const found = acc.find((entry) => entry.id === profile.id);
    if (found) {
      found.total += 1;
    } else {
      acc.push({ id: profile.id, label: profile.label, total: 1, hint: summary.riscoPrincipal, recommendation: summary.recommendedNextStep, toneLabel: toneMeta.label, toneClass: toneMeta.badgeClass });
    }
    return acc;
  }, []).sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={competencia ? `Visão executiva de operações publicitárias · ${competencia}` : "Visão executiva de operações publicitárias"}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 rounded border border-border bg-background/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              Publicado
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-400 ml-2" />
              Pede ação hoje
              <span className="inline-flex h-2 w-2 rounded-full bg-red-400 ml-2" />
              Estourou prazo da PI
            </div>
            <select
              value={competencia ?? ""}
              onChange={e => setFilters((prev) => ({ ...prev, competencia: e.target.value || null }))}
              className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Todas as competências</option>
              {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="datetime-local"
              value={captureAt}
              onChange={(e) => setFilters((prev) => ({ ...prev, captureAt: e.target.value }))}
              className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Opcional: use para gerar prova retroativa de uma data e hora específicas."
            />
            <button
              onClick={runBatchCapture}
              disabled={batchState === "running" || !canRunProtectedMutations}
              className="flex items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
              title={!canRunProtectedMutations ? protectedMutationMessage ?? "Cole o token de operador para disparar os prints do dia." : undefined}
            >
              {batchState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Prints do dia
            </button>
            <button
              onClick={runOverdueBackfill}
              disabled={backfillState === "running" || !canRunProtectedMutations}
              className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 disabled:opacity-60"
              title={!canRunProtectedMutations ? protectedMutationMessage ?? "Cole o token de operador para disparar os retroativos." : undefined}
            >
              {backfillState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
              Retroativos vencidos
            </button>
            <button
              onClick={() => refetchBackfillPreview()}
              disabled={isBackfillPreviewLoading}
              className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
            >
              {isBackfillPreviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
              Prévia
            </button>
            <button
              onClick={runAudit}
              disabled={auditState === "running"}
              className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
            >
              {auditState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
              Auditar
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {isCloudflarePublic && !canRunProtectedMutations ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
            <div className="font-semibold">Modo público no Cloudflare</div>
            <div className="mt-1 text-sky-100/90">{protectedMutationMessage ?? readonlyMessage ?? "Ações operacionais protegidas exigem token do operador."}</div>
            <div className="mt-2 text-xs text-sky-100/75">
              Leituras e auditorias já funcionam aqui. Para disparar jobs protegidos, cole o token de operador neste navegador.
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Cole o token de operador"
                className="min-w-0 flex-1 rounded border border-sky-400/30 bg-slate-950/40 px-3 py-2 text-xs text-sky-50 placeholder:text-sky-200/40 focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button type="button" onClick={() => setToken("")} className="rounded border border-sky-400/30 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-500/10">
                Limpar token
              </button>
            </div>
            <div className="mt-2 text-[11px] text-sky-100/70">
              Status do token: {hasToken ? "configurado neste navegador" : "ainda não informado"}.
            </div>
          </div>
        ) : null}

        {queueOverview.data ? (
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Rotinas em segundo plano</div>
                <div className="text-xs text-muted-foreground">
                  Acompanhe execução atual, fila e agendamentos sem sair do dashboard.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border bg-background/70 px-2 py-1 text-muted-foreground">Executando: {queueOverview.data.totals.running}</span>
                <span className="rounded-full border border-border bg-background/70 px-2 py-1 text-muted-foreground">Fila: {queueOverview.data.totals.queued + queueOverview.data.totals.readyForRunner}</span>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr,1fr,1fr]">
              <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                <div className="text-xs font-semibold text-foreground">Executando agora</div>
                {queueOverview.data.now ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-foreground">{getKindLabel(queueOverview.data.now.kind)}</div>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", getStatusClassName(queueOverview.data.now.status))}>
                        {getStatusLabel(queueOverview.data.now.status)}
                      </span>
                    </div>
                    <JobProgressBar progress={queueOverview.data.now} />
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">Nenhuma rotina executando agora.</div>
                )}
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                <div className="text-xs font-semibold text-foreground">Na fila</div>
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
                  <div className="mt-2 text-xs text-muted-foreground">Sem rotinas aguardando.</div>
                )}
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                <div className="text-xs font-semibold text-foreground">Próximo agendamento</div>
                {(queueOverview.data.scheduled ?? []).length ? (
                  <div className="mt-2 text-xs">
                    <div className="font-medium text-foreground">{getKindLabel(queueOverview.data.scheduled[0].kind)}</div>
                    <div className="text-muted-foreground">Previsto para iniciar em breve.</div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">Sem agendamento pendente.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {backfillPreview && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-foreground">O que falta regularizar nos retroativos</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hoje o recorte tem <strong>{backfillPreview.totalJobs}</strong> print(s) faltando em <strong>{backfillPreview.grouped.length}</strong> inserção(ões).
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-background/70 px-2 py-1 text-muted-foreground">Elegíveis: {backfillPreview.totalCandidates}</span>
                <span className="rounded-full bg-background/70 px-2 py-1 text-muted-foreground">Já existentes: {backfillPreview.totalSkipped}</span>
              </div>
            </div>
            {backfillPreview.grouped.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {backfillPreview.grouped.slice(0, 8).map((item) => (
                  <Link key={item.insertionId} href={`/insercoes/${item.insertionId}`} className="rounded-lg border border-border/60 bg-background/70 p-3 text-xs hover:border-primary/40">
                    <div className="font-medium text-foreground">{item.campaignName || `Inserção ${item.insertionId}`}</div>
                    <div className="mt-1 text-muted-foreground">{item.siteSigla} · {item.localFormato || "Sem posição"}</div>
                    <div className="mt-2 font-medium text-amber-200">{item.totalMissing} dia(s) faltando</div>
                    <div className="mt-1 text-muted-foreground">{item.sampleDates.join(", ")}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                Nenhum retroativo vencido ficou pendente neste recorte.
              </div>
            )}
          </div>
        )}

        {(batchMessage || backfillMessage || auditMessage) && (
          <div className="grid gap-2 lg:grid-cols-3">
            {batchMessage ? (
              <div className={cn("rounded-lg border px-3 py-2 text-xs", batchState === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : batchState === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-500/30 bg-slate-700/15 text-slate-200")}>
                <div className="font-medium">Geração em lote</div>
                <div className="mt-1">{batchMessage}</div>
              </div>
            ) : null}
            {backfillMessage ? (
              <div className={cn("rounded-lg border px-3 py-2 text-xs", backfillState === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : backfillState === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-100")}>
                <div className="font-medium">Retroativos vencidos</div>
                <div className="mt-1">{backfillMessage}</div>
              </div>
            ) : null}
            {auditMessage ? (
              <div className={cn("rounded-lg border px-3 py-2 text-xs", auditState === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : auditState === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-500/30 bg-slate-700/15 text-slate-200")}>
                <div className="font-medium">Auditoria de prints</div>
                <div className="mt-1">{auditMessage}</div>
              </div>
            ) : null}
          </div>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label="Total Inserções" value={fmt(summary?.totalInsercoes)} icon={Inbox} />
          <KpiCard label="Ativas" value={fmt(summary?.ativas)} icon={TrendingUp} variant="info" />
          <KpiCard label="Concluídas" value={fmt(summary?.concluidas)} icon={CheckCircle2} variant="success" />
          <KpiCard label="Atrasadas" value={fmt(summary?.atrasadas)} icon={AlertTriangle} variant="danger" />
          <KpiCard
            label="Prints Auditados Hoje"
            value={`${fmt(auditSummary?.ok)}${auditSummary ? `/${fmt(auditSummary.totalEligible)}` : ""}`}
            icon={ClipboardCheck}
            variant={auditSummary?.missing || auditSummary?.invalid ? "warning" : "success"}
            sub={auditSummary ? `${fmt(auditSummary.missing)} faltando · ${fmt(auditSummary.invalid)} inválidos` : "Conferindo o recorte atual"}
          />
          <KpiCard
            label="Vídeos Auditados"
            value={`${videoAuditSummary.ok}${videoAuditSummary.total ? `/${videoAuditSummary.total}` : ""}`}
            icon={PlayCircle}
            variant={videoAuditSummary.pending ? "warning" : "info"}
            sub={videoAuditSummary.total ? `${videoAuditSummary.pending} com player pendente` : "Nenhum vídeo no recorte"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <KpiCard label="Valor Total" value={fmtR(summary?.valorTotalLiquido)} icon={FileText} sub={`${fmt(summary?.totalCampanhas)} campanhas`} />
          <div className="rounded border border-sky-500/20 bg-sky-500/8 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <PlayCircle className="h-4 w-4 text-sky-300" />
              Auditoria de vídeo por portal
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              O selo de vídeo e a conferência do player são parametrizados por portal. Cada tema pode ter relógio, slot, layout e comportamento visual diferentes.
            </p>
          </div>
        </div>

        {activeProfiles.length ? (
          <div className="rounded border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">Como ler os prazos deste recorte</div>
            <p className="mt-1 text-xs text-muted-foreground">
              O dashboard agora assume que a PI é a referência principal de operação. Então o alerta não é só “atrasado”: ele também tenta mostrar que tipo de risco está concentrado no recorte.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeProfiles.slice(0, 3).map((profile) => (
                <div key={profile.id} className="rounded border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">{profile.label}</div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", profile.toneClass)}>
                      {profile.toneLabel}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">{profile.hint}</div>
                  <div className="mt-2 text-[11px] text-foreground">{profile.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Pending pipeline */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Ag. Publicação" value={fmt(summary?.aguardandoPublicacao)} icon={Clock} variant="warning" />
          <KpiCard label="Ag. Print" value={fmt(summary?.aguardandoPrint)} icon={FileText} variant="warning" />
          <KpiCard label="Ag. Envio" value={fmt(summary?.aguardandoEnvio)} icon={Send} variant="warning" />
          <KpiCard label="Ag. Docs" value={fmt(summary?.aguardandoDocs)} icon={FileText} variant="warning" />
        </div>

        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Perfis operacionais em destaque</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Esta leitura ajuda a equipe a entender por que um mesmo status pode exigir documentos diferentes dependendo da agência e do cliente.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeProfiles.length ? activeProfiles.map((profile) => (
              <div key={profile.id} className="rounded border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">{profile.label}</div>
                  <div className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                    {profile.total} crítico(s)
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{profile.hint}</p>
                <p className="mt-2 text-[11px] text-foreground">{profile.recommendation}</p>
                <div className="mt-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", profile.toneClass)}>
                    {profile.toneLabel}
                  </span>
                </div>
              </div>
            )) : (
              <div className="text-xs text-muted-foreground">Sem itens críticos no recorte atual.</div>
            )}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Inserções por Site</h2>
              <span className="text-[11px] text-muted-foreground">Base: inserções por site e etapa</span>
            </div>
            {bySite && bySite.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bySite} barSize={20}>
                  <XAxis dataKey="siteSigla" tick={{ fontSize: 11, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ativas" name="Ativas" fill={CHART_COLORS.active} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="concluidas" name="Concluídas" fill={CHART_COLORS.done} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="atrasadas" name="Atrasadas" fill={CHART_COLORS.late} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
                Nenhum dado disponível para o recorte selecionado.
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Histórico por Competência</h2>
              <span className="text-[11px] text-muted-foreground">Leitura mensal para gestão e cobrança</span>
            </div>
            {byCompetencia.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={byCompetencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="competencia" tick={{ fontSize: 9, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total" name="Total" stroke={CHART_COLORS.active} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="concluidas" name="Concluídas" stroke={CHART_COLORS.done} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="atrasadas" name="Atrasadas" stroke={CHART_COLORS.late} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
                Nenhum histórico consolidado disponível.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* By client */}
          <div className="bg-card border border-border rounded p-4 lg:col-span-1">
            <h2 className="text-sm font-semibold text-foreground mb-3">Por Cliente</h2>
            <div className="space-y-2">
              {byClient?.map(c => (
                <div key={c.clienteId} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-foreground flex-1 whitespace-normal leading-snug">{c.clienteNome}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground tabular-nums">{c.total}</span>
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (c.concluidas / (c.total || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Critical items */}
          <div className="bg-card border border-border rounded p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Itens Críticos
              </h2>
              <Link href="/insercoes?atrasado=true" className="text-xs text-primary hover:underline">
                Ver todos
              </Link>
            </div>
            <div className="space-y-2">
              {critical?.slice(0, 5).map(ins => (
                <Link
                  key={ins.id}
                  href={`/insercoes/${ins.id}`}
                  className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">{ins.campanhaName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{ins.siteSigla}</span>
                      <DelayBadge atrasado={ins.atrasado} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {ins.localFormatoNormalizado} · {ins.clienteNome}
                    </div>
                  </div>
                  <StatusBadge status={ins.statusNormalizado} size="sm" />
                </Link>
              ))}
              {(!critical || critical.length === 0) && (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhum item crítico</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
