import {createHash} from 'node:crypto';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const mediaPath=v=>{try{const u=new URL(v);return u.origin+u.pathname;}catch{return String(v??'');}};
export function commercialDecisionHash(c){
 const positions=(c.positions??[]).map(p=>({name:norm(p.name),start:p.start,end:p.end,media:mediaPath(p.existingMedia)})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const files=(c.files??[]).map(f=>({id:f.id,mime:f.mimeType,checksum:f.checksum??null,size:String(f.size??''),modifiedTime:f.checksum?null:f.modifiedTime??null})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return createHash('sha256').update(JSON.stringify({identity:c.identity,site:c.site,pi:c.pi,piWaived:c.piWaived===true,campaign:norm((c.known??[]).find(x=>x.startsWith('Campanha:'))),positions,files,...(c.clickUrl||c.destinationUrl?{destination:c.clickUrl||c.destinationUrl}:{})})).digest('hex');
}
export function withCompleteDecision(checklist,previous,{eligible=false,observedAt,source}={}){
 if(checklist.status!=='needs_operational_review')return checklist;
 const revision=commercialDecisionHash(checklist);
 if(previous?.decisionNeeded?.revision===revision)return {...checklist,decisionNeeded:previous.decisionNeeded};
 if(!eligible||!Number.isFinite(Date.parse(observedAt))||previous&&commercialDecisionHash(previous)===revision)return checklist;
 return {...checklist,decisionNeeded:{kind:'complete_campaign_review',revision,observedAt,source,publicationEnabled:false}};
}
export function hasCompleteDecision(c){return c.status==='needs_operational_review'&&c.decisionNeeded?.kind==='complete_campaign_review'&&c.decisionNeeded.revision===commercialDecisionHash(c);}
