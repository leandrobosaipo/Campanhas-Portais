import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageHeader } from "@/components/adops/Layout";
import { ADROTATE_SITE_OPTIONS, COMPETENCIAS, DEFAULT_COMPETENCIA, SITE_LOGOS } from "@/lib/adops-config";
import { Loader2, RefreshCcw, CheckCircle2, AlertTriangle, GitCompareArrows, ShieldCheck, ClipboardList, DatabaseZap, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, apiUrl } from "@/lib/api-base";
import { useApiMode } from "@/lib/use-api-mode";
import { useOpsOperator } from "@/lib/useOpsOperator";
import { JobProgressBar } from "@/components/adops/ops-queue/JobProgressBar";
import { getKindLabel, getStatusClassName, getStatusLabel, useOpsQueueOverview } from "@/lib/ops-queue";

type SyncPreview = {
  ok: boolean;
  dryRun?: boolean;
  rawRows: number;
  createdCampaigns: number;
  updatedCampaigns: number;
  createdInsertions: number;
  updatedInsertions: number;
  warnings: string[];
  sampleChanges?: Array<Record<string, unknown>>;
};

type DiagnosticsPayload = {
  invalidDates: Array<Record<string, unknown>>;
  competenciaMismatch: Array<Record<string, unknown>>;
  campaignReview: Array<{
    campaignId: number;
    campaignName: string | null;
    competenciaAtual: string | null;
    suggestionSet: string[];
    insertionCount: number;
    action: "safe_update_campaign" | "review_split_campaign" | "review_multiple_period_rules";
    items: Array<{
      insertionId: number;
      competenciaSugerida: string;
      periodoOriginal: string | null;
    }>;
  }>;
  summary: {
    invalidDates: number;
    competenciaMismatch: number;
    safeCampaignUpdates: number;
    needsManualReview: number;
  };
};

type PlannedItem = {
  insertionId: number;
  campaignId: number;
  campaignName: string | null;
  piCodigo: string | null;
  competencia: string | null;
  siteSigla: string | null;
  clienteNome: string | null;
  localFormato: string | null;
  mediaUrl: string | null;
  mediaBasename: string | null;
  adrotateGroupId: number | null;
};

type LiveItem = {
  pageUrl: string;
  groupId: number;
  adId: number;
  mediaUrl: string | null;
  mediaBasename: string | null;
};

type OpsJob = {
  id: string;
  kind: "print-batch" | "print-backfill" | "sync-planilha";
  status: "queued" | "ready_for_runner" | "running" | "completed" | "failed";
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  requestedBy: string | null;
  runnerId: string | null;
  createdAt: string;
  updatedAt: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(apiUrl(url));
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao carregar.");
  return payload;
}

