import {
  getAdopsClientBuildId,
  getRuntimeApiBaseUrl,
  getStoredOpsOperatorToken,
  isPublicAdopsApiBaseUrl,
} from "./runtime-api";

const apiBaseUrl = getRuntimeApiBaseUrl();
const PROTECTED_MUTATION_MESSAGE =
  "Acao operacional protegida. Informe o token do operador nesta sessao antes de tentar novamente.";

export type AdopsAuthState = "missing" | "present" | "empty_bearer_sanitized";

function resolveAuthState({
  token,
  hadEmptyBearer,
}: {
  token: string;
  hadEmptyBearer: boolean;
}): AdopsAuthState {
  if (hadEmptyBearer) return "empty_bearer_sanitized";
  return token ? "present" : "missing";
}

export function buildApiRequestHeaders(
  init: RequestInit | undefined,
  {
    apiBase,
    token,
    clientBuildId,
  }: {
    apiBase: string;
    token: string;
    clientBuildId: string;
  },
) {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers ?? {});
  const needsOperatorAuth = !["GET", "HEAD", "OPTIONS"].includes(method);
  const authorization = headers.get("Authorization") ?? headers.get("authorization") ?? "";
  const hasEmptyBearer = /^Bearer\s*$/i.test(authorization.trim()) || /^Bearer\s+""$/i.test(authorization.trim());

  if (hasEmptyBearer) {
    headers.delete("Authorization");
    headers.delete("authorization");
  }

  const authState = resolveAuthState({ token, hadEmptyBearer: hasEmptyBearer });
  const isPublicApi = isPublicAdopsApiBaseUrl(apiBase);

  if (needsOperatorAuth) {
    headers.set("x-adops-client-build", clientBuildId);
    headers.set("x-adops-auth-state", authState);
  }

  if (needsOperatorAuth && token && !headers.has("Authorization") && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return {
    method,
    headers,
    authState,
    shouldBlockProtectedMutation: needsOperatorAuth && isPublicApi && !token,
  };
}

export function apiUrl(path: string) {
  if (!path) return apiBaseUrl || "/";
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return apiBaseUrl ? `${apiBaseUrl}${normalized}` : normalized;
}

export function apiFetch(input: string, init?: RequestInit) {
  const token = getStoredOpsOperatorToken();
  const { headers, shouldBlockProtectedMutation } = buildApiRequestHeaders(init, {
    apiBase: apiBaseUrl,
    token,
    clientBuildId: getAdopsClientBuildId(),
  });

  if (shouldBlockProtectedMutation) {
    throw new Error(PROTECTED_MUTATION_MESSAGE);
  }

  return fetch(apiUrl(input), {
    ...init,
    headers,
  });
}
