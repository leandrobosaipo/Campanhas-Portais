export type PrintRunnerJobKind =
  | "capture-proof-single"
  | "capture-proof-batch"
  | "capture-proof-backfill"
  | "capture-proof-fix-invalid";

export type PrintRunnerJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type PrintRunnerJobTarget = {
  insertionId: number;
  targetDate: string;
  captureAt?: string | null;
  replaceExisting?: boolean;
  candidateOnly?: boolean;
  promoteCandidate?: boolean;
};

export type PrintRunnerJobPayload = {
  kind: PrintRunnerJobKind;
  idempotencyKey?: string | null;
  competencia?: string | null;
  siteId?: number | null;
  targets: PrintRunnerJobTarget[];
  requestedBy?: string | null;
  source?: "adops-ui" | "api" | "sync" | "manual";
};

export type PrintRunnerJobResultItem = {
  insertionId: number;
  targetDate: string;
  captureAt?: string | null;
  status: "ok" | "error" | "skipped";
  uploadedUrl?: string | null;
  captureLogId?: string | null;
  probableCause?: string | null;
  retroContentProof?: Record<string, unknown> | null;
  manifestHash?: string | null;
  reason?: string;
  error?: string;
};

export type PrintRunnerJobResult = {
  id: string;
  kind: PrintRunnerJobKind;
  status: PrintRunnerJobStatus;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  totalTargets: number;
  completedTargets: number;
  failedTargets: number;
  items: PrintRunnerJobResultItem[];
};

export type PrintRunnerPort = {
  runNow(payload: PrintRunnerJobPayload): Promise<PrintRunnerJobResult>;
  enqueue(payload: PrintRunnerJobPayload): Promise<{ jobId: string }>;
  get(jobId: string): Promise<PrintRunnerJobResult | null>;
  updateMeta(jobId: string, meta: Record<string, unknown>): Promise<void>;
};
