import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

export type OpsJobStatus = "queued" | "ready_for_runner" | "running" | "completed" | "failed" | "awaiting_human_review";

const cod5_ROTULOS_STATUS_JOB: Record<OpsJobStatus, string> = {
  queued: "Na fila",
  ready_for_runner: "Aguardando runner",
  running: "Em execução",
  completed: "Concluído",
  failed: "Falhou",
  awaiting_human_review: "Aguardando revisão humana",
};

export type OpsJobRow = {
  id: string;
  kind: string;
  status: OpsJobStatus;
  payload_json: unknown;
  result_json: unknown;
  error_text: string | null;
  requested_by: string | null;
  runner_id: string | null;
  created_at: string;
  updated_at: string;
};

export function cod5_lerJsonJobOperacional(cod5_valor: unknown): Record<string, unknown> | null {
  if (!cod5_valor) return null;
  if (typeof cod5_valor === "object" && !Array.isArray(cod5_valor)) return cod5_valor as Record<string, unknown>;
  if (typeof cod5_valor !== "string") return null;
  try {
    const cod5_lido = JSON.parse(cod5_valor) as unknown;
    return cod5_lido && typeof cod5_lido === "object" && !Array.isArray(cod5_lido)
      ? cod5_lido as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function cod5_descreverJobOperacional(cod5_linha: OpsJobRow) {
  return {
    id: cod5_linha.id,
    jobId: cod5_linha.id,
    kind: cod5_linha.kind,
    status: cod5_linha.status,
    statusLabel: cod5_ROTULOS_STATUS_JOB[cod5_linha.status],
    payload: cod5_lerJsonJobOperacional(cod5_linha.payload_json),
    result: cod5_lerJsonJobOperacional(cod5_linha.result_json),
    error: cod5_linha.error_text,
    requestedBy: cod5_linha.requested_by,
    runnerId: cod5_linha.runner_id,
    createdAt: cod5_linha.created_at,
    updatedAt: cod5_linha.updated_at,
  };
}

export async function cod5_obterJobOperacional(cod5_jobId: string, cod5_tipo: string) {
  const cod5_resultado = await pool.query<OpsJobRow>(
    "SELECT * FROM ops_jobs WHERE id = $1 AND kind = $2 LIMIT 1",
    [cod5_jobId, cod5_tipo],
  );
  return cod5_resultado.rows[0] ? cod5_descreverJobOperacional(cod5_resultado.rows[0]) : null;
}

export async function cod5_listarJobsOperacionais(cod5_tipo: string, cod5_opcoes: { insertionId?: number; limit?: number } = {}) {
  const cod5_limite = Math.max(1, Math.min(cod5_opcoes.limit ?? 20, 100));
  const cod5_resultado = cod5_opcoes.insertionId
    ? await pool.query<OpsJobRow>(
      `SELECT * FROM ops_jobs
        WHERE kind = $1
          AND payload_json::jsonb ->> 'insertionId' = $2::text
        ORDER BY created_at DESC
        LIMIT $3`,
      [cod5_tipo, cod5_opcoes.insertionId, cod5_limite],
    )
    : await pool.query<OpsJobRow>(
      "SELECT * FROM ops_jobs WHERE kind = $1 ORDER BY created_at DESC LIMIT $2",
      [cod5_tipo, cod5_limite],
    );
  return cod5_resultado.rows.map(cod5_descreverJobOperacional);
}

export function cod5_chaveEstavelPayloadOperacional(cod5_payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(cod5_payload)).digest("hex");
}

export async function cod5_criarJobOperacional(cod5_opcoes: {
  kind: string;
  payload: Record<string, unknown>;
  requestedBy: string | null;
  idempotencyKey: string;
  retryFailed?: boolean;
}) {
  const cod5_cliente = await pool.connect();
  try {
    await cod5_cliente.query("BEGIN");
    await cod5_cliente.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [cod5_opcoes.kind, cod5_opcoes.idempotencyKey],
    );
    const cod5_existentes = await cod5_cliente.query<OpsJobRow>(
      `SELECT * FROM ops_jobs
        WHERE kind = $1
          AND payload_json::jsonb ->> 'idempotencyKey' = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [cod5_opcoes.kind, cod5_opcoes.idempotencyKey],
    );
    const cod5_atual = cod5_existentes.rows[0];
    if (cod5_atual) {
      if (cod5_atual.status === "failed" && cod5_opcoes.retryFailed === true) {
        const cod5_repetidoEm = new Date().toISOString();
        const cod5_payloadAnterior = cod5_lerJsonJobOperacional(cod5_atual.payload_json) ?? {};
        const cod5_tentativaAnterior = Number(cod5_payloadAnterior.attempt ?? 1);
        const cod5_repetido = await cod5_cliente.query<OpsJobRow>(
          `UPDATE ops_jobs
              SET status = 'ready_for_runner',
                  payload_json = $1,
                  result_json = $2,
                  error_text = NULL,
                  runner_id = NULL,
                  updated_at = $3
            WHERE id = $4 AND status = 'failed'
            RETURNING *`,
          [
            JSON.stringify({ ...cod5_opcoes.payload, attempt: Number.isFinite(cod5_tentativaAnterior) ? cod5_tentativaAnterior + 1 : 2, idempotencyKey: cod5_opcoes.idempotencyKey }), // gitleaks:allow -- campo operacional, não contém segredo
            JSON.stringify({ stage: "ready_for_runner", retryOf: cod5_atual.id, retriedAt: cod5_repetidoEm }),
            cod5_repetidoEm,
            cod5_atual.id,
          ],
        );
        if (cod5_repetido.rows[0]) {
          await cod5_cliente.query("COMMIT");
          return { job: cod5_descreverJobOperacional(cod5_repetido.rows[0]), duplicate: false };
        }
      }
      await cod5_cliente.query("COMMIT");
      return { job: cod5_descreverJobOperacional(cod5_atual), duplicate: true };
    }

    const cod5_jobId = randomUUID();
    const cod5_criadoEm = new Date().toISOString();
    const cod5_inserido = await cod5_cliente.query<OpsJobRow>(
      `INSERT INTO ops_jobs
        (id, kind, status, payload_json, result_json, error_text, requested_by, runner_id, created_at, updated_at)
       VALUES ($1, $2, 'ready_for_runner', $3, $4, NULL, $5, NULL, $6, $7)
       RETURNING *`,
      [
        cod5_jobId,
        cod5_opcoes.kind,
        JSON.stringify({ ...cod5_opcoes.payload, idempotencyKey: cod5_opcoes.idempotencyKey }), // gitleaks:allow -- campo operacional, não contém segredo
        JSON.stringify({ stage: "ready_for_runner", queuedAt: cod5_criadoEm }),
        cod5_opcoes.requestedBy,
        cod5_criadoEm,
        cod5_criadoEm,
      ],
    );
    await cod5_cliente.query("COMMIT");
    return { job: cod5_descreverJobOperacional(cod5_inserido.rows[0]!), duplicate: false };
  } catch (cod5_erro) {
    await cod5_cliente.query("ROLLBACK").catch(() => undefined);
    throw cod5_erro;
  } finally {
    cod5_cliente.release();
  }
}
