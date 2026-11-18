import {createHash,createHmac,createDecipheriv} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {formatWhatsAppContext,portalLabel} from './whatsapp-message-context.mjs';
import {hasCompleteDecision} from './campaign-decision-policy.mjs';
export const ADOPS_GROUP='120363431261379098@g.us';
export const ADOPS_INSTANCE='cod5-pmt-pilot';
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function readWhatsAppConfig(){try{return JSON.parse(readFileSync(join(process.env.ADOPS_PROJECT_ROOT||process.cwd(),'config/adops-whatsapp.json'),'utf8'));}catch{return {enabled:false,pilotOnly:true,pilotIdentity:'OMT:9784',senderAliases:[]};}}
export function whatsappChannelState(cfg=readWhatsAppConfig()){return {enabled:cfg.enabled===true,pilotOnly:cfg.pilotOnly!==false,delivery:cfg.enabled===true?(cfg.pilotOnly!==false?'whatsapp_pilot':'whatsapp_n8n'):'pending_channel'};}
export const answerEventKey=a=>digest([ADOPS_INSTANCE,a.kind,a.id,a.replyTo]);
const tidy=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,12000);
const shortDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?`${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}`:'data não informada';
const issueText=value=>{const raw=typeof value==='string'?value:String(value?.message??'');const known={missing_pi_pdf:'PDF da PI ainda não localizado.',missing_media:'Mídia da campanha não localizada.',media_mismatch:'Mídia diverge do cadastro.',pi_mismatch:'Número da PI diverge entre as fontes.',ambiguous_insertion:'Mais de um cadastro corresponde à posição.'}[typeof value==='string'?value:value?.code];return known??(/^[a-z]+(?:_[a-z]+)+$/.test(raw)?'Há uma divergência registrada; precisa de conferência.':raw||'Informação pendente de conferência.');};
export function buildWhatsAppChecklist(row){
 const c=row.checklist,missing=[...(c.missing??[]),...(c.conflicts??[])];
 const complete=hasCompleteDecision(c);
 if(!complete&&(!['needs_information','conflict'].includes(c.status)||!missing.length))return null;
 const campaign=(c.known??[]).find(s=>s.startsWith('Campanha:'))?.replace(/^Campanha:\s*/,'').replace(/\.$/,'')||c.campaignName||c.campaign||'Campanha';
 const reference=`${portalLabel(c.site)} · PI ${c.piWaived?'sem PI':c.pi||'não informada'}`;
 const period=(c.positions??[]).map(p=>`${p.name}: ${shortDate(p.start)} a ${shortDate(p.end)}`).join('\n');
 const pdfMissing=missing.some(s=>/PDF.*n[aã]o localizado|missing_pi_pdf/.test(s));
 const options=complete?['Solicitar prévia','Manter como está','Revisar dados']:pdfMissing?['Já coloquei na pasta','Vou adicionar','Preciso de ajuda']:['Já conferi ou corrigi','Vou conferir','Preciso de ajuda'];
 const humanMissing=missing.filter(s=>s!=='missing_pi_pdf');
 const files=c.files??[],pdfs=files.filter(f=>f.mimeType==='application/pdf'||/\.pdf$/i.test(f.name)).length,media=files.filter(f=>/^(image|video)\//.test(f.mimeType)&&!(c.piDocumentImages??[]).some(d=>d.name===f.name)).length;
 const folders=(c.known??[]).filter(s=>s.startsWith('Pasta:'));
 const text=[`*${campaign}* · *${portalLabel(c.site)}*`,`*PI:* ${c.piWaived?'sem PI — confirmado':c.pi||'não informada'}`,period?`*Período:* ${period}`:'*Período:* não informado','',...formatWhatsAppContext(c),'',`*Materiais encontrados na conferência:* ${media} mídia(s) e ${pdfs} PDF(s). Isso não confirma publicação.`,'',`*${complete?'Próxima decisão':'Falta e impacto'}:*`,...(complete?['Os dados e materiais podem ser conferidos. Se escolher “Solicitar prévia”, a equipe revisa o pedido; essa resposta não cadastra nem publica.']:humanMissing.map(s=>'• '+issueText(s))),...(pdfMissing&&!complete?['• O PDF da PI não foi localizado; sem esse documento, o cadastro não pode ser validado por esta conferência.']:[]),...(complete?[]:['*Próximo responsável:* solicitante envia ou corrige os itens acima; a equipe AdOps confere depois.']),`*Referência:* ${reference}`,'Responda à enquete ou use Responder nesta mensagem. A escolha fica para revisão humana; não executa publicação.'].join('\n');
 const name=tidy(`${c.site||'AdOps'} | ${c.piWaived?'Sem PI — confirmado':'PI '+(c.pi||'pendente')} — ${complete?'Qual o próximo passo?':pdfMissing?'Como está o PDF?':'Como está esta pendência?'}`).slice(0,220);
 // Delivery identity is the decision, never evidence counters, timestamps or links.
 const key=complete?digest(['complete-decision-v1',row.identity,c.decisionNeeded.revision,options]):digest(['decision-v2',row.identity,humanMissing,name,options]);
 return {identity:row.identity,revision:row.revision,key,reference,group:ADOPS_GROUP,text,poll:{name,values:options,selectableCount:1}};
}
export function binary(value){
 if(Buffer.isBuffer(value))return value;
 if(value?.type==='Buffer'&&Array.isArray(value.data))return Buffer.from(value.data);
 if(Array.isArray(value))return Buffer.from(value);
 if(typeof value==='string')return Buffer.from(value,'base64');
 if(value&&typeof value==='object'&&Object.keys(value).every(k=>/^\d+$/.test(k)))return Buffer.from(Object.values(value));
 throw Error('invalid_binary_value');
}
function decodeOptions(buffer){
 const values=[];let offset=0;
 while(offset<buffer.length){if(buffer[offset++]!==10)throw Error('unexpected_poll_wire_tag');let len=0,shift=0,b;do{b=buffer[offset++];if(b===undefined||shift>21)throw Error('invalid_poll_wire_length');len|=(b&127)<<shift;shift+=7;}while(b&128);if(len!==32||offset+len>buffer.length)throw Error('invalid_poll_option_hash');values.push(buffer.subarray(offset,offset+len));offset+=len;}
 return values;
}
// Baileys Poll Vote contract: HMAC-derived AES-256-GCM, authenticated by voter/message ID.
export function decryptVote(vote,{pollId,secret,creators,voters}){
 const payload=binary(vote.encPayload),iv=binary(vote.encIv??vote.encIV);
 if(payload.length<16)throw Error('invalid_poll_ciphertext');
 const key0=createHmac('sha256',Buffer.alloc(32)).update(binary(secret)).digest();
 for(const creator of [...new Set(creators.filter(Boolean))])for(const voter of [...new Set(voters.filter(Boolean))]){
  try{const sign=Buffer.concat([Buffer.from(pollId+creator+voter+'Poll Vote'),Buffer.from([1])]);const key=createHmac('sha256',key0).update(sign).digest();const aes=createDecipheriv('aes-256-gcm',key,iv);aes.setAAD(Buffer.from(pollId+'\0'+voter));aes.setAuthTag(payload.subarray(-16));return decodeOptions(Buffer.concat([aes.update(payload.subarray(0,-16)),aes.final()]));}catch{}
 }
 throw Error('poll_vote_not_decrypted');
}
export function optionNames(hashes,values){
 return hashes.map(hash=>{const h=binary(hash).toString('hex');const name=values.find(v=>createHash('sha256').update(v).digest('hex')===h);if(!name)throw Error('unknown_poll_option');return name;});
}
export function unwrapMessage(message){
 let m=message??{};for(let i=0;i<5;i++){const inner=m.ephemeralMessage?.message??m.viewOnceMessage?.message??m.viewOnceMessageV2?.message??m.documentWithCaptionMessage?.message;if(!inner)break;m=inner;}return m;
}
export function eventParts(body){
 if(body.instance!==ADOPS_INSTANCE)return [];
 const event=String(body.event??'').toLowerCase().replace(/_/g,'.');
 if(!['messages.upsert','messages.update','send.message'].includes(event))return [];
 const rows=Array.isArray(body.data)?body.data:[body.data];
 return rows.filter(d=>d&&((d.key?.remoteJid??d.remoteJid)===ADOPS_GROUP)).map(d=>({event,data:d}));
}
export function receiptSummary(receipt){return {id:receipt?.key?.id??null,remoteJid:receipt?.key?.remoteJid??null,status:receipt?.status??null};}
