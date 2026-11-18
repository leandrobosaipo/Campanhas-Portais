export function parseRequiredEvidenceDates(raw) {
  if(raw==null||raw==='')return null;
  let value=raw;
  if(typeof value==='string'){try{value=JSON.parse(value);}catch{throw new Error('export_date_scope_invalid');}}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('export_date_scope_invalid');
  const entries=Object.entries(value);
  if(!entries.length)return null;
  if(entries.length>100)throw new Error('export_date_scope_invalid');
  return Object.fromEntries(entries.map(([id,dates])=>{
    if(!/^[1-9][0-9]*$/.test(id)||!Number.isSafeInteger(Number(id))||!Array.isArray(dates)||!dates.length||dates.length>366)throw new Error('export_date_scope_invalid');
    if(dates.some(date=>typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))throw new Error('export_date_scope_invalid');
    return [id,[...new Set(dates)].sort()];
  }).sort(([a],[b])=>Number(a)-Number(b)));
}
export function assertRequiredInsertionScope(scope,ids) {
  if(!scope)return;
  if(JSON.stringify(Object.keys(scope).map(Number).sort((a,b)=>a-b))!==JSON.stringify([...ids].map(Number).sort((a,b)=>a-b)))throw new Error('export_date_scope_insertion_mismatch');
}
export function selectRequiredEvidenceRows(rows,insertionId,scope,dateForRow) {
  if(!scope)return rows;
  const dates=scope[String(insertionId)];
  if(!dates)throw new Error('export_date_scope_insertion_mismatch');
  const selected=rows.filter(row=>dates.includes(dateForRow(row)));
  const actual=new Set(selected.map(dateForRow));
  if(dates.some(date=>!actual.has(date)))throw new Error('export_date_scope_required_date_missing');
  return selected;
}
