const DEFAULT_PUBLIC_API_BASE_URL = "https://adops-api.codigo5.com.br";
const OPS_OPERATOR_TOKEN_KEY = "adops.ops.operator-token.v1";
const EMPTY_TOKEN_VALUES = new Set(["", '""', "''"]);

function isPagesHost(hostname: string) {
  return hostname === "adops-campanhas-portais.pages.dev" || hostname.endsWith(".adops-campanhas-portais.pages.dev");
}

function parseStoredToken(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : raw;
  } catch {
    return raw;
  }
}

export function normalizeOpsOperatorToken(raw: string | null | undefined) {
  if (typeof raw !== "string") return "";

  const parsed = parseStoredToken(raw).trim();
  if (EMPTY_TOKEN_VALUES.has(parsed)) return "";
  return parsed;
}

export function getRuntimeApiBaseUrl() {
  const envBase =
    typeof import.meta !== "undefined" &&
    typeof import.meta.env === "object" &&
    import.meta.env &&
    "VITE_API_BASE_URL" in import.meta.env
      ? String(import.meta.env.VITE_API_BASE_URL ?? "")
      : "";
  const configured = envBase.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && isPagesHost(window.location.hostname)) {
    return DEFAULT_PUBLIC_API_BASE_URL;
  }
  return "";
}

export function getStoredOpsOperatorToken() {
  if (typeof window === "undefined") return "";
  try {
    return normalizeOpsOperatorToken(window.localStorage.getItem(OPS_OPERATOR_TOKEN_KEY));
  } catch {
    return "";
  }
}

export function sanitizeStoredOpsOperatorToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(OPS_OPERATOR_TOKEN_KEY);
    const token = normalizeOpsOperatorToken(raw);
    if (!token) {
      window.localStorage.removeItem(OPS_OPERATOR_TOKEN_KEY);
      return "";
    }

    const canonical = JSON.stringify(token);
    if (raw !== canonical) {
      window.localStorage.setItem(OPS_OPERATOR_TOKEN_KEY, canonical);
    }
    return token;
  } catch {
    return "";
  }
}

export function hasStoredOpsOperatorToken() {
  return getStoredOpsOperatorToken().length > 0;
}

export function isPublicAdopsApiBaseUrl(url: string | null | undefined) {
  if (!url) return false;
  return /https:\/\/adops-api-public\.leandro471\.workers\.dev/i.test(url);
}

export function getAdopsClientBuildId() {
  return typeof __ADOPS_BUILD_ID__ === "string" && __ADOPS_BUILD_ID__.trim()
    ? __ADOPS_BUILD_ID__.trim()
    : "dev";
}

export { DEFAULT_PUBLIC_API_BASE_URL, OPS_OPERATOR_TOKEN_KEY };
