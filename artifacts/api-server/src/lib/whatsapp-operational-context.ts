import {pool} from '@workspace/db';
import {isInstagramEvidenceExcluded} from '../../../../ops/shared/evidence-monitoring-policy.mjs';
import {campaignSheetExportUrl} from './current-sheet-campaigns';
import {getEvidenceDateKey} from './capture-audit';
import {validateAuditChecklist,loadAuditChecklistMetadata} from './audit-checklist';

const dateOnly=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'});
const http=(url:unknown)=>typeof url==='string'&&/^https?:\/\//i.test(url)?url:null;
export async function enrichWhatsAppChecklist(checklist:any,{client=pool,publication=true}:any={}) {
 const c={...checklist},date=dateOnly(),now=new Date(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Cuiaba',hour:'2-digit',hourCycle:'h23'}).format(now));
 const ids=[...new Set((c.positions??[]).flatMap((p:any)=>p.insertionIds??[]))];
 const rows=ids.length?(await client.query(`SELECT i.id,i.campanha_id AS "campaignId",i.local_formato AS format,
   i.periodo_inicio AS start,i.periodo_fim AS end,i.status_normalizado AS status,i.media_url AS "mediaUrl",
   i.banner_publicado_no_site AS "publishedFlag",c.pi_codigo AS pi,s.sigla AS site
   FROM insertions i JOIN campaigns c ON c.id=i.campanha_id LEFT JOIN sites s ON s.id=i.site_id WHERE i.id=ANY($1::int[])`,[ids])).rows:[];
 const evidences=ids.length?(await client.query('SELECT id,insercao_id AS "insertionId",titulo,arquivo_url AS url FROM evidences WHERE insercao_id=ANY($1::int[])',[ids])).rows:[];
 const positions=[];
 for(const p of c.positions??[]){
  if(isInstagramEvidenceExcluded(p)){positions.push({...p,state:'not_monitored_instagram',evidenceMonitoring:'excluded_instagram'});continue;}
  const registered=rows.filter((r:any)=>(p.insertionIds??[]).includes(r.id)&&r.site===c.site&&(c.pi?String(r.pi??'').match(/\d{3,}/)?.[0]?.replace(/^0+/,'')===c.pi:p.matchBasis==='provisional_site_name_format_dates_unique')&&r.start===p.start&&r.end===p.end&&!['cancelado','arquivado'].includes(r.status));
  if(registered.length!==1){positions.push({...p,state:registered.length?'ambiguous':'unregistered'});continue;}
  const r=registered[0];let state=p.start>date?'future_unverified':p.end<date?'ended':'current_unverified';
  if(publication&&state==='current_unverified')try{
   const response=await fetch(`http://127.0.0.1:${process.env.PORT||'4011'}/api/integrations/adrotate/insertions/${r.id}/relation`,{headers:{Authorization:`Bearer ${process.env.OPS_API_TOKEN}`},signal:AbortSignal.timeout(12000)});
   if(response.ok){const relation=await response.json();if(relation.insertionId===r.id&&relation.siteSigla===c.site&&relation.exactLiveMatches?.length>0)state='visible';}
  }catch{/* Preserve unknown visibility; never convert a timeout into not published. */}
  const end=p.end<date?p.end:date,days=[];let cursor=p.start;
  while(cursor&&cursor<=end&&days.length<93){days.push(cursor);cursor=new Date(Date.parse(cursor+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
  const evidence:any={approved:0,required:0,missingDates:[],invalidDates:[],reconstructed:0,todayPending:false,partial:Boolean(cursor&&cursor<=end)};
  for(const day of days){const records=evidences.filter((e:any)=>e.insertionId===r.id&&getEvidenceDateKey(e.titulo)===day&&http(e.url));
   if(day===date&&hour<18&&!records.length){evidence.todayPending=true;continue;}
   evidence.required++;if(!records.length){evidence.missingDates.push(day);continue;}
   const metadata:any=await loadAuditChecklistMetadata(r.id,day);
   const audit=await validateAuditChecklist({insertionId:r.id,date:day,metadata});
   if(audit.approved){evidence.approved++;if(metadata?.auditProvenance?.source==='recovery'||metadata?.recoveryFromJobId||metadata?.captureOrigin==='reconstructed'||String(metadata?.requestedCaptureAt??'').slice(0,10)>day)evidence.reconstructed++;}
   else evidence.invalidDates.push(day);
  }
  positions.push({...p,insertionId:r.id,campaignId:r.campaignId,state,registrationStatus:r.status,mediaUrl:http(r.mediaUrl),evidence});
 }
 // Read the configured source through the existing sheet loader; no guessed document IDs.
 const exportUrl=new URL(campaignSheetExportUrl()),match=exportUrl.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
 let sheet=match?`https://docs.google.com/spreadsheets/d/${match[1]}/edit`:null;
 const sheetPosition=(c.positions??[]).find((p:any)=>p.source?.match(/:R\d+C\d+$/));
 if(sheet&&sheetPosition){const m=sheetPosition.source.match(/^(.*):R(\d+)C(\d+)$/);let n=Number(m[3]),col='';while(n){n--;col=String.fromCharCode(65+n%26)+col;n=Math.floor(n/26);}sheet+=`#range=${encodeURIComponent("'"+m[1]+"'!"+col+m[2])}`;}
 const files=c.files??[],fileLink=(f:any)=>({name:f.name,url:http(f.url)||`https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`});
 const reports=[...new Set(positions.filter((p:any)=>p.campaignId).map((p:any)=>`https://sites.codigo5.com.br/reports/adops-evidencias/?mes=${date.slice(0,7)}&campaignId=${p.campaignId}&portal=${encodeURIComponent(c.site)}`))];
 if(!reports.length)reports.push(`https://sites.codigo5.com.br/reports/adops-evidencias/?mes=${date.slice(0,7)}&portal=${encodeURIComponent(c.site||'')}`);
 c.operationalContext={date,checkedAt:now.toISOString(),piSource:c.piResolution?.source,positions,
  links:{sheet,documents:files.filter((f:any)=>/application\/pdf/.test(f.mimeType)||/\.pdf$/i.test(f.name)||(c.piDocumentImages??[]).some((d:any)=>d.name===f.name)).map(fileLink),media:files.filter((f:any)=>/^(image|video)\//.test(f.mimeType)&&!(c.piDocumentImages??[]).some((d:any)=>d.name===f.name)).map(fileLink),folders:(c.known??[]).filter((s:string)=>s.startsWith('Pasta: ')).map((s:string)=>s.slice(7)).filter(http),reports}};
 return c;
}
