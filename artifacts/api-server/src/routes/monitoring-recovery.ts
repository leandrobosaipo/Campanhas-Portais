import { Router, type IRouter } from 'express';

// Operator-facing capability bridge. The internal credential never leaves this process.
// Internal routes still perform provenance, checksum, checklist and row-lock checks.
const router: IRouter = Router();
router.use('/monitoring/recovery', (req, res, next) => {
  const expected = process.env.OPS_API_TOKEN?.trim();
  const supplied = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!expected || supplied !== expected) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (!process.env.ADOPS_INTERNAL_API_TOKEN?.trim()) { res.status(503).json({ error: 'recovery_internal_capability_unavailable' }); return; }
  next();
});

async function forward(path: string, method: string, body: unknown, res: any) {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || '4011'}/api/internal${path}`, {
    method, headers: { 'x-adops-api-token': process.env.ADOPS_INTERNAL_API_TOKEN!.trim(), 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(110_000),
  });
  res.setHeader('cache-control', 'no-store');
  res.status(response.status).json(await response.json());
}

router.post('/monitoring/recovery/candidates', async (req, res) => {
  const { insertionId, date, sourceJobId, ...extra } = req.body || {};
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
  // Explicit recovery requested for the two missing first-day proofs (PI 9029/9034).
  const authorizedFirstDay = date === '2026-10-19' && (insertionId === 3105 || insertionId === 3106);
  if (Object.keys(extra).length || !Number.isInteger(insertionId) || insertionId <= 0 || typeof date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (date < '2026-10-20' && !authorizedFirstDay) || date > today
    || typeof sourceJobId !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(sourceJobId)) {
    res.status(400).json({ error: 'invalid_recovery_candidate_identity' }); return;
  }
  try { await forward(`/insertions/${insertionId}/capture-proof/candidates`, 'POST', { date, sourceJobId }, res); }
  catch { res.status(502).json({ error: 'recovery_candidate_request_unknown', retryInstruction: 'Consulte o candidato existente antes de repetir.' }); }
});

for (const operation of ['audit', 'promote'] as const) {
  router.post(`/monitoring/recovery/candidates/:id/${operation}`, async (req, res) => {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(String(req.params.id)) || Object.keys(req.body || {}).length) {
      res.status(400).json({ error: 'invalid_recovery_review_request' }); return;
    }
    try { await forward(`/capture-proof-candidates/${req.params.id}/${operation}`, 'POST', {}, res); }
    catch { res.status(502).json({ error: 'recovery_review_result_unknown', retryInstruction: 'Consulte o mesmo candidato e suas promoções; não gere nova captura.' }); }
  });
}
router.get('/monitoring/recovery/candidates/:id', async (req, res) => {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(String(req.params.id))) { res.status(400).json({ error: 'invalid_candidate_id' }); return; }
  try { await forward(`/capture-proof-candidates/${req.params.id}`, 'GET', null, res); }
  catch { res.status(502).json({ error: 'recovery_candidate_read_failed' }); }
});
router.get('/monitoring/recovery/candidates/:id/promotions', async (req, res) => {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(String(req.params.id))) { res.status(400).json({ error: 'invalid_candidate_id' }); return; }
  try { await forward(`/capture-proof-candidates/${req.params.id}/promotions`, 'GET', null, res); }
  catch { res.status(502).json({ error: 'recovery_promotion_read_failed' }); }
});
export default router;
