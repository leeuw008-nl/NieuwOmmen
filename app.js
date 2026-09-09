// app.js v400 MODULAIR - gebruikt parsing/ map - werkend uit 1 sept - GEEN parsers meer in app.js
import { parseDeStentor } from './parsing/De Stentor.js';
import { parseRondOmmen } from './parsing/RondOmmen.js';
import { parseOmmenCity } from './parsing/Ommen City.js';
import { parseOudOmmen } from './parsing/OudOmmen.js';
import { parseNatuurlijkOmmen } from './parsing/Natuurlijk Ommen.js';
import { parseRTVOost } from './parsing/RTV Oost.js';
import { parseRTVVechtdal } from './parsing/RTV Vechtdal.js';
import { parseVechtdalCentraal } from './parsing/Vechtdal Centraal.js';
import { parseGemeenteOmmen } from './parsing/Gemeente Ommen.js';
import { parseNieuwsbrief } from './parsing/Nieuwsbrief.js';

const BRON_PARSERS = {
  'De Stentor': parseDeStentor,
  'RondOmmen': parseRondOmmen,
  'Ommen City': parseOmmenCity,
  'OudOmmen': parseOudOmmen,
  'Natuurlijk Ommen': parseNatuurlijkOmmen,
  'RTV Oost': parseRTVOost,
  'RTV Vechtdal': parseRTVVechtdal,
  'Vechtdal Centraal': parseVechtdalCentraal,
  'Gemeente Ommen': parseGemeenteOmmen,
  'Nieuwsbrief': parseNieuwsbrief
};

