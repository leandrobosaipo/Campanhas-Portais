import { useParams, useLocation, Link } from "wouter";
import { useGetCampaign } from "@workspace/api-client-react";
import { PageHeader } from "@/components/adops/Layout";
import { StatusBadge, DelayBadge } from "@/components/adops/StatusBadge";
import { InsertionChecks } from "@/components/adops/InsertionChecks";
import { ArrowLeft, Plus, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yy", { locale: ptBR }); } catch { return s; }
}

function fmtR(n: number | null | undefined) {
  return n != null ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id);
  const [, navigate] = useLocation();
  const { data: campaign, isLoading } = useGetCampaign(numId, { query: { enabled: !!numId } });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Carregando...</div>;
  if (!campaign) return <div className="p-6 text-muted-foreground text-sm">Campanha não encontrada.</div>;

  return (
    <div>
      <PageHeader
        title={campaign.nome}
        subtitle={campaign.competencia ?? "Sem competência"}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/campanhas")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded border border-border">
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar
            </button>
            <Link href="/campanhas/nova" className="flex items-center gap-1.5 text-xs bg-muted text-foreground px-3 py-1.5 rounded font-medium hover:bg-muted/70">
              <Plus className="w-3.5 h-3.5" />
              Nova Inserção
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-5 max-w-6xl">
        {/* Campaign meta */}
        <div className="bg-card border border-border rounded p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Cliente</div>
              <div className="font-medium text-foreground">{campaign.clienteNome ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Agência</div>
              <div className="font-medium text-foreground">{campaign.agenciaNome ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">PI</div>
              <div className="font-mono font-medium text-foreground">{campaign.piCodigo ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Valor Líquido</div>
              <div className="font-semibold text-foreground">{fmtR(campaign.valorLiquido)}</div>
            </div>
          </div>
          {campaign.observacoes && (
            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">{campaign.observacoes}</div>
          )}
        </div>

        {/* Insertions table */}
        <div className="bg-card border border-border rounded">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Inserções <span className="text-muted-foreground font-normal">({campaign.totalInsercoes})</span></h2>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Site</th>
                  <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Formato</th>
                  <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Período</th>
                  <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Progresso</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {campaign.insertions?.map(ins => (
                  <tr key={ins.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors group">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] font-semibold text-primary">{ins.siteSigla ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground/80">{ins.localFormatoNormalizado ?? ins.localFormato ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground/70 font-mono">
                      {fmtDate(ins.periodoInicio)} — {fmtDate(ins.periodoFim)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
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
                {campaign.insertions?.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma inserção cadastrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
