import { createHash } from 'node:crypto';
const normal = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
export function currentDrivePackages(items, date = new Date()) {
  const months = new Set([0,15,30,45].map(days=>new Date(date.getTime()+days*86400000)).map(d=>normal(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',month:'long'}).format(d))));
  const groups = new Map();
  for(const item of items){
    if(item.mimeType==='application/vnd.google-apps.folder'||!item.parentFolderId)continue;
    const parts=String(item.path).split('/').map(part=>part.trim());
    const folderName=parts.at(-2)??'';
    if(!parts.some(part=>months.has(normal(part).split(' ')[0]))||!/^PI\b/i.test(folderName))continue;
    const group=groups.get(item.parentFolderId)??{folderId:item.parentFolderId,path:parts.slice(0,-1).join('/'),files:[]};
    group.files.push(item);groups.set(group.folderId,group);
  }
  return [...groups.values()].map(group=>({...group,revision:createHash('sha256').update(JSON.stringify(group.files.map(f=>[f.driveFileId,f.modifiedTime,f.checksum,f.name]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex')}));
}
