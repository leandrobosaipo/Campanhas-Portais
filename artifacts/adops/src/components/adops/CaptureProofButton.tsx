import { useEffect, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, ClipboardCheck, Loader2, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-base";
import { CAPTURE_PROOF_META } from "@/lib/adops-config";
import { useApiMode } from "@/lib/use-api-mode";
import { useOpsOperator } from "@/lib/useOpsOperator";

type CaptureProofButtonProps = {
  insertionId: number;
  hasMedia: boolean;
  compact?: boolean;
  onSuccess?: () => void;
  captureAt?: string;
  label?: string;
  auditedLabel?: string;
  missingMediaLabel?: string;
  showBadge?: boolean;
  className?: string;
};

function summarizeAuditIssues(audit: any) {
  const issues = Array.isArray(audit?.issues) ? audit.issues : [];
  if (!issues.length) return "";
  const labels = issues
    .map((issue: any) => String(issue?.label || issue?.detail || "ponto de revisão").trim())
    .filter(Boolean)
    .slice(0, 2);
  return labels.length > 0
    ? `A evidência precisa de revisão: ${labels.join(" · ")}. Gere novamente ou revise a mídia.`
    : "A evidência precisa de revisão. Gere novamente ou revise a mídia.";
}

function describeRemoteJobProgress(payload: any) {
  const stage = String(payload?.result?.stage || "").trim();
  const note = String(payload?.result?.note || "").trim();
  const runnerId = String(payload?.runnerId || "").trim();

  if (stage === "queue_received") {
    return "Pedido enviado. A evidência vai começar em instantes.";
  }
  if (stage) {
    return note ? `${stage}. ${note}` : `${stage}. A evidência está sendo gerada.`;
  }
  if (note) {
    return note;
  }
  return "Evidência em geração. Aguarde a conclusão.";
}

function describeCompletedJob(payload: any) {
  const execution = payload?.result?.execution;
  const uploadedUrl = String(execution?.capture?.uploadedUrl || "").trim();

  if (execution?.skipped) {
    return execution?.reason || "A evidência deste dia já existe.";
  }
  if (execution?.capture?.status === "ok") {
    return uploadedUrl
      ? "Evidência salva. Conferindo se ficou válida."
      : "Evidência gerada e salva.";
  }
  return "Evidência concluída. Aguarde alguns segundos para atualizar o status.";
}

function describeFailedJob(payload: any) {
  const execution = payload?.result?.execution;
  return (
    payload?.error ||
    payload?.result?.error ||
    execution?.error ||
    execution?.reason ||
    "Não consegui gerar a evidência. Tente novamente."
  );
}

export function CaptureProofButton({
  insertionId,
  hasMedia,
  compact = false,
  onSuccess,
  captureAt,
  label,
  auditedLabel,
  missingMediaLabel,
  showBadge = true,
  className,
}: CaptureProofButtonProps) {
  const { isCloudflarePublic, readonlyMessage, canRunProtectedMutations, protectedMutationMessage } = useApiMode();
  const { createJob } = useOpsOperator();
  const [state, setState] = useState<"idle" | "missing_media" | "running" | "success" | "audited" | "error">(hasMedia ? "idle" : "missing_media");
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const auditDate = captureAt && /^\d{4}-\d{2}-\d{2}/.test(captureAt) ? captureAt.slice(0, 10) : "";

  const effectiveState = hasMedia ? state : "missing_media";
  const meta = CAPTURE_PROOF_META[effectiveState];
  const buttonLabel =
    effectiveState === "running"
      ? "Gerando..."
      : effectiveState === "audited"
        ? auditedLabel ?? (compact ? "Em dia" : "Evidência aprovada")
        : effectiveState === "missing_media"
          ? missingMediaLabel ?? "Sem mídia"
          : label ?? (compact ? "Evidência" : "Gerar evidência");

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      if (!hasMedia) {
        setState("missing_media");
        setMessage("Cadastre a mídia da campanha antes de gerar a evidência.");
        return;
      }
      try {
        const statusQuery = auditDate ? `?date=${encodeURIComponent(auditDate)}` : "";
        const response = await apiFetch(`/api/insertions/${insertionId}/capture-proof/status${statusQuery}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled) return;
        if (payload?.status === "audited" || payload?.status === "audited_best_effort") {
          setState("audited");
          setMessage(
            payload?.status === "audited_best_effort"
              ? "A evidência foi salva, mas precisa de revisão do banner."
              : "Evidência salva e aprovada para o dia."
          );
          return;
        }
        if (payload?.status === "invalid_url" || payload?.status === "invalid_audit") {
          setState("error");
          const detail = summarizeAuditIssues(payload?.audit);
          setMessage(
            payload?.status === "invalid_audit"
              ? detail || "A evidência foi salva, mas o banner ou horário não conferiu. Gere novamente."
              : "A evidência existe, mas o link não abriu. Gere novamente."
          );
          return;
        }
        setState("idle");
        setMessage("Ainda falta a evidência deste dia.");
      } catch {
        if (!cancelled) {
          setState("idle");
          setMessage("Não consegui conferir o status agora. Você ainda pode tentar gerar a evidência.");
        }
      }
    }
      void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [auditDate, hasMedia, insertionId]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const response = await apiFetch(`/api/ops/jobs/${jobId}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled) return;
        if (["queued", "ready_for_runner", "running"].includes(String(payload?.status))) {
          setState("running");
          setMessage(describeRemoteJobProgress(payload));
          return;
        }
        if (payload?.status === "completed") {
          setJobId(null);
          const statusQuery = auditDate ? `?date=${encodeURIComponent(auditDate)}` : "";
          const statusResponse = await apiFetch(`/api/insertions/${insertionId}/capture-proof/status${statusQuery}`);
          const statusPayload = await statusResponse.json().catch(() => null);
          if (statusResponse.ok && (statusPayload?.status === "audited" || statusPayload?.status === "audited_best_effort")) {
            setState("audited");
            setMessage(
              statusPayload?.status === "audited_best_effort"
                ? "A evidência foi salva, mas precisa de revisão do banner."
                : "Evidência salva e aprovada para o dia."
            );
          } else {
            setState("success");
            setMessage(describeCompletedJob(payload));
          }
          onSuccess?.();
          clearInterval(interval);
          return;
        }
        if (payload?.status === "failed") {
          setJobId(null);
          setState("error");
          setMessage(describeFailedJob(payload));
          clearInterval(interval);
        }
      } catch {
        // mantém polling silencioso
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [auditDate, insertionId, jobId, onSuccess]);

  const handleCapture = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canRunProtectedMutations) {
      setState("error");
      setMessage(protectedMutationMessage ?? readonlyMessage);
      return;
    }
    if (!hasMedia || state === "running" || state === "audited") return;

    setState("running");
    setMessage(isCloudflarePublic ? "Pedido enviado. A geração vai começar em instantes." : "Gerando evidência. Pode levar alguns segundos.");

    try {
      if (isCloudflarePublic) {
        const payload = await createJob("print-single", {
          insertionId,
          ...(captureAt ? { captureAt } : {}),
        });
        setJobId(payload.jobId);
        setMessage("Pedido de geração enviado. Acompanhe o status nesta tela.");
        return;
      }
        const response = await apiFetch(`/api/insertions/${insertionId}/capture-proof`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(captureAt ? { captureAt } : {}),
        });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Não consegui gerar a evidência.");
      }

      setState("success");
      setMessage("Evidência salva. Conferindo se ficou válida.");
      try {
        const statusQuery = auditDate ? `?date=${encodeURIComponent(auditDate)}` : "";
        const statusResponse = await apiFetch(`/api/insertions/${insertionId}/capture-proof/status${statusQuery}`);
        const statusPayload = await statusResponse.json().catch(() => null);
        if (statusResponse.ok && (statusPayload?.status === "audited" || statusPayload?.status === "audited_best_effort")) {
          setState("audited");
          setMessage(
            statusPayload?.status === "audited_best_effort"
              ? "A evidência foi salva, mas precisa de revisão do banner."
              : "Evidência salva e aprovada para o dia."
          );
        } else {
          setState("success");
          setMessage("Evidência gerada e salva.");
        }
      } catch {
        setState("success");
        setMessage("Evidência gerada e salva.");
      }
      onSuccess?.();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não consegui gerar a evidência.");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleCapture}
        disabled={!hasMedia || state === "running" || !canRunProtectedMutations}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs",
          effectiveState === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15"
            : effectiveState === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
              : "border-primary/30 bg-primary text-primary-foreground hover:opacity-95",
          className,
        )}
        title={!canRunProtectedMutations ? protectedMutationMessage ?? readonlyMessage ?? meta.label : message ?? meta.label}
      >
        {effectiveState === "running" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : effectiveState === "audited" ? (
          <ClipboardCheck className="h-3.5 w-3.5" />
        ) : effectiveState === "success" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : effectiveState === "error" ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : effectiveState === "missing_media" ? (
          <Link2 className="h-3.5 w-3.5" />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        {buttonLabel}
      </button>
      {showBadge ? (
        <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 font-medium", compact ? "text-[9px]" : "text-[10px]", meta.badgeClass)}>
          {meta.label}
        </span>
      ) : null}
      {message && !compact && (
        <div className={cn(
          "rounded border px-2 py-1 text-[11px]",
          effectiveState === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-200"
            : effectiveState === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-slate-600/30 bg-slate-700/15 text-slate-200",
        )}>
          {message}
        </div>
      )}
    </div>
  );
}
