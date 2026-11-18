import https from 'node:https';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import crypto from 'node:crypto';

const MAX_BYTES=512*1024*1024;
function failure(code,stage,cause,extra={}){const e=new Error(code,{cause});e.code=code;e.sourceUploadDiagnostic={stage,code,causeCode:String(cause?.cause?.code||cause?.code||cause?.name||'UNKNOWN').replace(/[^a-z0-9_]/ig,'_').slice(0,48),...extra};return e;}
export async function identifyAdopsSourceFile(inputPath,expectedSha256,expectedMd5){
  const before=await stat(inputPath);if(!before.isFile()||before.size>MAX_BYTES||!before.size)throw failure('source_file_invalid','source_hash');
  const sha=crypto.createHash('sha256'),md5=crypto.createHash('md5');let bytes=0;
  for await(const chunk of createReadStream(inputPath)){bytes+=chunk.length;if(bytes>MAX_BYTES)throw failure('source_file_exceeds_limit','source_hash');sha.update(chunk);md5.update(chunk);}
  const hashes={sha256:sha.digest('hex'),md5:md5.digest('hex')},after=await stat(inputPath);
  if(bytes!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino)throw failure('source_file_changed','source_hash');
  if(!expectedMd5||hashes.md5!==String(expectedMd5).toLowerCase()||(expectedSha256&&hashes.sha256!==String(expectedSha256).toLowerCase()))throw failure('source_checksum_mismatch','source_hash');
  return {...hashes,bytes,mtimeMs:after.mtimeMs,ino:after.ino};
}

export async function ensureAdopsSourceUploaded({inputPath,url,identity,sign,checkpoint=async()=>{},timeoutMs=180000,requestFactory=https.request}){
  const empty=crypto.createHash('sha256').update('').digest('hex');
  async function request(method){return new Promise((resolve,reject)=>{
    const headers=sign({method,url,bodyHash:method==='PUT'?identity.sha256:empty,contentType:'video/mp4',extraHeaders:method==='PUT'?{'x-amz-acl':'public-read','x-amz-meta-sha256':identity.sha256,'x-amz-meta-source-md5':identity.md5}:{}});
    if(method==='PUT')headers['Content-Length']=String(identity.bytes);
    let settled=false,stream=null,bytes=0;const sha=crypto.createHash('sha256'),md5=crypto.createHash('md5');
    const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);stream?.destroy();error?reject(error):resolve(value)};
    const req=requestFactory(url,{method,headers,family:4},res=>{res.resume();res.on('error',e=>done(failure('source_response_failed',method.toLowerCase(),e)));res.on('end',()=>{
      if(method==='PUT'&&res.statusCode>=200&&res.statusCode<300&&(bytes!==identity.bytes||sha.digest('hex')!==identity.sha256||md5.digest('hex')!==identity.md5))return done(failure('source_stream_checksum_mismatch','source_upload',null,{bytes}));
      done(null,{status:res.statusCode,headers:res.headers,bytes});
    });});
    const timer=setTimeout(()=>{const e=Object.assign(new Error('source_transport_timeout'),{code:'SOURCE_TRANSPORT_TIMEOUT'});req.destroy(e);},method==='PUT'?timeoutMs:15000);
    req.on('error',e=>done(failure('source_transport_failed',method==='PUT'?'source_upload':'source_head',e,{bytes})));
    if(method==='PUT'){stream=createReadStream(inputPath);stream.on('data',chunk=>{bytes+=chunk.length;sha.update(chunk);md5.update(chunk)});stream.on('error',e=>req.destroy(e));stream.pipe(req);}else req.end();
  });}
  function matches(r){return r.status===200&&Number(r.headers['content-length'])===identity.bytes&&String(r.headers.etag||'').replaceAll('"','')===identity.md5&&r.headers['x-amz-meta-sha256']===identity.sha256&&r.headers['x-amz-meta-source-md5']===identity.md5;}
  const safe={sourceSha256:identity.sha256,sourceBytes:identity.bytes};
  await checkpoint({stage:'source_head_started',...safe});const first=await request('HEAD');
  if(matches(first)){await checkpoint({stage:'source_verified',reused:true,...safe});return {reused:true,status:200,...safe};}
  if(first.status!==404)throw failure('source_existing_object_unverified','source_head',null,{httpStatus:first.status});
  const before=await stat(inputPath);if(before.size!==identity.bytes||before.mtimeMs!==identity.mtimeMs||before.ino!==identity.ino)throw failure('source_file_changed','source_upload');
  await checkpoint({stage:'source_upload_started',...safe});let put;
  try{put=await request('PUT');if(put.status<200||put.status>=300)throw failure('source_upload_rejected','source_upload',null,{httpStatus:put.status});}
  catch(primary){let recovered=null;try{recovered=await request('HEAD')}catch{}if(!recovered||!matches(recovered)){try{await checkpoint({stage:'source_upload_failed',...safe,diagnostic:primary.sourceUploadDiagnostic})}catch{}throw primary;}await checkpoint({stage:'source_verified',recoveredAfterUnknown:true,...safe});return {reused:true,recoveredAfterUnknown:true,status:200,...safe};}
  const after=await stat(inputPath);if(after.size!==identity.bytes||after.mtimeMs!==identity.mtimeMs||after.ino!==identity.ino)throw failure('source_file_changed','source_upload_readback');
  const readback=await request('HEAD');if(!matches(readback))throw failure('source_readback_mismatch','source_upload_readback',null,{httpStatus:readback.status});
  await checkpoint({stage:'source_verified',reused:false,...safe});return {reused:false,status:put.status,...safe};
}
