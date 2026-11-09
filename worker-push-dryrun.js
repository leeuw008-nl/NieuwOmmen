// Geïsoleerde push-dry-run. Geen KV-bindings, geen scheduled-handler, geen pushcode.
// De parserfuncties komen ongewijzigd uit app.js; alleen de transportlaag verschilt.
import "./article-filter.js";
import {
  parseRSSFull,
  parseGemeenteOverview,
  enrichGemeenteWithDetail,
  parseOostFull,
  parseRTVVechtdalFull,
  parseVechtdalCentraalFallback
} from "./app-source-parsers.js";

const SOURCES = [
  {id:"De Stentor",name:"De Stentor",url:"https://www.destentor.nl/ommen/rss.xml",homepage:"https://www.destentor.nl/ommen/"},
  {id:"Gemeente Ommen",name:"Gemeente Ommen",url:"https://www.ommen.nl/actueel/",homepage:"https://www.ommen.nl/actueel/",type:"gemeente"},
  {id:"Natuurlijk Ommen",name:"Natuurlijk Ommen",url:"https://www.natuurlijkommen.nl/feed/",homepage:"https://www.natuurlijkommen.nl/"},
  {id:"Ommen City",name:"Ommen City",url:"https://ommencity.nl/feed/",homepage:"https://ommencity.nl/"},
  {id:"OudOmmen",name:"OudOmmen",url:"https://weblog.oudommen.nl/feed/",homepage:"https://weblog.oudommen.nl/"},
  {id:"RondOmmen",name:"RondOmmen",url:"https://www.rondommen.nl/feed/",homepage:"https://www.rondommen.nl/"},
  {id:"RTV Oost",name:"RTV Oost",url:"https://www.oost.nl/nieuws/vechtdal",homepage:"https://www.oost.nl/nieuws/vechtdal",type:"oost",fallback:"https://www.oost.nl/nieuws/vechtdal"},
  {id:"RTV Vechtdal",name:"RTV Vechtdal",url:"https://rtvvechtdal.nl/feed/",homepage:"https://rtvvechtdal.nl/"},
  {id:"Vechtdal Centraal",name:"Vechtdal Centraal",url:"https://www.vechtdalcentraal.nl/feed/",homepage:"https://www.vechtdalcentraal.nl/",fallback:"https://www.vechtdalcentraal.nl/"},
  {id:"Nieuwsbrief",name:"Nieuwsbrief",url:"https://ommen-push-v2.leeuw008.workers.dev/newsletter/feed",homepage:"https://nieuwommen.leeuw008.nl/",type:"nieuwsbrief"}
];

