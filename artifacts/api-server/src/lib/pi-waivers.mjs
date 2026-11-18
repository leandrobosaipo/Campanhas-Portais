import {createHash} from 'node:crypto';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export function waiverScope(i){return {insertionId:Number(i.insertionId??i.id),campaignId:Number(i.campaignId??i.campanhaId),site:i.siteSigla,format:norm(i.localFormatoNormalizado||i.localFormato),start:i.periodoInicio,end:i.periodoFim,campaign:norm(i.campaignName??i.campanhaName)};}
export const scopeHash=i=>createHash('sha256').update(JSON.stringify(waiverScope(i))).digest('hex');
export async function ensurePiWaiverSchema(client){await client.query(`CREATE TABLE IF NOT EXISTS adops_pi_waivers(
 id UUID PRIMARY KEY, insertion_id INTEGER NOT NULL, identity TEXT NOT NULL, approved_revision TEXT NOT NULL,
 scope_hash TEXT NOT NULL, scope JSONB NOT NULL, reason TEXT NOT NULL, source_event_key TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'codex_user_confirmation', idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 active_folder_id TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ, revoke_reason TEXT, revoke_source_event_key TEXT);
 CREATE INDEX IF NOT EXISTS adops_pi_waivers_insertion ON adops_pi_waivers(insertion_id,status);`);}
export async function activePiWaivers(client){if(!(await client.query("SELECT to_regclass('adops_pi_waivers') AS name")).rows[0]?.name)return [];return (await client.query("SELECT * FROM adops_pi_waivers WHERE status='active' ORDER BY created_at,id")).rows;}
export function applicablePiWaivers(insertions,decisions){return decisions.filter(d=>d.status==='active'&&insertions.some(i=>Number(i.insertionId??i.id)===Number(d.insertion_id)&&scopeHash(i)===d.scope_hash));}
export function activeWaiverFolders(insertions,decisions,asOf){return applicablePiWaivers(insertions,decisions).filter(d=>d.active_folder_id&&d.scope.start<=asOf&&d.scope.end>=asOf).map(d=>({folderId:d.active_folder_id,identity:d.identity,site:d.scope.site}));}
export function applyPiWaivers(checklist,insertions,decisions){
 const active=applicablePiWaivers(insertions,decisions).filter(d=>d.identity===checklist.identity);
 const ids=(checklist.positions??[]).flatMap(p=>p.insertionIds??[]);
 if(!ids.length||!(checklist.positions??[]).every(p=>p.insertionIds?.length===1&&active.some(d=>Number(d.insertion_id)===Number(p.insertionIds[0]))))return checklist;
 const documental=/^(Enviar a PI ou confirmar o cadastro provisório\.|PDF da PI não localizado|PI em imagem encontrada; leitura documental pendente|Concluir a leitura do PDF oficial|Confirmar o número da PI|Número da PI ausente ou ambíguo)/;
 const missing=(checklist.missing??[]).filter(line=>!documental.test(line));
 const conflicts=(checklist.conflicts??[]).filter(issue=>issue!=='missing_pi_pdf');
 const known=[...(checklist.known??[]).filter(line=>!line.startsWith('PI:')),'PI: dispensada por confirmação do responsável (sem número de PI).'];
 return {...checklist,piWaived:true,piWaivers:active.filter(d=>ids.includes(Number(d.insertion_id))).map(d=>({id:d.id,insertionId:Number(d.insertion_id),source:d.source,sourceEventKey:d.source_event_key,approvedRevision:d.approved_revision})),known,missing,conflicts,
 status:conflicts.length?'conflict':missing.length?'needs_information':'needs_operational_review',
 message:[...String(checklist.message??'').split('\n').filter(line=>!line.startsWith('PI:')&&!documental.test(line.replace(/^Falta:\s*/,''))),'Sem PI — confirmado pelo responsável. Dispensa documental; não autoriza publicação.'].join('\n')};
}
