/** Compatibilidade temporária de URLs legadas. Nenhum banco ou fila na borda. */
type Cod5Ambiente = { PRIVATE_ADOPS_API_BASE_URL?: string };
const cod5_origens = new Set([
  "https://adops.codigo5.com.br",
  "https://adops-campanhas-portais.pages.dev",
  "https://sites.codigo5.com.br",
]);

function cod5_responder(cod5_corpo: BodyInit | null, cod5_status: number, cod5_headers: Headers, cod5_origem: string | null) {
  cod5_headers.set("cache-control", "no-store");
  cod5_headers.delete("access-control-allow-origin");
  cod5_headers.delete("access-control-allow-credentials");
  cod5_headers.append("vary", "Origin");
  if (cod5_origem && cod5_origens.has(cod5_origem)) {
    cod5_headers.set("access-control-allow-origin", cod5_origem);
    cod5_headers.set("access-control-allow-credentials", "true");
  }
  cod5_headers.set("x-cod5-control-plane", "macmini-postgresql");
  return new Response(cod5_corpo, { status: cod5_status, headers: cod5_headers });
}

export default {
  async fetch(cod5_pedido: Request, cod5_ambiente: Cod5Ambiente): Promise<Response> {
    const cod5_url = new URL(cod5_pedido.url);
    const cod5_origem = cod5_pedido.headers.get("origin");
    const cod5_headers = new Headers();
    if (cod5_origem && !cod5_origens.has(cod5_origem)) {
      return cod5_responder("Origem não permitida", 403, cod5_headers, null);
    }
    if (!cod5_url.pathname.startsWith("/api/") || /^\/api\/internal(?:\/|$)/.test(cod5_url.pathname)) {
      return cod5_responder("Not found", 404, cod5_headers, cod5_origem);
    }
    if (cod5_pedido.method === "OPTIONS") {
      cod5_headers.set("access-control-allow-methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
      cod5_headers.set("access-control-allow-headers", "Authorization,Content-Type,Idempotency-Key,X-Adops-Client-Build,X-Adops-Auth-State");
      return cod5_responder(null, 204, cod5_headers, cod5_origem);
    }
    const cod5_base = new URL(cod5_ambiente.PRIVATE_ADOPS_API_BASE_URL || "https://adops-api.codigo5.com.br");
    // Destino fixo impede loop e redirecionamento a um host configurado por engano.
    if (cod5_base.origin !== "https://adops-api.codigo5.com.br") {
      return cod5_responder("Destino indisponível", 503, cod5_headers, cod5_origem);
    }
    const cod5_destino = new URL(cod5_url.pathname + cod5_url.search, cod5_base.origin);
    const cod5_encaminhados = new Headers();
    for (const cod5_nome of ["authorization", "cookie", "content-type", "accept", "idempotency-key", "x-adops-client-build", "x-adops-auth-state", "range", "if-range", "origin"]) {
      const cod5_valor = cod5_pedido.headers.get(cod5_nome);
      if (cod5_valor) cod5_encaminhados.set(cod5_nome, cod5_valor);
    }
    const cod5_controle = new AbortController();
    const cod5_prazo = setTimeout(() => cod5_controle.abort(), 60_000);
    try {
      const cod5_resposta = await fetch(cod5_destino, {
        method: cod5_pedido.method,
        headers: cod5_encaminhados,
        body: ["GET", "HEAD"].includes(cod5_pedido.method) ? undefined : cod5_pedido.body,
        redirect: "manual",
        signal: cod5_controle.signal,
      });
      return cod5_responder(cod5_resposta.body, cod5_resposta.status, new Headers(cod5_resposta.headers), cod5_origem);
    } catch {
      return cod5_responder("API temporariamente indisponível", 503, cod5_headers, cod5_origem);
    } finally {
      clearTimeout(cod5_prazo);
    }
  },
};