const BRONNEN = [
  {id:'De Stentor', name:'De Stentor', sub:'regionaal (Ommen)'},
  {id:'Gemeente Ommen', name:'Gemeente Ommen', sub:'officiële berichten'},
  {id:'Natuurlijk Ommen', name:'Natuurlijk Ommen', sub:'evenementen & toerisme'},
  {id:'Ommen City', name:'Ommen City', sub:'lokaal nieuws Ommen'},
  {id:'OudOmmen', name:'OudOmmen', sub:'artikelen over historie'},
  {id:'RondOmmen', name:'RondOmmen', sub:'lokaal nieuws'},
  {id:'RTV Oost', name:'RTV Oost', sub:'regionaal Overijssel'},
  {id:'RTV Vechtdal', name:'RTV Vechtdal', sub:'lokaal Vechtdal'},
  {id:'Vechtdal Centraal', name:'Vechtdal Centraal', sub:'112 & dorpsnieuws'},
  {id:'Nieuwsbrief', name:'NieuwOmmen', sub:'Nieuwsbrief updates & releases'},
];
const MAX_PER_BRON = {'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Nieuwsbrief':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':10,'RTV Vechtdal':10};
const BRON_URLS = {
  'De Stentor': {url:'https://www.destentor.nl/ommen/rss.xml', homepage:'https://www.destentor.nl/ommen/'},
  'Gemeente Ommen': {url:'https://www.ommen.nl/actueel/', homepage:'https://www.ommen.nl/actueel/', type:'gemeente'},
  'Natuurlijk Ommen': {url:'https://www.natuurlijkommen.nl/feed/', homepage:'https://www.natuurlijkommen.nl/'},
  'Ommen City': {url:'https://ommencity.nl/feed/', homepage:'https://ommencity.nl/'},
  'OudOmmen': {url:'https://weblog.oudommen.nl/feed/', homepage:'https://weblog.oudommen.nl/'},
  'RondOmmen': {url:'https://www.rondommen.nl/feed/', homepage:'https://www.rondommen.nl/'},
  'RTV Oost': {url:'https://www.oost.nl/nieuws/vechtdal', homepage:'https://www.oost.nl/nieuws/vechtdal', type:'oost', fallback:'https://www.oost.nl/nieuws/vechtdal'},
  'RTV Vechtdal': {url:'https://rtvvechtdal.nl/feed/', homepage:'https://rtvvechtdal.nl/'},
  'Vechtdal Centraal': {url:'https://www.vechtdalcentraal.nl/feed/', homepage:'https://www.vechtdalcentraal.nl/', fallback:'https://www.vechtdalcentraal.nl/'},
  'Nieuwsbrief': {url:'https://ommen-push-v2.leeuw008.workers.dev/newsletter/feed', homepage:'https://nieuwommen.leeuw008.nl/', type:'nieuwsbrief'},
};
// PLAATSEN FILTER - HERSTELD: alle kernen en buurtschappen gemeente Ommen

// ===== v238 DEFINITIEF - ECHTE HTML PARSERS =====
function parseVechtdalCentraalECHT(html){
  const items=[]; const seen=new Set();
  // Originele parser - behouden
  let re=/<h[2-3] class="entry-title[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi; let m;
  while((m=re.exec(html))!==null && items.length<25){
    let link=m[1]; if(link.startsWith('/')) link='https://www.vechtdalcentraal.nl'+link;
    if(seen.has(link)) continue; seen.add(link);
    const title=m[2].replace(/&#8217;/g,"'").replace(/&amp;/g,"&").trim();
    if(title.length>4) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
  }
  if(items.length>0) return items;
  // FIX 25-08-2026: nieuwe thema varianten - vechtdalcentraal gebruikt nu ook <h2><a> en article
  const patterns=[
    /<h2[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]{8,200})<\/a>\s*<\/h2>/gi,
    /<article[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>[\s\S]*?<h[23]/gi,
    /<a[^>]+href="(https:\/\/www\.vechtdalcentraal\.nl\/[^"']{5,150})"[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</gi,
    /<a href="(\/[^"']{5,150})"[^>]*>[^<]*<h[2-3][^>]*>([^<]{8,200})<\/h3>/gi
  ];
  for(const pat of patterns){
    let mm;
    while((mm=pat.exec(html))!==null && items.length<25){
      let link=mm[1]; let title=mm[2].replace(/<[^>]*>/g,'').replace(/&#8217;/g,"'").replace(/&amp;/g,"&").trim();
      if(link.startsWith('/')) link='https://www.vechtdalcentraal.nl'+link;
      if(!link.includes('vechtdalcentraal.nl')) continue;
      if(seen.has(link)) continue; seen.add(link);
      if(title.length>8) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
    }
    if(items.length>5) break;
  }
  return items;
}
function getVechtdalCache(){try{return JSON.parse(localStorage.getItem('ommen_vechtdal_poll')||'{}');}catch{return {};}}
function setVechtdalCache(c){try{localStorage.setItem('ommen_vechtdal_poll',JSON.stringify(c));}catch{}}
function parseRTVVechtdalECHT(html){
  const items=[];
  const now = new Date(); const pollCache=getVechtdalCache(); let dirty=false; const pollingMoment=now;
  const today = new Date();
  today.setHours(0,0,0,0);
  const reFull=/<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,600}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>[\s\S]{0,800}?<div class="allmode_(?:intro|text|introtext)[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while((m=reFull.exec(html))!==null && items.length<20){
    const dparts=m[1].split('-'); 
    let pd=null;
    let isToday=false;
    if(dparts.length===3){
      const d = new Date(parseInt(dparts[2]), parseInt(dparts[1])-1, parseInt(dparts[0]), 0,0,0);
      const dMidnight = new Date(d); dMidnight.setHours(0,0,0,0);
      isToday = dMidnight.getTime() === today.getTime();
      if(isToday){
        pd = new Date(pollingMoment);
      }else{
        // geen tijd op bron -> polling-tijd (zoals gevraagd)
        pd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), pollingMoment.getHours(), pollingMoment.getMinutes(), pollingMoment.getSeconds());
      }
    }else{
      pd = new Date(pollingMoment);
    }
    let link=m[2].replace(/&amp;/g,'&'); if(!link.startsWith('http')) link='https://www.rtvvechtdal.nl'+link;
    let intro=m[4].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(intro.length>200) intro=intro.slice(0,200)+' [...]'; else if(intro) intro=intro+' [...]'; else intro=m[3].trim()+' [...]';
    if(pollCache[link]==null){pollCache[link]=pd.toISOString(); dirty=true;} else if(pd.getHours()!=0 || pd.getMinutes()!=0){pd=new Date(pollCache[link]);} if(dirty) setVechtdalCache(pollCache); items.push({title:m[3].trim(), link, pubDate:pd, description:intro});
  }
  if(items.length===0){
    const re=/<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,500}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>/gi;
    while((m=re.exec(html))!==null && items.length<15){
      const dparts=m[1].split('-'); 
      let pd=null;
      let isToday=false;
      if(dparts.length===3){
        const d = new Date(parseInt(dparts[2]), parseInt(dparts[1])-1, parseInt(dparts[0]), 0,0,0);
        const dMidnight = new Date(d); dMidnight.setHours(0,0,0,0);
        isToday = dMidnight.getTime() === today.getTime();
        if(isToday){
          pd = new Date(pollingMoment);
        }else{
          // geen tijd op bron -> polling-tijd
          pd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), pollingMoment.getHours(), pollingMoment.getMinutes(), pollingMoment.getSeconds());
        }
      }else{
        pd = new Date(pollingMoment);
      }
      let link=m[2].replace(/&amp;/g,'&'); if(!link.startsWith('http')) link='https://www.rtvvechtdal.nl'+link;
      items.push({title:m[3].trim(), link, pubDate:pd, description:m[3].trim()+' [...]'});
    }
  }
  return items;
}

async function enrichVechtdalWithDetail(arts){
  console.log('[v228] RTV Vechtdal enrich DISABLED - polling moment gebruikt, geen extra fetches');
  return arts;
}


