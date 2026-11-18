export function maintenanceAdMatchesFromSnapshot(snapshot) {
  if (!Array.isArray(snapshot?.ads) || !Array.isArray(snapshot?.links)) throw new Error('maintenance_snapshot_incomplete');
  return snapshot.ads.flatMap(ad => snapshot.links
    .filter(link => Number(link.ad) === Number(ad.id) && Number(link.user) === 0 && Number(link.group) > 0)
    .map(link => ({ adId: Number(ad.id), groupId: Number(link.group), adopsInsertionId: Number(ad.adops_insertion_id),
      adopsExternalKey: ad.adops_external_key, adopsMediaBasename: ad.adops_media_basename })));
}
export function maintenanceScope({ insertion, site, checklist, relation, homeUrl }) {
  const home=new URL(homeUrl);
  if(home.protocol!=='https:'||home.username||home.password)throw new Error('maintenance_home_invalid');
  if(!Number.isInteger(Number(insertion.rowVersion))||insertion.rowVersion==null||!insertion.mediaUrl)throw new Error('maintenance_identity_incomplete');
  const urls=[new URL('/',home).href];
  for(const raw of [site.artigoExemploUrl,site.articleFallbackUrl,insertion.pageUrl]) {
    if(!raw)continue;
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.hostname!==home.hostname||url.username||url.password)throw new Error('maintenance_url_out_of_scope');
    url.hash='';url.search='';urls.push(url.href);
  }
  const groupId=Number(checklist?.expectedSelectors?.groupId);
  const campaignId=Number(insertion.campanhaId??insertion.campaignId);
  const externalKey=`ADOPS-${site.sigla}-${insertion.id}`;
  const matches=(relation.historicalAdminMatches||[]).filter(ad=>Number(ad.groupId??ad.group_id)===groupId
    &&Number(ad.adopsInsertionId)===Number(insertion.id)
    &&String(ad.adopsMediaBasename||'')===new URL(insertion.mediaUrl).pathname.split('/').pop()
    &&ad.adopsExternalKey===externalKey);
  if(!checklist.ok||matches.length!==1||!Number.isInteger(groupId)||groupId<=0)throw new Error('maintenance_exact_ad_required');
  if(!Number.isInteger(campaignId)||campaignId<=0)throw new Error('maintenance_campaign_required');
  return {insertionId:Number(insertion.id),campaignId,externalKey,piCodigo:insertion.piCodigo??null,siteId:Number(site.id),rowVersion:insertion.rowVersion,
    mediaUrl:insertion.mediaUrl,adId:Number(matches[0].adId??matches[0].id),groupId,
    periodoInicio:insertion.periodoInicio,periodoFim:insertion.periodoFim,
    hostname:home.hostname,urls:[...new Set(urls)].sort()};
}
export function assertMaintenancePreview(preview,scope,layers) {
  if(preview?.kind!=='cache-maintenance'||preview.status!=='completed')throw new Error('maintenance_preview_required');
  const result=preview.result?.execution??preview.result;
  if(result?.mode!=='preview'||JSON.stringify(result.identity)!==JSON.stringify(scope)
    ||JSON.stringify(result.layers)!==JSON.stringify(layers))throw new Error('maintenance_preview_stale');
}
export function classifyMaintenanceTransportError(error) {
  const stderr=String(error?.stderr||'');
  // Return only fixed classifications. Never return SSH command, argv or raw logs.
  if(/RedisException|read error on connection|socket error on read/i.test(stderr))return 'maintenance_wordpress_redis_failed';
  if(/Permission denied|publickey/i.test(stderr))return 'maintenance_wordpress_auth_failed';
  if(/Fatal error|Uncaught|Call to undefined/i.test(stderr))return 'maintenance_wordpress_php_failed';
  if(/gateway.*(denied|not allowed)|command.*not allowed/i.test(stderr))return 'maintenance_wordpress_gateway_rejected';
  if(error?.killed||error?.code==='ETIMEDOUT')return 'maintenance_wordpress_timeout_unknown';
  return 'maintenance_wordpress_execution_failed';
}
const CACHE_DEVICE_TYPES=['desktop','mobile','tablet'];
export function cloudflarePurgeFiles(urls) {
  return urls.flatMap(url=>[url,...CACHE_DEVICE_TYPES.map(device=>({url,headers:{'CF-Device-Type':device}}))]);
}
export async function assertMaintenanceCacheReadback(before,after) {
  if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length||after.length===0)throw new Error('maintenance_cache_readback_incomplete');
  const beforeByKey=new Map(before.map(item=>[`${item.url}|${item.deviceType}`,item]));
  let uncachedVariants=0;
  for(const current of after){
    const prior=beforeByKey.get(`${current.url}|${current.deviceType}`);
    if(!prior||current.status==null||current.status<200||current.status>=300)throw new Error('maintenance_cache_readback_incomplete');
    const status=String(current.cacheStatus||'').toUpperCase();
    if((status==='DYNAMIC'||status==='BYPASS')&&(current.age==null||current.age==='')){uncachedVariants++;continue;}
    const oldAge=Number(prior.age),newAge=Number(current.age);
    if(status==='MISS'||status==='EXPIRED')continue;
    if(Number.isFinite(oldAge)&&Number.isFinite(newAge)&&newAge<oldAge)continue;
    throw new Error('maintenance_cache_readback_stale');
  }
  return {ok:true,variants:after.length,uncachedVariants,cacheState:uncachedVariants===after.length?'not_cached':'cached_or_mixed'};
}
export async function maintenanceStep(stage,operation,progress,timings) {
  const started=Date.now();
  try{await progress({stage:'maintenance_'+stage+'_started',maintenanceTimings:timings});}
  catch{throw new Error('maintenance_progress_unavailable_before_'+stage);}
  try{
    const value=await operation();timings[stage]=Date.now()-started;
    try{await progress({stage:'maintenance_'+stage+'_completed',maintenanceTimings:timings});}
    catch{throw new Error('maintenance_progress_unavailable_after_'+stage);}
    return value;
  }catch(error){
    timings[stage]=Date.now()-started;
    const timeout=error?.name==='TimeoutError'||error?.name==='AbortError'||error?.code==='ETIMEDOUT';
    const safe=timeout?'maintenance_'+stage+'_timeout':/^maintenance_[a-z_]+$/.test(error?.message||'')?error.message:'maintenance_'+stage+'_failed';
    try{await progress({stage:'maintenance_'+stage+'_failed',maintenanceTimings:timings,maintenanceFailure:safe});}catch{}
    throw new Error(safe);
  }
}
export async function cloudflareCredentials({token=process.env.CLOUDFLARE_API_TOKEN||process.env.CF_API_TOKEN,secretPath='/app/config/secrets/adops-cache-cloudflare.json'}={}) {
  if(token)return {token};
  try{const info=await stat(secretPath);if((info.mode&0o777)!==0o600)throw new Error();
    const secret=JSON.parse(await readFile(secretPath,'utf8'));
    if(secret.token)return {token:secret.token};
    if(secret.email&&secret.apiKey)return {email:secret.email,apiKey:secret.apiKey};
  }catch{throw new Error('cloudflare_credentials_unavailable');}
  throw new Error('cloudflare_credentials_unavailable');
}
export async function purgeScopedCloudflare(scope,{fetchImpl=fetch,token,email,apiKey,preview=false}={}) {
  if(!token&&!(email&&apiKey))throw new Error('cloudflare_token_missing');
  const call=async(path,body)=>{
    let response;
    try{response=await fetchImpl('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{'X-Auth-Email':email,'X-Auth-Key':apiKey}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});}catch{throw new Error('cloudflare_transport_failed');}
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.success!==true)throw new Error('cloudflare_request_failed');
    return data.result;
  };
  const zoneName=scope.hostname.replace(/^www\./,'');
  const zones=await call('/zones?name='+encodeURIComponent(zoneName));
  if(!Array.isArray(zones)||zones.length!==1||zones[0].name!==zoneName)throw new Error('cloudflare_exact_zone_required');
  if(preview)return {ok:true,mode:'preview',hostname:scope.hostname,urls:scope.urls};
  const files=cloudflarePurgeFiles(scope.urls),batchSize=30;
  for(let offset=0;offset<files.length;offset+=batchSize)
    await call('/zones/'+encodeURIComponent(zones[0].id)+'/purge_cache',{files:files.slice(offset,offset+batchSize)});
  return {ok:true,urls:scope.urls,purgedEntries:files.length,batches:Math.ceil(files.length/batchSize)};
}
import { readFile, stat } from 'node:fs/promises';
