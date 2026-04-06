import { useState } from "react";
import { Link } from "wouter";
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
import { AlertTriangle, TrendingUp, CheckCircle2, Clock, FileText, Send, Inbox } from "lucide-react";

const COMPETENCIAS = [
  "OUTUBRO/2025", "NOVEMBRO/2025", "DEZEMBRO/2025",
  "JANEIRO/2026", "FEVEREIRO/2026", "MARÇO/2026", "ABRIL/2026",
];

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
  const [competencia, setCompetencia] = useState<string | null>(null);
  const params = competencia ? { competencia } : {};

  const { data: summary } = useGetDashboardSummary({ ...params });
  const { data: bySite } = useGetDashboardBySite({ ...params });
  const { data: byClient } = useGetDashboardByClient({ ...params });
  const { data: byComp } = useGetDashboardByCompetencia();
  const { data: critical } = useGetDashboardCritical({ ...params });

  const fmt = (n: number | undefined) => n?.toLocaleString("pt-BR") ?? "—";
  const fmtR = (n: number | undefined) =>
    n != null ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão executiva de operações publicitárias"
        actions={
          <select
            value={competencia ?? ""}
            onChange={e => setCompetencia(e.target.value || null)}
            className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todas as competências</option>
            {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <KpiCard label="Total Inserções" value={fmt(summary?.totalInsercoes)} icon={Inbox} />
          <KpiCard label="Ativas" value={fmt(summary?.ativas)} icon={TrendingUp} variant="info" />
          <KpiCard label="Concluídas" value={fmt(summary?.concluidas)} icon={CheckCircle2} variant="success" />
          <KpiCard label="Atrasadas" value={fmt(summary?.atrasadas)} icon={AlertTriangle} variant="danger" />
          <KpiCard label="Valor Total" value={fmtR(summary?.valorTotalLiquido)} icon={FileText} sub={`${fmt(summary?.totalCampanhas)} campanhas`} />
        </div>

        {/* Pending pipeline */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Ag. Publicação" value={fmt(summary?.aguardandoPublicacao)} icon={Clock} variant="warning" />
          <KpiCard label="Ag. Print" value={fmt(summary?.aguardandoPrint)} icon={FileText} variant="warning" />
          <KpiCard label="Ag. Envio" value={fmt(summary?.aguardandoEnvio)} icon={Send} variant="warning" />
          <KpiCard label="Ag. Docs" value={fmt(summary?.aguardandoDocs)} icon={FileText} variant="warning" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">Inserções por Site</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bySite} barSize={20}>
                <XAxis dataKey="siteSigla" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ativas" name="Ativas" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="concluidas" name="Concluídas" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="atrasadas" name="Atrasadas" fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">Histórico por Competência</h2>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={byComp}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="competencia" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="total" name="Total" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="concluidas" name="Concluídas" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="atrasadas" name="Atrasadas" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* By client */}
          <div className="bg-card border border-border rounded p-4 lg:col-span-1">
            <h2 className="text-sm font-semibold text-foreground mb-3">Por Cliente</h2>
            <div className="space-y-2">
              {byClient?.slice(0, 7).map(c => (
                <div key={c.clienteId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-foreground truncate flex-1">{c.clienteNome}</span>
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
