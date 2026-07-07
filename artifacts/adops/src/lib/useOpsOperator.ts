import { useMemo } from "react";
import { apiUrl } from "@/lib/api-base";
import { getAdopsClientBuildId } from "@/lib/runtime-api";
import { usePersistentState } from "@/lib/usePersistentState";

type OpsJobKind = "print-batch" | "print-backfill" | "print-single" | "sync-planilha";

export function useOpsOperator() {
  const [token, setToken] = usePersistentState<string>("adops.ops.operator-token.v1", "");

  const hasToken = token.trim().length > 0;

  const authHeaders = useMemo(
    () => {
      const headers = new Headers();
      if (hasToken) {
        headers.set("Authorization", `Bearer ${token.trim()}`);
      }
      return headers;
    },
    [hasToken, token],
  );

  async function postProtected<T = unknown>(path: string, body: Record<string, unknown>) {
    const headers = new Headers({
      "Content-Type": "application/json",
      "x-adops-client-build": getAdopsClientBuildId(),
      "x-adops-auth-state": hasToken ? "present" : "missing",
    });
    authHeaders.forEach((value, key) => {
      headers.set(key, value);
    });

    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.details ||
          payload?.error ||
          "Falha ao chamar a camada protegida no Cloudflare.",
      );
    }
    return payload as T;
  }

  async function createJob(kind: OpsJobKind, body: Record<string, unknown>) {
    return postProtected<{ ok: boolean; jobId: string; kind: OpsJobKind; status: string }>(
      `/api/ops/jobs/${kind}`,
      body,
    );
  }

  return {
    token,
    setToken,
    hasToken,
    createJob,
    postProtected,
  };
}
