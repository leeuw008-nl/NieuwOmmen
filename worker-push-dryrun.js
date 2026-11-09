// Geïsoleerde push-dry-run. Geen KV-bindings, geen scheduled-handler, geen pushcode.
// Alleen handmatige GET /__dry-run. Haalt openbare feeds op en geeft diagnostiek terug.
// Dezelfde filterbron als app en productie-Worker.
import "./article-filter.js";
import "./source-registry.js";

const SOURCE_REGISTRY = globalThis.NieuwOmmenSourceRegistry;
if (!SOURCE_REGISTRY || !Array.isArray(SOURCE_REGISTRY.SOURCES)) throw new Error("NieuwOmmenSourceRegistry ontbreekt in push-dry-run");
const SOURCES = SOURCE_REGISTRY.SOURCES;
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
function parseGemeenteOverview(html, bronId){
 const results=[]; const seen=new Set();
 const re=/<h[23][^>]*>\s*<a[^>]+href=["']([^"']*\/actueel\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[23]>/gi;
 let m;
 while((m=re.exec(html))!==null && results.length<10){
  const title=clean(m[2]).slice(0,130), link=new URL(m[1],"https://www.ommen.nl").toString();
  if(title.length<8||seen.has(link))continue;
  seen.add(link);results.push({source:bronId,title,link,pubDate:null,_dateOrigin:"unknown"});
 }
 return results;
}
function parseVechtdalCentraalHTML(html, bronId){
 const results=[];const seen=new Set();
 const patterns=[
  /<h[23][^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi,
  /<h2[^>]*>\s*<a href=["']([^"']+)["'][^>]*>([^<]{8,200})<\/a>\s*<\/h2>/gi
 ];
 for(const re of patterns){let m;while((m=re.exec(html))!==null&&results.length<10){
  const link=new URL(m[1],"https://www.vechtdalcentraal.nl").toString(),title=clean(m[2]).slice(0,120);
  if(!link.includes("vechtdalcentraal.nl")||!title||seen.has(link))continue;
  seen.add(link);results.push({source:bronId,title,link,pubDate:null,_dateOrigin:"polling"});
 }if(results.length)break;}
 return results;
}
function parseRss2Json(json, bronId){
 return (Array.isArray(json.items)?json.items:[]).slice(0,10).map(it=>{
  const date=it.pubDate&&!Number.isNaN(Date.parse(it.pubDate))?new Date(it.pubDate).toISOString():null;
  return {source:bronId,title:clean(it.title).slice(0,120),link:it.link||"",pubDate:date,_realDate:!!date};
 }).filter(a=>a.title&&/^https?:\/\//i.test(a.link));
}
function isGemeenteArtikel(article){
 return globalThis.NieuwOmmenArticleFilter.isMunicipalityArticle(article);
}
function isRecentPushArticle(article,now=new Date()){
 return globalThis.NieuwOmmenArticleFilter.isRecentForPush(article,now);
}
function simulateFilters(articles,now=new Date()){
 const perArticle=articles.map(a=>{
  const decision=globalThis.NieuwOmmenArticleFilter.evaluateArticle(a);
  const recent=decision.valid && isRecentPushArticle(a,now);
  return {source:a.source,title:a.title,pubDate:a.pubDate||null,dateOnly:!!a._dateOnly,valid:decision.valid,validityReason:decision.reason,datePrecision:decision.datePrecision||"unknown",dateOrigin:decision.dateOrigin||"unknown",recent,gemeenteMatch:isGemeenteArtikel(a),result:!decision.valid?"rejected_"+decision.reason:recent?"date_eligible":decision.hasReliableDate?"rejected_date":"rejected_missing_or_unreliable_date"};
 });
 const bySource={};
 for(const a of perArticle){const s=bySource[a.source]||(bySource[a.source]={total:0,valid:0,invalid:0,dateEligible:0,rejectedDate:0,missingOrUnreliableDate:0,gemeenteMatch:0});s.total++;if(a.valid)s.valid++;else s.invalid++;if(a.recent)s.dateEligible++;else if(a.valid&&a.datePrecision==="unknown")s.missingOrUnreliableDate++;else if(a.valid)s.rejectedDate++;if(a.gemeenteMatch)s.gemeenteMatch++;}
 return {checkedAt:now.toISOString(),rule:"Dezelfde article-filter-module als app en Worker: geldigheid eerst; pushvenster -1 uur tot +6 uur; datum-zonder-tijd alleen huidige kalenderdag Europe/Amsterdam.",validArticles:perArticle.filter(x=>x.valid).length,invalidArticles:perArticle.filter(x=>!x.valid).length,dateEligible:perArticle.filter(x=>x.recent).length,rejectedDate:perArticle.filter(x=>x.valid&&!x.recent&&x.datePrecision!=="unknown").length,missingOrUnreliableDate:perArticle.filter(x=>x.valid&&!x.recent&&x.datePrecision==="unknown").length,gemeenteKeywordMatches:perArticle.filter(x=>x.gemeenteMatch).length,bySource,articles:perArticle};
}
function canonical(link){try{const u=new URL(link);u.hash="";for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid|mc_)/i.test(k))u.searchParams.delete(k);u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\/$/,"");}catch{return link.trim();}}
async function collect(s){
 const started=Date.now();
 if(s.parser==="newsletter-kv")return {source:s.id,status:"not_tested_production_kv",httpStatus:null,count:0,articles:[],attempts:[],error:"Bewust overgeslagen: deze route leest productie-KV; alleen de routebeschrijving staat in het register.",durationMs:0};
 const attempts=[];
 try{
  for(const route of s.fetchOrder){
   let requestUrl=route;
   if(s.parser==="vechtdal-centraal-chain"&&route==="https://api.rss2json.com/v1/api.json")requestUrl=route+"?rss_url="+encodeURIComponent(s.url);
   let response;
   try{response=await fetch(requestUrl,{headers:{"User-Agent":"NieuwOmmenBot/1.0"},redirect:"follow",signal:AbortSignal.timeout(15000)});}
   catch(error){attempts.push({url:requestUrl,status:"fetch_error",error:String(error.message||error)});continue;}
   if(!response.ok){
    let errorBody="";try{errorBody=(await response.text()).slice(0,300);}catch(e){errorBody="response body unavailable";}
    attempts.push({url:requestUrl,status:"http_error",httpStatus:response.status,error:clean(errorBody),response:{server:response.headers.get("server"),contentType:response.headers.get("content-type"),cfMitigated:response.headers.get("cf-mitigated"),cfRay:response.headers.get("cf-ray"),retryAfter:response.headers.get("retry-after")}});
    continue;
   }
   const body=await response.text();let articles=[];
   if(s.parser==="rss")articles=parseRSS(body,s.id,5);
   else if(s.parser==="gemeente-html-detail")articles=parseGemeenteOverview(body,s.id);
   else if(s.parser==="rtv-oost-html"){
    // Vereenvoudigde HTML-parser blijft diagnostisch; exacte app-parserpariteit volgt apart.
    const generic=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
    while((m=generic.exec(body))!==null&&articles.length<5){
     const href=m[1].trim(),parts=href.split("/");
     if(!href.startsWith("/nieuws/")||parts.length<4||!/^[0-9]+$/.test(parts[2])||!parts[3])continue;
     const title=clean(m[2]).slice(0,120),published=(m[0].match(/publishedAt=["']([^"']+)["']/i)||[])[1]||null;
     if(title.length>10)articles.push({title,link:new URL(href,"https://www.oost.nl").toString(),source:s.id,pubDate:published&&!Number.isNaN(Date.parse(published))?new Date(published).toISOString():null,_realDate:!!published});
    }
   }else if(s.parser==="rtv-vechtdal-html"){
    articles=route===s.homepage?parseRTVVechtdal(body,s.id):parseRSS(body,s.id,5);
   }else if(s.parser==="vechtdal-centraal-chain"){
    if(route==="https://api.rss2json.com/v1/api.json"){try{const data=JSON.parse(body);if(data.status==="ok")articles=parseRss2Json(data,s.id);}catch{}}
    else if(route===s.url&&(body.includes("<rss")||body.includes("<feed")||body.includes("<item")))articles=parseRSS(body,s.id,10);
    else articles=parseVechtdalCentraalHTML(body,s.id);
   }
   attempts.push({url:requestUrl,status:"ok",httpStatus:response.status,count:articles.length});
   if(articles.length)return {source:s.id,status:"ok",httpStatus:response.status,count:articles.length,articles,attempts,durationMs:Date.now()-started};
  }
  const failed=attempts.some(x=>x.status==="http_error"||x.status==="fetch_error");
  const lastHttp=[...attempts].reverse().find(x=>x.httpStatus);
  return {source:s.id,status:failed?"http_error":"empty",httpStatus:lastHttp?.httpStatus??null,count:0,articles:[],attempts,error:failed?"Geen route leverde artikelen op":"Alle routes succesvol geprobeerd; geen artikelen gevonden",durationMs:Date.now()-started};
 }catch(e){return {source:s.id,status:"error",error:String(e.message||e),count:0,articles:[],attempts,durationMs:Date.now()-started};}
}
export default {async fetch(request){
 const u=new URL(request.url);
 if(request.method!=="GET"||u.pathname!=="/__dry-run")return new Response("Not found",{status:404});
 const results=await Promise.all(SOURCES.map(collect));
 const seen=new Map(),duplicates=[];
 for(const result of results)for(const a of result.articles){const key=canonical(a.link);if(seen.has(key))duplicates.push({canonicalUrl:key,firstSource:seen.get(key),duplicateSource:a.source,title:a.title});else seen.set(key,a.source);}
  const articles=results.flatMap(x=>x.articles);
  const filterSimulation=simulateFilters(articles);
 return new Response(JSON.stringify({mode:"DRY_RUN_ONLY",pushAttempts:0,pushSent:0,kvReads:0,kvWrites:0,scheduledHandler:false,sourceCount:SOURCES.length,successfulSources:results.filter(x=>x.status==="ok").length,failedSources:results.filter(x=>x.status==="http_error"||x.status==="error").length,skippedSources:results.filter(x=>x.status==="not_tested_production_kv").length,articleCount:articles.length,uniqueCanonicalArticles:seen.size,duplicateCount:duplicates.length,duplicates,filterSimulation,articleDetails:articles.map(a=>({source:a.source,title:a.title,url:a.link,pubDate:a.pubDate||null})),results,generatedAt:new Date().toISOString()},null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}};
