// Instagram is registered commercially, but its prints are outside AdOps monitoring.
// Standalone STORIES/REELS/SOCIAL are deliberately not inferred as Instagram.
export function isInstagramEvidenceExcluded(item) {
  return [item?.localFormatoNormalizado,item?.localFormato,item?.name].some(value=>{
    const format=String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
    return /^INSTAGRAM(?: (?:STORY|STORIES|REEL|REELS|FEED))?$/.test(format);
  });
}
