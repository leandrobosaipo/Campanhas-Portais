export type CaptureStageTiming = {
  stage: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

export function buildFailedCaptureStage(startedAt: string, finishedAt: string): CaptureStageTiming;
