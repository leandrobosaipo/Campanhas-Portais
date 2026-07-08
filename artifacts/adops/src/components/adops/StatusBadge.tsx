import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_META } from "@/lib/adops-config";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  showDot?: boolean;
}

export function StatusBadge({ status, size = "md", showDot = true }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const meta = STATUS_META[status];
  const style = meta?.badgeClass ?? STATUS_META.rascunho.badgeClass;
  const dot = meta?.dotClass ?? STATUS_META.rascunho.dotClass;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium border rounded-sm",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
        style
      )}
    >
      {showDot && (
        <span className={cn("rounded-full shrink-0", size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5", dot)} />
      )}
      {label}
    </span>
  );
}

export function DelayBadge({ atrasado }: { atrasado: boolean }) {
  if (!atrasado) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 bg-red-500/20 text-red-300 border border-red-500/40 rounded-sm">
      <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
      ATRASO
    </span>
  );
}
