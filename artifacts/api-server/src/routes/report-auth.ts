import crypto from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import {
  buildGoogleAuthorizationUrl,
  isAllowedGoogleIdentity,
  normalizeSafeReportNext,
  signReportSession,
  verifyReportSession,
  type ReportAuthConfig,
} from "../lib/google-report-auth";

const router: IRouter = Router();
export const REPORT_SESSION_COOKIE = "cod5_adops_report_session";

export function getReportAuthConfig(): ReportAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.ADOPS_GOOGLE_REDIRECT_URI?.trim() ?? "https://adops-api.codigo5.com.br/api/auth/google/callback";
  const sessionSecret = process.env.ADOPS_SESSION_SECRET?.trim() ?? "";
  const allowedEmails = new Set((process.env.ADOPS_GOOGLE_ALLOWED_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return clientId && clientSecret && redirectUri && sessionSecret && allowedEmails.size
    ? { clientId, redirectUri, sessionSecret, allowedEmails }
    : null;
}

export function reportSessionFromRequest(req: Request) {
  const config = getReportAuthConfig();
  return config ? verifyReportSession(req.cookies?.[REPORT_SESSION_COOKIE], config.sessionSecret) : null;
}

const cookieBase = { httpOnly: true, secure: true, sameSite: "lax" as const, domain: ".codigo5.com.br" };

router.get("/auth/google/login", (req, res) => {
  const config = getReportAuthConfig();
  if (!config) {
    res.status(503).json({ error: "google_oauth_not_configured" });
    return;
  }
  const state = crypto.randomBytes(24).toString("base64url");
  res.cookie("cod5_adops_oauth_state", state, { ...cookieBase, path: "/api/auth/google", maxAge: 10 * 60_000 });
  res.cookie("cod5_adops_oauth_next", normalizeSafeReportNext(req.query.next), { ...cookieBase, path: "/api/auth/google", maxAge: 10 * 60_000 });
  res.redirect(buildGoogleAuthorizationUrl(state, config));
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const config = getReportAuthConfig();
  if (!config) {
    res.status(503).json({ error: "google_oauth_not_configured" });
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state || state !== req.cookies?.cod5_adops_oauth_state) {
    res.status(400).json({ error: "invalid_oauth_state" });
    return;
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const token = await tokenResponse.json() as { id_token?: string };
    if (!tokenResponse.ok || !token.id_token) throw new Error("oauth_token_exchange_failed");
    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`, { signal: AbortSignal.timeout(15_000) });
    const info = await infoResponse.json() as Record<string, unknown>;
    if (!infoResponse.ok || !isAllowedGoogleIdentity(info, config)) {
      res.status(403).json({ error: "google_user_not_allowed" });
      return;
    }
    const email = String(info.email).trim().toLowerCase();
    const session = signReportSession({ email, name: String(info.name ?? ""), exp: Date.now() + 8 * 60 * 60_000 }, config.sessionSecret);
    res.clearCookie("cod5_adops_oauth_state", { ...cookieBase, path: "/api/auth/google" });
    res.clearCookie("cod5_adops_oauth_next", { ...cookieBase, path: "/api/auth/google" });
    res.cookie(REPORT_SESSION_COOKIE, session, { ...cookieBase, path: "/", maxAge: 8 * 60 * 60_000 });
    res.redirect(normalizeSafeReportNext(req.cookies?.cod5_adops_oauth_next));
  } catch {
    res.status(401).json({ error: "google_oauth_failed" });
  }
});

router.get("/auth/session", (req, res) => {
  const session = reportSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.setHeader("cache-control", "no-store");
  res.json({ authenticated: true, user: { email: session.email, name: session.name } });
});

router.post("/auth/logout", (req, res) => {
  res.clearCookie(REPORT_SESSION_COOKIE, { ...cookieBase, path: "/" });
  res.status(204).end();
});

export default router;