function getOostPollCache(){try{return JSON.parse(localStorage.getItem('ommen_oost_poll')||'{}');}catch{return {};}}
function setOostPollCache(c){try{localStorage.setItem('ommen_oost_poll', JSON.stringify(c));}catch{}}
function parseNieuwsbriefECHT(json){
  try{
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const items = data.items || data.articles || data || [];
    return items.map(it=>{
      const title = it.title || it.subject || 'Nieuwsbrief';
      const link = it.link || it.url || 'https://nieuwommen.leeuw008.nl/';
      let pubDate = new Date();
      if(it.pubDate || it.date || it.updated){ const d=new Date(it.pubDate||it.date||it.updated); if(!isNaN(d.getTime())) pubDate=d; }
      const desc = it.description || it.body || it.excerpt || title;
      return {title: title.slice(0,120), link, pubDate, description: desc.slice(0,200)+' [...]', source:'Nieuwsbrief', id:'Nieuwsbrief'};
    }).slice(0,10);
  }catch(e){ console.log('parse nieuwsbrief fail', e.message); return []; }
}
function parseRTVOostECHT(html){
  const items=[]; let m;
  console.log('[RTV Oost vechtdal] HTML len', html.length);
  const reReal = /<div[^>]*publishedAt=["']([^"']+)["'][^>]*>[\s\S]*?<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-overijssel)[^"']{10,150})["'][^>]*>[\s\S]*?<div[^>]*class="[^"]*name-label[^"]*"[^>]*>([^<]{2,20})<\/div>[\s\S]*?<h[2-3][^>]*>([^<]{12,200})<\/h3>/gi;
  while((m=reReal.exec(html))!==null && items.length<25){
    let dateStr=m[1]; let link=m[2]; if(link.startsWith('/')) link='https://www.oost.nl'+link;
    let category=m[3].trim().toUpperCase(); let title=m[4].trim();
    if(['ALLE NIEUWS','ZWOLLE','TWENTE'].includes(title.toUpperCase())) continue;
    let pd=new Date(dateStr); if(isNaN(pd.getTime())) pd=new Date();
    let finalTitle = ['NIEUWS','112','ECONOMIE','SPORT'].includes(category) ? category+': '+title : title;
    if(!items.find(x=>x.link===link)) items.push({title:finalTitle, link, pubDate:pd, description:title+' [...]'});
  }
  if(items.length===0){
    const re2 = /<div[^>]*publishedAt=["']([^"']+)["'][^>]*>[\s\S]*?<a[^>]+href=["'](\/nieuws\/[^"']{10,150})["'][^>]*>[\s\S]*?<h[2-3][^>]*>([^<]{12,200})<\/h3>/gi;
    while((m=re2.exec(html))!==null && items.length<25){
      let dateStr=m[1]; let link=m[2]; if(link.startsWith('/')) link='https://www.oost.nl'+link;
      let title=m[3].trim(); if(title.toLowerCase().includes('alle nieuws')) continue;
      let pd=new Date(dateStr); if(isNaN(pd.getTime())) continue;
      if(!items.find(x=>x.link===link)) items.push({title, link, pubDate:pd, description:title+' [...]'});
    }
  }
  if(items.length>0){ items.sort((a,b)=>b.pubDate-a.pubDate); console.log('[RTV Oost] gevonden', items.length, 'met echte publishedAt'); return items; }
  const pollCache=getOostPollCache(); let dirty=false; const now=new Date();
  function getPoll(link){ if(pollCache[link]){const d=new Date(pollCache[link]); if(!isNaN(d.getTime())) return d;} const d=new Date(now); pollCache[link]=d.toISOString(); dirty=true; return d; }
  const reBlock = /<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-overijssel)[^"']{10,150})["'][^>]*>([\s\S]*?)<\/a>/gi;
  let blockMatch; while((blockMatch=reBlock.exec(html))!==null && items.length<20){
    let link=blockMatch[1]; if(link.startsWith('/')) link='https://www.oost.nl'+link;
    let inner=blockMatch[2]; let catMatch=inner.match(/<(?:span|div)[^>]*>\s*(NIEUWS|112|ECONOMIE|SPORT)\s*<\/(?:span|div)>/i); let category=catMatch?catMatch[1].toUpperCase():''; let titleMatch=inner.match(/<h[23][^>]*>([^<]{12,180})<\/h[23]>/i); let title=titleMatch?titleMatch[1].trim():''; if(!title||title.length<12) continue;
    if(['alle nieuws','zwolle','twente','enschede','vechtdal','salland','kop van overijssel'].includes(title.toLowerCase())) continue;
    let finalTitle=category?category+': '+title:title;
    if(!items.find(x=>x.link===link)) items.push({title:finalTitle, link, pubDate:getPoll(link), description:title+' [...]'});
  }
  if(dirty) setOostPollCache(pollCache);
  items.sort((a,b)=>b.pubDate-a.pubDate);
  console.log('[RTV Oost] gevonden', items.length, 'met fallback');
  return items;
}



async function loadOneSource(b){
  const cfg = BRON_URLS[b.id];
  try{
    let arts=[];
    const parser = BRON_PARSERS[b.id];
    if(!parser) throw new Error('geen parser voor '+b.id+' in parsing/ map');
    const rawData = await fetchViaWorker(cfg.url);
    try{ arts = await parser(rawData, b.id); }catch(e){ try{ arts = await parser(rawData); }catch(e2){ throw e; } }
    if(arts.length===0 && cfg.fallback){
      try{ const raw2 = await fetchViaWorker(cfg.fallback); try{ arts = await parser(raw2, b.id); }catch{ arts = await parser(raw2); } }catch{}
    }
    if(arts.length===0 && b.id==='Vechtdal Centraal'){
      try{
        const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://www.vechtdalcentraal.nl/feed/')}&t=${Date.now()}`;
        const rRss = await fetch(rss2jsonUrl, {cache:'no-store'});
        if(rRss.ok){ const j = await rRss.json(); if(j.status==='ok' && j.items && j.items.length>0){ arts = j.items.slice(0,10).map(it=>({title: it.title.replace(/<[^>]*>/g,'').trim(), link: it.link, pubDate: it.pubDate ? new Date(it.pubDate) : new Date(), description: (it.description||'').replace(/<[^>]*>/g,' ').slice(0,180)+' [...]'})); } }
      }catch(e){}
    }
    if(arts.length===0) throw new Error('empty na parsing uit parsing/'+b.id+'.js');
    return arts.map(a=>({...a, source:b.name, id:b.id, isFallback:false, pubDate:a.pubDate||new Date(), description:a.description||(a.title+' [...]')}));
  }catch(e){
    console.log('load fail', b.id, e.message);
    return [{title:b.name, link:cfg.homepage, pubDate:new Date(0), description:'Bron tijdelijk offline - homepage [...]', source:b.name, id:b.id, isFallback:true}];
  }
}

