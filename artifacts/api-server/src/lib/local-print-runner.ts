import { db, printJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runLocalCaptureProof } from "./local-capture-runtime";
import type {
  PrintRunnerJobPayload,
  PrintRunnerJobResult,
  PrintRunnerJobResultItem,
  PrintRunnerPort,
} from "./print-runner-contract";

const PRINT_TARGET_MAX_ATTEMPTS = Math.max(1, Number.parseInt(process.env.ADOPS_PRINT_TARGET_MAX_ATTEMPTS ?? "3", 10) || 3);
const PRINT_RETRY_BASE_MS = Math.max(0, Number.parseInt(process.env.ADOPS_PRINT_RETRY_BASE_MS ?? "15000", 10) || 15_000);
const PRINT_TARGET_COOLDOWN_MS = Math.max(0, Number.parseInt(process.env.ADOPS_PRINT_TARGET_COOLDOWN_MS ?? "12000", 10) || 12_000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class LocalPrintRunner implements PrintRunnerPort {
  async runNow(payload: PrintRunnerJobPayload): Promise<PrintRunnerJobResult> {
    const job = this.createJob(payload, `inline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await this.save(job, payload);
    return this.execute(job, payload);
  }

  async enqueue(payload: PrintRunnerJobPayload): Promise<{ jobId: string }> {
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = this.createJob(payload, jobId);
    await this.save(job, payload);

    setTimeout(() => {
      void this.execute(job, payload)
        .then(() => undefined)
        .catch((error) => {
          const current = { ...job };
          current.status = "failed";
          current.finishedAt = new Date().toISOString();
          current.items.push({
            insertionId: payload.targets[0]?.insertionId ?? 0,
            targetDate: payload.targets[0]?.targetDate ?? "",
            captureAt: payload.targets[0]?.captureAt ?? null,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
          current.failedTargets = current.items.filter((item) => item.status === "error").length;
          current.completedTargets = current.items.filter((item) => item.status !== "skipped").length;
          void this.save(current, payload);
        });
    }, 0);

    return { jobId };
  }

  async get(jobId: string): Promise<PrintRunnerJobResult | null> {
    const row = await db.query.printJobsTable.findFirst({
      where: eq(printJobsTable.id, jobId),
    });
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind as PrintRunnerJobResult["kind"],
      status: row.status as PrintRunnerJobResult["status"],
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      totalTargets: row.totalTargets,
      completedTargets: row.completedTargets,
      failedTargets: row.failedTargets,
      items: Array.isArray(row.items) ? (row.items as PrintRunnerJobResultItem[]) : [],
    };
  }

  private createJob(payload: PrintRunnerJobPayload, id: string): PrintRunnerJobResult {
    return {
      id,
      kind: payload.kind,
      status: "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      totalTargets: payload.targets.length,
      completedTargets: 0,
      failedTargets: 0,
      items: [],
    };
  }

  private async execute(job: PrintRunnerJobResult, payload: PrintRunnerJobPayload): Promise<PrintRunnerJobResult> {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    await this.save(job, payload);

    for (const [index, target] of payload.targets.entries()) {
      const item = await this.executeTarget(job.id, target);
      job.items.push(item);
      job.completedTargets = job.items.filter((entry) => entry.status !== "skipped").length;
      job.failedTargets = job.items.filter((entry) => entry.status === "error").length;
      await this.save(job, payload);
      if (index < payload.targets.length - 1 && PRINT_TARGET_COOLDOWN_MS > 0) {
        await sleep(PRINT_TARGET_COOLDOWN_MS);
      }
    }

    job.status = job.failedTargets > 0 ? "failed" : "completed";
    job.finishedAt = new Date().toISOString();
    await this.save(job, payload);
    return job;
  }

  private async executeTarget(jobId: string, target: PrintRunnerJobPayload["targets"][number]): Promise<PrintRunnerJobResultItem> {
    let lastError = "Falha desconhecida na captura.";
    for (let attempt = 1; attempt <= PRINT_TARGET_MAX_ATTEMPTS; attempt += 1) {
      try {
        const capture = await runLocalCaptureProof(target.insertionId, {
          replaceExisting: attempt > 1 ? true : target.replaceExisting,
          captureAt: target.captureAt ?? null,
          runnerJobId: jobId,
          candidateOnly: target.candidateOnly === true,
          promoteCandidate: target.promoteCandidate === true,
        });
        return {
          insertionId: target.insertionId,
          targetDate: target.targetDate,
          captureAt: target.captureAt ?? null,
          status: "ok",
          uploadedUrl: capture.uploadedUrl ?? null,
          captureLogId: capture.captureLogId ?? null,
          probableCause: capture.probableCause ?? null,
          readinessAudit: capture.readinessAudit && typeof capture.readinessAudit === "object"
            ? capture.readinessAudit as Record<string, unknown>
            : null,
          retroContentProof: capture.retroContentProof ?? null,
          manifestHash: capture.manifestHash ?? null,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (/capture_audit_failed|invalid_audit/i.test(lastError)) break;
        if (attempt < PRINT_TARGET_MAX_ATTEMPTS && PRINT_RETRY_BASE_MS > 0) {
          await sleep(PRINT_RETRY_BASE_MS * attempt);
        }
      }
    }
    return {
      insertionId: target.insertionId,
      targetDate: target.targetDate,
      captureAt: target.captureAt ?? null,
      status: "error",
      error: `${lastError} (${PRINT_TARGET_MAX_ATTEMPTS} tentativa(s))`,
    };
  }

  async updateMeta(jobId: string, meta: Record<string, unknown>): Promise<void> {
    await db
      .update(printJobsTable)
      .set({
        meta,
        updatedAt: new Date(),
      })
      .where(eq(printJobsTable.id, jobId));
  }

  private async save(job: PrintRunnerJobResult, payload: PrintRunnerJobPayload): Promise<void> {
    const row = {
      id: job.id,
      kind: job.kind,
      status: job.status,
      competencia: payload.competencia ?? null,
      siteId: payload.siteId ?? null,
      requestedBy: payload.requestedBy ?? null,
      source: payload.source ?? null,
      totalTargets: job.totalTargets,
      completedTargets: job.completedTargets,
      failedTargets: job.failedTargets,
      payload: payload as unknown as Record<string, unknown>,
      items: job.items as unknown as Array<Record<string, unknown>>,
      startedAt: job.startedAt ? new Date(job.startedAt) : null,
      finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
      updatedAt: new Date(),
    };

    await db
      .insert(printJobsTable)
      .values(row)
      .onConflictDoUpdate({
        target: printJobsTable.id,
        set: row,
      });
  }
}

let singleton: LocalPrintRunner | null = null;

export function getLocalPrintRunner(): LocalPrintRunner {
  if (!singleton) singleton = new LocalPrintRunner();
  return singleton;
}
