// Durable documentary follow-up, owned by the existing n8n minute processor.
// Finding a PI never creates a second campaign or republishes an existing one.
import {readCampaignAuthorizationConfig} from './campaign-authorization.mjs';
export async function processDocumentaryPending({c,queueText}){
 await c.query(`CREATE TABLE IF NOT EXISTS adops_campaign_documentary_pending(
  action_id UUID PRIMARY KEY,identity TEXT NOT NULL,folder_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'searching',source_event_key TEXT NOT NULL,
  source_pdf_sha TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(identity,folder_id))`);
 await c.query(`INSERT INTO adops_campaign_documentary_pending(action_id,identity,folder_id,source_event_key)
  SELECT a.id,a.identity,p.plan->>'folderId',a.source_event_key FROM adops_campaign_actions a
  JOIN adops_campaign_previews p ON p.id=a.preview_id WHERE p.plan->'validation'->>'documentaryPending'='true'
  ON CONFLICT DO NOTHING`);
 const cfg=readCampaignAuthorizationConfig();
 if(cfg.allowPendingPi===true)await c.query(`INSERT INTO adops_campaign_documentary_pending(action_id,identity,folder_id,source_event_key)
  SELECT j.id::uuid,m.identity,j.payload_json::jsonb->>'driveFileId',j.payload_json::jsonb->>'eventId'
  FROM ops_jobs j JOIN adops_monitor_checklists m ON m.active=true
   AND m.checklist->>'pi'=j.payload_json::jsonb->'parsedPi'->>'piCodigo'
   AND m.checklist->'known' @> jsonb_build_array('Pasta: https://drive.google.com/drive/folders/'||(j.payload_json::jsonb->>'driveFileId'))
  WHERE j.kind='drive-pi-ingest' AND j.payload_json::jsonb->>'operationMode'='operational_minimum'
   AND j.payload_json::jsonb->>'publish'='true' AND COALESCE(j.payload_json::jsonb->>'preflightOnly','false')<>'true'
   AND j.payload_json::jsonb->>'campaignActionId' IS NULL
   AND j.result_json::jsonb->'execution'->'applied'->>'campaignId' IS NOT NULL
   AND (j.created_at::timestamptz>=$1::timestamptz OR j.id=ANY($2::text[]))
  ON CONFLICT DO NOTHING`,[cfg.allActiveCampaignsCutover??null,cfg.pendingPiJobIds??[]]);
 const rows=(await c.query(`SELECT d.*,m.checklist,COALESCE(p.revision,m.revision) AS revision FROM adops_campaign_documentary_pending d
  JOIN adops_monitor_checklists m ON m.identity=d.identity AND m.active=true
  LEFT JOIN adops_campaign_actions a ON a.id=d.action_id LEFT JOIN adops_campaign_previews p ON p.id=a.preview_id
  WHERE d.state='searching' ORDER BY d.created_at LIMIT 30`)).rows;
 for(const row of rows){
  const sha=row.checklist?.document?.sha256;
  if(!sha){await queueText(c,{key:'campaign-document:'+row.action_id+':pending',event:row.source_event_key,identity:'campaign-action:'+row.action_id,revision:row.revision,text:`*PI pendente — ${row.identity}*\nA ausência do PDF não bloqueia a publicação autorizada com os dados completos. O monitor do Drive continuará procurando a PI na pasta da campanha. Quando ela chegar, será vinculada e conferida com este mesmo cadastro; não será criada outra campanha.`});continue;}
  await c.query("UPDATE adops_campaign_documentary_pending SET state='found_requires_reconciliation',source_pdf_sha=$2,updated_at=now() WHERE action_id=$1",[row.action_id,sha]);
  await queueText(c,{key:'campaign-document:'+row.action_id+':found:'+sha,event:row.source_event_key,identity:'campaign-action:'+row.action_id,revision:row.revision,text:`*PI localizada — ${row.identity}*\nO monitor encontrou o PDF na pasta da campanha já cadastrada. Etapa: conciliação documental do cliente, período, posições e valores com o cadastro existente. ${row.checklist.conflicts?.length?'Há divergências registradas para revisão.':'Documento disponível para conferência final.'} Nenhum novo anúncio ou campanha foi criado por esta localização.`});
 }
 return {tracked:rows.length};
}