function highlightArticleByLink(link){
  try{
    const container=document.getElementById('news-container');
    if(!container) return;
    // wacht tot artikelen gerenderd zijn
    setTimeout(()=>{
      const articles = container.querySelectorAll('.article');
      for(const el of articles){
        const a = el.querySelector('a');
        if(a && a.href && link && (a.href===link || link.includes(a.href) || a.href.includes(link) || el.dataset.link===link)){
          el.classList.add('highlight');
          el.scrollIntoView({behavior:'smooth', block:'center'});
          setTimeout(()=>{ el.classList.remove('highlight'); }, 5000);
          console.log('[v325 - datum uit overzicht (free tier, geen detail fetch) - free tier: geen 30 sec sync, alleen 5 min + visibilitychange, debounce 5s - v297 met account + Alles uit fix + low KV] highlight article', link);
          break;
        }
      }
      // als niet gevonden, check of het nieuwsbrief artikel is dat net gepusht is
      if(window._lastPushRealArticle && window._lastPushRealArticle.link===link){
        // voeg tijdelijk toe bovenaan als highlight
        const art = window._lastPushRealArticle;
        const div=document.createElement('div');
        div.className='article highlight';
        div.innerHTML=`<h2><a href="${art.link}" target="_blank">${art.title}</a> <span style="background:#16a34a;color:white;padding:2px 6px;border-radius:4px;font-size:11px">NIEUW via push</span></h2><small>${art.source} - zojuist</small><div style="margin-top:6px;color:#555;">${art.description||art.title}</div>`;
        container.prepend(div);
        div.scrollIntoView({behavior:'smooth', block:'center'});
        setTimeout(()=>{ div.classList.remove('highlight'); }, 5000);
      }
    }, 500);
  }catch(e){ console.log('highlight fail', e.message); }
}
function isSameDay(d1,d2){
  if(!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate();
}
function formatDate(d, sourceId){
  if(!d || isNaN(d.getTime()) || d.getTime()===0) return '';
  const dateStr = d.toLocaleDateString('nl-NL',{day:'numeric', month:'short'});
  if(d.getHours()===0 && d.getMinutes()===0 && d.getSeconds()===0){
    return dateStr;
  }
  const timeStr = d.toLocaleTimeString('nl-NL',{hour:'2-digit', minute:'2-digit'});
  return `${dateStr} ${timeStr}`;
}
function renderArticles(){
  const container=document.getElementById('news-container'); if(!container) return;
  const search = (document.getElementById('search-input')?.value||'').toLowerCase();
  const today = new Date();
  let filtered = allArticles.filter(a=>{
    const s=state[a.id];
    if(!s || !s.aan) return false;
    if(s.vandaag){
      if(a.isFallback) return false;
      if(!a.pubDate || isNaN(a.pubDate.getTime())) return false;
      if(!isSameDay(a.pubDate, today)) return false;
    }
    if(s.scope==='gemeente'){
      if(!isGemeenteArtikel(a)) return false;
    }
    return true;
  });
  if(search) filtered = filtered.filter(a=> (a.title+' '+a.description+' '+a.source).toLowerCase().includes(search));
  filtered = filtered.sort((a,b)=>b.pubDate - a.pubDate);
  const realCount = filtered.filter(a=>!a.isFallback).length;
  const vandaagActive = Object.values(state).some(s=>s.aan && s.vandaag);
  const gemeenteActive = Object.values(state).some(s=>s.aan && s.scope==='gemeente');
  let filterLabel = '';
  if(vandaagActive) filterLabel += ' (alleen vandaag)';
  if(gemeenteActive) filterLabel += vandaagActive ? ' + gemeente' : ' (alleen gemeente Ommen)';
  const countHtml = `<div class="articles-count">${realCount} artikelen${filterLabel} - ${loadedSources.size} v/d ${BRONNEN.length} bronnen geladen</div>`;
  if(filtered.length===0){
    if(vandaagActive || gemeenteActive) container.innerHTML = countHtml + '<div class="article" style="color:#666;padding:20px;text-align:center;">Geen artikelen gevonden met dit filter.<br>Zet op REGIO of MEER om meer te zien.</div>';
    else container.innerHTML = countHtml + '<div class="article">Geen artikelen</div>';
    return;
  }
  const html = filtered.map(a=>{
    const cleanTitle = a.title.replace(/^\[[^\]]+\]\s*/,'').trim() || a.title;
    if(a.isFallback){
      return `<div class="article fallback" data-source="${a.id}"><h2><a href="${a.link}" target="_blank">${a.source}</a></h2><small>${a.source}${a.pubDate.getTime()?` - ${formatDate(a.pubDate, a.id)}`:''}</small><div style="margin-top:6px;color:#666;">${a.description}</div></div>`;
    }
    return `<div class="article" data-source="${a.id}"><h2><a href="${a.link}" target="_blank">${cleanTitle}</a></h2><small>${a.source} - ${formatDate(a.pubDate, a.id)}</small>${a.description?`<div style="margin-top:6px;color:#555;">${a.description}</div>`:''}</div>`;
  }).join('');
  container.innerHTML = countHtml + html;
  window.getAllArticles = ()=> filtered;
  try{ if(typeof updateSourceLeds==='function') setTimeout(()=>updateSourceLeds(), 20); }catch{}
  // v275 fix 0/0 - update filter counts after articles filtered
  try{ const list=document.getElementById('source-list'); if(list && list.children.length>0){ /* counts will be updated on next renderFilters */ } }catch{}
}
function filterNews(){ renderArticles(); }
async function refreshNews(){
  const c=document.getElementById('news-container');
  // PERF v239: 1. Direct stale cache tonen (<200ms)
  let hasStale=false;
  const initialArts=[];
  try{
    for(const b of BRONNEN){
      const cfg=BRON_URLS[b.id];
      const cachedData=getCachedSource(cfg.url) || getStaleSource(cfg.url);
      if(cachedData){
        try{
          let arts=[];
          if(cfg.type==='gemeente') arts=parseGemeenteOverview(cachedData);
          else if(b.id==='Nieuwsbrief'){ const json=await fetchViaWorker(cfg.url); arts=parseNieuwsbriefECHT(json); }
    else if(cfg.type==='oost') arts=parseOostFull(cachedData);
          else if(b.id==='RTV Vechtdal'){ try{ arts=parseRTVVechtdalFull(cachedData); }catch{} if(arts.length===0) arts=parseRSSFull(cachedData,b.id); }
          else if(b.id==='Vechtdal Centraal'){ if(cachedData.includes('<rss')||cachedData.includes('<item')) arts=parseRSSFull(cachedData,b.id); else arts=parseVechtdalCentraalFallback(cachedData); }
          else arts=parseRSSFull(cachedData,b.id);
          if(arts.length>0){ initialArts.push(...arts.map(a=>({...a, source:b.name, id:b.id, isFallback:false}))); hasStale=true; }
        }catch(e){}
      }
    }
  }catch(e){}
  if(hasStale && initialArts.length>0){
    allArticles=initialArts;
    loadedSources=new Set(BRONNEN.map(b=>b.id));
    updateHeaderCount(); renderArticles(); renderFilters(); updateSourceLeds();
    if(c) c.querySelector('.articles-count')?.insertAdjacentHTML('afterend', '<div style="font-size:11px;color:#16a34a;padding:0 2px 6px">⚡ Uit cache - wordt ververst...</div>');
    console.log('[perf v239] stale cache getoond', initialArts.length);
  } else {
    if(c) c.innerHTML='<div class="article">Bezig met laden... (9 bronnen) - eerste keer iets langer, daarna <1 sec</div>';
    allArticles=[]; loadedSources=new Set(); updateHeaderCount();
  }
  const loadWithTimeout = async (b) => {
    try {
      const timeout = new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout '+b.id)), 8000));
      const arts = await Promise.race([loadOneSource(b), timeout]);
      return {b, arts};
    } catch(e){
      console.log('load timeout/fail', b.id, e.message);
      if(hasStale) return {b, arts:[]};
      return {b, arts:[{title:b.name, link:BRON_URLS[b.id].homepage, pubDate:new Date(0), description:'Bron tijdelijk offline - '+e.message.slice(0,80)+' [...]', source:b.name, id:b.id, isFallback:true}]};
    }
  };
  const results = await Promise.allSettled(BRONNEN.map(b=>loadWithTimeout(b)));
  const freshArts=[];
  results.forEach(r=>{
    if(r.status==='fulfilled'){
      const {b, arts}=r.value;
      if(arts.length>0) freshArts.push(...arts);
      loadedSources.add(b.id);
    }
  });
  if(freshArts.length>0) allArticles=freshArts;
  updateHeaderCount(); renderArticles(); renderFilters(); updateSourceLeds();
  console.log('refreshNews klaar v275 FIX 0/0', allArticles.length, 'artikelen');
}
document.addEventListener('DOMContentLoaded', ()=>{
  loadState(); renderFilters(); saveState(); restorePanelState(); setupFilterHeader();
  document.getElementById('search-input')?.addEventListener('input', filterNews);
  setTimeout(()=>refreshNews(), 200);
});
window.closePanel=closePanel; window.resetFilters=resetFilters; window.BRONNEN=BRONNEN; window.getAppState=()=>state;
window.filterNews=filterNews; window.refreshNews=refreshNews;

