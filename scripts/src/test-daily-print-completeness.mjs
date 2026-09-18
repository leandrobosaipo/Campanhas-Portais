import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { selectDailyPrintCandidates } from '../../ops/shared/daily-print-candidates.mjs';
import { classifyDailyPrintOutcome } from '../../ops/shared/daily-operations-policy.mjs';
import { buildDailyPrintLiveProgress } from '../../ops/shared/daily-print-status.mjs';
import { aggregateCaptureTimings } from '../../ops/shared/capture-stage-timings.mjs';
const date = '2026-09-17';
const canonical = {
  adops: { insertionId: 3038, mediaUrl: 'https://cdn.test/9774.gif', bannerPublicadoNoSite: true, publicConfirmation: 'confirmed' },
  canonicalSelection: { insertionId: 3038, decision: 'confirmed' },
  publicationHealth: { status: 'blocked_upstream', reason: 'duplicate_identity', expectedMediaObserved: true, expectedGroupId: 2 },
  sourceIdentity: { decision: 'confirmed' },
  evidence: { requiredDates: [date], missingDates: [date] },
};
test('capture confirmed canonical creative despite a sibling draft without authorizing publication', () => {
  assert.deepEqual(selectDailyPrintCandidates([canonical], date).map(x => x.adops.insertionId), [3038]);
  for (const change of [
    { canonicalSelection: { insertionId: 3030, decision: 'confirmed' } },
    { sourceIdentity: { decision: 'needs_confirmation' } },
    { publicationHealth: { ...canonical.publicationHealth, expectedMediaObserved: false } },
  ]) assert.equal(selectDailyPrintCandidates([{...canonical, ...change}], date).length, 0);
});
test('published audited scope adds off-sheet C Display once and preserves pending date selection', () => {
  const extra = { id: 3022, bannerPublicadoNoSite: true, mediaUrl: 'https://cdn.test/display.gif', periodoInicio: '2026-09-01', periodoFim: '2026-09-30', statusNormalizado: 'publicado', competencia: '09/2026' };
  const options = { publishedInsertions: [{ insertion: extra, audit: { insertionId: 3022, targetDate: date, status: 'missing' } }] };
  const result = selectDailyPrintCandidates([], date, options);
  assert.deepEqual(result.map(x => x.adops.insertionId), [3022]);
  assert.deepEqual(result[0].evidence.missingDates, [date]);
  assert.equal(selectDailyPrintCandidates([], date, {...options, pendingInsertionIds:[3038]}).length, 0);
  for (const change of [{bannerPublicadoNoSite:false}, {mediaUrl:null}, {archivedAt:'2026-09-18'}, {statusNormalizado:'cancelado'}, {statusNormalizado:' CANCELADO '}, {statusNormalizado:'inativo'}, {statusNormalizado:'ARQUIVADO'}, {periodoFim:'2026-09-16'}]) {
    assert.equal(selectDailyPrintCandidates([], date, {publishedInsertions:[{...options.publishedInsertions[0],insertion:{...extra,...change}}]}).length, 0);
  }
  assert.equal(selectDailyPrintCandidates(result, date, options).length, 1);
});
test('real batch includes off-sheet publication and does not report complete while a sheet row is blocked', async () => {
  const source = await readFile(new URL('../../ops/cloudflare-remote-runner/src/runner.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function executePrintBatch(job,'), source.indexOf('\nfunction jobResultFromError'));
  const captured = [];
  const dependencies = {
    selectDailyPrintCandidates, classifyDailyPrintOutcome, buildDailyPrintLiveProgress, aggregateCaptureTimings,
    readPositiveInteger: value => Number(value) > 0 ? Number(value) : null,
    progressJob: async () => {}, safeProcessOutput: value => String(value),
    privateApiGet: async pathname => {
      const url = new URL(pathname, 'https://adops.test');
      if (url.pathname === '/api/campaign-operations/active') return {items:[canonical, {adops:{insertionId:3021}, publicationHealth:{status:'blocked_upstream',reason:'media_missing'},evidence:{requiredDates:[date],missingDates:[date]}}]};
      if (url.pathname === '/api/insertions/3022') return {id:3022, bannerPublicadoNoSite:true,mediaUrl:'https://cdn.test/display.gif',periodoInicio:'2026-09-01',periodoFim:'2026-09-30',statusNormalizado:'publicado'};
      if (url.pathname === '/api/insertions/capture-proof/audit' && !url.searchParams.has('insertionIds')) return {items:[{insertionId:3022,targetDate:date,status:'missing'}]};
      if (url.pathname === '/api/insertions/capture-proof/audit') {
        assert.deepEqual(url.searchParams.get('insertionIds').split(',').sort(), ['3022','3038']);
        return {totalEligible:2,ok:2,missing:0,invalid:0};
      }
      throw Error('Unexpected request '+pathname);
    },
    enqueueAndWaitCaptureProof: async request => { captured.push(request.insertionId); assert.equal(request.replace,false); return {jobId:'capture-'+request.insertionId,item:{uploadedUrl:'https://cdn.test/proof.png'}}; },
  };
  const execute = new Function(...Object.keys(dependencies), body+'; return executePrintBatch;')(...Object.values(dependencies));
  await assert.rejects(execute({id:'test-job',payload:{date}}), error => {
    assert.deepEqual(captured,[3038,3022]);
    assert.equal(error.jobResult.canonicalAudit.expected,3);
    assert.equal(error.jobResult.canonicalAudit.approved,2);
    assert.equal(error.jobResult.canonicalAudit.missing,1);
    assert.deepEqual(error.jobResult.liveProgress.blockedInsertionIds,[3021]);
    const incident = JSON.parse(error.message.slice('daily_print_audit_incomplete:'.length));
    assert.equal(incident.expectedTotal,3);
    assert.equal(incident.totalEligible,3);
    assert.equal(incident.missing,1);
    return true;
  });
});
