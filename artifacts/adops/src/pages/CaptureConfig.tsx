import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-base";
import { hasStoredOpsOperatorToken } from "@/lib/runtime-api";

type CaptureRuleListItem = {
  id: number;
  siteSigla: string;
  groupId: number;
  aliases: string[];
  page: string;
  slotSelector: string;
  contextSelector: string | null;
  scrollMode: string;
  proofStyle: string;
  enabled: boolean;
  statusPublished: boolean;
  ruleVersionHash: string | null;
  updatedAt: string;
};

type CaptureRuleDetail = CaptureRuleListItem & {
  auditConfig: Record<string, unknown>;
  articleFallbackUrl: string | null;
};

type CaptureRulesBootstrapStatus = {
  totalLegacyRules: number;
  totalImportedRules: number;
  totalPublishedRules: number;
  items: Array<{
    siteSigla: string;
    groupId: number;
    aliases: string[];
    page: string;
    imported: boolean;
    published: boolean;
    existingRuleId: number | null;
    existingDraftCount: number;
  }>;
};

type RuntimeRuleResponse = {
  rule: {
    source: "db_published" | "json_fallback";
    siteSigla: string;
    groupId: number;
    page: string;
    slotSelector: string;
    contextSelector: string;
    scrollMode: string;
    proofStyle: string;
    aliases: string[];
    auditConfig: Record<string, unknown>;
    articleFallbackUrl: string | null;
    pageUrl: string;
    homeUrl: string;
    domain: string;
    pageDateSelectors: string[];
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.details || `Falha na requisição: ${response.status}`);
  }
  return response.json();
}

