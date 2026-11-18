const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function assertCampaignExecutionGuard(guard,payload,pdfSha){
 if(guard?.allowed!==true||guard.actionId!==payload.campaignActionId)throw Error('campaign_execution_not_authorized');
 const pending=guard.documentaryPending===true&&payload.operationMode==='operational_minimum'&&guard.sourcePdfSha==null&&pdfSha==null;
 if(guard.folderId!==payload.driveFileId||(!pending&&guard.sourcePdfSha!==pdfSha))throw Error('campaign_authorized_source_changed');
 if(JSON.stringify(canonical(guard.parsedPi))!==JSON.stringify(canonical(payload.parsedPi)))throw Error('campaign_authorized_plan_changed');
 return guard;
}
