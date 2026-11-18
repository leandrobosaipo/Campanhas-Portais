import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {notificationFingerprint} from './campaign-notification-policy.mjs';

export function readCampaignAuthorizationConfig(){
 try{return JSON.parse(readFileSync(join(process.env.ADOPS_PROJECT_ROOT||process.cwd(),'config/adops-campaign-authorization.json'),'utf8'));}
 catch{return {enabled:false,approvers:[],identities:[]};}
}
export function allowedCampaignActor(answer,identity,cfg=readCampaignAuthorizationConfig()){
 const received=answer?.received_at instanceof Date?answer.received_at.getTime():Date.parse(answer?.received_at),cutover=Date.parse(cfg.cutover);
 return cfg.enabled===true&&Number.isFinite(received)&&Number.isFinite(cutover)&&received>=cutover
  &&Array.isArray(cfg.approvers)&&cfg.approvers.includes(answer.participant)
  &&((cfg.allowAllActiveCampaigns===true&&received>=Date.parse(cfg.allActiveCampaignsCutover)&&typeof identity==='string'&&!/^(campaign-|evidence)/.test(identity))||(Array.isArray(cfg.identities)&&cfg.identities.includes(identity)));
}
export const publicationWords='Autorizar cadastro e publicação';
export function authorizationSourceFingerprint(c){
 const positions=(c.positions??[]).map(p=>({name:p.name,start:p.start,end:p.end,insertionIds:[...(p.insertionIds??[])].sort((a,b)=>a-b),registrations:(p.registrations??[]).map(r=>({id:r.id,rowVersion:r.rowVersion??null})).sort((a,b)=>a.id-b.id)})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return createHash('sha256').update(JSON.stringify({notification:notificationFingerprint(c),pdfSha:c.document?.sha256??null,folders:(c.known??[]).filter(s=>String(s).startsWith('Pasta:')).sort(),positions})).digest('hex');
}
