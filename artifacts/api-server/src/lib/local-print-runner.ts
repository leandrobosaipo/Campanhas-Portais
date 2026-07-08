import { db, printJobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runLocalCaptureProof } from "./local-capture-runtime";
import type {
  PrintRunnerJobPayload,
  PrintRunnerJobResult,
  PrintRunnerJobResultItem,
  PrintRunnerPort,
} from "./print-runner-contract";

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

    for (const target of payload.targets) {
      const item = await this.executeTarget(job.id, target);
      job.items.push(item);
      job.completedTargets = job.items.filter((entry) => entry.status !== "skipped").length;
      job.failedTargets = job.items.filter((entry) => entry.status === "error").length;
      await this.save(job, payload);
    }

    job.status = job.failedTargets > 0 ? "failed" : "completed";
    job.finishedAt = new Date().toISOString();
    await this.save(job, payload);
    return job;
  }

  private async executeTarget(jobId: string, target: PrintRunnerJobPayload["targets"][number]): Promise<PrintRunnerJobResultItem> {
    try {
      const capture = await runLocalCaptureProof(target.insertionId, {
        replaceExisting: target.replaceExisting,
        captureAt: target.captureAt ?? null,
        runnerJobId: jobId,
      });
      return {
        insertionId: target.insertionId,
        targetDate: target.targetDate,
        captureAt: target.captureAt ?? null,
        status: "ok",
        uploadedUrl: capture.uploadedUrl ?? null,
        captureLogId: capture.captureLogId ?? null,
        probableCause: capture.probableCause ?? null,
      };
    } catch (error) {
      return {
        insertionId: target.insertionId,
        targetDate: target.targetDate,
        captureAt: target.captureAt ?? null,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
