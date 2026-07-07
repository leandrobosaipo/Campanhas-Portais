import { Activity, Clock3, ListOrdered, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import { JobProgressBar } from "@/components/adops/ops-queue/JobProgressBar";
import {
  JobProgress,
  dateTimePt,
  getKindLabel,
  getStatusClassName,
  getStatusLabel,
  relativeCountdown,
  useOpsQueueOverview,
} from "@/lib/ops-queue";
import { cn } from "@/lib/utils";

function QueueJobChip({ job }: { job: JobProgress }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-foreground">{getKindLabel(job.kind)}</div>
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", getStatusClassName(job.status))}>
          {getStatusLabel(job.status)}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground font-mono">{job.jobId.slice(0, 12)}</div>
    </div>
  );
}

export function QueueOverviewBanner({
  actions,
  className,
}: {
  actions?: ReactNode;
  className?: string;
}) {
  const { data, isLoading, isFetching, refetch } = useOpsQueueOverview(true);
  const now = data?.now ?? null;
  const queue = data?.queue ?? [];
  const nextScheduled = (data?.scheduled ?? [])[0] ?? null;

  return (
    <div className={cn("border-b border-border bg-card/70 px-4 py-3 backdrop-blur-sm md:px-6", className)}>
      {actions ? (
        <div className="mb-3 flex items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-[1.3fr,1fr,1fr]">
        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Activity className="h-3.5 w-3.5 text-sky-300" />
              Executando agora
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
              title="Atualizar fila"
            >
              <RefreshCcw className={cn("h-3 w-3", isFetching ? "animate-spin" : "")} />
              Atualizar
            </button>
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Carregando fila operacional...</div>
          ) : now ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-foreground">{getKindLabel(now.kind)}</div>
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", getStatusClassName(now.status))}>
                  {getStatusLabel(now.status)}
                </span>
              </div>
              <JobProgressBar progress={now} />
              <div className="text-[10px] text-muted-foreground">
                Início: {dateTimePt(now.startedAt || now.createdAt)} · Atualizado: {dateTimePt(now.updatedAt)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Nenhuma rotina em execução neste momento.</div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <ListOrdered className="h-3.5 w-3.5 text-amber-300" />
            Próximos da fila ({queue.length})
          </div>
          {queue.length ? (
            <div className="grid max-h-36 gap-2 overflow-auto pr-1">
              {queue.slice(0, 3).map((job) => (
                <QueueJobChip key={job.jobId} job={job} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Fila vazia no momento.</div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
            Próximo agendamento
          </div>
          {nextScheduled ? (
            <div className="space-y-1 text-xs">
              <div className="font-medium text-foreground">{getKindLabel(nextScheduled.kind)}</div>
              <div className="text-muted-foreground">Agendado para: {dateTimePt(nextScheduled.startedAt || nextScheduled.createdAt)}</div>
              <div className="text-muted-foreground">Começa em: {relativeCountdown(nextScheduled.startedAt || nextScheduled.createdAt) ?? "—"}</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Nenhum job agendado para depois.</div>
          )}
        </div>
      </div>
    </div>
  );
}
