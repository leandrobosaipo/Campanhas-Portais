import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-base";
import { getRuntimeApiBaseUrl, hasStoredOpsOperatorToken, isPublicAdopsApiBaseUrl } from "@/lib/runtime-api";

type ApiHealth = {
  status: string;
  mode?: string;
};

export function useApiMode() {
  const query = useQuery({
    queryKey: ["api-health-mode"],
    queryFn: async () => {
      const response = await apiFetch("/api/healthz");
      const payload = (await response.json()) as ApiHealth;
      if (!response.ok) throw new Error(payload?.status || "Falha ao ler healthz.");
      return payload;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const mode = query.data?.mode ?? null;
  const isReadonlyPublic = mode === "cloudflare-public-readonly";
  const inferPublicFromRuntime = isPublicAdopsApiBaseUrl(getRuntimeApiBaseUrl());
  const isCloudflarePublic =
    mode === "cloudflare-public-readonly" ||
    mode === "cloudflare-public-live-proxy" ||
    (!mode && inferPublicFromRuntime);
  const hasOperatorToken = hasStoredOpsOperatorToken();
  const canRunProtectedMutations = !isCloudflarePublic || hasOperatorToken;
  const protectedMutationMessage = canRunProtectedMutations
    ? null
    : "Acao operacional protegida. Informe o token do operador nesta sessao para excluir, corrigir, gerar ou sincronizar.";

  return {
    ...query,
    mode,
    isReadonlyPublic,
    isCloudflarePublic,
    hasOperatorToken,
    canRunProtectedMutations,
    protectedMutationMessage,
    readonlyMessage: isReadonlyPublic
      ? "Esta versão pública já mostra os dados no Cloudflare. As ações operacionais protegidas já podem ser disparadas daqui com token de operador, enquanto o runner remoto definitivo termina de sair do local."
      : null,
  };
}
