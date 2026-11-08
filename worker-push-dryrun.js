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
{id:"RTV Vechtdal",url:"https://rtvvechtdal.nl/",type:"rtv-vechtdal"},
{id:"Vechtdal Centraal",url:"https://www.vechtdalcentraal.nl/feed/",type:"rss"},
{id:"Nieuwsbrief",url:null,type:"newsletter"}
];
function clean(s){return (s||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();}
function extractRssDate(itemXml){
try{
const raw = (itemXml.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i)||[])[1]
|| (itemXml.match(/<published[^>]*>([^<]+)<\/published>/i)||[])[1]
|| (itemXml.match(/<updated[^>]*>([^<]+)<\/updated>/i)||[])[1]
|| (itemXml.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i)||[])[1]
|| (itemXml.match(/<date[^>]*>([^<]+)<\/date>/i)||[])[1];
if(raw){ const d = new Date(raw); if(!isNaN(d.getTime())) return d.toISOString(); }
}catch{}
return null;
}
function parseRSS(xml, bronId, max=10){
const items=[...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,max);
let entries = [];
if(items.length===0) entries=[...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)].slice(0,max);
const all = items.length? items : entries;
return all.map(m=>{
const it=m[1];
const title=(it.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)||[])[1]||'';
let link=(it.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||'';
if(!link || !link.includes('http')){ const hrefMatch = it.match(/<link[^>]+href=["']([^"']+)["']/i); if(hrefMatch) link = hrefMatch[1]; }
link=link.replace(/<!\[CDATA\[|\]\]>/g,'').trim();
if(!link.startsWith('http')){ const mm=it.match(/https?:\/\/[^\s<"]+/); if(mm) link=mm[0]; }
const realDate = extractRssDate(it);
return {title:title.replace(/<[^>]*>/g,'').trim().slice(0,120), link, source:bronId, pubDate: realDate, _realDate: !!realDate};
}).filter(x=>x.link && x.title);
}
function parseRTVVechtdal(html, bronId){
try{
const out=[];
const re = /<div class="allmode_item[^>]*>\s*<a href="([^"]+)"[^>]*>.*?allmode_date">([^<]+)<\/div>.*?alt="([^"]+)"/gis;
let m;
while((m=re.exec(html))!==null && out.length<10){
let href=m[1].trim(), dateStr=m[2].trim(), title=m[3].trim().slice(0,120), link=href;
if(link.startsWith('/?') || link.startsWith('?')) link='https://rtvvechtdal.nl/'+link.replace(/^\//,'');
else if(link.startsWith('/')) link='https://rtvvechtdal.nl'+link;
let iso=null; const dmatch=dateStr.match(/(\d{2})-(\d{2})-(\d{4})/);
if(dmatch){ const d=new Date(`${dmatch[3]}-${dmatch[2]}-${dmatch[1]}T00:00:00Z`); if(!isNaN(d.getTime())) iso=d.toISOString(); }
if(title && link) out.push({title,link,source:bronId,pubDate:iso,_dateOnly:!!iso});
}
return out;
}catch(e){ return []; }
}
const GEMEENTE_ZOEK=["Ommen","Lemele","Vilsteren","Beerze","Beerzerveld","Witharen","Archem","Arriën","Arriërveld","Besthmen","Dalmsholte","Eerde","Emsland","Giethmen","Hoogengraven","Junne","Nieuwebrug","Ommerbosch","Ommerkanaal","Ommerschans","Ommerveld","Rotbrink","Stegeren","Stegerveld","Varsen","Vinkenbuurt","Zeesse","Beerzerpoort"].map(x=>x.toLowerCase());
function isGemeenteArtikel(article){
 const txt=((article?.title||"")+" "+(article?.description||"")).toLowerCase();
 return GEMEENTE_ZOEK.some(pl=>txt.includes(pl));
}
function isRecentPushArticle(article,now=new Date()){
 if(!article||!article.pubDate)return false;
 const d=new Date(article.pubDate);if(Number.isNaN(d.getTime()))return false;
 if(article._dateOnly){
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Amsterdam",year:"numeric",month:"2-digit",day:"2-digit"});
  return fmt.format(d)===fmt.format(now);
 }
 const ageMs=now.getTime()-d.getTime();
 return ageMs>=-60*60*1000&&ageMs<=6*60*60*1000;
}
function simulateFilters(articles,now=new Date()){
 const perArticle=articles.map(a=>{
  const recent=isRecentPushArticle(a,now);
  return {source:a.source,title:a.title,pubDate:a.pubDate||null,dateOnly:!!a._dateOnly,recent,gemeenteMatch:isGemeenteArtikel(a),result:!a.pubDate?"rejected_missing_date":recent?"date_eligible":"rejected_date"};
 });
 const bySource={};
 for(const a of perArticle){const s=bySource[a.source]||(bySource[a.source]={total:0,dateEligible:0,rejectedDate:0,missingDate:0,gemeenteMatch:0});s.total++;if(a.recent)s.dateEligible++;else if(!a.pubDate)s.missingDate++;else s.rejectedDate++;if(a.gemeenteMatch)s.gemeenteMatch++;}
 return {checkedAt:now.toISOString(),rule:"Exacte isRecentPushArticle()-logica uit worker-v280.js; tijdvenster -1 uur tot +6 uur; _dateOnly alleen huidige datum Europe/Amsterdam.",dateEligible:perArticle.filter(x=>x.recent).length,rejectedDate:perArticle.filter(x=>!x.recent&&!!x.pubDate).length,missingDate:perArticle.filter(x=>!x.pubDate).length,gemeenteKeywordMatches:perArticle.filter(x=>x.gemeenteMatch).length,bySource,articles:perArticle};
}
function canonical(link){try{const u=new URL(link);u.hash="";for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid|mc_)/i.test(k))u.searchParams.delete(k);u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\/$/,"");}catch{return link.trim();}}
async function collect(s){
 const started=Date.now();
 if(s.type==="newsletter")return {source:s.id,status:"not_tested_production_kv",httpStatus:null,count:0,articles:[],error:"Bewust overgeslagen: de feedroute leest productie-KV; alleen route en responsvorm zijn in worker-v280.js geverifieerd.",durationMs:0};
 try{
  const r=await fetch(s.url,{headers:{"User-Agent":"NieuwOmmenBot/1.0"},redirect:"follow",signal:AbortSignal.timeout(15000)});
  if(!r.ok){let errorBody="";try{errorBody=(await r.text()).slice(0,300);}catch(e){errorBody="response body unavailable";}return {source:s.id,status:"http_error",httpStatus:r.status,count:0,articles:[],response:{server:r.headers.get("server"),contentType:r.headers.get("content-type"),cfMitigated:r.headers.get("cf-mitigated"),cfRay:r.headers.get("cf-ray"),retryAfter:r.headers.get("retry-after")},error:clean(errorBody),durationMs:Date.now()-started};}
  const body=await r.text();let articles=[];
  if(s.type==="newsletter"){const j=JSON.parse(body);articles=(j.items||[]).slice(0,8).map(x=>({source:s.id,title:x.title||"",link:x.link||"",pubDate:x.pubDate||null})).filter(x=>x.title&&/^https?:\/\//i.test(x.link));}
  else if(s.type==="rss")articles=parseRSS(body,s.id,5);
  else if(s.type==="rtv-vechtdal"){articles=parseRTVVechtdal(body,s.id);if(!articles.length)articles=parseRSS(body,s.id,5);}
  else {
   const generic=/<a\\b[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
   let m;const candidates=[];
   while((m=generic.exec(body))!==null){
     const href=m[1].trim();
     if(!/^\\/nieuws\\/\\d+\\/[^/]+/.test(href))continue;
     const anchor=m[0];
     const h3=anchor.match(/<h3[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\\s\\S]*?)<\\/h3>/i);
     const title=clean(h3?h3[1]:m[2]).slice(0,120);
     const published=(anchor.match(/publishedAt=["']([^"']+)["']/i)||[])[1]||null;
     if(title)candidates.push({href,title,publishedAt:published});
     if(articles.length<5&&title.length>10){
       const link=new URL(href,"https://www.oost.nl").toString();
       const parsedDate=published&&!Number.isNaN(Date.parse(published))?new Date(published).toISOString():null;
       articles.push({title,link,source:s.id,pubDate:parsedDate,_realDate:!!parsedDate});
     }
   }
   return {source:s.id,status:"ok",httpStatus:r.status,count:articles.length,articles,debugCandidates:candidates.slice(0,40),durationMs:Date.now()-started};
 }
  return {source:s.id,status:"ok",httpStatus:r.status,count:articles.length,articles,durationMs:Date.now()-started};
 }catch(e){return {source:s.id,status:"error",error:String(e.message||e),count:0,articles:[],durationMs:Date.now()-started};}
}
export default {async fetch(request){
 const u=new URL(request.url);
 if(request.method!=="GET"||u.pathname!=="/__dry-run")return new Response("Not found",{status:404});
 const results=await Promise.all(SOURCES.map(collect));
 const seen=new Map(),duplicates=[];
 for(const result of results)for(const a of result.articles){const key=canonical(a.link);if(seen.has(key))duplicates.push({canonicalUrl:key,firstSource:seen.get(key),duplicateSource:a.source,title:a.title});else seen.set(key,a.source);}
 const articles=results.flatMap(x=>x.articles);\n const filterSimulation=simulateFilters(articles);
 return new Response(JSON.stringify({mode:"DRY_RUN_ONLY",pushAttempts:0,pushSent:0,kvReads:0,kvWrites:0,scheduledHandler:false,sourceCount:SOURCES.length,successfulSources:results.filter(x=>x.status==="ok").length,failedSources:results.filter(x=>x.status==="http_error"||x.status==="error").length,skippedSources:results.filter(x=>x.status==="not_tested_production_kv").length,articleCount:articles.length,uniqueCanonicalArticles:seen.size,duplicateCount:duplicates.length,duplicates,filterSimulation,articleDetails:articles.map(a=>({source:a.source,title:a.title,url:a.link,pubDate:a.pubDate||null})),results,generatedAt:new Date().toISOString()},null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}};
