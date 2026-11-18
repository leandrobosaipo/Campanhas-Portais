const decode=s=>s.replace(/&amp;/gi,'&').replace(/&#0*38;/g,'&');
export function observedMediaLinkless(html,pageUrl,mediaUrl){
 if(/<a\b/i.test(html))return false;
 return [...html.matchAll(/\b(?:src|data-lazy-src)=["']([^"']+)["']/gi)].some(m=>{try{return new URL(decode(m[1]),pageUrl).href===mediaUrl;}catch{return false;}});
}
export function observedClickHref(html,pageUrl,mediaUrl){
 const matches=[];
 for(const anchor of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const media=[...anchor[2].matchAll(/\b(?:src|data-lazy-src)=["']([^"']+)["']/gi)];
  try{if(media.some(m=>new URL(decode(m[1]),pageUrl).href===mediaUrl)){const href=new URL(decode(anchor[1]),pageUrl);if(href.protocol==='https:')matches.push(href.href);}}catch{}
 }
 const unique=[...new Set(matches)];return unique.length===1?unique[0]:null;
}
