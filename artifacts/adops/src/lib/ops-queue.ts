import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-base";

export type OpsJobKind =
  | "print-batch"
  | "print-backfill"
  | "print-single"
  | "sync-planilha"
  | "analytics-report"
  | "pi-site-export";

export type OpsJobStatus = "queued" | "ready_for_runner" | "running" | "completed" | "failed";

export type JobProgress = {
  jobId: string;
  kind: OpsJobKind;
  status: OpsJobStatus;
  stageKey: string;
  stageLabel: string;
  percentStage: number | null;
  percentTotal: number | null;
  itemsDone: number | null;
  itemsTotal: number | null;
  etaSeconds: number | null;
  startedAt: string | null;
  updatedAt: string;
  createdAt: string;
  runnerId: string | null;
  error: string | null;
};

export type QueueOverview = {
  now: JobProgress | null;
  queue: JobProgress[];
  scheduled: JobProgress[];
  totals: {
    running: number;
    queued: number;
    readyForRunner: number;
    completedToday: number;
    failedToday: number;
  };
  generatedAt: string;
};

function normalizePercent(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getKindLabel(kind: OpsJobKind) {
  switch (kind) {
    case "print-single":
      return "Evidência individual";
    case "print-backfill":
      return "Evidências retroativas";
    case "print-batch":
      return "Evidências do dia";
    case "sync-planilha":
      return "Sincronização";
    case "analytics-report":
      return "Relatório Analytics";
    case "pi-site-export":
      return "Pacote PI por site";
    default:
      return kind;
  }
}

export function getStatusLabel(status: OpsJobStatus) {
  switch (status) {
    case "queued":
      return "Na fila";
    case "ready_for_runner":
      return "Aguardando execução";
    case "running":
      return "Executando";
    case "completed":
      return "Concluído";
    case "failed":
      return "Falhou";
    default:
      return status;
  }
}

export function getStatusClassName(status: OpsJobStatus) {
  switch (status) {
    case "running":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "failed":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "ready_for_runner":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

export function summarizeProgress(progress: JobProgress) {
  const parts: string[] = [];
  if (progress.percentTotal !== null) parts.push(`${progress.percentTotal}%`);
  if (progress.itemsDone !== null && progress.itemsTotal !== null) {
    parts.push(`${progress.itemsDone}/${progress.itemsTotal} itens`);
  }
  if (progress.etaSeconds !== null) {
    const minutes = Math.max(0, Math.round(progress.etaSeconds / 60));
    parts.push(minutes > 0 ? `ETA ${minutes} min` : "Finalizando");
  }
  return parts.join(" · ");
}

export function jobPrimaryPercent(progress: JobProgress) {
  if (progress.percentTotal !== null) return normalizePercent(progress.percentTotal);
  if (progress.percentStage !== null) return normalizePercent(progress.percentStage);
  if (progress.status === "completed") return 100;
  if (progress.status === "running") return 20;
  return 0;
}

export function etaToHuman(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const remain = safe % 60;
  return remain > 0 ? `${minutes}m ${remain}s` : `${minutes}m`;
}

export function dateTimePt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { hour12: false });
}

export function relativeCountdown(targetIso: string | null | undefined) {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return null;
  const diff = Math.round((target.getTime() - Date.now()) / 1000);
  if (diff <= 0) return "iniciando agora";
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${diff}s`;
}

async function fetchQueueOverview() {
  const response = await apiFetch("/api/ops/queue/overview");
  const payload = await response.json();
  if (response.status === 404) {
    return {
      now: null,
      queue: [],
      scheduled: [],
      totals: {
        running: 0,
        queued: 0,
        readyForRunner: 0,
        completedToday: 0,
        failedToday: 0,
      },
      generatedAt: new Date().toISOString(),
    } as QueueOverview;
  }
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || "Não consegui carregar o andamento das tarefas.");
  }
  return payload as QueueOverview;
}

async function fetchJobProgress(jobId: string) {
  const response = await apiFetch(`/api/ops/jobs/${jobId}/progress`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.details || payload?.error || "Não consegui carregar o andamento desta tarefa.");
  }
  return payload as JobProgress;
}

export function useOpsQueueOverview(enabled = true) {
  return useQuery({
    queryKey: ["ops-queue-overview"],
    queryFn: fetchQueueOverview,
    enabled,
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}

export function useOpsJobProgress(jobId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["ops-job-progress", jobId],
    queryFn: () => fetchJobProgress(String(jobId)),
    enabled: Boolean(jobId) && enabled,
    staleTime: 3_000,
    refetchInterval: 4_000,
  });
}
