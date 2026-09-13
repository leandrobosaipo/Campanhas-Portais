import crypto from "node:crypto";

export type ReportAuthConfig = {
  clientId: string;
  redirectUri: string;
  sessionSecret: string;
  allowedEmails: Set<string>;
};

export type ReportSession = {
  email: string;
  name: string;
  exp: number;
};

export const REPORT_URL = "https://sites.codigo5.com.br/reports/adops-evidencias/";

export function normalizeSafeReportNext(value: unknown) {
  try {
    const url = new URL(String(value || REPORT_URL));
    return url.origin === "https://sites.codigo5.com.br" && url.pathname === "/reports/adops-evidencias/"
      ? url.toString()
      : REPORT_URL;
  } catch {
    return REPORT_URL;
  }
}

export function buildGoogleAuthorizationUrl(state: string, config: Pick<ReportAuthConfig, "clientId" | "redirectUri">) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function isAllowedGoogleIdentity(info: Record<string, unknown>, config: Pick<ReportAuthConfig, "clientId" | "allowedEmails">) {
  const email = String(info.email ?? "").trim().toLowerCase();
  const verified = info.email_verified === true || String(info.email_verified ?? "").toLowerCase() === "true";
  return Boolean(email && verified && String(info.aud ?? "") === config.clientId && config.allowedEmails.has(email));
}

export function signReportSession(session: ReportSession, secret: string) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyReportSession(value: string | undefined, secret: string, now = Date.now()): ReportSession | null {
  if (!value || !secret) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ReportSession;
    return session.email && Number.isFinite(session.exp) && session.exp > now ? session : null;
  } catch {
    return null;
  }
}
