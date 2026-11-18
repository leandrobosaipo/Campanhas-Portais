import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { reportPeriodExport } from './report-period-export.mjs';

const original = {date:'2026-09-30', status:'audited', technicalAccepted:true, evidenceId:1800, url:'https://example.test/original.png?v=1', capturedAt:'2026-09-30T22:40:09Z'};
const reconstruction = {...original, date:'2026-09-23', status:'reconstruction', evidenceId:1700, capturedAt:'2026-09-30T12:00:00Z'};
const item = {id:3050, evidenceDays:[original, reconstruction]};
const hash = scope => createHash('sha256').update(JSON.stringify(scope)).digest('hex');

test('preserves exact portal-period date scope, originals and reconstructions', () => {
  const scope = reportPeriodExport([item], '2026-09', '2026-09-30');
  assert.equal(scope.ready, true);
  assert.deepEqual(scope.requiredDatesByInsertion, {3050:['2026-09-23','2026-09-30']});
  assert.equal(scope.label, '23/09/2026 a 30/09/2026 · 2 capturas');
  assert.equal(scope.evidenceManifest[0][4], 'reconstruction');
  assert.equal(scope.evidenceManifest[1][7], original.capturedAt);
});

test('canonical ordering is stable; changed source/date/capture invalidates cache identity', () => {
  const baseline = reportPeriodExport([item], '2026-09', '2026-09-30');
  assert.equal(hash(baseline), hash(reportPeriodExport([{...item,evidenceDays:[reconstruction,original]}], '2026-09', '2026-09-30')));
  for (const change of [{url:'https://example.test/replacement.png'}, {evidenceId:1801}, {capturedAt:'2026-10-01T01:00:00Z'}, {date:'2026-09-29'}]) {
    assert.notEqual(hash(baseline), hash(reportPeriodExport([{...item,evidenceDays:[reconstruction,{...original,...change}]}], '2026-09', '2026-09-30')));
  }
});

test('missing or technically invalid days block complete period; future dates excluded by cutoff', () => {
  for (const change of [{status:'missing',technicalAccepted:false}, {technicalAccepted:false}, {url:''}, {evidenceId:null}]) {
    const scope = reportPeriodExport([{...item,evidenceDays:[{...original,...change}]}], '2026-09', '2026-09-30');
    assert.equal(scope.ready, false);
    assert.equal(scope.captureCount, 0);
    assert.match(scope.label, /0 de 1 capturas/);
  }
  assert.equal(reportPeriodExport([item], '2026-10', '2026-10-01').ready, false);
  assert.deepEqual(reportPeriodExport([item], '2026-09', '2026-09-23').requiredDatesByInsertion, {3050:['2026-09-23']});
});
