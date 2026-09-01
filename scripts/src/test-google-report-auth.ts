import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleAuthorizationUrl,
  isAllowedGoogleIdentity,
  normalizeSafeReportNext,
  signReportSession,
  verifyReportSession,
} from "../../artifacts/api-server/src/lib/google-report-auth.ts";

const config = {
  clientId: "client-123",
  redirectUri: "https://adops-api.codigo5.com.br/api/auth/google/callback",
  sessionSecret: "secret-with-enough-entropy",
  allowedEmails: new Set(["leandro@codigo5.com.br", "marianacardozof@gmail.com"]),
};

test("autoriza somente os dois emails Google verificados", () => {
  assert.equal(isAllowedGoogleIdentity({ email: "Leandro@codigo5.com.br", email_verified: true, aud: "client-123" }, config), true);
  assert.equal(isAllowedGoogleIdentity({ email: "marianacardozof@gmail.com", email_verified: "true", aud: "client-123" }, config), true);
  assert.equal(isAllowedGoogleIdentity({ email: "outro@codigo5.com.br", email_verified: true, aud: "client-123" }, config), false);
  assert.equal(isAllowedGoogleIdentity({ email: "leandro@codigo5.com.br", email_verified: false, aud: "client-123" }, config), false);
  assert.equal(isAllowedGoogleIdentity({ email: "leandro@codigo5.com.br", email_verified: true, aud: "outro-client" }, config), false);
});

test("assina sessao curta e rejeita adulteracao ou expiracao", () => {
  const token = signReportSession({ email: "leandro@codigo5.com.br", name: "Leandro", exp: 2_000 }, config.sessionSecret);
  assert.equal(verifyReportSession(token, config.sessionSecret, 1_000)?.email, "leandro@codigo5.com.br");
  assert.equal(verifyReportSession(`${token}x`, config.sessionSecret, 1_000), null);
  assert.equal(verifyReportSession(token, config.sessionSecret, 3_000), null);
});

test("mantem retorno apenas na pagina unica do relatorio", () => {
  assert.equal(normalizeSafeReportNext("https://sites.codigo5.com.br/reports/adops-evidencias/?mes=2026-08"), "https://sites.codigo5.com.br/reports/adops-evidencias/?mes=2026-08");
  assert.equal(normalizeSafeReportNext("https://evil.example/roubar"), "https://sites.codigo5.com.br/reports/adops-evidencias/");
});

test("gera URL OAuth Google com state e escopos minimos", () => {
  const url = new URL(buildGoogleAuthorizationUrl("state-1", config));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), "state-1");
  assert.equal(url.searchParams.get("client_id"), "client-123");
});
