import { db, printJobsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
          current.durationMs = current.startedAt
            ? Date.parse(current.finishedAt) - Date.parse(current.startedAt)
            : null;
          current.timedOut = error instanceof Error && (
            String((error as Error & { code?: string }).code ?? "").includes("TIMEOUT")
            || /timeout/i.test(error.message)
          );
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
      queuedAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      queueWaitMs: typeof row.meta?.queueWaitMs === "number" ? row.meta.queueWaitMs : null,
      durationMs: typeof row.meta?.durationMs === "number" ? row.meta.durationMs : null,
      timedOut: row.meta?.timedOut === true,
      runnerId: typeof row.meta?.runnerId === "string" ? row.meta.runnerId : null,
      totalTargets: row.totalTargets,
      completedTargets: row.completedTargets,
      failedTargets: row.failedTargets,
      items: Array.isArray(row.items) ? (row.items as PrintRunnerJobResultItem[]) : [],
    };
  }

  private createJob(payload: PrintRunnerJobPayload, id: string): PrintRunnerJobResult {
    const now = new Date().toISOString();
    return {
      id,
      kind: payload.kind,
      status: "queued",
      createdAt: now,
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      queueWaitMs: null,
      durationMs: null,
      timedOut: false,
      runnerId: process.env.RUNNER_ID ?? "adops-api-local",
      totalTargets: payload.targets.length,
      completedTargets: 0,
      failedTargets: 0,
      items: [],
    };
  }

  private async execute(job: PrintRunnerJobResult, payload: PrintRunnerJobPayload): Promise<PrintRunnerJobResult> {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.queueWaitMs = Date.parse(job.startedAt) - Date.parse(job.queuedAt ?? job.createdAt);
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
    job.durationMs = job.startedAt ? Date.parse(job.finishedAt) - Date.parse(job.startedAt) : null;
    job.timedOut = job.items.some((item) => item.timedOut === true);
    await this.save(job, payload);
    return job;
  }

  private async executeTarget(jobId: string, target: PrintRunnerJobPayload["targets"][number]): Promise<PrintRunnerJobResultItem> {
    try {
      const capture = await runLocalCaptureProof(target.insertionId, {
        replaceExisting: target.replaceExisting,
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
        retroContentProof: capture.retroContentProof && typeof capture.retroContentProof === "object"
          ? capture.retroContentProof as Record<string, unknown>
          : null,
        manifestHash: typeof capture.manifestHash === "string" ? capture.manifestHash : null,
      };
    } catch (error) {
      const timedOut = error instanceof Error && (
        String((error as Error & { code?: string }).code ?? "").includes("TIMEOUT")
        || /timeout/i.test(error.message)
      );
      return {
        insertionId: target.insertionId,
        targetDate: target.targetDate,
        captureAt: target.captureAt ?? null,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        timedOut,
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
    const runtimeMeta = {
      queuedAt: job.queuedAt ?? job.createdAt,
      queueWaitMs: job.queueWaitMs ?? null,
      durationMs: job.durationMs ?? null,
      timedOut: job.timedOut === true,
      runnerId: job.runnerId ?? null,
    };
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
      meta: runtimeMeta,
      startedAt: job.startedAt ? new Date(job.startedAt) : null,
      finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
      updatedAt: new Date(),
    };

    await db
      .insert(printJobsTable)
      .values(row)
      .onConflictDoUpdate({
        target: printJobsTable.id,
        set: {
          ...row,
          meta: sql`COALESCE(${printJobsTable.meta}, '{}'::jsonb) || ${JSON.stringify(runtimeMeta)}::jsonb`,
        },
      });
  }
}

let singleton: LocalPrintRunner | null = null;

export function getLocalPrintRunner(): LocalPrintRunner {
  if (!singleton) singleton = new LocalPrintRunner();
  return singleton;
}
