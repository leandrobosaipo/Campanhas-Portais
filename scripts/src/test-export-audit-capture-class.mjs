import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {join} from 'node:path';
import vm from 'node:vm';
import * as exportHelpers from '../../artifacts/api-server/src/lib/evidence-export.ts';

const source=await readFile(new URL('../../artifacts/api-server/src/routes/insertions.ts',import.meta.url),'utf8');
const start=source.indexOf('async function writeRetroAuditArtifacts(');
const end=source.indexOf('\nasync function writeContactSheet(',start);
assert(start>=0&&end>start);
const code=stripTypeScriptTypes(source.slice(start,end));
const audit={ok:true,captureClass:'scheduled',targetDate:'2026-09-08',capturedAt:'2026-09-08T15:39:08.469Z',sourceJobId:'1788881914121-r9bcab',auditPolicyVersion:'audit-policy-v1',retroContentProof:null};
async function exportAudit(status,metadata={}){
  const files=new Map();
  const context={...exportHelpers,join,Date,Array,Set,Boolean,Number,JSON,
    mkdir:async()=>{},writeFile:async(path,content)=>files.set(path,JSON.parse(content)),
    db:{select:()=>({from:()=>({where:async()=>[{titulo:'2026-09-08'}]})})},
    evidencesTable:{insercaoId:'insercaoId'},eq:()=>true,getEvidenceDateKey:value=>value,
    resolveEvidenceAuditStatus:async()=>status,loadCaptureMetadataForAudit:async()=>metadata,
    sanitizeEditorialPosts:()=>[],deliverySegment:value=>value,
  };
  const run=vm.runInNewContext(code+';writeRetroAuditArtifacts',context);
  const result=await run({rootDir:'/output',descriptor:{piCodigo:'3218',siteSigla:'ROO'},insertions:[{id:3015,siteSigla:'ROO'}]});
  return {result,manifest:files.get('/output/04-AUDITORIA/MANIFESTOS-EDITORIAIS/ROO-INSERCAO-3015-2026-09-08.json')};
}

// Regression: a real scheduled capture needs no fabricated reconstruction manifest.
const original=await exportAudit({status:'ok',audit});
assert.equal(original.result.ok,true);
assert.equal(original.result.approved,1);
assert.equal(original.result.originalCaptures,1);
assert.equal(original.result.documentaryPending,0);
assert.equal(original.manifest.auditBasis,'same_day_capture');
assert.equal(original.manifest.proof,null);
assert.equal(original.manifest.reconstructed,false);
assert.equal(original.manifest.documentaryStatus,null);
assert.equal(original.manifest.capturedAt,'2026-09-08T15:39:08.469Z');
assert.equal(original.manifest.sourceJobId,'1788881914121-r9bcab');
assert.equal((await exportAudit({status:'ok',audit:{...audit,captureClass:'same_day_retry'}})).result.ok,true);
for(const change of [
  {ok:false},{captureClass:null},{sourceJobId:null},{auditPolicyVersion:null},
  {capturedAt:null},{capturedAt:'invalid'},{capturedAt:'2026-09-09T04:01:00Z'},
  {targetDate:'2026-09-09'},{captureClass:'historical_recovery'},
]) await assert.rejects(exportAudit({status:'ok',audit:{...audit,...change}}),/Prova editorial/);
await assert.rejects(exportAudit({status:'ok_best_effort',audit}),/Prova editorial/);
await assert.rejects(exportAudit({status:'ok',audit:{...audit,captureClass:null}},{...audit}),/Prova editorial/);
const retro={...audit,captureClass:'historical_recovery',capturedAt:'2026-09-17T12:00:00Z',retroContentProof:{status:'approved',futureCount:0,manifestHash:'verified-hash'}};
const historical=await exportAudit({status:'ok',audit:retro});
assert.equal(historical.result.ok,true);
assert.equal(historical.result.originalCaptures,0);
assert.equal(historical.result.editorialProofApproved,1);
assert.equal(historical.result.documentaryPending,0);
assert.equal(historical.manifest.auditBasis,'editorial_proof');
assert.equal(historical.manifest.reconstructed,false);
assert.equal(historical.manifest.documentaryStatus,null);
const signedPreviewHistorical=await exportAudit({status:'ok',audit:{...retro,retroContentProof:{status:'approved',futureCount:0,manifestHash:'signed-preview-hash',sourceMode:'signed_preview',reconstructed:false}}},{
  retroContentManifest:{reconstructed:false},
  // Historical capture context is not itself evidence that the published page was reconstructed.
  reconstruction:{reason:'historical_recovery',provenanceVersion:4,contractedDate:'2026-09-08',reconstructedAt:'2026-09-17T12:00:00Z'},
});
assert.equal(signedPreviewHistorical.result.originalCaptures,0);
assert.equal(signedPreviewHistorical.result.editorialProofApproved,1);
assert.equal(signedPreviewHistorical.result.documentaryPending,0);
assert.equal(signedPreviewHistorical.manifest.auditBasis,'editorial_proof');
assert.equal(signedPreviewHistorical.manifest.reconstructed,false);
assert.equal(signedPreviewHistorical.manifest.documentaryStatus,null);
for(const proof of [null,{status:'failed',futureCount:0,manifestHash:'hash'},{status:'approved',futureCount:1,manifestHash:'hash'},{status:'approved',futureCount:0}]){
  await assert.rejects(exportAudit({status:'ok',audit:{...retro,retroContentProof:proof}}),/Prova editorial/);
}