export function SyncCenter() {
  const { isReadonlyPublic, isCloudflarePublic, readonlyMessage, canRunProtectedMutations, protectedMutationMessage } = useApiMode();
  const { token, setToken, hasToken, createJob } = useOpsOperator();
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(DEFAULT_COMPETENCIA);
  const [siteSigla, setSiteSigla] = useState<(typeof ADROTATE_SITE_OPTIONS)[number]["sigla"]>("PERRENGUE");
  const [previewState, setPreviewState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewData, setPreviewData] = useState<SyncPreview | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [applyMessage, setApplyMessage] = useState("");
  const [safeState, setSafeState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [safeMessage, setSafeMessage] = useState("");

  const diagnosticsQuery = useQuery<DiagnosticsPayload>({
    queryKey: ["sync-diagnostics"],
    queryFn: () => fetchJson("/api/sync/planilha/diagnostics"),
    staleTime: 10_000,
  });

  const plannedQuery = useQuery<PlannedItem[]>({
    queryKey: ["adrotate-planned", competencia, siteSigla],
    queryFn: () => fetchJson(`/api/integrations/adrotate/planned?competencia=${encodeURIComponent(competencia)}&siteSigla=${encodeURIComponent(siteSigla)}`),
    staleTime: 10_000,
  });

  const liveQuery = useQuery<{ items: LiveItem[]; homeUrl: string | null; articleUrl: string | null; warnings: string[] }>({
    queryKey: ["adrotate-live-preview", siteSigla],
    queryFn: () => fetchJson(`/api/integrations/adrotate/live-preview?siteSigla=${encodeURIComponent(siteSigla)}`),
    staleTime: 10_000,
  });

  const opsJobsQuery = useQuery<{ items: OpsJob[] }>({
    queryKey: ["ops-jobs"],
    queryFn: () => fetchJson("/api/ops/jobs?limit=8"),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
  const queueOverview = useOpsQueueOverview(true);

  const selectedSite = ADROTATE_SITE_OPTIONS.find((item) => item.sigla === siteSigla) ?? ADROTATE_SITE_OPTIONS[0];

  const reconciliation = useMemo(() => {
    const planned = plannedQuery.data ?? [];
    const live = liveQuery.data?.items ?? [];
    return live.map((liveItem) => {
      const match = planned.find((plannedItem) =>
        plannedItem.adrotateGroupId === liveItem.groupId &&
        plannedItem.mediaBasename &&
        liveItem.mediaBasename &&
        plannedItem.mediaBasename === liveItem.mediaBasename,
      ) ?? null;
      return { live: liveItem, planned: match };
    });
  }, [plannedQuery.data, liveQuery.data]);

  const runPreview = async () => {
    if (isReadonlyPublic) {
      setPreviewState("error");
      setPreviewMessage(readonlyMessage ?? "Esta ação ainda está disponível só na camada privada.");
      return;
    }
    setPreviewState("running");
    setPreviewMessage("Lendo a planilha mais recente e comparando sem gravar nada.");
    try {
      const payload = await fetchJson<SyncPreview>("/api/sync/planilha/preview");
      setPreviewData(payload);
      setPreviewState("success");
      setPreviewMessage(`Preview pronto: ${payload.createdCampaigns} campanhas novas, ${payload.updatedCampaigns} campanhas atualizadas, ${payload.createdInsertions} inserções novas, ${payload.updatedInsertions} inserções atualizadas.`);
    } catch (error) {
      setPreviewState("error");
      setPreviewMessage(error instanceof Error ? error.message : "Falha ao gerar preview.");
    }
  };

  const applySync = async () => {
    if (!canRunProtectedMutations) {
      setApplyState("error");
      setApplyMessage(protectedMutationMessage ?? "Informe o token de operador para disparar o sync protegido no Cloudflare.");
      return;
    }
    setApplyState("running");
    setApplyMessage(isReadonlyPublic ? "Criando job protegido de sync no Cloudflare." : "Aplicando a sincronização incremental da planilha.");
    try {
      if (isReadonlyPublic) {
        const payload = await createJob("sync-planilha", { mode: "latest" });
        setApplyState("success");
        setApplyMessage(`Job de sync criado no Cloudflare: ${payload.jobId}. Acompanhe abaixo em Jobs operacionais.`);
        await qc.invalidateQueries({ queryKey: ["ops-jobs"] });
        return;
      }
      const response = await apiFetch("/api/sync/planilha/latest", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao aplicar sincronização.");
      setApplyState("success");
      setApplyMessage(`Sincronização aplicada: ${payload.updatedInsertions} inserções atualizadas e ${payload.createdInsertions} novas inserções.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sync-diagnostics"] }),
        qc.invalidateQueries({ queryKey: ["adrotate-planned"] }),
      ]);
    } catch (error) {
      setApplyState("error");
      setApplyMessage(error instanceof Error ? error.message : "Falha ao aplicar sincronização.");
    }
  };

  const applySafeCompetencia = async () => {
    if (!canRunProtectedMutations) {
      setSafeState("error");
      setSafeMessage(protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.");
      return;
    }
    setSafeState("running");
    setSafeMessage("Aplicando apenas correções seguras, sem dividir campanhas automaticamente.");
    try {
      const response = await apiFetch("/api/sync/competencia/apply-safe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details || payload?.error || "Falha ao aplicar correções seguras.");
      setSafeState("success");
      setSafeMessage(`Correções seguras aplicadas: ${payload.updated ?? 0}. Casos de múltiplas inserções continuam para revisão manual.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sync-diagnostics"] }),
        qc.invalidateQueries({ queryKey: ["adrotate-planned"] }),
      ]);
    } catch (error) {
      setSafeState("error");
      setSafeMessage(error instanceof Error ? error.message : "Falha ao aplicar correções seguras.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Sincronização"
        subtitle="Central de implantação assistida: veja o que precisa fazer, o impacto de cada ação e o que ainda depende de revisão humana."
        actions={
          <div className="flex items-center gap-2">
            <select
              value={competencia}
              onChange={(event) => setCompetencia(event.target.value)}
              className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {COMPETENCIAS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={siteSigla}
              onChange={(event) => setSiteSigla(event.target.value as (typeof ADROTATE_SITE_OPTIONS)[number]["sigla"])}
              className="text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ADROTATE_SITE_OPTIONS.map((item) => <option key={item.sigla} value={item.sigla}>{item.label}</option>)}
            </select>
            <button onClick={runPreview} disabled={previewState === "running" || isReadonlyPublic} className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-60" title={isReadonlyPublic ? readonlyMessage ?? undefined : undefined}>
              {previewState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              Preview planilha
            </button>
            <button onClick={applySync} disabled={applyState === "running" || !canRunProtectedMutations} className="flex items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60" title={!canRunProtectedMutations ? protectedMutationMessage ?? "Cole o token de operador para disparar o sync protegido." : undefined}>
              {applyState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Aplicar sync
            </button>
          </div>
        }
      />

      <div className="space-y-4 px-6 py-4">
        {isCloudflarePublic && !canRunProtectedMutations ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">
            <div className="font-semibold">Modo público no Cloudflare</div>
            <div className="mt-1 text-sky-100/90">{protectedMutationMessage ?? readonlyMessage ?? "Ações operacionais protegidas exigem token do operador."}</div>
            <div className="mt-2 text-xs text-sky-100/75">
              Os diagnósticos e comparações já aparecem aqui. Para disparar o sync protegido, cole abaixo o token de operador. O token fica salvo só neste navegador.
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Cole o token de operador"
                className="min-w-0 flex-1 rounded border border-sky-400/30 bg-slate-950/40 px-3 py-2 text-xs text-sky-50 placeholder:text-sky-200/40 focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button
                type="button"
                onClick={() => setToken("")}
                className="rounded border border-sky-400/30 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-500/10"
              >
                Limpar token
              </button>
            </div>
            <div className="mt-2 text-[11px] text-sky-100/70">
              Status do token: {hasToken ? "configurado neste navegador" : "ainda não informado"}.
            </div>
          </div>
        ) : null}
        <section className="grid gap-4 xl:grid-cols-3">
          <GuideCard
            step="Etapa 1"
            title="Ler a planilha atual"
            description="Use o preview para entender o que vai entrar ou mudar, sem gravar nada. É o primeiro passo quando a planilha foi atualizada."
            implication="Não altera o banco. Serve para validar antes de aplicar."
            icon={ClipboardList}
          />
          <GuideCard
            step="Etapa 2"
            title="Aplicar o sync do mês atual"
            description="Atualiza a base local com a planilha mais recente. Durante a implantação, esta é a ação principal para manter AdOps e planilha rodando em paralelo."
            implication="Grava campanhas e inserções novas ou alteradas."
            icon={DatabaseZap}
          />
          <GuideCard
            step="Etapa 3"
            title="Conferir o site real"
            description="Compara o planejado no AdOps com o que o portal está mostrando agora. Use antes de renomear anúncios, gerar prints ou corrigir mídia."
            implication="Ajuda a detectar anúncio em posição errada, mídia errada ou anúncio ainda não conciliado."
            icon={Waypoints}
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Jobs operacionais no Cloudflare</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Esta lista já mostra a camada protegida de jobs publicada no Cloudflare. Aqui aparecem disparos de retroativo, lote de prints e sync conforme forem migrados.
              </p>
            </div>
            <button
              type="button"
              onClick={() => opsJobsQuery.refetch()}
              className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Atualizar jobs
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {queueOverview.data?.now ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-sky-100">Executando agora: {getKindLabel(queueOverview.data.now.kind)}</div>
                  <span className={cn("rounded-full border px-2 py-1 text-[10px] font-medium", getStatusClassName(queueOverview.data.now.status))}>
                    {getStatusLabel(queueOverview.data.now.status)}
                  </span>
                </div>
                <div className="mt-2">
                  <JobProgressBar progress={queueOverview.data.now} />
                </div>
              </div>
            ) : null}
            {(queueOverview.data?.queue.length ?? 0) > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-sm font-semibold text-amber-100">Na fila: {queueOverview.data?.queue.length ?? 0} rotinas</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(queueOverview.data?.queue ?? []).slice(0, 4).map((job) => (
                    <div key={job.jobId} className="rounded-lg border border-amber-500/20 bg-slate-950/20 p-2 text-xs text-amber-50">
                      <div className="font-medium">{getKindLabel(job.kind)}</div>
                      <div className="mt-1 text-[11px] opacity-80">{job.stageLabel}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {(opsJobsQuery.data?.items ?? []).length ? (
              opsJobsQuery.data!.items.map((job) => (
                <div key={job.id} className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">{job.kind}</span>
                    <span className={cn(
                      "rounded-full border px-2 py-1 text-[10px] font-medium",
                      getStatusClassName(job.status)
                    )}>
                      {getStatusLabel(job.status)}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">{job.id}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    <div>Criado: {new Date(job.createdAt).toLocaleString("pt-BR")}</div>
                    <div>Atualizado: {new Date(job.updatedAt).toLocaleString("pt-BR")}</div>
                    <div>Runner: {job.runnerId ?? "aguardando claim"}</div>
                    {job.error ? <div className="text-rose-300">Erro: {job.error}</div> : null}
                    {job.result ? <div className="mt-1 break-all text-[11px]">{JSON.stringify(job.result)}</div> : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                Nenhum job operacional publicado ainda.
              </div>
            )}
          </div>
        </section>

        {(previewMessage || applyMessage || safeMessage) && (
          <div className="grid gap-2 lg:grid-cols-3">
            {[{ state: previewState, message: previewMessage, label: "Preview" }, { state: applyState, message: applyMessage, label: "Sync" }, { state: safeState, message: safeMessage, label: "Competência" }].filter((item) => item.message).map((item) => (
              <div key={item.label} className={cn("rounded-lg border px-3 py-2 text-xs", item.state === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : item.state === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-500/30 bg-slate-700/15 text-slate-200")}>
                <div className="font-medium">{item.label}</div>
                <div className="mt-1">{item.message}</div>
              </div>
            ))}
          </div>
        )}

        <section className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Prévia da sincronização</div>
              <div className="text-xs text-muted-foreground">Roda em modo leitura antes de atualizar a base local. Ideal para o operador saber se vale aplicar agora.</div>
            </div>
          </div>
          {previewData ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-4 text-xs">
                <Metric label="Linhas lidas" value={String(previewData.rawRows)} />
                <Metric label="Campanhas novas" value={String(previewData.createdCampaigns)} />
                <Metric label="Campanhas atualizadas" value={String(previewData.updatedCampaigns)} />
                <Metric label="Inserções alteradas" value={`${previewData.createdInsertions} novas / ${previewData.updatedInsertions} atualizadas`} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ListBox title="Avisos" empty="Sem avisos.">
                  {previewData.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ListBox>
                <ListBox title="Mudanças amostradas" empty="Sem mudanças amostradas.">
                  {(previewData.sampleChanges ?? []).map((item, index) => <li key={index}><code>{JSON.stringify(item)}</code></li>)}
                </ListBox>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border/60 bg-background/30 p-3 text-xs text-muted-foreground">
              Ainda não há preview carregado.
              <div className="mt-1">Quando usar: sempre que a planilha tiver sido atualizada e você quiser entender o impacto antes de gravar no sistema.</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Revisão de competência</div>
              <div className="text-xs text-muted-foreground">Separa o que pode ser corrigido automaticamente do que exige dividir campanha ou validar regra. Como você não quer revisar meses antigos, essa área serve mais como apoio e alerta.</div>
            </div>
            <button onClick={applySafeCompetencia} disabled={safeState === "running" || !canRunProtectedMutations} className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 disabled:opacity-60" title={!canRunProtectedMutations ? protectedMutationMessage ?? readonlyMessage ?? undefined : undefined}>
              {safeState === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Aplicar seguras
            </button>
          </div>
          {diagnosticsQuery.isLoading ? (
            <div className="mt-3 text-xs text-muted-foreground">Carregando diagnóstico...</div>
          ) : diagnosticsQuery.error ? (
            <div className="mt-3 text-xs text-red-200">Falha ao carregar o diagnóstico.</div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-4 text-xs">
                <Metric label="Erros de data" value={String(diagnosticsQuery.data?.summary.invalidDates ?? 0)} />
                <Metric label="Diferenças de competência" value={String(diagnosticsQuery.data?.summary.competenciaMismatch ?? 0)} />
                <Metric label="Seguras" value={String(diagnosticsQuery.data?.summary.safeCampaignUpdates ?? 0)} />
                <Metric label="Revisão manual" value={String(diagnosticsQuery.data?.summary.needsManualReview ?? 0)} />
              </div>
              <div className="space-y-3">
                {(diagnosticsQuery.data?.campaignReview ?? []).map((item) => (
                  <div key={item.campaignId} className={cn("rounded-lg border p-3 text-xs", item.action === "safe_update_campaign" ? "border-emerald-500/30 bg-emerald-500/8" : "border-amber-500/30 bg-amber-500/8")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground">{item.campaignName}</div>
                        <div className="text-muted-foreground">Campanha {item.campaignId} · {item.competenciaAtual} → {item.suggestionSet.join(", ")}</div>
                      </div>
                      <div className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", item.action === "safe_update_campaign" ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200")}>
                        {item.action === "safe_update_campaign" ? "Correção segura" : item.action === "review_split_campaign" ? "Provável desdobramento" : "Regra ambígua"}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {item.items.map((row) => (
                        <Link key={row.insertionId} href={`/insercoes/${row.insertionId}`} className="rounded border border-border px-2 py-1 hover:text-foreground">
                          Inserção {row.insertionId}: {row.periodoOriginal}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Conciliação AdRotate x AdOps</div>
              <div className="text-xs text-muted-foreground">Compara o que a competência atual planeja com o que o site está mostrando publicamente agora. Use esta área para saber se existe algo a fazer no portal.</div>
            </div>
            <div className="text-xs text-muted-foreground">{plannedQuery.data?.length ?? 0} planejados · {liveQuery.data?.items.length ?? 0} detectados no site</div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Metric label="O que está previsto no AdOps" value={String(plannedQuery.data?.length ?? 0)} />
            <Metric label="O que foi lido no site" value={String(liveQuery.data?.items.length ?? 0)} />
            <Metric label="Pendências de vínculo" value={String(reconciliation.filter((item) => !item.planned).length)} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr,1fr]">
            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground"><GitCompareArrows className="h-3.5 w-3.5" /> Itens detectados no site</div>
              <div className="space-y-2">
                {reconciliation.map(({ live, planned }) => (
                  <div key={`${live.pageUrl}-${live.groupId}-${live.adId}`} className={cn("rounded-lg border p-3 text-xs", planned ? "border-emerald-500/25 bg-emerald-500/8" : "border-amber-500/25 bg-amber-500/8")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">Ad {live.adId} · Grupo {live.groupId}</div>
                        <div className="mt-0.5 text-muted-foreground">{live.mediaBasename ?? "Sem mídia lida"}</div>
                      </div>
                      <a href={live.pageUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Abrir página</a>
                    </div>
                    {planned ? (
                      <div className="mt-2 text-[11px] text-emerald-100">
                        Vinculado por mídia ao AdOps: <Link href={`/insercoes/${planned.insertionId}`} className="underline">inserção {planned.insertionId}</Link> · {planned.campaignName}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-amber-100">Sem vínculo automático por mídia nesta competência. Isso normalmente significa que a mídia ainda não foi vinculada, a planilha mudou ou o anúncio foi publicado fora do previsto.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                {SITE_LOGOS[selectedSite.sigla] ? (
                  <img src={SITE_LOGOS[selectedSite.sigla]} alt={selectedSite.label} className="h-4 w-8 object-contain rounded bg-white px-1" />
                ) : null}
                Planejado no AdOps
              </div>
              <div className="space-y-2">
                {(plannedQuery.data ?? []).map((item) => (
                  <div key={item.insertionId} className="rounded-lg border border-border/60 p-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">{item.campaignName}</div>
                        <div className="text-muted-foreground">Inserção {item.insertionId} · Grupo {item.adrotateGroupId} · {item.localFormato}</div>
                      </div>
                      <Link href={`/insercoes/${item.insertionId}`} className="text-primary hover:underline">Abrir</Link>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{item.mediaBasename ?? "Sem mídia"} · {item.piCodigo ?? "Sem PI"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {liveQuery.data?.warnings?.length ? (
            <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-100">
              {liveQuery.data.warnings.join(" ")}
            </div>
          ) : null}
          <div className="mt-3 text-[11px] text-muted-foreground">
            Leitura pública atual:
            {" "}
            <a href={liveQuery.data?.homeUrl ?? undefined} target="_blank" rel="noreferrer" className="text-primary hover:underline">home</a>
            {" · "}
            <a href={liveQuery.data?.articleUrl ?? `https://${selectedSite.domain}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">página interna</a>
          </div>
        </section>
      </div>
    </div>
  );
}

function GuideCard({
  step,
  title,
  description,
  implication,
  icon: Icon,
}: {
  step: string;
  title: string;
  description: string;
  implication: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{step}</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-2 text-xs text-muted-foreground">{description}</div>
          <div className="mt-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
            Implica em: {implication}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ListBox({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="mb-2 text-xs font-semibold text-foreground">{title}</div>
      {hasChildren ? <ul className="space-y-1 text-[11px] text-muted-foreground">{children}</ul> : <div className="text-[11px] text-muted-foreground">{empty}</div>}
    </div>
  );
}
