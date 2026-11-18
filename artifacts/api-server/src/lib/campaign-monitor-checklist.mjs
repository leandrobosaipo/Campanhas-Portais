import { createHash } from 'node:crypto';
import {applyPiWaivers} from './pi-waivers.mjs';
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const piOf = value => String(value ?? '').match(/(?:\bPI\s*[-:]?\s*)?(\d{3,})/i)?.[1]?.replace(/^0+/, '') || null;
const insertionIdOf = insertion => insertion?.insertionId ?? insertion?.id ?? null;
export function filenamePi(name) {
 const text=String(name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/_/g,' ');
 const values=[...text.matchAll(/(?:^|[^A-Z0-9])P\.?I\.?\s*(?:N[º°O.]?\s*)?[-:]?\s*(\d{3,})\b/g)].map(m=>m[1].replace(/^0+/,''));
 const unique=[...new Set(values.filter(Boolean))];return unique.length===1?unique[0]:null;
}
export function documentPiCandidates(text) {
 const header=(Array.isArray(text)?text:[text]).map(value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().slice(0,2400)).join('\n');
 const values=[...header.matchAll(/\bP\.?I\.?\s*(?:N[º°O.]?\s*)?[-:]?\s*(\d{3,})\b/g)].map(match=>match[1].replace(/^0+/,''));
 for(const match of header.matchAll(/(?:^|\n)\s*#(\d{3,})\s*-\s*PEDIDO DE INSERCAO\b/g))values.push(match[1].replace(/^0+/,''));
 for(const match of header.matchAll(/(?:^|\n)\s*PI\s*\n\s*PEDIDO DE INSERCAO\s*\n\s*(\d{3,})\b/g))values.push(match[1].replace(/^0+/,''));
 // Imagine's form separates the PI column title from the zero-padded number.
 if(!values.length&&/PEDIDO DE/.test(header)&&/\bPI\b/.test(header)){
  for(const match of header.matchAll(/\bINSERCAO\s+(0\d{4,})\b/g))values.push(match[1].replace(/^0+/,''));
 }
 const unique=[...new Set(values.filter(Boolean))];
 return unique;
}
export function documentPi(text) {const values=documentPiCandidates(text);return values.length===1?values[0]:null;}
const siteOf = path => {
 const text=norm(path);
 const candidates=[['PERRENGUE',/\bPERRENGUE\b/],['AFL',/\bAFL\b|\b(?:A )?FOLHA LIVRE\b/],['ROO',/\bROO\b/],['PNMT',/\bPNMT\b|\bPORTAL NMT\b/],['PPMT',/\bPPMT\b|\bPMMT\b|\bPORTAL PANTANAL\b/],['OMT',/\bOMT\b|\bO MATOGROSSENSE\b/]];
 const found=candidates.filter(([,regex])=>regex.test(text)).map(([site])=>site);
 return found.length===1 ? found[0] : null;
};
export function isSheetControlMarker(row) {
 if(piOf(row.piCodigo||row.peca)||row.inicio||row.fim)return false;
 return ['FINALIZADA','FINALIZADO'].includes(norm(row.campanha))
  && ['FINALIZADA','FINALIZADO'].includes(norm(row.local));
}
export function sheetObservations(snapshot, asOf) {
 if(snapshot.complete!==true || snapshot.inventoryComplete!==true)throw new Error('sheet_or_inventory_incomplete');
 const month = new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(asOf+'T12:00:00Z')).replace(' de ',' ');
 const coverage=snapshot.coverage?.find(item=>norm(item.sheetName)===norm(month));
 for(const site of ['OMT','ROO','PERRENGUE','AFL','PNMT','PPMT']) if(!coverage?.[site]?.header)throw new Error('sheet_coverage_missing_'+site);
 const limit=new Date(asOf+'T12:00:00Z');limit.setUTCDate(limit.getUTCDate()+45);
 const upcoming=limit.toISOString().slice(0,10);
 return snapshot.rows.filter(row=>!isSheetControlMarker(row)).filter(row=>row.fim ? row.fim>=asOf : norm(row.sourceSheet)===norm(month)).filter(row=>!row.inicio || row.inicio<=upcoming).map(row=>{
  const pi=piOf(row.piCodigo || row.peca), site=row.siteSigla;
  const identity=pi ? `${site}:${pi}` : `provisional:${fingerprint([site,norm(row.campanha),row.competenciaSheet]).slice(0,24)}`;
  return {identity,kind:'sheet',entityKey:fingerprint([site,norm(row.campanha),norm(row.local),row.inicio,row.fim,pi]),site,pi,
   data:{...row,origin:'planilha',reference:`${row.sourceSheet}:R${row.sourceRow}C${row.sourceColumn}`}};
 });
}
export function driveObservations(items, asOf, packages=[],activeFolders=[]) {
 const anchor=new Date(asOf+'T12:00:00Z');
 const months=new Set([0,15,30,45].map(days=>norm(new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long'}).format(new Date(anchor.getTime()+days*86400000)))));
 const groups=new Map();
 for(const item of items){
  const activeFolder=activeFolders.find(folder=>folder.folderId===item.parentFolderId);
  // Historical files remain in the inventory. They do not reopen past campaigns.
  const normalizedPath=norm(item.path);
  if(!activeFolder&&!normalizedPath.split(' ').some(part=>months.has(part)))continue;
  if(item.mimeType==='application/vnd.google-apps.folder')continue;
  const folderPath=String(item.path).split('/').slice(0,-1).join('/');
  const folderPi=piOf(folderPath.split('/').at(-1)),site=activeFolder?.site??siteOf(folderPath);
  const pack=packages.find(p=>p.folderId===item.parentFolderId)??null;
  const officialPi=documentPi([pack?.pdf?.layoutExcerpt,pack?.pdf?.textExcerpt]);
  const filePi=/application\/pdf/.test(item.mimeType)||/\.pdf$/i.test(item.name)?filenamePi(item.name):null;
  const pi=activeFolder?null:officialPi||folderPi||filePi;
  if(!pi && !/\bPI\b/.test(norm(folderPath.split('/').at(-1))))continue;
  const folderId=item.parentFolderId;
  if(!folderId)continue;
  const group=groups.get(folderId)??{identity:activeFolder?.identity??(pi&&site?`${site}:${pi}`:`drive:${folderId}`),kind:'drive',entityKey:folderId,site,pi,data:{folderId,path:folderPath,folderPi,officialPi,files:[],package:null}};
  group.data.files.push({id:item.driveFileId,name:item.name,mimeType:item.mimeType,modifiedTime:item.modifiedTime,checksum:item.checksum??null,size:item.size??null,url:item.webViewLink??null});
  groups.set(folderId,group);
 }
 for(const group of groups.values()){
  group.data.files.sort((a,b)=>a.id.localeCompare(b.id));
  group.data.package=packages.find(p=>p.folderId===group.data.folderId)??null;
 }
 return [...groups.values()];
}
export function buildMonitorChecklist(identity, observations, insertions, asOf,decisions=[]) {
 const sheets=observations.filter(o=>o.kind==='sheet'),drives=observations.filter(o=>o.kind==='drive');
 const site=observations.find(o=>o.site)?.site??null,pi=observations.find(o=>o.pi)?.pi??null;
 const conflicts=[],missing=[];
 if(!site)missing.push('Confirmar o portal.');
 if(!pi)missing.push('Enviar a PI ou confirmar o cadastro provisório.');
 if(!sheets.length)missing.push('Incluir a campanha na planilha ou confirmar nome, posição e período.');
 if(drives.length>1)conflicts.push('Mais de uma pasta para a mesma PI e portal; confirmar qual revisão está vigente.');
 for(const drive of drives)if(drive.data.folderPi&&drive.data.officialPi&&drive.data.folderPi!==drive.data.officialPi)conflicts.push(`A pasta informa PI ${drive.data.folderPi}, mas o PDF informa PI ${drive.data.officialPi}. Corrigir a referência da pasta/planilha após conferir.`);
 const files=drives.flatMap(d=>d.data.files),pdfs=files.filter(f=>f.mimeType==='application/pdf'||/\.pdf$/i.test(f.name));
 const piDocumentImages=files.filter(f=>/^image\//.test(f.mimeType)&&/^PI[ _-]*\d{3,}.*\.(?:jpe?g|png|webp|tiff?)$/i.test(f.name));
 const media=files.filter(f=>/^(image|video)\//.test(f.mimeType)&&!piDocumentImages.includes(f));
 if(!pdfs.length&&!piDocumentImages.length)missing.push('PDF da PI não localizado no inventário desta pasta.');
 if(piDocumentImages.length)missing.push('PI em imagem encontrada; leitura documental pendente.');
 if(pdfs.length>1)conflicts.push('Há mais de um PDF. Confirmar qual documento substitui o anterior.');
 if(!media.length)missing.push('Mídia não localizada na pasta.');
 const packages=drives.map(d=>d.data.package).filter(Boolean);
 const document=packages.find(p=>p.pdf?.textExcerpt?.trim());
 if(pdfs.length && !document)missing.push('Concluir a leitura do PDF oficial.');
 const filenamePis=[...new Set(pdfs.map(f=>filenamePi(f.name)).filter(Boolean))];
 const bodyPis=[...new Set(packages.flatMap(p=>documentPiCandidates([p.pdf?.layoutExcerpt,p.pdf?.textExcerpt])))];
 if(bodyPis.length>1)conflicts.push(`O conteúdo do documento traz mais de uma PI: ${bodyPis.join(', ')}. Conferir a revisão vigente.`);
 for(const number of bodyPis)if(pi&&number!==pi)conflicts.push(`O conteúdo do documento informa PI ${number}, mas o checklist/planilha informa ${pi}.`);
 for(const number of filenamePis)if(pi&&number!==pi)conflicts.push(`O arquivo da PI informa ${number}, mas o checklist/planilha informa ${pi}. Conferir o documento vinculado.`);
 const piSource=drives.some(d=>d.data.officialPi)?'document_body':filenamePis.length===1&&filenamePis[0]===pi?'document_filename':null;
 // File names identify the PI automatically. Document conflicts still block; this
 // operational identification does not approve publication or infer contract terms.
 if(document&&!piSource)missing.push('Número da PI ausente ou ambíguo no documento e no nome do arquivo.');
 for(const p of packages)for(const issue of p.issues??[])conflicts.push(issue);
 const positions=sheets.map(o=>{
  const r=o.data;
  const periodValid=Boolean(r.inicio&&r.fim&&r.inicio<=r.fim);
  if(!periodValid)missing.push(`Confirmar o período de ${r.local||'posição não informada'}.`);
  if(!r.local)missing.push('Confirmar a posição do anúncio.');
  const rowFormat=norm(r.localFormatoNormalizado||r.local);
  // Match only observed API fields: either its configured normalized alias or its canonical format.
  // Requiring same PI, site and dates prevents same-name placements from cross-matching.
  const rowName=norm(r.campanha);
  const knownName=Boolean(rowName&&!['NAO INFORMADO','NAO INFORMADA','SEM NOME','DESCONHECIDO'].includes(rowName));
  const matches=insertions.filter(i=>i.siteSigla===site&&[i.localFormatoNormalizado,i.localFormato].some(format=>norm(format)===rowFormat)&&i.periodoInicio===r.inicio&&i.periodoFim===r.fim&&!['cancelado','arquivado'].includes(i.statusNormalizado||i.status)&&!i.archivedAt&&!i.supersededByInsertionId&&
    (pi?piOf(i.piCodigo)===pi:knownName&&periodValid&&Boolean(rowFormat)&&norm(i.campaignName??i.campanhaName)===rowName));
  const candidates=pi||matches.length===1?matches:[];
  if(!pi&&matches.length>1)conflicts.push(`Cadastro provisório ambíguo para ${r.local}; confirmar os registros existentes.`);
  if(candidates.length>1)conflicts.push(`Mais de uma inserção corresponde a ${r.local}, ${r.periodo}; revisar os registros existentes.`);
  const registrations=candidates.map(i=>({insertionId:insertionIdOf(i),status:i.statusNormalizado||i.status||null,bannerPublicadoNoSite:typeof i.bannerPublicadoNoSite==='boolean'?i.bannerPublicadoNoSite:null}));
  return {name:r.local,start:r.inicio,end:r.fim,source:r.reference??o.data.reference,insertionIds:registrations.map(i=>i.insertionId).filter(Boolean),registrations,matchBasis:candidates.length?pi?'pi_site_format_dates':'provisional_site_name_format_dates_unique':null,existingMedia:candidates.length===1?candidates[0].mediaUrl:null,scheduled:Boolean(r.inicio&&r.inicio>asOf)};
 });
 if(!media.length&&positions.some(p=>p.existingMedia&&p.matchBasis==='provisional_site_name_format_dates_unique')){
  const index=missing.indexOf('Mídia não localizada na pasta.');if(index>=0)missing.splice(index,1);
 }
 // This stage never approves an inferred PDF calendar or guessed media/group mapping.
 const operationalChecks=['Validar período por posição no PDF, dimensões/duração, destino do clique e grupo do portal.'];
 const status=conflicts.length?'conflict':missing.length?'needs_information':'needs_operational_review';
 const uniqueMissing=[...new Set(missing)],uniqueConflicts=[...new Set(conflicts)];
 const known=[site?`Portal: ${site}.`:'',pi?`PI: ${pi}${drives.some(d=>d.data.officialPi)?' (número lido no PDF)':''}.`:'',sheets[0]?.data.campanha?`Campanha: ${sheets[0].data.campanha}.`:'',sheets[0]?.data.agenciaValor?`Agência/valor na planilha: ${sheets[0].data.agenciaValor}.`:'',...positions.map(p=>`${p.name}: ${p.start??'?'} a ${p.end??'?'}.`),`Drive: ${pdfs.length} PDF(s), ${piDocumentImages.length} imagem(ns) de PI, ${media.length} mídia(s) de campanha.`,...drives.map(d=>`Pasta: https://drive.google.com/drive/folders/${d.data.folderId}`)].filter(Boolean);
 const registrationNotes=positions.flatMap(p=>p.registrations.map(i=>`Cadastro AdOps #${i.insertionId??'ID não informado'}; status cadastral: ${i.status??'não informado'}; flag bannerPublicadoNoSite: ${i.bannerPublicadoNoSite===null?'não informada':i.bannerPublicadoNoSite}.`));
 for(const p of positions)if(p.existingMedia&&!media.length)registrationNotes.push(`Mídia já vinculada ao cadastro de ${p.name}; presença na pasta Drive não confirmada neste checklist.`);
 if(!registrationNotes.length)registrationNotes.push('Nenhum cadastro AdOps correspondente foi localizado para a posição.');
 const publicationNote='Publicação visual pendente de leitura pública; status e flag do cadastro, quando presentes, não comprovam exibição.';
 const message=[...known,...registrationNotes,...uniqueConflicts.map(x=>'Divergência: '+x),...uniqueMissing.map(x=>'Falta: '+x),...operationalChecks,publicationNote].join('\n');
 return applyPiWaivers({identity,site,pi,piResolution:{number:pi,source:piSource,filenamePis},status,positions,known,missing:uniqueMissing,conflicts:uniqueConflicts,operationalChecks,document:document?.pdf??null,piDocumentImages:piDocumentImages.map(f=>({name:f.name,mimeType:f.mimeType,url:f.url??null})),files,message,publicationEnabled:false,notificationDelivery:'pending_channel',readyForPublication:false},insertions,decisions);
}
