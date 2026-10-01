import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { renderDynamicEvidenceReport } from './build-dynamic-evidence-report.mjs';
import { reportPeriodExport } from './report-period-export.mjs';

const html = renderDynamicEvidenceReport();
const runtime = html.slice(html.indexOf('    const preparePackage ='), html.indexOf('    const todayInCuiaba ='));
const day = {date:'2026-09-30',evidenceId:1800,status:'audited',technicalAccepted:true,url:'https://example.test/original.png?v=1'};

async function requestPackage({change={},cutoff='2026-10-01',returnedIds=[3050]}={}) {
  const calls=[];const notice={};let download;
  const button={dataset:{pi:'9783',site:'OMT',insertions:'[3050]'},replaceWith:link=>download=link};
  const context=vm.createContext({reportPeriodExport,crypto:webcrypto,TextEncoder,Uint8Array,
    state:{month:'2026-09',items:[{id:3050,evidenceDays:[{...day,...change}]}]},todayInCuiaba:()=>cutoff,
    REPORT_API_BASE:'https://example.test',byId:()=>notice,document:{createElement:()=>({})},
    fetch:async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>options.method==='POST'?{jobId:'job-scoped',status:'completed',duplicate:true}:{status:'completed',insertionIds:returnedIds}}},
  });
  await new vm.Script(runtime+'\npreparePackage(button)').runInContext(vm.createContext({...context,button}));
  return {calls,notice,button,download};
}

test('uses exact date scope, authenticated async contract and matched completed cache', async()=>{
  const result=await requestPackage();
  assert.equal(result.calls.length,2);
  const post=result.calls[0];
  assert.equal(post.options.credentials,'include');
  assert.match(post.options.headers['idempotency-key'],/^dynamic-period-v2:[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(post.options.body).requiredDatesByInsertion,{'3050':['2026-09-30']});
  assert.equal(JSON.parse(post.options.body).asOfDate,'2026-09-30');
  assert.match(result.notice.textContent,/Pacote existente reaproveitado.*30\/09\/2026.*1 capturas/);
  assert.equal(result.download.href,'https://example.test/api/pi-site-exports/jobs/job-scoped/download');
});

test('same historical period stays reusable next day; changed source cannot reuse old scope',async()=>{
  const key=result=>result.calls[0].options.headers['idempotency-key'];
  const first=key(await requestPackage());
  assert.equal(first,key(await requestPackage()));
  assert.notEqual(first,key(await requestPackage({change:{url:'https://example.test/replaced.png'}})));
  assert.equal(first,key(await requestPackage({cutoff:'2026-10-02'})));
  assert.equal((await requestPackage({cutoff:'2026-09-29'})).calls.length,0);
});

test('missing days cause no export; a mismatched completed job is never offered for download',async()=>{
  assert.equal((await requestPackage({change:{technicalAccepted:false}})).calls.length,0);
  const wrong=await requestPackage({returnedIds:[3048,3050]});
  assert.equal(wrong.download,undefined);
  assert.match(wrong.notice.textContent,/inserções diferentes/);
});
