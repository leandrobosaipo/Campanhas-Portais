import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { renderDynamicEvidenceReport } from './build-dynamic-evidence-report.mjs';

const html=renderDynamicEvidenceReport();
const runtime=html.slice(html.indexOf('    const load ='),html.indexOf('    let searchTimer;'));
const deadline=Number(html.match(/REPORT_LOAD_TIMEOUT_MS = ([0-9_]+)/)[1].replaceAll('_',''));

async function loadAt(responseDelay) {
  let now=0,id=0;const timers=new Map();const nodes=new Map();
  const byId=key=>{if(!nodes.has(key))nodes.set(key,{dataset:{},disabled:false});return nodes.get(key)};
  const state={month:'2026-09',requestSequence:0,items:[]};
  const control=value=>({value,dataset:{}});
  const context=vm.createContext({state,AbortController,URLSearchParams,REPORT_LOAD_TIMEOUT_MS:deadline,
    REPORT_API_BASE:'https://example.test',API_PATH:'/monthly',timeZone:'America/Cuiaba',byId,
    controls:{search:control(''),portal:control(''),publication:control('all'),evidence:control('all')},
    setTimeout:(callback,ms)=>{const key=++id;timers.set(key,{callback,at:now+ms});return key},clearTimeout:key=>timers.delete(key),
    populatePortals:()=>{},setSummary:()=>{},render:()=>{},loadCaptureDiagnostics:async()=>{},restoreActiveEvidenceJob:()=>{},syncUrl:()=>{},escapeHtml:String,
    fetch:(_url,{signal,credentials,cache})=>new Promise((resolve,reject)=>{
      assert.equal(credentials,'include');
      assert.equal(cache,'no-store','Monthly refresh must request current data, including with a previously cached response.');
      signal.addEventListener('abort',()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'})),{once:true});
      if(responseDelay!==null){const key=++id;timers.set(key,{at:responseDelay,callback:()=>resolve({status:200,ok:true,json:async()=>({items:[{id:3050,campanhaId:1051}],portals:['OMT'],pagination:{total:1,nextCursor:null},generatedAt:'2026-10-01T11:42:00Z'})})})}
    }),
  });
  const promise=new vm.Script(runtime+'\nload()').runInContext(context);
  while(timers.size){const [key,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(key);now=timer.at;timer.callback();await new Promise(resolve=>setImmediate(resolve));}
  await promise;return {state,nodes,elapsed:now};
}

test('real observed 27-second monthly response completes before bounded 45-second deadline',async()=>{
  assert.equal(deadline,45_000);
  const result=await loadAt(27_000);
  assert.equal(result.elapsed,27_000);
  assert.equal(result.state.items.length,1);
  assert.match(result.nodes.get('statusMessage').textContent,/Dados completos/);
  assert.equal(result.nodes.get('refreshButton').disabled,false);
});

test('hung request still aborts; no partial evidence survives and refresh is released',async()=>{
  const result=await loadAt(null);
  assert.equal(result.elapsed,45_000);
  assert.equal(result.state.items.length,0);
  assert.match(result.nodes.get('statusMessage').textContent,/excedeu 45 segundos/);
  assert.equal(result.nodes.get('refreshButton').disabled,false);
});
