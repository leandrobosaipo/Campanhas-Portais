import { useParams, useLocation, Link } from "wouter";
import { useState } from "react";
import { useGetCampaign, useDeleteCampaign, getGetCampaignQueryKey, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { StatusBadge, DelayBadge } from "@/components/adops/StatusBadge";
import { InsertionChecks } from "@/components/adops/InsertionChecks";
import { ArrowLeft, Plus, ExternalLink, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { getOperationalProfileSummary, getOperationalToneMeta, resolveOperationalProfile } from "@/lib/adops-requirements";
import { useApiMode } from "@/lib/use-api-mode";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isReadonlyPublic, readonlyMessage, canRunProtectedMutations, protectedMutationMessage } = useApiMode();
  const protectedActionMessage = protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.";
  const { data: campaign, isLoading } = useGetCampaign(numId, { query: { queryKey: getGetCampaignQueryKey(numId), enabled: !!numId } });
  const deleteCampaign = useDeleteCampaign();
  const [confirmValue, setConfirmValue] = useState("");

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Carregando...</div>;
  if (!campaign) return <div className="p-6 text-muted-foreground text-sm">Campanha não encontrada.</div>;

  const profile = resolveOperationalProfile({
    agenciaNome: campaign.agenciaNome,
    clienteNome: campaign.clienteNome,
    campaignName: campaign.nome,
    faturamentoTipo: campaign.faturamentoTipo,
    observacoes: campaign.observacoes,
  });
  const profileSummary = getOperationalProfileSummary(profile);
  const toneMeta = getOperationalToneMeta(profileSummary.tone);

  const hasOperationalHistory = (campaign.insertions ?? []).some((ins) =>
    ins.bannerPublicadoNoSite ||
    ins.printGerado ||
    ins.processoEnviadoAgencia ||
    ins.docsEnviados ||
    ins.totalEvidencias > 0 ||
    ["print_gerado", "enviado_para_agencia", "docs_enviados", "concluido"].includes(ins.statusNormalizado),
  );
  const canDelete = !hasOperationalHistory;

  async function handleDelete() {
    if (!canRunProtectedMutations) {
      toast({
        title: "Ação operacional protegida",
        description: protectedActionMessage,
      });
      return;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        deleteCampaign.mutate({ id: campaign!.id }, { onSuccess: () => resolve(), onError: reject });
      });
      await qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      toast({
        title: "Campanha excluída",
        description: "A campanha e suas inserções sem histórico operacional foram removidas com segurança.",
      });
      navigate("/campanhas");
    } catch (error: any) {
      const message = error?.response?.data?.error ?? error?.message ?? "Não foi possível excluir a campanha.";
      toast({
        title: "Exclusão bloqueada",
        description: message,
        variant: "destructive",
      });
    }
  }

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
            {!canRunProtectedMutations ? (
              <button
                type="button"
                disabled
                title={protectedActionMessage}
                className="flex items-center gap-1.5 text-xs bg-muted text-foreground px-3 py-1.5 rounded font-medium opacity-60 cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova Inserção
              </button>
            ) : (
              <Link href="/campanhas/nova" className="flex items-center gap-1.5 text-xs bg-muted text-foreground px-3 py-1.5 rounded font-medium hover:bg-muted/70">
                <Plus className="w-3.5 h-3.5" />
                Nova Inserção
              </Link>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={!canDelete || !canRunProtectedMutations}
                  title={!canRunProtectedMutations ? protectedActionMessage : undefined}
                  className="flex items-center gap-1.5 text-xs border border-destructive/30 bg-destructive/10 text-destructive px-3 py-1.5 rounded font-medium hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Campanha
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir campanha</AlertDialogTitle>
                  <AlertDialogDescription>
                    {canDelete
                      ? "Essa ação remove a campanha e suas inserções. Para evitar exclusão por engano, confirme digitando exatamente o nome da campanha."
                      : "Essa campanha já possui histórico operacional ou evidências. Para preservar auditoria, a exclusão está bloqueada."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3">
                  <div className="rounded border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                    <div><span className="text-foreground font-medium">Campanha:</span> {campaign.nome}</div>
                    <div><span className="text-foreground font-medium">Inserções:</span> {campaign.totalInsercoes}</div>
                    <div><span className="text-foreground font-medium">Histórico operacional:</span> {hasOperationalHistory ? "Sim" : "Não"}</div>
                  </div>
                  {!canDelete ? (
                    <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Exclusão bloqueada
                      </div>
                      <div className="mt-1 text-amber-100/90">
                        Em vez de excluir, prefira manter a campanha para auditoria e cancelar as inserções quando necessário.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                        Digite o nome da campanha para confirmar
                      </label>
                      <input
                        value={confirmValue}
                        onChange={(event) => setConfirmValue(event.target.value)}
                        placeholder={campaign.nome}
                        className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  )}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmValue("")}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      if (!canDelete || confirmValue !== campaign.nome) {
                        event.preventDefault();
                        if (canDelete) {
                          toast({
                            title: "Confirmação incompleta",
                            description: "Digite exatamente o nome da campanha para liberar a exclusão.",
                          });
                        }
                        return;
                      }
                      void handleDelete();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir definitivamente
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="p-6 space-y-5 max-w-6xl">
        {isReadonlyPublic ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            <div className="font-semibold text-amber-50">🔒 Modo público em leitura</div>
            <div className="mt-1">{readonlyMessage}</div>
          </div>
        ) : null}

        {/* Campaign meta */}
        <div className="bg-card border border-border rounded p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4 text-xs">
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
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Projeto</div>
              <div className="font-medium text-foreground">{campaign.projeto ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Plano</div>
              <div className="font-medium text-foreground">{campaign.plano ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Valor Líquido</div>
              <div className="font-semibold text-foreground">{fmtR(campaign.valorLiquido)}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Planilha</div>
              <div className="font-medium text-foreground">{campaign.planilhaRef ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Produto</div>
              <div className="font-medium text-foreground">{campaign.produto ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Praça</div>
              <div className="font-medium text-foreground">{campaign.praca ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Condição Pgto</div>
              <div className="font-medium text-foreground">{campaign.condicaoPagamento ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Faturamento</div>
              <div className="font-medium text-foreground">{campaign.faturamentoTipo ?? "—"}</div>
            </div>
          </div>
          {campaign.observacoes && (
            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">{campaign.observacoes}</div>
          )}
        </div>

        <div className={cn("border rounded p-5", toneMeta.cardClass)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Leitura operacional desta campanha pela PI</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {profile.label} · {profile.matchLabel}
              </div>
              <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
                {profileSummary.summary}
              </p>
            </div>
            <span className={cn("rounded-full border px-2 py-1 text-[10px] font-medium", toneMeta.badgeClass)}>
              {toneMeta.label}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-border/60 bg-background/60 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prazo principal</div>
              <div className="mt-1 font-medium text-foreground">{profileSummary.prazoPrincipal}</div>
            </div>
            <div className="rounded border border-border/60 bg-background/60 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Risco principal</div>
              <div className="mt-1 font-medium text-foreground">{profileSummary.riscoPrincipal}</div>
            </div>
            <div className="rounded border border-border/60 bg-background/60 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tratamento de prazo</div>
              <div className="mt-1 font-medium text-foreground">{profileSummary.prazoOperacional}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-border/60 bg-background/60 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Checklist lembrado da PI</div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {profileSummary.checklist.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            <div className="rounded border border-border/60 bg-background/60 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{profileSummary.recommendationTitle}</div>
              <p className="mt-2 text-muted-foreground">{profileSummary.recommendedNextStep}</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {profileSummary.formHints.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className={`border rounded p-4 text-xs ${canDelete ? "border-destructive/30 bg-destructive/5 text-muted-foreground" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>
          <div className="font-semibold text-foreground mb-1">Zona de exclusão</div>
          <div>
            {canDelete
              ? "Esta campanha ainda não tem histórico operacional relevante. A exclusão está disponível apenas aqui no detalhe e exige confirmação por digitação."
              : "Esta campanha já tem histórico operacional. A exclusão foi bloqueada para preservar auditoria e evitar perda de rastreabilidade."}
          </div>
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
