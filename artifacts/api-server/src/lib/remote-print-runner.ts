import type {
  PrintRunnerJobPayload,
  PrintRunnerJobResult,
  PrintRunnerPort,
} from "./print-runner-contract";

type RemoteRunnerOptions = {
  baseUrl: string;
  token?: string | null;
};

function ensureTrailingApi(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

export class RemotePrintRunner implements PrintRunnerPort {
  constructor(private readonly options: RemoteRunnerOptions) {}

  async runNow(payload: PrintRunnerJobPayload): Promise<PrintRunnerJobResult> {
    return this.request<PrintRunnerJobResult>("/run-now", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async enqueue(payload: PrintRunnerJobPayload): Promise<{ jobId: string }> {
    return this.request<{ jobId: string }>("/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async get(jobId: string): Promise<PrintRunnerJobResult | null> {
    return this.request<PrintRunnerJobResult | null>(`/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
    });
  }

  async updateMeta(jobId: string, meta: Record<string, unknown>): Promise<void> {
    await this.request(`/jobs/${encodeURIComponent(jobId)}/meta`, {
      method: "PUT",
      body: JSON.stringify({ meta }),
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${ensureTrailingApi(this.options.baseUrl)}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Remote print runner failed (${response.status}): ${text || response.statusText}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
