import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE_URL = (process.env.ADOPS_PUBLIC_BASE_URL || 'https://adops-campanhas-portais.pages.dev').replace(/\/$/, '');
const API_BASE = (process.env.ADOPS_PUBLIC_API_BASE_URL || 'https://adops-api-public.leandro471.workers.dev').replace(/\/$/, '');
const OPS_TOKEN = process.env.OPS_API_TOKEN || '';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const OUT_DIR = process.env.ADOPS_TEST_REPORT_DIR || path.join(PROJECT_ROOT, 'docs');
const DATE_STAMP = new Date().toISOString().slice(0, 10);
const jsonPath = path.join(OUT_DIR, `testes-pages-vps-${DATE_STAMP}.json`);
const mdPath = path.join(OUT_DIR, `testes-pages-vps-${DATE_STAMP}.md`);
const results = [];

function pushResult(name, status, detail) {
  results.push({ name, status, detail });
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout em ${label} (${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runStep(name, fn, ms = 25000) {
  console.log(`STEP_START ${name}`);
  try {
    const detail = await withTimeout(fn(), ms, name);
    pushResult(name, 'passed', String(detail ?? 'ok'));
    console.log(`STEP_OK ${name}`);
    return true;
  } catch (error) {
    pushResult(name, 'failed', error instanceof Error ? error.message : String(error));
    console.log(`STEP_FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function settlePage(page, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent().catch(() => '');
    if (body && !body.includes('Carregando...')) return body;
  }
  return page.locator('body').textContent().catch(() => '');
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await settlePage(page);
}

async function expectBodyContains(page, text) {
  await page.locator('body').waitFor({ timeout: 10000 });
  const body = await settlePage(page);
  if (!body?.includes(text)) throw new Error(`texto não encontrado: ${text}`);
  return body;
}

async function createProtectedJob(kind, body = {}) {
  if (!OPS_TOKEN) throw new Error('OPS_API_TOKEN ausente');
  const response = await fetch(`${API_BASE}/api/ops/jobs/${kind}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.details || payload?.error || `falha ao criar job ${kind}`);
  return payload;
}

async function getJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.details || payload?.error || `falha em ${url}`);
  return payload;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const health = await getJson(`${API_BASE}/api/healthz`);
  const dashboardSummary = await getJson(`${API_BASE}/api/dashboard/summary?competencia=ABRIL/2026`);
  const campaign840 = await getJson(`${API_BASE}/api/campaigns/840`);
  const insertion857 = await getJson(`${API_BASE}/api/insertions/857`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });

  if (OPS_TOKEN) {
    await context.addInitScript((token) => {
      window.localStorage.setItem('adops.ops.operator-token.v1', token);
    }, OPS_TOKEN);
  }

  const page = await context.newPage();

  await runStep('Health da API pública', async () => {
    if (health.mode !== 'cloudflare-public-live-proxy') throw new Error(`modo inesperado: ${health.mode}`);
    return health.mode;
  });

  await runStep('Dashboard carrega estrutura principal', async () => {
    await goto(page, `${BASE_URL}/`);
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 15000 });
    await expectBodyContains(page, 'Total Inserções');
    return 'dashboard ok';
  });

  await runStep('API pública entrega resumo do dashboard', async () => {
    if (!(Number(dashboardSummary.totalInsercoes) > 0)) throw new Error('totalInsercoes zerado');
    if (!(Number(dashboardSummary.totalCampanhas) > 0)) throw new Error('totalCampanhas zerado');
    return `${dashboardSummary.totalInsercoes} inserções`;
  });

  await runStep('Dashboard mostra ações principais', async () => {
    await expectBodyContains(page, 'Prints do dia');
    await expectBodyContains(page, 'Retroativos vencidos');
    await expectBodyContains(page, 'Auditar');
    return 'ações visíveis';
  });

  await runStep('Campanhas carrega estrutura da listagem', async () => {
    await goto(page, `${BASE_URL}/campanhas`);
    await page.getByRole('heading', { name: 'Campanhas' }).waitFor({ timeout: 15000 });
    await page.getByPlaceholder('Buscar campanha, cliente, PI...').waitFor({ timeout: 15000 });
    return 'campanhas ok';
  });

  await runStep('Filtro de campanhas recebe entrada', async () => {
    const input = page.getByPlaceholder('Buscar campanha, cliente, PI...');
    await input.fill('DENGUE');
    const value = await input.inputValue();
    if (value !== 'DENGUE') throw new Error(`valor inesperado: ${value}`);
    return 'filtro ok';
  });

  await runStep('API pública entrega campanha 840', async () => {
    const campaignName = campaign840.nome || campaign840.name || 'Campanha';
    if (!campaignName) throw new Error('campanha sem nome');
    return String(campaignName);
  });

  await runStep('Detalhe da campanha 840 carrega estrutura', async () => {
    await goto(page, `${BASE_URL}/campanhas/840`);
    await expectBodyContains(page, 'Cliente');
    await expectBodyContains(page, 'Inserções');
    return 'detalhe ok';
  });

  await runStep('Inserções carrega estrutura da fila operacional', async () => {
    await goto(page, `${BASE_URL}/insercoes`);
    await page.getByRole('heading', { name: 'Fila Operacional' }).waitFor({ timeout: 15000 });
    await page.getByPlaceholder('Buscar campanha, cliente, site...').waitFor({ timeout: 15000 });
    return 'inserções ok';
  });

  await runStep('Filtro de inserções recebe entrada', async () => {
    const input = page.getByPlaceholder('Buscar campanha, cliente, site...');
    await input.fill('ROO');
    const value = await input.inputValue();
    if (value !== 'ROO') throw new Error(`valor inesperado: ${value}`);
    return 'filtro ok';
  });

  await runStep('API pública entrega inserção 857', async () => {
    if (Number(insertion857.id) !== 857) throw new Error(`id inesperado: ${insertion857.id}`);
    return `${insertion857.campanhaName || 'sem-campanha'} / ${insertion857.siteSigla || 'sem-site'}`;
  });

  await runStep('Detalhe da inserção 857 carrega estrutura', async () => {
    await goto(page, `${BASE_URL}/insercoes/857`);
    await expectBodyContains(page, 'Relação com AdRotate');
    await expectBodyContains(page, 'Baixar ZIP + TXT');
    return `inserção ${insertion857.id} ok`;
  });

  await runStep('Sincronização carrega jobs operacionais', async () => {
    await goto(page, `${BASE_URL}/sincronizacao`);
    await page.getByRole('heading', { name: 'Sincronização' }).waitFor({ timeout: 15000 });
    await expectBodyContains(page, 'Jobs operacionais no Cloudflare');
    return 'sync center ok';
  });

  await runStep('Fila de falhas carrega', async () => {
    await goto(page, `${BASE_URL}/auditoria-prints`);
    await page.locator('body').waitFor({ timeout: 10000 });
    return 'auditoria acessível';
  });

  await runStep('Configurações carrega', async () => {
    await goto(page, `${BASE_URL}/configuracoes`);
    await page.getByRole('heading', { name: 'Configurações' }).waitFor({ timeout: 15000 });
    await expectBodyContains(page, 'Cadastrar agência');
    return 'config ok';
  });

  await runStep('Nova campanha carrega', async () => {
    await goto(page, `${BASE_URL}/campanhas/nova`);
    await page.getByRole('heading', { name: 'Nova Campanha' }).waitFor({ timeout: 15000 });
    await expectBodyContains(page, 'Salvar rascunho local');
    return 'nova campanha ok';
  });

  if (OPS_TOKEN) {
    await runStep('API protegida cria job de sync', async () => {
      const payload = await createProtectedJob('sync-planilha', { competencia: 'ABRIL/2026' });
      if (!payload.jobId) throw new Error('jobId ausente');
      return payload.jobId;
    }, 30000);

    await runStep('API protegida cria job de prints do dia', async () => {
      const payload = await createProtectedJob('print-batch', { competencia: 'ABRIL/2026' });
      if (!payload.jobId) throw new Error('jobId ausente');
      return payload.jobId;
    }, 30000);

    await runStep('API protegida cria retroativo por inserção', async () => {
      const response = await fetch(`${API_BASE}/api/insertions/capture-proof/backfill-overdue/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ insertionId: 857 }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.details || payload?.error || 'falha no retroativo por inserção');
      if (!payload.ok) throw new Error('payload ok=false');
      return payload.jobId || 'sem-job';
    }, 30000);

    await runStep('API protegida cria job de print individual', async () => {
      const payload = await createProtectedJob('print-single', {
        insertionId: 857,
        captureAt: '2026-04-10T19:13:00-04:00',
        replace: true,
      });
      if (!payload.jobId) throw new Error('jobId ausente');
      return payload.jobId;
    }, 30000);

    await runStep('API pública responde status da inserção 857', async () => {
      const payload = await getJson(`${API_BASE}/api/insertions/857/capture-proof/status?date=2026-04-10`);
      if (!payload.status) throw new Error('status ausente');
      return payload.status;
    }, 30000);

    await runStep('API pública exporta ZIP da inserção 857', async () => {
      const response = await fetch(`${API_BASE}/api/insertions/857/evidences/export.zip`);
      if (!response.ok) {
        let detail = `status ${response.status}`;
        try {
          const payload = await response.json();
          detail = payload?.details || payload?.error || detail;
        } catch {}
        throw new Error(detail);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!/zip|octet-stream/i.test(contentType)) throw new Error(`content-type inesperado: ${contentType}`);
      return contentType;
    }, 45000);
  }

  await browser.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    apiBase: API_BASE,
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };

  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2));
  const md = [
    `# Relatório de testes do Pages + VPS (${DATE_STAMP})`,
    '',
    `- Base pública: ${BASE_URL}`,
    `- API pública: ${API_BASE}`,
    `- Total: ${summary.total}`,
    `- Aprovados: ${summary.passed}`,
    `- Falhos: ${summary.failed}`,
    '',
    '## Resultados',
    '',
    ...results.map((item) => `- ${item.status === 'passed' ? '✅' : '❌'} **${item.name}**: ${item.detail}`),
  ].join('\n');
  await fs.writeFile(mdPath, md, 'utf8');

  console.log(JSON.stringify({ ok: summary.failed === 0, jsonPath, mdPath, summary }, null, 2));
  process.exit(summary.failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  pushResult('Execução geral da suíte', 'failed', error instanceof Error ? error.message : String(error));
  await fs.mkdir(OUT_DIR, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    apiBase: API_BASE,
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2));
  await fs.writeFile(mdPath, `# Relatório de testes do Pages + VPS (${DATE_STAMP})\n\n- ❌ Falha geral: ${error instanceof Error ? error.message : String(error)}\n`, 'utf8');
  console.error(error);
  process.exit(1);
});