// An explicit reconstruction marker overrides scheduled/same-day metadata and requires auditable proof.
const scheduledReconstruction={...audit,retroContentProof:{status:'approved',futureCount:0,manifestHash:'reconstruction-hash',reconstructed:true,sourceMode:'audited_reconstruction'}};
const reconstructed=await exportAudit({status:'ok',audit:scheduledReconstruction},{retroContentManifest:{reconstructed:true}});
assert.equal(reconstructed.result.originalCaptures,0);
assert.equal(reconstructed.result.editorialProofApproved,1);
assert.equal(reconstructed.result.documentaryPending,1);
assert.equal(reconstructed.manifest.auditBasis,'editorial_proof');
assert.equal(reconstructed.manifest.reconstructed,true);
assert.equal(reconstructed.manifest.documentaryStatus,'reconstruction_requires_acceptance');
assert.equal(reconstructed.result.entries[0].documentaryStatus,'reconstruction_requires_acceptance');
assert.match(source,/provas editoriais auditadas: \$\{retroAudit\.editorialProofApproved\}/);

for(const metadata of [
  {reconstructed:true},
  {retroContentManifest:{reconstructed:true}},
  {retroContentProof:{sourceMode:'audited_reconstruction'}},
  {retroContentProof:{reconstructed:true}},
]) {
  const status={status:'ok',audit:{...audit,retroContentProof:{status:'approved',futureCount:0,manifestHash:'metadata-hash'}}};
  const result=await exportAudit(status,metadata);
  assert.equal(result.manifest.auditBasis,'editorial_proof');
  assert.equal(result.manifest.reconstructed,true);
  assert.equal(result.result.documentaryPending,1);
}
const historicalReconstructionAudit={...scheduledReconstruction,captureClass:'historical_recovery',capturedAt:'2026-09-17T12:00:00Z'};
const historicalReconstruction=await exportAudit({status:'ok',audit:historicalReconstructionAudit},{retroContentManifest:{reconstructed:true}});
assert.equal(historicalReconstruction.manifest.auditBasis,'editorial_proof');
assert.equal(historicalReconstruction.manifest.documentaryStatus,'reconstruction_requires_acceptance');
assert.equal(historicalReconstruction.result.documentaryPending,1);
// Historical reconstruction may have a valid real capture time later than the target date; no date equality is required.
for(const change of [
  {captureClass:null},{captureClass:'unknown'},{sourceJobId:null},{sourceJobId:' '},
  {capturedAt:null},{capturedAt:'invalid'},{auditPolicyVersion:null},{auditPolicyVersion:'unknown'},
]) {
  const status={status:'ok',audit:{...scheduledReconstruction,...change}};
  await assert.rejects(exportAudit(status,{retroContentManifest:{reconstructed:true}}),/Prova editorial/);
}
for(const metadata of [
  {retroContentManifest:{reconstructed:true}},
  {retroContentProof:{sourceMode:'audited_reconstruction'}},
]) {
  for(const proof of [null,{status:'failed',futureCount:0,manifestHash:'hash'},{status:'approved',futureCount:1,manifestHash:'hash'},{status:'approved',futureCount:0}]) {
    const status={status:'ok',audit:{...audit,retroContentProof:proof}};
    await assert.rejects(exportAudit(status,metadata),/Prova editorial/);
  }
}
for(const status of [
  {status:'invalid_audit',audit:scheduledReconstruction},
  {status:'ok',audit:{...scheduledReconstruction,ok:false}},
]) await assert.rejects(exportAudit(status,{retroContentManifest:{reconstructed:true}}),/Prova editorial/);
console.log('ok: original trusted captures exported unchanged; historical and untrusted captures remain gated');