// ===== v226.2 LIVE SYNC + NOTIFICATIE =====
(function(){
  const SYNC_ENABLED = true;
  const SYNC_INTERVAL_MS = 30000;
  let currentUser = null;
  let authToken = localStorage.getItem('ommen_auth_token') || null;
  let lastRemoteUpdated = parseInt(localStorage.getItem('ommen_last_sync')||'0', 10);
  let isSyncing = false;
  let notifPermissionAsked = false;

  function getAuthHeaders(){
    return authToken ? {'Authorization': 'Bearer '+authToken, 'Content-Type':'application/json'} : {'Content-Type':'application/json'};
  }

  async function checkLogin(){
    if(!authToken) return null;
    try{
      const r = await fetch(WORKER+'/auth/me', {headers: getAuthHeaders()});
      if(!r.ok){ logout(); return null; }
      const u = await r.json();
      currentUser = u.user || u;
      return currentUser;
    }catch{ return null; }
  }

  window.loginOmmen = async function(email, password){
    const r = await fetch(WORKER+'/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password})});
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'Login mislukt');
    authToken = j.token;
    localStorage.setItem('ommen_auth_token', authToken);
    currentUser = {id:j.id||j.user?.id, email:j.email||j.user?.email};
    await loadFromCloud(true);
    updateAuthUI();
    startLiveSync();
    ensureNotificationPermission();
    return j;
  };

  window.registerOmmen = async function(email, password){
    const r = await fetch(WORKER+'/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password})});
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'Registratie mislukt');
    authToken = j.token;
    localStorage.setItem('ommen_auth_token', authToken);
    currentUser = {id:j.id||j.user?.id, email:j.email||j.user?.email};
    await saveToCloud();
    updateAuthUI();
    startLiveSync();
    ensureNotificationPermission();
    return j;
  };

  window.logoutOmmen = function(){
    if(authToken) fetch(WORKER+'/auth/logout', {method:'POST', headers: getAuthHeaders(), body: JSON.stringify({token: authToken})}).catch(()=>{});
    authToken = null;
    currentUser = null;
    localStorage.removeItem('ommen_auth_token');
    localStorage.removeItem('ommen_last_sync');
    lastRemoteUpdated = 0;
    stopLiveSync();
    updateAuthUI();
  };

  async function ensureNotificationPermission(){
    if(!('Notification' in window)) return;
    if(Notification.permission === 'default' && !notifPermissionAsked){
      notifPermissionAsked = true;
      try{ await Notification.requestPermission(); }catch{}
    }
  }

  function showSyncNotification(isBackground){
    try{
      if(navigator.serviceWorker && navigator.serviceWorker.controller){
        navigator.serviceWorker.controller.postMessage({type: 'SYNC_UPDATED'});
      } else if(navigator.serviceWorker && navigator.serviceWorker.ready){
        navigator.serviceWorker.ready.then(reg => {
          if(reg.active) reg.active.postMessage({type: 'SYNC_UPDATED'});
        });
      }
    }catch{}

    if(!isBackground){
      const toast = document.createElement('div');
      toast.textContent = '✓ Filters gesynchroniseerd';
      toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#065f46;color:white;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,0.2);opacity:0;transition:opacity 0.3s';
      document.body.appendChild(toast);
      setTimeout(()=>{ toast.style.opacity='1'; }, 50);
      setTimeout(()=>{ toast.style.opacity='0'; setTimeout(()=>toast.remove(), 400); }, 3000);
    }
  }

  let pendingSave = false;
  async function saveToCloud(){
    if(!authToken || !SYNC_ENABLED) return;
    if(isSyncing){
      pendingSave = true;
      console.log('[sync] save queued, isSyncing true');
      return;
    }
    try{
      isSyncing = true;
      console.log('[sync] saving state to cloud, items:', Object.keys(state).length);
      const r = await fetch(WORKER+'/sync/save', {method:'POST', headers: getAuthHeaders(), body: JSON.stringify({state})});
      const j = await r.json().catch(()=>({}));
      console.log('[sync] save response', j);
      if(r.ok && (j.ok || j.updated)){
        const updated = j.updated || Date.now();
        lastRemoteUpdated = updated;
        localStorage.setItem('ommen_last_sync', String(updated));
        console.log('[sync] saved ok, updated:', updated);
      } else {
        console.warn('[sync] save failed', j);
      }
    }catch(e){ console.log('Sync save fail', e.message); }
    finally{ 
      isSyncing = false; 
      if(pendingSave){
        pendingSave = false;
        console.log('[sync] processing queued save');
        setTimeout(()=>saveToCloud(), 300);
      }
    }
  }

  async function loadFromCloud(force=false){
    if(!authToken){
      console.log('[sync] load skipped, no authToken');
      return false;
    }
    if(isSyncing && !force){
      console.log('[sync] load skipped, isSyncing true and not force');
      return false;
    }
    let didUpdate = false;
    try{
      if(!force) isSyncing = true;
      console.log('[sync] loading from cloud, force=', force, 'lastRemote=', lastRemoteUpdated);
      const r = await fetch(WORKER+'/sync/load', {headers: getAuthHeaders()});
      console.log('[sync] load status', r.status);
      if(!r.ok){
        const errTxt = await r.text().catch(()=>'' );
        console.warn('[sync] load failed status', r.status, errTxt);
        return false;
      }
      const data = await r.json();
      console.log('[sync] load data', {hasState: !!data.state, updated: data.updated, keys: data.state?Object.keys(data.state).length:0});
      if(!data.state){
        console.log('[sync] no remote state');
        return false;
      }
      const remoteUpdated = data.updated || 0;
      if(!force && remoteUpdated && remoteUpdated <= lastRemoteUpdated && lastRemoteUpdated!==0){
        console.log('[sync] remote not newer, skipping', remoteUpdated, '<=', lastRemoteUpdated);
        // Still check if local differs though
        const localStr = JSON.stringify(state);
        const remoteStr = JSON.stringify(data.state);
        if(localStr === remoteStr){
          return false;
        }
        // If different but remote older, still apply? No, keep local wins
        // But for debugging, log
        console.log('[sync] local differs but remote older, keeping local');
        return false;
      }
      const localStr = JSON.stringify(state);
      const remoteStr = JSON.stringify(data.state);
      console.log('[sync] compare', {localLen: localStr.length, remoteLen: remoteStr.length, equal: localStr===remoteStr});
      if(localStr === remoteStr){
        if(remoteUpdated) { lastRemoteUpdated = remoteUpdated; localStorage.setItem('ommen_last_sync', String(remoteUpdated)); }
        console.log('[sync] states equal, no update needed');
        return false;
      }
      console.log('[sync] applying remote state');
      state = data.state;
      // Ensure all bronnen exist
      try{ BRONNEN.forEach(b=>{ if(!state[b.id]) state[b.id]={aan:true, vandaag:false, scope:'gemeente'}; }); }catch{}
      localStorage.setItem('nieuwsommen_bronnen_v2', JSON.stringify(state));
      lastRemoteUpdated = remoteUpdated || Date.now();
      localStorage.setItem('ommen_last_sync', String(lastRemoteUpdated));
      if(typeof renderFilters==='function'){ renderFilters(); }
      if(typeof filterNews==='function'){ filterNews(); }
      if(typeof updateHiddenCompat==='function'){ updateHiddenCompat(); }
      if(typeof updateHeaderCount==='function'){ updateHeaderCount(); }
      if(window.updatePushBell) try{ window.updatePushBell(); }catch{}
      try{ if(window.pushFiltersToSW) window.pushFiltersToSW(); }catch{}
      updateAuthUI();
      didUpdate = true;
      const isBg = document.visibilityState !== 'visible';
      if(!force){
        showSyncNotification(isBg);
      } else {
        console.log('[sync] force load applied');
      }
    }catch(e){ console.log('Sync load fail', e.message, e.stack); }
    finally{ isSyncing = false; }
    return didUpdate;
  }

  let liveInterval = null;
  function startLiveSync(){
    stopLiveSync();
    if(!authToken) return;
    liveInterval = setInterval(()=>{ loadFromCloud(false); }, SYNC_INTERVAL_MS);
  }
  function stopLiveSync(){
    if(liveInterval){ clearInterval(liveInterval); liveInterval=null; }
  }

  function updateAuthUI(){
    const btn = document.getElementById('user-icon-btn');
    const oldSlot = document.getElementById('auth-slot');
    if(oldSlot) oldSlot.remove();
    if(!btn) return;
    if(currentUser){
      btn.classList.add('logged-in');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" clip-rule="evenodd"/></svg>';
      btn.title = currentUser.email + ' - ingelogd (● live)';
      btn.onclick = function(){
        const old = document.getElementById('login-modal'); if(old) old.remove();
        const overlay = document.createElement('div');
        overlay.id='login-modal';
        overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
        const box = document.createElement('div');
        box.style.cssText='background:white;border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,0.2);color:#111';
        const emailSafe = (currentUser.email || currentUser.user?.email || '').replace(/</g,'&lt;');
        box.innerHTML = `<h[2-3] style="margin:0 0 8px;font-size:18px">Ingelogd als</h[2-3]>
          <p style="margin:0 0 16px;color:#374151;font-size:13px;word-break:break-all">${emailSafe}<br><span style="font-size:11px;color:#059669;font-weight:700">● live sync elke 30 sec</span></p>
          <div style="display:flex;gap:8px"><button id="btn-sync-now" style="flex:1;padding:10px;background:#0b5bd3;color:white;border:0;border-radius:8px;font-weight:600;cursor:pointer">Sync nu</button><button id="btn-logout-now" style="flex:1;padding:10px;background:#fee2e2;color:#991b1b;border:0;border-radius:8px;font-weight:600;cursor:pointer">Uitloggen</button></div>
          <button id="btn-close-acc" style="width:100%;margin-top:10px;padding:8px;background:transparent;border:0;color:#666;cursor:pointer">Sluiten</button>`;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.getElementById('btn-close-acc').onclick=()=>overlay.remove();
        document.getElementById('btn-logout-now').onclick=()=>{ overlay.remove(); window.logoutOmmen(); };
        document.getElementById('btn-sync-now').onclick=async()=>{
          const btn=document.getElementById('btn-sync-now');
          const origText=btn.textContent;
          btn.textContent='Bezig...'; btn.disabled=true;
          try{
            await saveToCloud();
            const ok = await loadFromCloud(true);
            btn.textContent='✓ Gesynced!';
            btn.style.background='#16a34a';
            // Toast bevestiging
            try{
              let toast=document.getElementById('ommen-toast');
              if(!toast){
                toast=document.createElement('div');
                toast.id='ommen-toast';
                toast.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#16a34a;color:white;padding:12px 20px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;font-weight:600;font-size:14px;';
                document.body.appendChild(toast);
              }
              toast.textContent='✓ Filters gesynchroniseerd om '+new Date().toLocaleTimeString();
              toast.style.display='block';
              setTimeout(()=>{ if(toast) toast.style.display='none'; }, 3000);
            }catch{}
            setTimeout(()=>{ overlay.remove(); }, 1200);
          }catch(e){
            btn.textContent='Fout: '+e.message;
            btn.style.background='#dc2626';
            setTimeout(()=>{ btn.textContent=origText; btn.disabled=false; btn.style.background='#0b5bd3'; }, 2500);
          }
        };
        overlay.onclick=(e)=>{ if(e.target===overlay) overlay.remove(); };
      };
    } else {
      btn.classList.remove('logged-in');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" clip-rule="evenodd"/></svg>';
      btn.title = 'Inloggen / Account maken';
      btn.onclick = openLoginModal;
    }
  }

  function openLoginModal(){
    const old = document.getElementById('login-modal'); if(old) old.remove();
    const overlay = document.createElement('div');
    overlay.id='login-modal';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    const box = document.createElement('div');
    box.style.cssText='background:white;border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,0.2)';
    const h3 = document.createElement('h3'); h3.textContent='Inloggen voor sync & nieuwsbrief'; h3.style.margin='0 0 8px'; h3.style.fontSize='18px';
    const p = document.createElement('p'); p.textContent='Je filters worden live gesynchroniseerd én je ontvangt de nieuwsbrief met belangrijke updates (max 1-2 per maand).'; p.style.cssText='margin:0 0 16px;color:#666;font-size:13px';
    const inpEmail = document.createElement('input'); inpEmail.type='email'; inpEmail.placeholder='Email'; inpEmail.id='auth-email'; inpEmail.style.cssText='width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:10px;box-sizing:border-box';
    const inpPass = document.createElement('input'); inpPass.type='password'; inpPass.placeholder='Wachtwoord (min 6 tekens)'; inpPass.id='auth-pass'; inpPass.style.cssText='width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:16px;box-sizing:border-box';
    const row = document.createElement('div'); row.style.cssText='display:flex;gap:8px';
    const btnLogin = document.createElement('button'); btnLogin.textContent='Inloggen'; btnLogin.style.cssText='flex:1;padding:10px;background:#0b5bd3;color:white;border:0;border-radius:8px;font-weight:600;cursor:pointer';
    const btnReg = document.createElement('button'); btnReg.textContent='Account maken'; btnReg.style.cssText='flex:1;padding:10px;background:#e8eef8;color:#0b5bd3;border:0;border-radius:8px;font-weight:600;cursor:pointer';
    const btnClose = document.createElement('button'); btnClose.textContent='Annuleren'; btnClose.style.cssText='width:100%;margin-top:10px;padding:8px;background:transparent;border:0;color:#666;cursor:pointer';
    const errDiv = document.createElement('div'); errDiv.id='auth-error'; errDiv.style.cssText='margin-top:10px;color:#c00;font-size:13px';
    btnClose.onclick=function(){ overlay.remove(); };
    btnLogin.onclick=async function(){
      const email=inpEmail.value.trim(); const pass=inpPass.value;
      errDiv.textContent='Bezig...';
      try{ await window.loginOmmen(email, pass); overlay.remove(); }catch(e){ errDiv.textContent=e.message; }
    };
    btnReg.onclick=async function(){
      const email=inpEmail.value.trim(); const pass=inpPass.value;
      errDiv.textContent='Bezig...';
      try{ await window.registerOmmen(email, pass); overlay.remove(); }catch(e){ errDiv.textContent=e.message; }
    };
    row.appendChild(btnLogin); row.appendChild(btnReg);
    box.appendChild(h3); box.appendChild(p); box.appendChild(inpEmail); box.appendChild(inpPass); box.appendChild(row); box.appendChild(btnClose); box.appendChild(errDiv);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  if(typeof saveState === 'function'){
    const origSave = saveState;
    let saveTimeout = null;
    window.saveState = function(){
      try{ origSave(); }catch{}
      localStorage.setItem('nieuwsommen_bronnen_v2', JSON.stringify(state));
      try{ if(typeof updateHiddenCompat==='function') updateHiddenCompat(); }catch{}
      try{ if(typeof updateHeaderCount==='function') updateHeaderCount(); }catch{}
      try{ if(window.updatePushBell) window.updatePushBell(); }catch{}
      if(authToken){
        // debounce cloud save 500ms
        if(saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(()=>{ saveToCloud(); }, 500);
      }
    };
  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(async function(){
      const oldAuthSlot = document.getElementById('auth-slot');
      if(oldAuthSlot) oldAuthSlot.remove();
      await checkLogin();
      if(currentUser){
        await loadFromCloud(true);
        startLiveSync();
        ensureNotificationPermission();
      }
      updateAuthUI();
      document.addEventListener('visibilitychange', function(){
        if(document.visibilityState==='visible' && currentUser){
          loadFromCloud(false);
        }
      });
    }, 800);
  });
})();

// ===== v227 FILTER BRIDGE VOOR SERVICE WORKER v231 =====
(function(){
  function getSelectedSourcesForSW(){
    try{
      if(typeof state !== 'object') return [];
      const selected = [];
      for(const bron of BRONNEN){
        const s = state[bron.id];
        if(s && s.aan){
          selected.push(bron.id);
        }
      }
      return selected;
    }catch(e){ return []; }
  }

  window.pushFiltersToSW = function(){
    const sources = getSelectedSourcesForSW();
    // 1. Naar Service Worker
    try{
      if(navigator.serviceWorker && navigator.serviceWorker.controller){
        navigator.serviceWorker.controller.postMessage({type:'SET_FILTERS', sources: sources});
      }
      navigator.serviceWorker.ready.then(reg=>{
        if(reg.active) reg.active.postMessage({type:'SET_FILTERS', sources: sources});
      }).catch(()=>{});
    }catch(e){}
    // 2. Naar IndexedDB voor offline fallback
    try{
      const req = indexedDB.open('nieuws-ommen', 1);
      req.onupgradeneeded = (e)=>{
        const db = e.target.result;
        if(!db.objectStoreNames.contains('settings')){
          db.createObjectStore('settings');
        }
      };
      req.onsuccess = (e)=>{
        const db = e.target.result;
        try{
          const tx = db.transaction('settings','readwrite');
          const store = tx.objectStore('settings');
          store.put(sources, 'selectedSources');
        }catch(err){}
      };
    }catch(e){}
    console.log('[v227] Filters naar SW gepusht:', sources);
  };

  // Service Worker vraagt om filters (GET_FILTERS)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', event=>{
      if(event.data && event.data.type === 'GET_FILTERS'){
        const sources = getSelectedSourcesForSW();
        if(event.ports && event.ports[0]){
          event.ports[0].postMessage({sources: sources});
        }
      }
    });
  }

  // Bij load ook meteen pushen
  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{ try{ window.pushFiltersToSW(); }catch(e){} }, 1500);
  });

  // Bij visibility change (terugkomen in app) ook pushen
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible'){
      try{ window.pushFiltersToSW(); }catch(e){}
    }
  });
})();
