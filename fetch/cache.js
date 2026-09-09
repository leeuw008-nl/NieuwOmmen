
export const SOURCE_CACHE_TTL = 1000 * 60 * 5;
export const SOURCE_CACHE_KEY = 'ommen_source_cache_v1';
export function getSourceCache(){ try{return JSON.parse(localStorage.getItem(SOURCE_CACHE_KEY)||'{}');}catch{return {};}}
export function setSourceCache(c){ try{localStorage.setItem(SOURCE_CACHE_KEY, JSON.stringify(c));}catch{}}
export function putCachedSource(url, data){
  if(!data || data.length<200) return;
  const cache=getSourceCache(); cache[url]={data, ts:Date.now()};
  const keys=Object.keys(cache); if(keys.length>25){ const oldest=keys.sort((a,b)=>cache[a].ts-cache[b].ts)[0]; delete cache[oldest]; }
  setSourceCache(cache);
}
