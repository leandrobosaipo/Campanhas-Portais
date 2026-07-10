import { useState } from "react";
import { Link } from "wouter";
import { useListCampaigns, useListClients, useListAgencies } from "@workspace/api-client-react";
import { PageHeader } from "@/components/adops/Layout";
import { Plus, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPETENCIAS, DEFAULT_COMPETENCIA, resetToCurrentCompetencia } from "@/lib/adops-config";
import { getOperationalProfileSummary, getOperationalToneMeta, resolveOperationalProfile } from "@/lib/adops-requirements";
import { usePersistentState } from "@/lib/usePersistentState";
import { useApiMode } from "@/lib/use-api-mode";

export function Campaigns() {
  const { isReadonlyPublic, readonlyMessage } = useApiMode();
  const [filters, setFilters] = usePersistentState("adops.campaigns.filters.v1", {
    search: "",
    competencia: DEFAULT_COMPETENCIA,
    clienteId: "",
    agenciaId: "",
  });
  const search = filters.search;
  const competencia = filters.competencia;
  const clienteId = filters.clienteId;
  const agenciaId = filters.agenciaId;

  const params: Record<string, string | number | undefined> = {};
  if (competencia) params.competencia = competencia;
  if (clienteId) params.clienteId = parseInt(clienteId);
  if (agenciaId) params.agenciaId = parseInt(agenciaId);

  const { data: campaigns, isLoading, error } = useListCampaigns(params as any);
  const { data: clients } = useListClients();
  const { data: agencies } = useListAgencies();

  const filtered = campaigns?.filter(c =>
    !search || c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.clienteNome?.toLowerCase().includes(search.toLowerCase())) ||
    (c.piCodigo?.toLowerCase().includes(search.toLowerCase()))
  );

  const fmtR = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const activeProfiles = (filtered ?? []).reduce<Array<{ id: string; label: string; total: number; hint: string; toneLabel: string; badgeClass: string }>>((acc, item) => {
    const profile = resolveOperationalProfile({
      agenciaNome: item.agenciaNome,
      clienteNome: item.clienteNome,
      campaignName: item.nome,
    });
    const summary = getOperationalProfileSummary(profile);
    const toneMeta = getOperationalToneMeta(summary.tone);
    const existing = acc.find((entry) => entry.id === profile.id);
    if (existing) {
      existing.total += 1;
      return acc;
    }
    acc.push({ id: profile.id, label: profile.label, total: 1, hint: summary.riscoPrincipal, toneLabel: toneMeta.label, badgeClass: toneMeta.badgeClass });
    return acc;
  }, []).sort((a, b) => b.total - a.total);

  return (
    <div>
      <PageHeader
        title="Campanhas"
        subtitle={isLoading ? "Carregando campanhas..." : `${filtered?.length ?? 0} campanhas${competencia ? ` em ${competencia}` : ""}`}
        actions={
          isReadonlyPublic ? (
            <button
              type="button"
              disabled
              title={readonlyMessage ?? undefined}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium opacity-60 cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Campanha
            </button>
          ) : (
            <Link href="/campanhas/nova" className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium hover:opacity-90 transition-opacity">
              <Plus className="w-3.5 h-3.5" />
              Nova Campanha
            </Link>
          )
        }
      />

      {isReadonlyPublic ? (
        <div className="mx-6 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <div className="font-semibold text-amber-50">🔒 Painel público em modo leitura</div>
          <div className="mt-1">{readonlyMessage}</div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-card/30 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar campanha, cliente, PI..."
            value={search}
            onChange={e => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            className="text-xs bg-card border border-border rounded pl-7 pr-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-64"
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
        {(competencia || clienteId || agenciaId || search) && (
          <button onClick={() => setFilters({ competencia: resetToCurrentCompetencia(), clienteId: "", agenciaId: "", search: "" })} className="text-xs text-muted-foreground hover:text-foreground">
            Limpar filtros
          </button>
        )}
        <div className="ml-auto text-[11px] text-muted-foreground">
          Agora esta tela já deve ser lida pela PI: olhe agência, cliente, prazo implícito e risco documental antes de abrir a campanha.
        </div>
      </div>

      {activeProfiles.length ? (
        <div className="px-6 py-4 border-b border-border bg-card/20">
          <div className="mb-3">
            <div className="text-sm font-semibold text-foreground">Leitura operacional por PI no recorte atual</div>
            <div className="mt-1 text-xs text-muted-foreground">
              As campanhas abaixo já estão agrupadas pelo perfil mais provável de operação. Isso ajuda a equipe a saber onde o prazo aperta e onde a PI costuma exigir mais documentação.
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeProfiles.slice(0, 6).map((profile) => (
              <div key={profile.id} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{profile.label}</div>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", profile.badgeClass)}>
                    {profile.toneLabel}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{profile.hint}</div>
                <div className="mt-2 text-[10px] text-muted-foreground">{profile.total} campanha(s) neste filtro</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
            {!isLoading && error && (
              <tr><td colSpan={7} className="text-center py-12 text-destructive">Falha ao carregar campanhas.</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
            )}
            {filtered?.map(campaign => {
              const profile = resolveOperationalProfile({
                agenciaNome: campaign.agenciaNome,
                clienteNome: campaign.clienteNome,
                campaignName: campaign.nome,
              });
              const profileSummary = getOperationalProfileSummary(profile);
              const toneMeta = getOperationalToneMeta(profileSummary.tone);
              return (
              <tr key={campaign.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                <td className="px-4 py-3">
                  <Link href={`/campanhas/${campaign.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {campaign.nome}
                  </Link>
                  {campaign.piCodigo && (
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{campaign.piCodigo}</div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", toneMeta.badgeClass)}>
                      {toneMeta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{profile.label}</span>
                  </div>
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
                  </div>
                </td>
              </tr>
            )})}
            {!isLoading && filtered?.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Nenhuma campanha encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
