// A proxy service token alone does not authenticate the original reader.
// In particular, the legacy public proxy injects that token for anonymous GETs.
export function captureRuntimeResponse(rule, authorization, operatorToken, internalToken) {
  const bearer = String(authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const allowed = [operatorToken, internalToken].map(x => String(x || '').trim()).filter(Boolean);
  const authenticated = Boolean(bearer && allowed.includes(bearer));
  return authenticated ? rule : { ...rule, previewSecret: null };
}
