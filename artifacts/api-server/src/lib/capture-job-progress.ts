import crypto from "node:crypto";
import type { PrintRunnerJobResult } from "./print-runner-contract";

export const CAPTURE_PROGRESS = {
  queued: 0,
  running: 5,
  page_resolved: 15,
  slot_found: 25,
  creative_matched: 35,
  frame_selected: 45,
  slot_captured: 60,
  critical_assets: 70,
  final_composed: 80,
  uploaded: 90,
  audit_evaluated: 95,
  completed: 100,
} as const;

export type CaptureProgressStage = keyof typeof CAPTURE_PROGRESS | "failed";
export type CaptureProgress = {
  percent: number;
  stage: CaptureProgressStage;
  message: string;
  updatedAt: string;
};

const MESSAGES: Record<CaptureProgressStage, string> = {
  queued: "Solicitação recebida.",
  running: "Iniciando a geração do print.",
  page_resolved: "Preparando a página.",
  slot_found: "Localizando o espaço do anúncio.",
  creative_matched: "Conferindo o anúncio.",
  frame_selected: "Preparando a área da captura.",
  slot_captured: "Captura realizada. Estamos montando a evidência.",
  critical_assets: "Carregando os elementos da página.",
  final_composed: "Montando a evidência.",
  uploaded: "Salvando a imagem.",
  audit_evaluated: "Validando a evidência.",
  completed: "Print concluído.",
  failed: "Não foi possível concluir a geração deste print.",
};

export function initialCaptureProgress(updatedAt = new Date().toISOString()): CaptureProgress {
  return { percent: 0, stage: "queued", message: MESSAGES.queued, updatedAt };
}

export function advanceCaptureProgress(
  current: CaptureProgress | null | undefined,
  stage: CaptureProgressStage,
  updatedAt = new Date().toISOString(),
): CaptureProgress {
  const percent = stage === "failed" ? (current?.percent ?? 0) : CAPTURE_PROGRESS[stage];
  if (stage !== "failed" && current && percent < current.percent) return current;
  return { percent, stage, message: MESSAGES[stage], updatedAt };
}

export function buildCaptureSupport(jobId: string, _technicalError?: unknown) {
  return {
    code: `CAPTURE-${crypto.createHash("sha256").update(jobId).digest("hex").slice(0, 8).toUpperCase()}`,
    message: "Tente novamente. Se o problema continuar, informe este código ao suporte.",
  };
}

export function toPublicCaptureJob(job: PrintRunnerJobResult) {
  const progress = job.progress
    ?? advanceCaptureProgress(null, job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : job.status);
  const failed = job.status === "failed";
  return {
    ...job,
    items: job.items.map((item) => item.status === "error"
      ? { ...item, error: MESSAGES.failed, probableCause: null }
      : item),
    progress,
    support: failed ? buildCaptureSupport(job.id) : null,
  };
}
