import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const cod5_base=process.env.COD5_HML_API_BASE_URL;
const cod5_token=process.env.COD5_HML_OPS_TOKEN;
if(process.env.COD5_D1_HML!=='1'||!cod5_token||!cod5_base||!['localhost','127.0.0.1','cod5-adops-d1-hml-api'].includes(new URL(cod5_base).hostname)) throw Error('Somente homologação isolada');
const {Pool:Cod5Pool}=createRequire(process.env.COD5_HML_DB_PACKAGE || new URL('../../lib/db/package.json',import.meta.url))('pg');
const cod5_pool=new Cod5Pool({connectionString:process.env.DATABASE_URL});
assert.equal((await cod5_pool.query('SELECT current_database() AS nome')).rows[0].nome,'cod5_adops_hml');
const cod5_chamar=async(cod5_caminho,cod5_corpo,cod5_autenticado=true)=>fetch(new URL(cod5_caminho,cod5_base),{method:cod5_corpo===undefined?'GET':'POST',headers:{'content-type':'application/json',...(cod5_autenticado?{authorization:`Bearer ${cod5_token}`}:{})},body:cod5_corpo===undefined?undefined:JSON.stringify(cod5_corpo),signal:AbortSignal.timeout(15000)});
const cod5_reservar=async()=>{const cod5_r=await cod5_chamar('/api/ops/runner/claim-next',{kinds:['runtime-readiness-probe'],runnerId:'cod5_hml_teste'});assert.equal(cod5_r.status,200);return(await cod5_r.json()).job;};
const cod5_ids=[];
try{
 assert.equal((await cod5_chamar('/api/ops/jobs/runtime-readiness-probe',{},false)).status,401);
 const cod5_r=await cod5_chamar('/api/ops/jobs/runtime-readiness-probe',{includeChecks:['cod5_hml']});assert.equal(cod5_r.status,202);
 const cod5_criado=await cod5_r.json();cod5_ids.push(cod5_criado.jobId);
 const cod5_reservas=await Promise.all([cod5_reservar(),cod5_reservar(),cod5_reservar()]);assert.equal(cod5_reservas.filter(cod5_x=>cod5_x?.id===cod5_criado.jobId).length,1);
 assert.equal((await cod5_chamar(`/api/ops/runner/jobs/${cod5_criado.jobId}/complete`,{runnerId:'outro',result:{ok:true}})).status,409);
 assert.equal((await cod5_chamar(`/api/ops/runner/jobs/${cod5_criado.jobId}/complete`,{runnerId:'cod5_hml_teste',result:{ok:true}})).status,200);
 for(const [cod5_id,cod5_status,cod5_payload] of [['cod5_hml_dependente','ready_for_runner',{dependsOnJobId:'cod5_hml_pai'}],['cod5_hml_pai','failed',{}],['cod5_hml_futuro','ready_for_runner',{notBefore:'2099-01-01T00:00:00.000Z'}],['cod5_hml_revisao','awaiting_human_review',{}]]){
  cod5_ids.push(cod5_id);await cod5_pool.query("INSERT INTO ops_jobs(id,kind,status,payload_json,created_at,updated_at) VALUES($1,'runtime-readiness-probe',$2,$3,$4,$4)",[cod5_id,cod5_status,JSON.stringify(cod5_payload),new Date().toISOString()]);
 }
 assert.equal(await cod5_reservar(),null,'dependência falha, notBefore e revisão bloqueiam claim');
 await cod5_pool.query("UPDATE ops_jobs SET status='completed' WHERE id='cod5_hml_pai'");
 assert.equal((await cod5_reservar())?.id,'cod5_hml_dependente','dependência concluída libera claim');
 assert.equal(await cod5_reservar(),null);
 const cod5_exportacoes=await Promise.all([cod5_chamar('/api/pi-site-exports/jobs',{piCodigo:'999999999',siteSigla:'HML',source:'cod5_hml'}),cod5_chamar('/api/pi-site-exports/jobs',{piCodigo:'999999999',siteSigla:'HML',source:'cod5_hml'})]);
 const cod5_exportados=await Promise.all(cod5_exportacoes.map(cod5_x=>cod5_x.json()));
 assert.ok(cod5_exportados[0].jobId);assert.equal(cod5_exportados[0].jobId,cod5_exportados[1].jobId,'PI concorrente idempotente');cod5_ids.push(cod5_exportados[0].jobId);
 const cod5_legado=(await cod5_pool.query("SELECT id FROM ops_jobs WHERE kind='campaign-evidence-export' AND status='completed' ORDER BY created_at DESC LIMIT 1")).rows[0];
 assert.equal((await cod5_chamar(`/api/campaign-evidence-exports/jobs/${cod5_legado.id}`)).status,200);
 const cod5_insercao=(await cod5_pool.query('SELECT id FROM insertions ORDER BY id LIMIT 1')).rows[0].id;
 for(const cod5_rota of ['/api/campaigns',`/api/analytics/insertions/${cod5_insercao}/reports`,'/api/ops/incidents','/api/ops/daily-print-recoveries?date=2026-09-11']) assert.equal((await cod5_chamar(cod5_rota)).status,200,cod5_rota);
 console.log('ok: auth, concorrência, lease, dependência, notBefore, revisão e leituras reais HML');
}finally{await cod5_pool.query('DELETE FROM ops_jobs WHERE id=ANY($1::text[])',[cod5_ids]);await cod5_pool.end();}
