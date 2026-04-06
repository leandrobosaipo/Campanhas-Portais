import { useState } from "react";
import { Link } from "wouter";
import { useListCampaigns, useListClients, useListAgencies, useDeleteCampaign, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { Plus, Trash2, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const COMPETENCIAS = [
  "OUTUBRO/2025", "NOVEMBRO/2025", "DEZEMBRO/2025",
  "JANEIRO/2026", "FEVEREIRO/2026", "MARÇO/2026", "ABRIL/2026",
];

export function Campaigns() {
  const [search, setSearch] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [agenciaId, setAgenciaId] = useState("");

  const qc = useQueryClient();

  const params: Record<string, string | number | undefined> = {};
  if (competencia) params.competencia = competencia;
  if (clienteId) params.clienteId = parseInt(clienteId);
  if (agenciaId) params.agenciaId = parseInt(agenciaId);

  const { data: campaigns, isLoading } = useListCampaigns(params as any);
  const { data: clients } = useListClients();
  const { data: agencies } = useListAgencies();
  const deleteMutation = useDeleteCampaign();

  const filtered = campaigns?.filter(c =>
    !search || c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.clienteNome?.toLowerCase().includes(search.toLowerCase())) ||
    (c.piCodigo?.toLowerCase().includes(search.toLowerCase()))
  );

  const fmtR = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Excluir campanha?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() }),
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Campanhas"
        subtitle={`${filtered?.length ?? 0} campanhas`}
        actions={
          <Link href="/campanhas/nova" className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5" />
            Nova Campanha
          </Link>
        }
      />

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-card/30 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar campanha, cliente, PI..."
            value={search}
            onChange={e => setSearch(e.target.value)}
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
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Cliente</option>
          {clients?.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
        </select>
        <select
          value={agenciaId}
          onChange={e => setAgenciaId(e.target.value)}
          className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Agência</option>
          {agencies?.map(a => <option key={a.id} value={String(a.id)}>{a.nome}</option>)}
        </select>
        {(competencia || clienteId || agenciaId || search) && (
          <button onClick={() => { setCompetencia(""); setClienteId(""); setAgenciaId(""); setSearch(""); }} className="text-xs text-muted-foreground hover:text-foreground">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Campanha / PI</th>
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Cliente</th>
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Agência</th>
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Competência</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Valor Líq.</th>
              <th className="text-center px-4 py-2.5 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Inserções</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
            )}
            {filtered?.map(campaign => (
              <tr key={campaign.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                <td className="px-4 py-3">
                  <Link href={`/campanhas/${campaign.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {campaign.nome}
                  </Link>
                  {campaign.piCodigo && (
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{campaign.piCodigo}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-foreground/80">{campaign.clienteNome ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3 text-foreground/80">{campaign.agenciaNome ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3">
                  {campaign.competencia ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-muted border border-border rounded text-muted-foreground">{campaign.competencia}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-foreground/80">{fmtR(campaign.valorLiquido)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={cn("font-semibold tabular-nums", campaign.totalInsercoes > 0 ? "text-primary" : "text-muted-foreground")}>
                    {campaign.totalInsercoes}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/campanhas/${campaign.id}`} className="p-1 hover:text-primary">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                    <button onClick={e => handleDelete(campaign.id, e)} className="p-1 hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && filtered?.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Nenhuma campanha encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
