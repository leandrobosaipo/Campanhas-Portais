const day=value=>{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
};
// A purpose flag alone never grants a capture-window exception. The persisted
// API job must authorize this exact same-day target; final audit also needs the
// existing server-correlated artifact provenance supplied by capture-audit.
export function publicationAcceptanceReceipt({insertionId,date,phase,metadata,audit,job,receivedAt=new Date()}){
 if(!metadata||metadata.capturePurpose!=='publication_acceptance'||!job)return null;
 if(typeof metadata.sourceJobId!=='string'||metadata.sourceJobId!==job.id)return null;
 if(!['capture-proof-single'].includes(job.kind))return null;
 const payload=job.payload;
 if(!payload||!Array.isArray(payload.targets)||payload.targets.length!==1)return null;
 const target=payload.targets[0];
 if(Number(target.insertionId)!==Number(insertionId)||target.targetDate!==date||target.capturePurpose!=='publication_acceptance'||target.captureAt||target.candidateOnly!==true||target.promoteCandidate===true||target.replaceExisting===true)return null;
 if(metadata.requestedCaptureAt||metadata.reconstruction?.reconstructed||metadata.reconstruction?.sourceMode==='signed_preview'||metadata.reconstruction?.sourceMode==='audited_reconstruction')return null;
 if(day(job.createdAt)!==date||day(job.startedAt)!==date)return null;
 const preliminary=phase==='pre_upload';
 if(preliminary){
  if(job.status!=='running'||day(receivedAt)!==date)return null;
 }else if(!['running','completed','failed'].includes(job.status)||!['scheduled','same_day_retry'].includes(audit?.captureClass)||audit?.sourceJobId!==job.id||audit?.targetDate!==date||day(audit?.capturedAt)!==date||audit?.requestedCaptureAt)return null;
 const actualAt=preliminary?new Date(receivedAt):new Date(audit.capturedAt);
 const startedAt=new Date(job.startedAt),now=new Date(receivedAt);
 if(!Number.isFinite(actualAt.getTime())||actualAt.getTime()>now.getTime()||actualAt.getTime()<startedAt.getTime())return null;
 return {purpose:'publication_acceptance',sourceJobId:job.id,insertionId:Number(insertionId),targetDate:date,actualAt:actualAt.toISOString(),preliminary};
}
