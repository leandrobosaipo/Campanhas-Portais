import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderDynamicEvidenceReport } from './build-dynamic-evidence-report.mjs';

const html = renderDynamicEvidenceReport();
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const expression = name => html.split('\n').find(line => line.trim().startsWith('const '+name+' ' ) || line.trim().startsWith('const '+name+'=' )).trim().replace(/^const [^=]+\s*=\s*/, '').replace(/;$/, '');
const accepted = vm.runInNewContext('('+expression('evidenceTechnicallyAccepted')+')');
const previewDay = {date:'2026-10-01',status:'provenance_unverified',technicalStatus:'audited',technicalAccepted:false,url:'https://example.test/preview.png'};
const thumb = vm.runInNewContext('('+expression('renderEvidenceThumb')+')', {escapeHtml:String,statusLabel:()=> 'Origem a conferir',evidenceDownloadUrl:(_item,day)=>day.url});
assert.match(thumb({id:3055},previewDay,0), /<img.*preview.png/);
assert.match(thumb({id:3055},previewDay,0), /Origem a conferir/);
assert.equal(accepted(previewDay),false);

const details=new Map();
const detailContext={state:{evidenceItem:{id:3047},evidenceDays:[{date:'2026-10-01',status:'reconstruction',captureClass:'historical_recovery',technicalAccepted:true,requestedCaptureAt:'2026-10-01T20:30:00-04:00',capturedAt:'2026-10-06T09:41:51.403Z'}],evidenceIndex:0},evidenceTechnicallyAccepted:accepted,escapeHtml:String,statusLabel:value=>value,safeUrl:()=>'',dateTimeCuiaba:vm.runInNewContext('('+expression('dateTimeCuiaba')+')',{timeZone:'America/Cuiaba',Intl,Date}),EVIDENCE_API_BASE:'https://adops-api.codigo5.com.br',document:{querySelectorAll:()=>[]},byId:id=>{if(!details.has(id))details.set(id,{setAttribute(){},removeAttribute(){},addEventListener(){}});return details.get(id)}};
detailContext.deleteSelectedEvidence=()=>{};
vm.runInNewContext('('+expression('renderEvidenceModal')+')',detailContext)();
assert.match(details.get('evidenceDetails').innerHTML,/Reconstrução histórica/);
assert.match(details.get('evidenceDetails').innerHTML,/Referência visual<\/dt><dd>01\/10\/2026, 20:30/);
assert.match(details.get('evidenceDetails').innerHTML,/Reconstruída em<\/dt><dd>06\/10\/2026, 05:41/);
detailContext.state.evidenceDays[0].requestedCaptureAt='2026-10-01T20:30';
vm.runInNewContext('('+expression('renderEvidenceModal')+')',detailContext)();
assert.match(details.get('evidenceDetails').innerHTML,/Referência visual<\/dt><dd>01\/10\/2026, 20:30/);

const item={id:3047};
const day={date:'2026-10-01',status:'missing',url:null};
const state={evidenceItem:item,evidenceDays:[day],evidenceIndex:0,evidencePollJobId:null};
const calls=[],progress=[],previews=[];
let active=null;
const button={disabled:false};
let result={insertionId:3047,targetDate:day.date,candidateOnly:true,status:'ok',uploadedUrl:'https://example.test/candidate.png'};
const context={state,REPORT_API_BASE:'https://adops-api.codigo5.com.br',readActiveJob:()=>active,writeActiveJob:value=>{active=value},showEvidenceProgress:(...args)=>progress.push(args),safeUrl:value=>typeof value==='string'&&value.startsWith('https://')?value:'',escapeHtml:String,stageLabels:{completed:'Print concluído'},byId:id=>id==='generateEvidence'?button:{insertAdjacentHTML:(_position,value)=>previews.push(value)},load:()=>{throw Error('Candidate must preserve canonical evidence')},fetch:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>init?.method==='POST'?{jobId:'source-candidate-test'}:{status:'completed',items:[result]}}}};
context.waitForEvidenceJob=vm.runInNewContext('('+expression('waitForEvidenceJob')+')',context);
const generate=vm.runInNewContext('('+expression('generateSelectedEvidence')+')',context);
await generate();
assert.equal(calls.length,2);
assert.equal(JSON.parse(calls[0].init.body).promote,false);
assert.equal(JSON.parse(calls[0].init.body).candidate,true);
assert.equal(JSON.parse(calls[0].init.body).reconstructionReason,undefined);
assert.match(calls[0].init.headers['idempotency-key'],/^report-candidate:/);
assert.equal(calls[0].init.credentials,'include');
assert.ok(progress.some(args=>args[0].includes('Aguarda auditoria e promoção')));
assert.ok(previews.some(value=>value.includes('Abrir captura para revisão')));
assert.equal(button.disabled,true);
assert.equal(active,null);
assert.equal(day.status,'missing');
assert.equal(day.url,null);
assert.equal(accepted(previewDay),false);

for (const invalid of [{...result,insertionId:3055},{...result,targetDate:'2026-10-02'},{...result,candidateOnly:false},{...result,status:'failed'},{...result,uploadedUrl:'javascript:alert(1)'}]) {
  result=invalid; progress.length=0; previews.length=0;
  await generate();
  assert.ok(progress.some(args=>args[2]===true&&args[0].includes('não foi confirmada')));
  assert.equal(previews.length,0);
  assert.ok(active,'Keep the job for safe consultation, do not blindly retry');
}
context.fetch=async()=>({ok:false,status:409,json:async()=>({error:'candidate_promotion_requires_persisted_approval'})});
await generate();
assert.ok(progress.some(args=>args[0].includes('HTTP 409')));
assert.ok(progress.some(args=>args[0].includes('candidate_promotion_requires_persisted_approval')));
console.log('PASS: inline JS, preview without approval, authenticated candidate-only request, exact completed result, preserved canonical evidence, safe error.');
