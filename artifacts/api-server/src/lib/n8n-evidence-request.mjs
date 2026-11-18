// Admission checks are safety constraints, not a scheduler. n8n chooses when to call.
export function validateEvidenceRequest(body, now = new Date()) {
 const date=now.toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'});
 const time=now.toLocaleTimeString('sv-SE',{timeZone:'America/Cuiaba',hour12:false,hour:'2-digit',minute:'2-digit'});
 const yesterday=new Date(now.getTime()-86400000).toLocaleDateString('sv-SE',{timeZone:'America/Cuiaba'});
 const routine=body?.routine, target=body?.targetDate, window=body?.dispatchWindow;
 const recoveryWindows=['18:30','19:00','19:30','20:00','20:30','21:00','21:30'];
 const valid=routine==='daily-print'&&window==='18:00'&&target===date
  ||routine==='daily-print-recovery'&&recoveryWindows.includes(window)&&target===date
  ||routine==='daily-print-morning-recovery'&&window==='08:00'&&target===yesterday
  ||routine==='evidence-monthly-report'&&window==='22:15'&&target===date;
 if(!valid)throw new Error('invalid_routine_or_target');
 const admitted=routine==='daily-print-morning-recovery' ? time>='08:00'&&time<'08:30'
  :routine==='evidence-monthly-report' ? time>='22:15' :time>=window&&time<'22:00';
 if(!admitted&&body.dryRun!==true)throw new Error('outside_safe_execution_window');
 return {routineKind:routine,targetDate:target,dispatchWindow:window,idempotencyKey:`${routine}:${target}:${window}`,
   jobKind:routine==='evidence-monthly-report'?'evidence-monthly-report':'print-batch',admitted};
}
