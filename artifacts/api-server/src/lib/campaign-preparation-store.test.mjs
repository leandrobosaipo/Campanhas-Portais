import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {processCampaignPreparations} from './campaign-preparation-store.mjs';
import {authorizationSourceFingerprint} from './campaign-authorization.mjs';
import {processDocumentaryPending} from './campaign-documentary-pending.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'adops-preparation-'));
fs.mkdirSync(temp+'/config');
fs.writeFileSync(temp+'/config/adops-campaign-authorization.json',JSON.stringify({enabled:true,allowPendingPi:true,cutover:'2026-01-01',approvers:['test'],identities:['PERRENGUE:25208280']}));
process.env.ADOPS_PROJECT_ROOT=temp;
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
const checklist={identity:'PERRENGUE:25208280',positions:[],files:[],known:['Pasta: https://drive.google.com/drive/folders/fixture']};
const row=(age=6,extra={})=>({id:'fixture',event_key:'event',identity:'PERRENGUE:25208280',source_fingerprint:authorizationSourceFingerprint(checklist),created_at:new Date(Date.now()-age*60000),status:'discovery',job_id:'same-job',retry_count:0,...extra});
async function run(rows,{fail=false}={}){
 const queries=[],messages=[],jobs=[];
 const c={async query(sql,args){queries.push({sql,args});
  if(sql.includes('SELECT attname'))return {rows:[{},{}]};
  if(sql.startsWith('SELECT a.*'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM adops_campaign_preparations'))return {rows};
  if(sql.startsWith('SELECT * FROM adops_wa_answers'))return {rows:[{participant:'test',received_at:'2026-11-18'}]};
  if(sql.startsWith('SELECT * FROM ops_jobs')){if(fail)throw Error('connection timeout');return {rows:[{id:'same-job',status:'running'}]};}
  return {rows:[]};}};
 await processCampaignPreparations({c,active:async()=>({checklist}),createJob:async e=>{jobs.push(e);return {jobId:'new-job'}},validateEvent:x=>x,persistPreview:async()=>assert.fail('unexpected preview'),queueText:async(c,m)=>messages.push(m),group:'fixture'});
 return {queries,messages,jobs};
}
test('expired requests and technical failures terminate without a new job or retry',async()=>{
 for(const status of ['requested','discovery','strict']){
  const r=await run([row(31,{status})],{fail:true});
  assert.equal(r.jobs.length,0);assert.equal(r.messages.length,1);
  assert.match(r.messages[0].key,/:blocked$/);
  assert.ok(r.queries.some(q=>q.args?.[1]==='preparation_deadline_exceeded'));
 }
});
test('five-minute notice reuses the same job and stable deduplication key',async()=>{
 const a=await run([row(6)]),b=await run([row(6)]),early=await run([row(4)]);
 assert.equal(a.jobs.length,0);assert.equal(a.messages[0].key,b.messages[0].key);
 assert.match(a.messages[0].text,/same-job/);assert.equal(early.messages.length,0);
});
test('technical retries are limited to 2, 5 and 10 minutes',async()=>{
 for(let retry_count=0;retry_count<4;retry_count++){
  const r=await run([row(7,{retry_count})],{fail:true});assert.equal(r.jobs.length,0);
  if(retry_count<3)assert.ok(r.queries.some(q=>q.args?.[2]===[2,5,10][retry_count]));
  else assert.ok(r.queries.some(q=>q.args?.[1]==='technical_retries_exhausted'));
 }
});
test('blocked first item does not interrupt a healthy second item',async()=>{
 const r=await run([row(31),row(6,{id:'second'})]);
 assert.deepEqual(r.messages.map(m=>m.key),['campaign-preparation:fixture:blocked','campaign-preparation:second:waiting']);
});
test('document discovery is idempotent and never creates another campaign or publication',async()=>{
 const messages=new Map(),queries=[];let state='searching',sha=null;
 const c={async query(sql,args){queries.push(sql);
  if(sql.startsWith('SELECT d.*'))return {rows:state==='searching'?[{action_id:'published-action',identity:'PERRENGUE:25208280',source_event_key:'e',revision:'r',checklist:sha?{document:{sha256:sha}}:{}}]:[]};
  if(sql.startsWith('UPDATE adops_campaign_documentary_pending'))state='found_requires_reconciliation';
  return {rows:[]};}};
 const call=()=>processDocumentaryPending({c,queueText:async(c,m)=>messages.set(m.key,m)});
 await call();await call();assert.equal(messages.size,1);assert.equal(state,'searching');
 sha='a'.repeat(64);await call();await call();assert.equal(messages.size,2);assert.equal(state,'found_requires_reconciliation');
 assert.ok(queries.every(q=>!/^INSERT INTO (campaigns|campanhas|insertions|ops_jobs)/i.test(q)));
});
