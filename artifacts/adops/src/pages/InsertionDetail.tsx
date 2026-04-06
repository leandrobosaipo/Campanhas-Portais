import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetInsertion, useUpdateInsertion, useCreateEvidence, useDeleteEvidence,
  getListInsertionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { StatusBadge, DelayBadge, STATUS_LABELS } from "@/components/adops/StatusBadge";
import { ArrowLeft, Plus, Trash2, Check, Image } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd MMM yyyy", { locale: ptBR }); } catch { return s; }
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return s; }
}

const STATUS_SEQUENCE = [
  "rascunho", "aguardando_publicacao", "publicado_no_site",
  "print_gerado", "enviado_para_agencia", "docs_enviados", "concluido",
];

export function InsertionDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = parseInt(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: insertion, isLoading } = useGetInsertion(numId, {
    query: { enabled: !!numId },
  });

  const updateMutation = useUpdateInsertion();
  const createEvidence = useCreateEvidence();
  const deleteEvidence = useDeleteEvidence();

  const [newEvidenceTitle, setNewEvidenceTitle] = useState("");
  const [newEvidenceUrl, setNewEvidenceUrl] = useState("");
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [editingObs, setEditingObs] = useState(false);
  const [obs, setObs] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetInsertionQueryKey(numId) });
    qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
  };

  const setStatus = (s: string) => {
    const updates: Record<string, unknown> = { statusNormalizado: s };
    if (s === "publicado_no_site" || STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("publicado_no_site")) {
      updates.bannerPublicadoNoSite = true;
    }
    if (STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("print_gerado")) {
      updates.printGerado = true;
    }
    if (STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("enviado_para_agencia")) {
      updates.processoEnviadoAgencia = true;
      if (!insertion?.dataEnvioAgencia) updates.dataEnvioAgencia = new Date().toISOString().split("T")[0];
    }
    if (STATUS_SEQUENCE.indexOf(s) >= STATUS_SEQUENCE.indexOf("docs_enviados")) {
      updates.docsEnviados = true;
    }
    updateMutation.mutate({ id: numId, data: updates as any }, { onSuccess: invalidate });
  };

  const handleAddEvidence = () => {
    if (!newEvidenceTitle && !newEvidenceUrl) return;
    createEvidence.mutate({
      insertionId: numId,
      data: { tipo: "print", titulo: newEvidenceTitle || null, arquivoUrl: newEvidenceUrl || null },
    }, {
      onSuccess: () => {
        setNewEvidenceTitle("");
        setNewEvidenceUrl("");
        setAddingEvidence(false);
        invalidate();
      },
    });
  };

  const handleSaveObs = () => {
    updateMutation.mutate({ id: numId, data: { observacoes: obs } }, {
      onSuccess: () => { setEditingObs(false); invalidate(); },
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Carregando...</div>;
  if (!insertion) return <div className="p-6 text-muted-foreground text-sm">Inserção não encontrada.</div>;

  const currentIdx = STATUS_SEQUENCE.indexOf(insertion.statusNormalizado);

  return (
    <div>
      <PageHeader
        title={`Inserção #${insertion.id}`}
        subtitle={`${insertion.campanhaName} · ${insertion.siteSigla ?? "—"}`}
        actions={
          <button onClick={() => navigate(-1 as any)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded border border-border">
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar
          </button>
        }
      />

      <div className="p-6 space-y-5 max-w-4xl">
        {/* Meta */}
        <div className="bg-card border border-border rounded p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">{insertion.localFormatoNormalizado ?? insertion.localFormato ?? "—"}</h2>
              <div className="text-xs text-muted-foreground mt-1">{insertion.campanhaName} · {insertion.clienteNome} · {insertion.agenciaNome}</div>
            </div>
            <div className="flex items-center gap-2">
              <DelayBadge atrasado={insertion.atrasado} />
              <StatusBadge status={insertion.statusNormalizado} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Competência</div>
              <div className="font-medium">{insertion.competencia ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Período Início</div>
              <div className="font-medium">{fmtDate(insertion.periodoInicio)}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Período Fim</div>
              <div className="font-medium">{fmtDate(insertion.periodoFim)}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Envio Agência</div>
              <div className="font-medium">{fmtDate(insertion.dataEnvioAgencia)}</div>
            </div>
          </div>
        </div>

        {/* Status timeline */}
        <div className="bg-card border border-border rounded p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Linha do Tempo</h3>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STATUS_SEQUENCE.map((s, i) => {
              const done = i <= currentIdx;
              const current = i === currentIdx;
              return (
                <div key={s} className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setStatus(s)}
                    className={cn(
                      "flex flex-col items-center gap-1 px-2 py-1.5 rounded transition-colors text-center",
                      current && "bg-primary/10 border border-primary/30",
                      !current && "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      done ? "bg-primary border-primary" : "border-border bg-muted"
                    )}>
                      {done && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className={cn("text-[9px] font-medium", done ? "text-foreground" : "text-muted-foreground")}>
                      {STATUS_LABELS[s]}
                    </span>
                  </button>
                  {i < STATUS_SEQUENCE.length - 1 && (
                    <div className={cn("w-8 h-0.5 shrink-0", i < currentIdx ? "bg-primary" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            {STATUS_SEQUENCE.filter((_, i) => i !== currentIdx).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className="text-[10px] px-2 py-1 bg-muted border border-border rounded hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Marcar: {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Evidences */}
        <div className="bg-card border border-border rounded p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Evidências / Prints <span className="text-muted-foreground font-normal">({insertion.evidences?.length ?? 0})</span>
            </h3>
            <button
              onClick={() => setAddingEvidence(v => !v)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </button>
          </div>

          {addingEvidence && (
            <div className="bg-muted/50 border border-border rounded p-3 mb-3 flex flex-col gap-2">
              <input
                placeholder="Título (ex: Print Homepage 06/04)"
                value={newEvidenceTitle}
                onChange={e => setNewEvidenceTitle(e.target.value)}
                className="text-xs bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                placeholder="URL do arquivo / print (opcional)"
                value={newEvidenceUrl}
                onChange={e => setNewEvidenceUrl(e.target.value)}
                className="text-xs bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2">
                <button onClick={handleAddEvidence} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium hover:opacity-90">Salvar</button>
                <button onClick={() => setAddingEvidence(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">Cancelar</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {insertion.evidences?.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 p-2.5 bg-muted/30 border border-border/50 rounded group">
                <Image className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground">{ev.titulo ?? "Print"}</div>
                  {ev.arquivoUrl && (
                    <a href={ev.arquivoUrl} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline truncate block">{ev.arquivoUrl}</a>
                  )}
                  <div className="text-[10px] text-muted-foreground">{fmtDateTime(ev.criadoEm)}</div>
                </div>
                <button
                  onClick={() => deleteEvidence.mutate({ params: { id: ev.id } }, { onSuccess: invalidate })}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {insertion.evidences?.length === 0 && (
              <div className="text-xs text-muted-foreground py-4 text-center">
                Nenhuma evidência registrada. Adicione prints para comprovação.
              </div>
            )}
          </div>
        </div>

        {/* Observations */}
        <div className="bg-card border border-border rounded p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Observações</h3>
            {!editingObs && (
              <button onClick={() => { setObs(insertion.observacoes ?? ""); setEditingObs(true); }} className="text-xs text-primary hover:text-primary/80">Editar</button>
            )}
          </div>
          {editingObs ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={3}
                placeholder="Observações sobre esta inserção..."
                className="text-sm bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none w-full"
              />
              <div className="flex gap-2">
                <button onClick={handleSaveObs} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium">Salvar</button>
                <button onClick={() => setEditingObs(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">Cancelar</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-foreground/80">{insertion.observacoes || <span className="text-muted-foreground italic">Sem observações</span>}</p>
          )}
        </div>
      </div>
    </div>
  );
}
