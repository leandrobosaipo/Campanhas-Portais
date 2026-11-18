import {createHash} from 'node:crypto';
import {sheetObservations,driveObservations,buildMonitorChecklist,isSheetControlMarker} from './campaign-monitor-checklist.mjs';
import {activeWaiverFolders} from './pi-waivers.mjs';
import {currentDrivePackages} from '../../../../ops/cloudflare-remote-runner/src/drive-monitor-resource.mjs';
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export function auditDriveCoverage({items,packages,snapshot,asOf,decisions=[]}) {
 const sheet=sheetObservations(snapshot,asOf),current=new Set(sheet.map(x=>x.identity));
 const expired=new Set(snapshot.rows.filter(row=>row.fim&&row.fim<asOf).map(row=>`${row.siteSigla}:${String(row.piCodigo||row.peca).match(/\d{3,}/)?.[0]?.replace(/^0+/,'')}`));
 const raw=driveObservations(items,asOf,packages,activeWaiverFolders(snapshot.insertions,decisions,asOf));
 const included=raw.filter(row=>!expired.has(row.identity)||current.has(row.identity));
 const byFolder=new Map(raw.map(x=>[x.entityKey,x])),includedIds=new Set(included.map(x=>x.entityKey));
 const expected=currentDrivePackages(items,new Date(asOf+'T12:00:00Z'));
 const packageIds=new Set(packages.map(p=>p.folderId));
 const missingPackages=expected.filter(p=>!packageIds.has(p.folderId)).map(p=>p.folderId);
 const reasonFor=id=>includedIds.has(id)?'included_current_or_upcoming':byFolder.has(id)?'expired_in_sheet':'outside_monitor_eligibility';
 const folders=[...new Set([...expected.map(p=>p.folderId),...packages.map(p=>p.folderId),...raw.map(p=>p.entityKey)])].sort().map(id=>{
  const observation=byFolder.get(id),pack=packages.find(p=>p.folderId===id),group=expected.find(p=>p.folderId===id),files=items.filter(x=>x.parentFolderId===id);
  return {folderId:id,path:observation?.data.path||pack?.path||group?.path||null,identity:observation?.identity||null,site:observation?.site||null,pi:observation?.pi||null,
   workerPackage:packageIds.has(id),monitored:includedIds.has(id),reason:reasonFor(id),fileCount:files.length,issues:pack?.issues||[],
   documents:(pack?.textObservations||[]).map(doc=>({driveFileId:doc.driveFileId,name:doc.name,readOk:!doc.error,error:doc.error||null,
    sha256:createHash('sha256').update(String(doc.text||'')).digest('hex'),links:doc.links||[]}))};
 });
 const months=new Set([0,15,30,45].map(days=>norm(new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long'}).format(new Date(Date.parse(asOf+'T12:00:00Z')+days*86400000)))));
 const ledger=items.map(item=>({driveFileId:item.driveFileId,parentFolderId:item.parentFolderId,path:item.path,mimeType:item.mimeType,
  reason:item.mimeType==='application/vnd.google-apps.folder'?'directory':byFolder.has(item.parentFolderId)?reasonFor(item.parentFolderId):packageIds.has(item.parentFolderId)?'outside_monitor_eligibility':norm(item.path).split(' ').some(p=>months.has(p))?'outside_pi_package':'outside_current_and_upcoming_months'}));
 const counts={};for(const item of ledger)counts[item.reason]=(counts[item.reason]||0)+1;
 const identities=[...new Set([...sheet,...included].map(x=>x.identity))].sort();
 const checklists=identities.map(identity=>buildMonitorChecklist(identity,[...sheet,...included].filter(x=>x.identity===identity),snapshot.insertions,asOf,decisions));
 const registrationGaps=checklists.flatMap(c=>c.positions.filter(p=>p.insertionIds.length!==1).map(p=>({identity:c.identity,site:c.site,pi:c.pi,format:p.name,start:p.start,end:p.end,insertionIds:p.insertionIds,reason:p.insertionIds.length?'ambiguous_registration':'unregistered'})));
 const sheetLedger=snapshot.rows.map(row=>({site:row.siteSigla,campaign:row.campanha,pi:row.piCodigo,format:row.local,start:row.inicio,end:row.fim,
  source:`${row.sourceSheet}:R${row.sourceRow}C${row.sourceColumn}`,reason:isSheetControlMarker(row)?'control_marker':sheet.some(o=>o.data.reference===`${row.sourceSheet}:R${row.sourceRow}C${row.sourceColumn}`)?'included_current_or_upcoming':row.fim&&row.fim<asOf?'expired':'outside_upcoming_window'}));
 return {version:'adops-drive-coverage-v1',readOnly:true,mutations:0,asOf,complete:missingPackages.length===0,
  summary:{inventoryItems:items.length,classifiedItems:ledger.length,itemReasons:counts,expectedWorkerPackages:expected.length,workerPackages:packages.length,rawDriveGroups:raw.length,monitoredDriveGroups:included.length,
   sheetRows:snapshot.rows.length,sheetEligibleRows:sheet.length,sheetControlMarkers:sheetLedger.filter(x=>x.reason==='control_marker').length,checklists:checklists.length,registrationGaps:registrationGaps.length},
  missingPackages,folders,sheetLedger,registrationGaps,checklists:checklists.map(c=>({identity:c.identity,site:c.site,pi:c.pi,status:c.status,missing:c.missing,conflicts:c.conflicts,piWaived:c.piWaived===true,positions:c.positions})),ledger};
}
