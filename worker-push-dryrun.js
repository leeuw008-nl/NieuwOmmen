// Geïsoleerde push-dry-run. Geen KV-bindings, geen scheduled-handler, geen pushcode.
// Alleen handmatige GET /__dry-run. Haalt openbare feeds op en geeft diagnostiek terug.
const SOURCES = [
{id:"De Stentor",url:"https://www.destentor.nl/ommen/rss.xml",type:"rss"},
{id:"Gemeente Ommen",url:"https://www.ommen.nl/feed/",type:"rss"},
{id:"Natuurlijk Ommen",url:"https://www.natuurlijkommen.nl/feed/",type:"rss"},
{id:"Ommen City",url:"https://ommencity.nl/feed/",type:"rss"},
{id:"OudOmmen",url:"https://weblog.oudommen.nl/feed/",type:"rss"},
{id:"RondOmmen",url:"https://www.rondommen.nl/feed/",type:"rss"},
{id:"RTV Oost",url:"https://www.oost.nl/nieuws/vechtdal",type:"oost"},
{id:"RTV Vechtdal",url:"https://rtvvechtdal.nl/",type:"vechtdal"},
{id:"Vechtdal Centraal",url:"https://www.vechtdalcentraal.nl/feed/",type:"rss"},
{id:"Nieuwsbrief",url:"https://nieuwommen.leeuw008.nl/api/newsletter/feed",type:"newsletter"}
];
function clean(s){return (s||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();}
function parseDate(xml){const m=xml.match(/<(?:pubDate|published|updated|dc:date|date)[^>]*>([^<]+)<\//i);if(!m)return null;const d=new Date(clean(m[1]));return Number.isNaN(d.getTime())?null:d.toISOString();}
function parseRss(xml,source,max=5){
 const blocks=[...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0,max);
 return blocks.map(x=>{const b=x[2];const title=clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
 let link=(b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||"";
 if(!link.trim()||!link.includes("http"))link=(b.match(/<link[^>]+href=["']([^"']+)/i)||[])[1]||"";
 link=clean(link);return {source,title,link,pubDate:parseDate(b)};
 }).filter(a=>a.title&&/^https?:\/\//i.test(a.link));
}
function parseVechtdal(html,source){
 const out=[];const re=/<div class="allmode_item[^>]*>\s*<a href="([^"]+)"[^>]*>.*?allmode_date">([^<]+)<\/div>.*?alt="([^"]+)"/gis;let m;
 while((m=re.exec(html))&&out.length<5){let link=m[1];if(link.startsWith("/"))link="https://rtvvechtdal.nl"+link;const d=m[2].match(/(\d{2})-(\d{2})-(\d{4})/);out.push({source,title:clean(m[3]),link,pubDate:d?new Date(Date.UTC(+d[3],+d[2]-1,+d[1])).toISOString():null});}
 return out;
}
function canonical(link){try{const u=new URL(link);u.hash="";for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid|mc_)/i.test(k))u.searchParams.delete(k);u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\/$/,"");}catch{return link.trim();}}
async function collect(s){
 const started=Date.now();
 try{
  const r=await fetch(s.url,{headers:{"User-Agent":"NieuwOmmen-DryRun/1.0"},redirect:"follow",signal:AbortSignal.timeout(15000)});
  if(!r.ok)return {source:s.id,status:"http_error",httpStatus:r.status,count:0,articles:[],durationMs:Date.now()-started};
  const body=await r.text();let articles=[];
  if(s.type==="newsletter"){const j=JSON.parse(body);articles=(j.items||[]).slice(0,8).map(x=>({source:s.id,title:x.title||"",link:x.link||"",pubDate:x.pubDate||null})).filter(x=>x.title&&/^https?:\/\//i.test(x.link));}
  else if(s.type==="rss")articles=parseRss(body,s.id);
  else if(s.type==="vechtdal"){articles=parseVechtdal(body,s.id);if(!articles.length)articles=parseRss(body,s.id);}
  else {const re=/<a[^>]+href=["'](\/nieuws\/[^"']+)["'][^>]*>([^<]{15,160})</gi;let m;while((m=re.exec(body))&&articles.length<5)articles.push({source:s.id,title:clean(m[2]),link:"https://www.oost.nl"+m[1],pubDate:null});}
  return {source:s.id,status:"ok",httpStatus:r.status,count:articles.length,articles,durationMs:Date.now()-started};
 }catch(e){return {source:s.id,status:"error",error:String(e.message||e),count:0,articles:[],durationMs:Date.now()-started};}
}
export default {async fetch(request){
 const u=new URL(request.url);
 if(request.method!=="GET"||u.pathname!=="/__dry-run")return new Response("Not found",{status:404});
 const results=await Promise.all(SOURCES.map(collect));
 const seen=new Map(),duplicates=[];
 for(const result of results)for(const a of result.articles){const key=canonical(a.link);if(seen.has(key))duplicates.push({canonicalUrl:key,firstSource:seen.get(key),duplicateSource:a.source,title:a.title});else seen.set(key,a.source);}
 const articles=results.flatMap(x=>x.articles);
 return new Response(JSON.stringify({mode:"DRY_RUN_ONLY",pushAttempts:0,pushSent:0,kvReads:0,kvWrites:0,scheduledHandler:false,sourceCount:SOURCES.length,successfulSources:results.filter(x=>x.status==="ok").length,failedSources:results.filter(x=>x.status!=="ok").length,articleCount:articles.length,uniqueCanonicalArticles:seen.size,duplicateCount:duplicates.length,duplicates,results,generatedAt:new Date().toISOString()},null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}};
