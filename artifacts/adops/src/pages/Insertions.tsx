import { useState } from "react";
import { Link, useSearch } from "wouter";
import {
  useListInsertions, useListSites,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/adops/Layout";
import { StatusBadge, DelayBadge } from "@/components/adops/StatusBadge";
import { InsertionChecks } from "@/components/adops/InsertionChecks";
import { Search, ExternalLink, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const COMPETENCIAS = [
  "OUTUBRO/2025", "NOVEMBRO/2025", "DEZEMBRO/2025",
  "JANEIRO/2026", "FEVEREIRO/2026", "MARÇO/2026", "ABRIL/2026",
];

const STATUS_OPTS = [
  { value: "", label: "Todos os status" },
  { value: "rascunho", label: "Rascunho" },
  { value: "aguardando_publicacao", label: "Ag. Publicação" },
  { value: "publicado_no_site", label: "Publicado" },
  { value: "print_gerado", label: "Print Gerado" },
  { value: "enviado_para_agencia", label: "Enviado" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yy", { locale: ptBR }); } catch { return s; }
}

export function Insertions() {
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const initAtrasado = urlParams.get("atrasado") === "true";

  const [searchText, setSearchText] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState("");
  const [atrasado, setAtrasado] = useState(initAtrasado);

  const params: Record<string, string | number | boolean | undefined> = {};
  if (competencia) params.competencia = competencia;
  if (siteId) params.siteId = parseInt(siteId);
  if (status) params.status = status;
  if (atrasado) params.atrasado = true;

  const { data: insertions, isLoading } = useListInsertions(params as any);
  const { data: sites } = useListSites();

  const filtered = insertions?.filter(ins => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      ins.campanhaName?.toLowerCase().includes(q) ||
      ins.clienteNome?.toLowerCase().includes(q) ||
      ins.siteSigla?.toLowerCase().includes(q) ||
      ins.localFormatoNormalizado?.toLowerCase().includes(q) ||
      ins.agenciaNome?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Fila Operacional"
        subtitle={`${filtered?.length ?? 0} inserções`}
        actions={
          <button
            onClick={() => setAtrasado(a => !a)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border font-medium transition-colors",
              atrasado
                ? "bg-red-500/15 text-red-300 border-red-500/30"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            {atrasado ? "Atrasadas" : "Com atraso"}
          </button>
        }
      />

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-card/30 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar campanha, cliente, site..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="text-xs bg-card border border-border rounded pl-7 pr-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-64"
          />
        </div>
        <select
          value={competencia}
          onChange={e => setCompetencia(e.target.value)}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Competência</option>
          {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={siteId}
          onChange={e => setSiteId(e.target.value)}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Site</option>
          {sites?.map(s => <option key={s.id} value={String(s.id)}>{s.sigla}</option>)}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(competencia || siteId || status || atrasado || searchText) && (
          <button
            onClick={() => { setCompetencia(""); setSiteId(""); setStatus(""); setAtrasado(false); setSearchText(""); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20 sticky top-0">
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Site</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Campanha</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Formato</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Período</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Competência</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Progresso</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
            )}
            {filtered?.map(ins => (
              <tr key={ins.id} className={cn(
                "border-b border-border/40 hover:bg-muted/15 transition-colors group",
                ins.atrasado && "bg-red-500/3"
              )}>
                <td className="px-4 py-3">
                  <span className="font-mono text-[11px] font-bold text-primary">{ins.siteSigla ?? "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground truncate max-w-[200px]">{ins.campanhaName}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{ins.clienteNome}</div>
                </td>
                <td className="px-4 py-3 text-foreground/75 max-w-[130px] truncate">{ins.localFormatoNormalizado ?? ins.localFormato ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-foreground/70 whitespace-nowrap">
                  {fmtDate(ins.periodoInicio)} — {fmtDate(ins.periodoFim)}
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
                  <InsertionChecks
                    id={ins.id}
                    bannerPublicadoNoSite={ins.bannerPublicadoNoSite}
                    printGerado={ins.printGerado}
                    processoEnviadoAgencia={ins.processoEnviadoAgencia}
                    docsEnviados={ins.docsEnviados}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/insercoes/${ins.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && filtered?.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Nenhuma inserção encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
