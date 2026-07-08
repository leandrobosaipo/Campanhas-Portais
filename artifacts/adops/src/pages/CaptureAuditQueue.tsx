import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Loader2, RefreshCcw, PlayCircle } from "lucide-react";
import { format, startOfDay } from "date-fns";
import { PageHeader } from "@/components/adops/Layout";
import { useListAgencies, useListClients, useListSites } from "@workspace/api-client-react";
import { COMPETENCIAS, DEFAULT_COMPETENCIA } from "@/lib/adops-config";
import { apiFetch } from "@/lib/api-base";
import { getKindLabel, useOpsQueueOverview } from "@/lib/ops-queue";

function formatPtDate(value: string) {
  return value.split("-").reverse().join("/");
}

function getAuditIssueLines(audit: any) {
  return Array.isArray(audit?.issues) ? audit.issues.map((issue: any) => String(issue?.label || issue?.detail || "Falha sem detalhe")) : [];
}

export function CaptureAuditQueue() {
  const [, navigate] = useLocation();
  const [competencia, setCompetencia] = useState(DEFAULT_COMPETENCIA);
  const [siteId, setSiteId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [agenciaId, setAgenciaId] = useState("");
  const todayKey = format(startOfDay(new Date()), "yyyy-MM-dd");

  const { data: sites } = useListSites();
  const { data: clients } = useListClients();
  const { data: agencies } = useListAgencies();
  const queueOverview = useOpsQueueOverview(true);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["capture-audit-failures", competencia, siteId, clienteId, agenciaId],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (competencia) query.set("competencia", competencia);
      if (siteId) query.set("siteId", siteId);
      if (clienteId) query.set("clienteId", clienteId);
      if (agenciaId) query.set("agenciaId", agenciaId);
      const response = await apiFetch(`/api/insertions/capture-proof/audit/failures?${query.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar a fila de auditoria.");
      return payload as {
        totalFailures: number;
        invalidAudit: number;
        invalidUrl: number;
        items: Array<{
          insertionId: number;
          campaignName: string | null;
          siteSigla: string | null;
          clienteNome: string | null;
          agenciaNome: string | null;
          competencia: string | null;
          localFormato: string | null;
          targetDate: string;
          arquivoUrl: string | null;
          status: "invalid_url" | "invalid_audit";
          audit: any;
        }>;
      };
    },
    staleTime: 15_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<number, {
      insertionId: number;
      campaignName: string | null;
      siteSigla: string | null;
      clienteNome: string | null;
      agenciaNome: string | null;
      competencia: string | null;
      localFormato: string | null;
      items: Array<{
        targetDate: string;
        arquivoUrl: string | null;
        status: "invalid_url" | "invalid_audit";
        audit: any;
      }>;
    }>();
    for (const item of data?.items ?? []) {
      const current = map.get(item.insertionId) ?? {
        insertionId: item.insertionId,
        campaignName: item.campaignName,
        siteSigla: item.siteSigla,
        clienteNome: item.clienteNome,
        agenciaNome: item.agenciaNome,
        competencia: item.competencia,
        localFormato: item.localFormato,
        items: [],
      };
      current.items.push({
        targetDate: item.targetDate,
        arquivoUrl: item.arquivoUrl,
        status: item.status,
        audit: item.audit,
      });
      map.set(item.insertionId, current);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Falhas de Prints"
        subtitle="Fila operacional para revisar evidências inválidas do período e entender exatamente o que falhou."
        actions={(
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border font-medium transition-colors bg-card text-muted-foreground border-border hover:text-foreground disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Atualizar fila
          </button>
        )}
      />

      <div className="px-6 py-4 space-y-4">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-sm font-semibold text-foreground">Como usar esta fila</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Esta tela mostra somente evidências já salvas que falharam na auditoria visual ou abriram com URL inválida. O objetivo é revisar o que está quebrado e regenerar só o necessário.
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <select value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground">
              <option value="">Competência</option>
              {COMPETENCIAS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground">
              <option value="">Site</option>
              {sites?.map((site) => <option key={site.id} value={String(site.id)}>{site.sigla}</option>)}
            </select>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground">
              <option value="">Cliente</option>
              {clients?.map((client) => <option key={client.id} value={String(client.id)}>{client.nome}</option>)}
            </select>
            <select value={agenciaId} onChange={(e) => setAgenciaId(e.target.value)} className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground">
              <option value="">Agência</option>
              {agencies?.map((agency) => <option key={agency.id} value={String(agency.id)}>{agency.nome}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border bg-background/70 px-2 py-1 text-muted-foreground">Hoje: {formatPtDate(todayKey)}</span>
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-200">Falhas totais: {data?.totalFailures ?? 0}</span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-100">Auditoria visual: {data?.invalidAudit ?? 0}</span>
            <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-1 text-slate-200">URL inválida: {data?.invalidUrl ?? 0}</span>
          </div>
        </div>

        {queueOverview.data ? (
          <div className="rounded-xl border border-border bg-card/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">Rotinas em segundo plano</div>
              <div className="text-xs text-muted-foreground">
                Executando: {queueOverview.data.totals.running} · Fila: {queueOverview.data.totals.queued + queueOverview.data.totals.readyForRunner}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {queueOverview.data.now
                ? `Agora: ${getKindLabel(queueOverview.data.now.kind)} · ${queueOverview.data.now.stageLabel}`
                : "Nenhuma rotina executando neste momento."}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card/40 p-6 text-sm text-muted-foreground">Carregando fila de falhas...</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-200">
            Nenhuma falha encontrada neste recorte. As evidências salvas estão passando na auditoria.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.insertionId} className="rounded-xl border border-border bg-card/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{group.campaignName || `Inserção ${group.insertionId}`}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {group.siteSigla} · {group.localFormato || "Sem posição"} · {group.clienteNome} · {group.agenciaNome}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{group.competencia || "Sem competência"}</div>
                  </div>
                  <button
                    onClick={() => navigate(`/insercoes/${group.insertionId}`)}
                    className="inline-flex items-center gap-1 rounded border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Abrir inserção
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {group.items.sort((a, b) => a.targetDate.localeCompare(b.targetDate)).map((item) => {
                    const issueLines = getAuditIssueLines(item.audit);
                    return (
                      <div key={`${group.insertionId}-${item.targetDate}`} className="rounded-lg border border-red-500/20 bg-red-500/8 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200">
                            <AlertTriangle className="h-3 w-3" />
                            {item.status === "invalid_url" ? "URL inválida" : "Auditoria visual falhou"}
                          </span>
                          {item.audit?.isVideoCapture && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-200">
                              <PlayCircle className="h-3 w-3" />
                              Vídeo
                            </span>
                          )}
                          <span className="text-xs font-medium text-foreground">{formatPtDate(item.targetDate)}</span>
                          {item.arquivoUrl && (
                            <a href={item.arquivoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                              Abrir evidência
                            </a>
                          )}
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-[11px]">
                          <div className="rounded border border-border bg-background/70 px-2 py-1.5">
                            <div className="text-muted-foreground">Desktop</div>
                            <div className="mt-1 text-foreground">{item.audit?.systemDateTime || "—"}</div>
                          </div>
                          <div className="rounded border border-border bg-background/70 px-2 py-1.5">
                            <div className="text-muted-foreground">Site</div>
                            <div className="mt-1 text-foreground">{item.audit?.pageDateText || "—"}</div>
                          </div>
                          <div className="rounded border border-border bg-background/70 px-2 py-1.5">
                            <div className="text-muted-foreground">Primeira dobra</div>
                            <div className="mt-1 text-foreground">{item.audit?.visualAudit?.viewportImagesLoaded ?? 0}/{item.audit?.visualAudit?.viewportImagesTotal ?? 0}</div>
                          </div>
                          <div className="rounded border border-border bg-background/70 px-2 py-1.5">
                            <div className="text-muted-foreground">Anúncio</div>
                            <div className="mt-1 text-foreground">{item.audit?.visualAudit?.slotImagesLoaded ?? 0}/{item.audit?.visualAudit?.slotImagesTotal ?? 0}</div>
                          </div>
                          {item.audit?.isVideoCapture && (
                            <div className="rounded border border-border bg-background/70 px-2 py-1.5 md:col-span-2 xl:col-span-2">
                              <div className="text-muted-foreground">Player do vídeo</div>
                              <div className="mt-1 text-foreground">
                                {item.audit?.playerProofOk ? "Controles e progresso visíveis" : "Player pendente"} · {Math.max(0, Math.floor(Number(item.audit?.playerProof?.currentTime ?? 0)))}s / {Math.max(0, Math.floor(Number(item.audit?.playerProof?.duration ?? 0)))}s
                              </div>
                            </div>
                          )}
                        </div>
                        {issueLines.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {issueLines.map((issue, index) => (
                              <div key={`${group.insertionId}-${item.targetDate}-${index}`} className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100">
                                {issue}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