export function CaptureConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [siteSigla, setSiteSigla] = useState("PERRENGUE");
  const [cursor, setCursor] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actor, setActor] = useState("adops-ui");
  const [versionRollback, setVersionRollback] = useState("");
  const hasOperatorToken = hasStoredOpsOperatorToken();

  const listQuery = useQuery({
    queryKey: ["capture-rules", siteSigla, cursor],
    queryFn: () =>
      request<{ items: CaptureRuleListItem[]; nextCursor: number | null; hasMore: boolean }>(
        `/api/capture-rules?siteSigla=${encodeURIComponent(siteSigla)}&limit=20${cursor ? `&cursor=${cursor}` : ""}`,
      ),
    staleTime: 30_000,
  });

  const visibleItems = useMemo(
    () =>
      (listQuery.data?.items ?? []).filter((item) =>
        !(item.aliases ?? []).some((alias) => String(alias).toUpperCase().startsWith("HARNESS ")),
      ),
    [listQuery.data?.items],
  );

  const selected = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null,
    [visibleItems, selectedId],
  );

  function pageLabel(page: string) {
    return page === "article" ? "Pagina interna" : "Pagina inicial";
  }

  function positionLabel(item: CaptureRuleListItem) {
    return item.aliases[0] ?? `Grupo ${item.groupId}`;
  }

  const detailQuery = useQuery({
    queryKey: ["capture-rule", selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: () => request<{ item: CaptureRuleDetail }>(`/api/capture-rules/${selected!.id}`),
    staleTime: 10_000,
  });

  const perfQuery = useQuery({
    queryKey: ["capture-rules-perf-health"],
    queryFn: () => request<Record<string, unknown>>("/api/capture-rules/perf/health"),
    refetchInterval: 20_000,
  });

  const bootstrapQuery = useQuery({
    queryKey: ["capture-rules-bootstrap", siteSigla],
    queryFn: () => request<CaptureRulesBootstrapStatus>(`/api/capture-rules/bootstrap-status?siteSigla=${encodeURIComponent(siteSigla)}`),
    staleTime: 15_000,
  });

  const runtimeQuery = useQuery({
    queryKey: ["capture-rules-runtime", selected?.siteSigla, selected?.groupId],
    enabled: Boolean(selected?.siteSigla && selected?.groupId),
    queryFn: () =>
      request<RuntimeRuleResponse>(
        `/api/capture-rules/runtime?siteSigla=${encodeURIComponent(selected!.siteSigla)}&groupId=${selected!.groupId}`,
      ),
    staleTime: 10_000,
  });

  const actionMutation = useMutation({
    mutationFn: async (payload: { action: "validate" | "publish" | "rollback"; ruleId: number; versionId?: number }) => {
      if (payload.action === "rollback") {
        return request(`/api/capture-rules/${payload.ruleId}/rollback`, {
          method: "POST",
          headers: { "x-adops-actor": actor, "x-adops-role": "admin" },
          body: JSON.stringify({ versionId: payload.versionId, requestedBy: actor }),
        });
      }
      return request(`/api/capture-rules/${payload.ruleId}/${payload.action}`, {
        method: "POST",
        headers: { "x-adops-actor": actor, "x-adops-role": payload.action === "publish" ? "admin" : "operator" },
        body: JSON.stringify({ requestedBy: actor }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["capture-rules"] }),
        queryClient.invalidateQueries({ queryKey: ["capture-rule"] }),
        queryClient.invalidateQueries({ queryKey: ["capture-rules-perf-health"] }),
      ]);
      toast({ title: "Ação concluída", description: "Operação executada com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Falha na operação", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: (payload: { dryRun: boolean }) =>
      request<{
        total: number;
        created?: number;
        overwritten?: number;
        skipped?: number;
        toCreate?: number;
        toOverwrite?: number;
      }>("/api/capture-rules/import-legacy", {
        method: "POST",
        headers: { "x-adops-actor": actor, "x-adops-role": "admin" },
        body: JSON.stringify({ siteSigla, requestedBy: actor, dryRun: payload.dryRun }),
      }),
    onSuccess: async (payload, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["capture-rules"] }),
        queryClient.invalidateQueries({ queryKey: ["capture-rules-bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["capture-rules-runtime"] }),
      ]);
      toast({
        title: variables.dryRun ? "Prévia gerada" : "Importação concluída",
        description: variables.dryRun
          ? `${payload.toCreate ?? 0} para criar, ${payload.skipped ?? 0} já existentes.`
          : `${payload.created ?? 0} criadas, ${payload.skipped ?? 0} preservadas.`,
      });
    },
    onError: (error) => {
      toast({ title: "Falha na importação", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Configuração de Captura"
        subtitle="Modo shadow: leitura/validação/publicação com foco em performance e segurança."
        actions={(
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input value={siteSigla} onChange={(event) => setSiteSigla(event.target.value.toUpperCase())} className="w-40" />
            <Input value={actor} onChange={(event) => setActor(event.target.value)} className="w-44" />
            <Button
              variant="outline"
              onClick={() => {
                setCursor(null);
                queryClient.invalidateQueries({ queryKey: ["capture-rules"] });
              }}
            >
              Atualizar
            </Button>
          </div>
        )}
      />

      <div className="grid min-h-0 flex-1 gap-4 p-3 sm:p-4 md:grid-cols-[360px_minmax(0,1fr)] md:p-6">
        <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Regras ({visibleItems.length})</h2>
            <div className="text-xs text-muted-foreground">paginado</div>
          </div>

          <div className="mb-3 rounded-lg border border-border bg-background/50 p-3 text-xs">
            <div className="font-semibold">Carga inicial do legado</div>
            <div className="mt-1 text-muted-foreground">
              {bootstrapQuery.data
                ? `${bootstrapQuery.data.totalImportedRules}/${bootstrapQuery.data.totalLegacyRules} regras já vieram do legado para o banco.`
                : "Lendo status do legado..."}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => importMutation.mutate({ dryRun: true })}
                disabled={importMutation.isPending || !hasOperatorToken}
              >
                Ver prévia
              </Button>
              <Button
                size="sm"
                onClick={() => importMutation.mutate({ dryRun: false })}
                disabled={importMutation.isPending || !hasOperatorToken}
              >
                Importar regras atuais
              </Button>
            </div>
            {!hasOperatorToken ? (
              <div className="mt-2 text-[11px] text-amber-600">
                Informe o token do operador nesta sessao para importar, publicar ou fazer rollback.
              </div>
            ) : null}
          </div>

          <div className="max-h-[52vh] space-y-2 overflow-auto pr-1 md:max-h-[72vh]">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded border px-3 py-2 text-left text-xs ${selected?.id === item.id ? "border-primary bg-primary/10" : "border-border bg-background/40"}`}
              >
                <div className="font-semibold">{item.siteSigla} · {pageLabel(item.page)} · {positionLabel(item)}</div>
                <div className="mt-0.5 text-muted-foreground">Grupo {item.groupId} · {item.scrollMode === "top" ? "topo" : "slot"} · {item.proofStyle === "viewport_with_slot_inset" ? "com destaque do slot" : "posicao real"}</div>
                <div className="mt-0.5 line-clamp-1 text-muted-foreground">{item.aliases.join(", ")}</div>
                <div className="mt-1 text-[11px]">{item.statusPublished ? "publicada" : "rascunho"} · {item.enabled ? "ativa" : "desativada"}</div>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!cursor} onClick={() => setCursor(null)}>
              Início
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!listQuery.data?.nextCursor}
              onClick={() => setCursor(listQuery.data?.nextCursor ?? null)}
            >
              Próxima página
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Detalhe da regra</h2>
            <div className="text-xs text-muted-foreground">ações desacopladas</div>
          </div>

          {detailQuery.data?.item ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Site</Label>
                  <Input value={detailQuery.data.item.siteSigla} readOnly />
                </div>
                <div>
                  <Label>Grupo</Label>
                  <Input value={String(detailQuery.data.item.groupId)} readOnly />
                </div>
                <div className="sm:col-span-2">
                  <Label>Identificacao operacional</Label>
                  <Input value={`${detailQuery.data.item.siteSigla} · ${pageLabel(detailQuery.data.item.page)} · ${positionLabel(detailQuery.data.item)}`} readOnly />
                </div>
                <div className="sm:col-span-2">
                  <Label>Aliases</Label>
                  <Input value={detailQuery.data.item.aliases.join(", ")} readOnly />
                </div>
                <div className="sm:col-span-2">
                  <Label>Slot selector</Label>
                  <Input value={detailQuery.data.item.slotSelector} readOnly />
                </div>
                <div className="sm:col-span-2">
                  <Label>Context selector</Label>
                  <Input value={detailQuery.data.item.contextSelector ?? ""} readOnly />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => actionMutation.mutate({ action: "validate", ruleId: detailQuery.data!.item.id })}
                  disabled={actionMutation.isPending}
                >
                  Validar
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => actionMutation.mutate({ action: "publish", ruleId: detailQuery.data!.item.id })}
                  disabled={actionMutation.isPending}
                >
                  Publicar
                </Button>
                <Input
                  value={versionRollback}
                  onChange={(event) => setVersionRollback(event.target.value)}
                  placeholder="versionId rollback"
                  className="w-40"
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    actionMutation.mutate({
                      action: "rollback",
                      ruleId: detailQuery.data!.item.id,
                      versionId: Number(versionRollback),
                    })}
                  disabled={actionMutation.isPending || !versionRollback}
                >
                  Rollback
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-background/40 p-3">
                <h3 className="mb-2 text-xs font-semibold">Regra ativa no runtime</h3>
                <pre className="max-h-56 overflow-auto text-[11px] text-muted-foreground">
                  {JSON.stringify(runtimeQuery.data?.rule ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-border p-6 text-sm text-muted-foreground">
              Selecione uma regra para visualizar.
            </div>
          )}

          <div className="mt-5 rounded-lg border border-border bg-background/40 p-3">
            <h3 className="mb-2 text-xs font-semibold">Perf health</h3>
            <pre className="max-h-48 overflow-auto text-[11px] text-muted-foreground">
              {JSON.stringify(perfQuery.data ?? {}, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