function isGemeenteArtikel(article){
  return globalThis.NieuwOmmenArticleFilter.isMunicipalityArticle(article);
}
function isRecentPushArticle(article,now=new Date()){
  return globalThis.NieuwOmmenArticleFilter.isRecentForPush(article,now);
}
function simulateFilters(articles,now=new Date()){
  const perArticle=articles.map(a=>{
    const decision=globalThis.NieuwOmmenArticleFilter.evaluateArticle(a);
    const recent=decision.valid&&isRecentPushArticle(a,now);
    return {source:a.source,title:a.title,pubDate:a.pubDate||null,dateOnly:!!a._dateOnly,valid:decision.valid,validityReason:decision.reason,datePrecision:decision.datePrecision||"unknown",dateOrigin:decision.dateOrigin||"unknown",recent,gemeenteMatch:isGemeenteArtikel(a),result:!decision.valid?"rejected_"+decision.reason:recent?"date_eligible":decision.hasReliableDate?"rejected_date":"rejected_missing_or_unreliable_date"};
  });
  const bySource={};
  for(const a of perArticle){
    const s=bySource[a.source]||(bySource[a.source]={total:0,valid:0,invalid:0,dateEligible:0,rejectedDate:0,missingOrUnreliableDate:0,gemeenteMatch:0});
    s.total++;if(a.valid)s.valid++;else s.invalid++;if(a.recent)s.dateEligible++;else if(a.valid&&a.datePrecision==="unknown")s.missingOrUnreliableDate++;else if(a.valid)s.rejectedDate++;if(a.gemeenteMatch)s.gemeenteMatch++;
  }
  return {checkedAt:now.toISOString(),rule:"Dezelfde article-filter-module als app en Worker: geldigheid eerst; pushvenster -1 uur tot +6 uur; datum-zonder-tijd alleen huidige kalenderdag Europe/Amsterdam.",validArticles:perArticle.filter(x=>x.valid).length,invalidArticles:perArticle.filter(x=>!x.valid).length,dateEligible:perArticle.filter(x=>x.recent).length,rejectedDate:perArticle.filter(x=>x.valid&&!x.recent&&x.datePrecision!=="unknown").length,missingOrUnreliableDate:perArticle.filter(x=>x.valid&&!x.recent&&x.datePrecision==="unknown").length,gemeenteKeywordMatches:perArticle.filter(x=>x.gemeenteMatch).length,bySource,articles:perArticle};
}
function canonical(link){
  try{const u=new URL(link);u.hash="";for(const k of [...u.searchParams.keys()])if(/^(utm_|fbclid|gclid|mc_)/i.test(k))u.searchParams.delete(k);u.hostname=u.hostname.toLowerCase();return u.toString().replace(/\/$/,"");}
  catch{return link.trim();}
}
async function requestText(url){
  const response=await fetch(url,{headers:{"User-Agent":"NieuwOmmenBot/1.0","Accept":"text/html,application/rss+xml,application/xml"},redirect:"follow",signal:AbortSignal.timeout(15000)});
  const body=await response.text();
  if(!response.ok)throw Object.assign(new Error("HTTP "+response.status+": "+body.slice(0,250)),{status:response.status});
  return {response,body};
}
function attachSource(items,source){
  return items.map(a=>({...a,source:source.name,id:source.id,isFallback:false}));
}
async function collect(source){
  const started=Date.now(),attempts=[];
  if(source.type==="nieuwsbrief"){
    return {source:source.id,status:"not_tested_production_kv",httpStatus:null,count:0,articles:[],attempts:[],error:"Bewust overgeslagen: deze bron leest productie-KV.",durationMs:0};
  }
  async function attempt(url,parser){
    try{
      const {response,body}=await requestText(url);
      const articles=await parser(body);
      attempts.push({url,status:"ok",httpStatus:response.status,count:articles.length});
      return articles;
    }catch(error){
      attempts.push({url,status:error.status?"http_error":"fetch_error",httpStatus:error.status||null,error:String(error.message||error)});
      return [];
    }
  }
  let articles=[];
  if(source.type==="gemeente"){
    articles=await attempt(source.url,async html=>{
      const overview=parseGemeenteOverview(html);
      const enriched=await enrichGemeenteWithDetail(overview);
      return attachSource(enriched,source);
    });
  }else if(source.type==="oost"){
    articles=await attempt(source.url,html=>attachSource(parseOostFull(html),source));
  }else if(source.id==="RTV Vechtdal"){
    articles=await attempt(source.homepage,html=>attachSource(parseRTVVechtdalFull(html),source));
    if(!articles.length)articles=await attempt(source.url,xml=>attachSource(parseRSSFull(xml,source.id),source));
  }else if(source.id==="Vechtdal Centraal"){
    articles=await attempt(source.url,async body=>{
      if(body.includes("<rss")||body.includes("<feed")||body.includes("<item"))return attachSource(parseRSSFull(body,source.id),source);
      return attachSource(parseVechtdalCentraalFallback(body),source);
    });
    if(!articles.length)articles=await attempt(source.fallback||source.homepage,html=>attachSource(parseVechtdalCentraalFallback(html),source));
    if(!articles.length){
      const rss2jsonUrl="https://api.rss2json.com/v1/api.json?rss_url="+encodeURIComponent(source.url)+"&t="+Date.now();
      articles=await attempt(rss2jsonUrl,async body=>{
        const data=JSON.parse(body);
        if(data.status!=="ok"||!Array.isArray(data.items))return [];
        return attachSource(data.items.slice(0,10).map(it=>({
          title:String(it.title||"").replace(/<[^>]*>/g,"").trim(),
          link:it.link,
          pubDate:it.pubDate?new Date(it.pubDate):new Date(),
          description:(it.description||"").replace(/<[^>]*>/g," ").slice(0,180)+" [...]"
        })).filter(a=>a.title&&a.link),source);
      });
    }
  }else{
    articles=await attempt(source.url,xml=>attachSource(parseRSSFull(xml,source.id),source));
  }
  if(articles.length)return {source:source.id,status:"ok",httpStatus:attempts.at(-1)?.httpStatus??null,count:articles.length,articles,attempts,durationMs:Date.now()-started};
  const failed=attempts.some(a=>a.status==="http_error"||a.status==="fetch_error");
  const lastHttp=[...attempts].reverse().find(a=>a.httpStatus);
  return {source:source.id,status:failed?"http_error":"empty",httpStatus:lastHttp?.httpStatus??null,count:0,articles:[],attempts,error:failed?"Geen route leverde artikelen op":"Alle oorspronkelijke app-routes geprobeerd; geen artikelen gevonden",durationMs:Date.now()-started};
}
export default {async fetch(request){
  const url=new URL(request.url);
  if(request.method!=="GET"||url.pathname!=="/__dry-run")return new Response("Not found",{status:404});
  const results=await Promise.all(SOURCES.map(collect));
  const seen=new Map(),duplicates=[];
  for(const result of results)for(const article of result.articles){
    const key=canonical(article.link);
    if(seen.has(key))duplicates.push({canonicalUrl:key,firstSource:seen.get(key),duplicateSource:article.source,title:article.title});
    else seen.set(key,article.source);
  }
  const articles=results.flatMap(result=>result.articles);
  const filterSimulation=simulateFilters(articles);
  return new Response(JSON.stringify({
    mode:"DRY_RUN_ONLY",pushAttempts:0,pushSent:0,kvReads:0,kvWrites:0,scheduledHandler:false,
    sourceCount:SOURCES.length,successfulSources:results.filter(x=>x.status==="ok").length,
    failedSources:results.filter(x=>x.status==="http_error"||x.status==="error").length,
    skippedSources:results.filter(x=>x.status==="not_tested_production_kv").length,
    articleCount:articles.length,uniqueCanonicalArticles:seen.size,duplicateCount:duplicates.length,duplicates,
    filterSimulation,articleDetails:articles.map(a=>({source:a.source,title:a.title,url:a.link,pubDate:a.pubDate||null})),
    results,generatedAt:new Date().toISOString()
  },null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}};
