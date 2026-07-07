import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { JobProgress, jobPrimaryPercent, summarizeProgress } from "@/lib/ops-queue";

export function JobProgressBar({
  progress,
  compact = false,
}: {
  progress: JobProgress;
  compact?: boolean;
}) {
  const percent = jobPrimaryPercent(progress);
  const summary = summarizeProgress(progress);

  return (
    <div className={cn("space-y-1", compact ? "text-[10px]" : "text-[11px]")}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{progress.stageLabel}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <Progress value={percent} className={cn(compact ? "h-1.5" : "h-2")} />
      {summary ? <div className="text-muted-foreground">{summary}</div> : null}
    </div>
  );
}
