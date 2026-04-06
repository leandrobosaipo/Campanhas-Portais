import { cn } from "@/lib/utils";

export const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_publicacao: "Ag. Publicação",
  publicado_no_site: "Publicado",
  aguardando_print: "Ag. Print",
  print_gerado: "Print Gerado",
  enviado_para_agencia: "Enviado",
  docs_enviados: "Docs Enviados",
  concluido: "Concluído",
  atrasado: "Atrasado",
  bloqueado: "Bloqueado",
  cancelado: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  rascunho: "bg-slate-700/60 text-slate-300 border-slate-600/40",
  aguardando_publicacao: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  publicado_no_site: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  aguardando_print: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  print_gerado: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  enviado_para_agencia: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  docs_enviados: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  concluido: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  atrasado: "bg-red-500/20 text-red-300 border-red-500/40",
  bloqueado: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  cancelado: "bg-slate-600/40 text-slate-500 border-slate-600/30 line-through",
};

const STATUS_DOT: Record<string, string> = {
  rascunho: "bg-slate-500",
  aguardando_publicacao: "bg-amber-400",
  publicado_no_site: "bg-blue-400",
  aguardando_print: "bg-orange-400",
  print_gerado: "bg-cyan-400",
  enviado_para_agencia: "bg-violet-400",
  docs_enviados: "bg-indigo-400",
  concluido: "bg-emerald-400",
  atrasado: "bg-red-400 animate-pulse",
  bloqueado: "bg-rose-400",
  cancelado: "bg-slate-600",
};

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  showDot?: boolean;
}

export function StatusBadge({ status, size = "md", showDot = true }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const style = STATUS_STYLES[status] ?? "bg-slate-700/60 text-slate-300 border-slate-600/40";
  const dot = STATUS_DOT[status] ?? "bg-slate-500";

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
