import assert from 'node:assert/strict';
import test from 'node:test';
import cod5_ponte from '../../ops/cloudflare-public-api/src/bridge.ts';

test('ponte preserva autenticação do cliente sem promover acesso interno', async () => {
  const cod5_original = globalThis.fetch;
  globalThis.fetch = async (cod5_url, cod5_opcoes) => {
    assert.equal(String(cod5_url), 'https://adops-api.codigo5.com.br/api/ops/jobs?limit=2');
    assert.equal(cod5_opcoes.headers.get('authorization'), 'Bearer operador-teste');
    assert.equal(cod5_opcoes.headers.get('x-adops-api-token'), null);
    assert.equal(cod5_opcoes.headers.get('cookie'), 'sessao=teste');
    return new Response('privado', { status: 401, headers: { 'set-cookie': 'sessao=; HttpOnly; Secure', 'content-disposition': 'attachment; filename=arquivo.zip' } });
  };
  try {
    const cod5_resposta = await cod5_ponte.fetch(new Request('https://legado.workers.dev/api/ops/jobs?limit=2', { headers: { authorization: 'Bearer operador-teste', cookie: 'sessao=teste', 'x-adops-api-token': 'nao-encaminhar', origin: 'https://adops-campanhas-portais.pages.dev' } }), {});
    assert.equal(cod5_resposta.status, 401);
    assert.equal(cod5_resposta.headers.get('access-control-allow-origin'), 'https://adops-campanhas-portais.pages.dev');
    assert.equal(cod5_resposta.headers.get('access-control-allow-credentials'), 'true');
    assert.match(cod5_resposta.headers.get('set-cookie'), /HttpOnly/);
    assert.match(cod5_resposta.headers.get('content-disposition'), /arquivo.zip/);
  } finally { globalThis.fetch = cod5_original; }
});
test('origem externa, rotas internas e loop são bloqueados antes do upstream', async () => {
  const cod5_original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('upstream não deveria ser chamado'); };
  try {
    assert.equal((await cod5_ponte.fetch(new Request('https://legado.workers.dev/api/internal/campaign-evidence-exports'), {})).status, 404);
    assert.equal((await cod5_ponte.fetch(new Request('https://legado.workers.dev/api/ops/jobs', { headers: { origin: 'https://externo.invalid' } }), {})).status, 403);
    assert.equal((await cod5_ponte.fetch(new Request('https://legado.workers.dev/api/ops/jobs'), { PRIVATE_ADOPS_API_BASE_URL: 'https://legado.workers.dev' })).status, 503);
  } finally { globalThis.fetch = cod5_original; }
});
test('preflight permite cliente conhecido sem consultar banco', async () => {
  const cod5_resposta = await cod5_ponte.fetch(new Request('https://legado.workers.dev/api/pi-site-exports/jobs', { method: 'OPTIONS', headers: { origin: 'https://sites.codigo5.com.br' } }), {});
  assert.equal(cod5_resposta.status, 204);
  assert.match(cod5_resposta.headers.get('access-control-allow-headers'), /Idempotency-Key/);
});
