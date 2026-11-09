// Parserfuncties letterlijk overgenomen uit de herstelde app.js.
// Alleen de browseropslag is hier een tijdelijke geheugenadapter voor de geïsoleerde dry-run.
const MAX_PER_BRON = {'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Nieuwsbrief':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':10,'RTV Vechtdal':10};
const __parserCache = new Map();
// Worker-compatible transport used only by the unchanged Gemeente detail-enrichment function.
async function fetchViaWorker(url){
  const direct = await fetch(url,{headers:{"Accept":"text/html"},redirect:"follow",signal:AbortSignal.timeout(12000)});
  if(direct.ok){
    const html=await direct.text();
    if(html.length>500)return html;
  }
  const proxyUrl="https://api.allorigins.win/get?url="+encodeURIComponent(url);
  const proxy=await fetch(proxyUrl,{signal:AbortSignal.timeout(12000)});
  if(!proxy.ok)throw new Error("Gemeente detail HTTP "+proxy.status);
  const data=await proxy.json();
  if(data.contents&&data.contents.length>200)return data.contents;
  throw new Error("Gemeente detail response leeg");
}

const localStorage = {
  getItem(key){ return __parserCache.has(key) ? __parserCache.get(key) : null; },
  setItem(key,value){ __parserCache.set(key,String(value)); },
  removeItem(key){ __parserCache.delete(key); }
};
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
      return {title: title.slice(0,120), link, pubDate, description: desc.length>200 ? desc.slice(0,200).trimEnd()+' […]' : desc, fullText: desc, source:'Nieuwsbrief', id:'Nieuwsbrief'};
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

function parseOostFull_OLD(html){
  const max = MAX_PER_BRON['RTV Oost'];
  const patterns = [
    /<a[^>]+href=["'](\/nieuws\/[^"']*ommen[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+href=["'](https:\/\/www\.oost\.nl\/nieuws\/[^"']*ommen[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
  ];
  const uniqMap=new Map();
  for(const re of patterns){
    let mm;
    while((mm=re.exec(html))!==null && uniqMap.size<max){
      const href=mm[1]; let text=mm[2].replace(/<[^>]*>/g,'').trim();
      if(text.length<10 || text.length>200) continue;
      const full=href.startsWith('http')?href:'https://www.rtvoost.nl'+href;
      if(!uniqMap.has(full)) uniqMap.set(full, text);
    }
  }
  return Array.from(uniqMap.entries()).slice(0,max).map(([link,title])=>({title:title.slice(0,120), link, pubDate:new Date(), description:'[...]'}));
}

function parseVechtdalCentraalFallback_OLD(html){
  const max = MAX_PER_BRON['Vechtdal Centraal'];
  const re = /<a[^>]+href=["']([^"']*\/[^"']+)["'][^>]*>\s*<h[23][^>]*>([^<]{8,120})<\/h[23]>/gi;
  const map=new Map();
  let m;
  while((m=re.exec(html))!==null && map.size<max){
    let href=m[1], title=m[2].trim();
    if(href.startsWith('/')) href='https://www.vechtdalcentraal.nl'+href;
    if(!href.includes('vechtdalcentraal.nl')) continue;
    if(href.includes('/category/') || href.includes('/tag/') || href.includes('#')) continue;
    if(!map.has(href)) map.set(href, title);
  }
  return Array.from(map.entries()).slice(0,max).map(([link,title])=>({title, link, pubDate:new Date(), description:'[...]'}));
}

function parseOostFull(html){
  const echt = parseRTVOostECHT(html);
  if(echt.length>0) return echt;
  return parseOostFull_OLD(html);
}

function parseVechtdalCentraalFallback(html){
  const echt = parseVechtdalCentraalECHT(html);
  if(echt.length>0) return echt;
  return parseVechtdalCentraalFallback_OLD(html);
}

function parseRTVVechtdalFull(html){
  return parseRTVVechtdalECHT(html);
}

function parseRSSFull(xml, bronId){
  const max = MAX_PER_BRON[bronId] || 10;
  let items = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)];
  if(items.length===0) items = [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)];
  items = items.slice(0,max);
  return items.map(m=>{
    const it=m[0];
    let title=(it.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)||[])[1]||'';
    title=title.replace(/<[^>]*>/g,'').trim();
    let link=(it.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]||'';
    if(!link || link.includes('<')) {
      const hrefMatch = it.match(/<link[^>]+href=["']([^"']+)["']/i);
      if(hrefMatch) link=hrefMatch[1];
    }
    link=link.replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'').trim();
    if(!link.startsWith('http')){ const mm=it.match(/https?:\/\/[^\s<"\]]+/); if(mm) link=mm[0]; }
    let pub=(it.match(/<(pubDate|published|updated)[^>]*>([\s\S]*?)<\/(pubDate|published|updated)>/i)||[])[2]||'';
    let desc=(it.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)||[])[1]||'';
    let content=(it.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i)||[])[1]||'';
    if(!desc) {
      const summ = (it.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)||[])[1]||'';
      desc=summ;
    }
    let useDesc = (content || desc || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(useDesc.length>180) useDesc=useDesc.slice(0,177)+' [...]';
    else if(useDesc) useDesc=useDesc+' [...]';
    return {title, link, pubDate:pub?new Date(pub):new Date(), description:useDesc};
  }).filter(x=>x.link && x.title);
}

function extractGemeenteDate(html){
  // v291 debug
  // console.log('[v291] extractGemeenteDate html len', html.length);
  const months={januari:0,februari:1,maart:2,april:3,mei:4,juni:5,juli:6,augustus:7,september:8,oktober:9,november:10,december:11};
  function mkDate(m){
    try{
      const day=parseInt(m[1]); const mon=months[m[2].toLowerCase()]; const year=parseInt(m[3]); const hh=parseInt(m[4]); const mm=parseInt(m[5]);
      if(mon===undefined) return null;
      return new Date(year, mon, day, hh, mm);
    }catch{ return null; }
  }
  // Strip tags to spaces for date+time that are split over divs like "28 juli 2026,</div><div>17:17"
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const htmlNoTags = text;

  // 1) echte tijd samen: "28 juli 2026, 17:17" of "28 juli 2026,\n 17:17" of "28 juli 2026 - 17:17" of "28 juli 2026 om 17:17"
  // Nieuw: tolereer ook newline en extra comma tussen datum en tijd
  let patterns = [
    /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})\s*,?\s*(?:om|\-)?\s*(\d{1,2})\s*:\s*(\d{2})/i,
    /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})[^\d]{0,20}(\d{1,2})\s*:\s*(\d{2})/i
  ];
  for(const re of patterns){
    let m = htmlNoTags.match(re);
    if(m){
      const d=mkDate(m);
      if(d && !isNaN(d.getTime())) return d;
    }
    // Also try on raw html with tags replaced by space (covers <div> split)
    m = html.replace(/<[^>]*>/g, ' ').match(re);
    if(m){
      const d=mkDate(m);
      if(d && !isNaN(d.getTime())) return d;
    }
  }

  // 1b) datum en tijd los: zoek datum, en dan tijd binnen 300 chars erna (voor "28 juli 2026,\n\n17:17" over 2 divs)
  let dateOnly = htmlNoTags.match(/(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i);
  if(dateOnly){
    const idx = htmlNoTags.toLowerCase().indexOf(dateOnly[0].toLowerCase());
    if(idx>=0){
      const after = htmlNoTags.substring(idx, idx+400);
      const timeMatch = after.match(/(\d{1,2})\s*:\s*(\d{2})/);
      if(timeMatch){
        const day=parseInt(dateOnly[1]); const mon=months[dateOnly[2].toLowerCase()]; const year=parseInt(dateOnly[3]);
        if(mon!==undefined){
          return new Date(year, mon, day, parseInt(timeMatch[1]), parseInt(timeMatch[2]));
        }
      }
    }
  }

  // 2) meta article:published_time
  let m = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
  if(m){
    const d=new Date(m[1]);
    if(!isNaN(d.getTime())) return d;
  }
  m = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i);
  if(m){
    const d=new Date(m[1]);
    if(!isNaN(d.getTime())) return d;
  }
  // 3) JSON-LD datePublished
  m = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  if(m){
    const d=new Date(m[1]);
    if(!isNaN(d.getTime())) return d;
  }
  // 4) time datetime
  m = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if(m){
    const d=new Date(m[1]);
    if(!isNaN(d.getTime())) return d;
  }
  // 5) alleen datum: 12 mei 2026 -> middernacht zodat enrich weet dat er geen echte tijd is
  m = htmlNoTags.match(/(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i);
  if(m){
    return new Date(parseInt(m[3]), months[m[2].toLowerCase()], parseInt(m[1]), 0, 0, 0);
  }
  return null;
}

function extractDescAfter(pos, clean){
  const slice = clean.substring(pos, pos+1500);
  const re = /<(p|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  let mm;
  while((mm=re.exec(slice))!==null){
    let txt = mm[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(txt.length<30) continue;
    if(txt.length>400) continue;
    if(/^\d{1,2}\s+\w+\s+\d{4}/.test(txt)) continue;
    if(txt.includes('Facebook') && txt.includes('Instagram')) continue;
    if(txt.includes('prefetch') || txt.includes('wp-admin')) continue;
    if(/^(Lees meer|Meer lezen|Home|Actueel)$/i.test(txt)) continue;
    if(txt.length>180) txt=txt.slice(0,177)+' [...]'; else txt=txt+' [...]';
    return txt;
  }
  return ' [...]';
}

function parseGemeenteOverview(html){
  const max = MAX_PER_BRON['Gemeente Ommen'];
  let clean = html.replace(/<!--[\s\S]*?-->/g,' ');
  const results=[]; const seen=new Set();
  const titleRe = /<h[23][^>]*>\s*<a[^>]+href=["']([^"']*\/actueel\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h[23]>/gi;
  let m;
  while((m=titleRe.exec(clean))!==null && results.length<max){
    let href=m[1], title=m[2].replace(/<[^>]*>/g,'').trim();
    if(title.length<8) continue;
    const full = href.startsWith('http')?href:'https://www.ommen.nl'+href;
    if(seen.has(full)) continue;
    seen.add(full);
    const desc = extractDescAfter(m.index, clean);
    const block = clean.substring(Math.max(0,m.index-500), m.index+2500);
    let tempDate = extractGemeenteDate(block);
    results.push({title:title.slice(0,130), link:full, pubDate:tempDate, description:desc});
  }
  return results.slice(0,max);
}

function getGemeenteCache(){
  try{ 
    const raw = localStorage.getItem('ommen_gemeente_cache');
    if(!raw) return {};
    const obj = JSON.parse(raw);
    // v291 auto-migratie: als cache alleen datum zonder tijd bevat, wis hem zodat echte tijd opnieuw gehaald wordt
    let hasMidnight=false;
    for(const k in obj){
      try{
        const d=new Date(obj[k].iso);
        if(d.getHours()===0 && d.getMinutes()===0) { hasMidnight=true; break; }
      }catch{}
    }
    if(hasMidnight){
      console.log('[v291] oude gemeente cache met 00:00 gevonden -> wissen voor echte tijd');
      localStorage.removeItem('ommen_gemeente_cache');
      return {};
    }
    return obj;
  }catch{ return {}; }
}

function setGemeenteCache(cache){
  localStorage.setItem('ommen_gemeente_cache', JSON.stringify(cache));
}

async function enrichGemeenteWithDetail(arts){
  let cache=getGemeenteCache();
  const now=Date.now();
  const pollingNow=new Date();
  const CACHE_TTL=1000*60*60*2;
  // v288 FIX: wis oude cache entries met 00:00 (middernacht) - die verbergen echte tijd
  let cleaned=false;
  for(const k in cache){
    try{
      const d=new Date(cache[k].iso);
      if(d.getHours()===0 && d.getMinutes()===0 && d.getSeconds()===0){
        delete cache[k];
        cleaned=true;
      }
    }catch{}
  }
  if(cleaned){ setGemeenteCache(cache); console.log('[v288] gemeente cache middernacht opgeschoond'); }
  console.log('[v293] start enrich check voor', arts.length, 'artikelen, cache size', Object.keys(cache).length);
  const needEnrich=arts.filter(a=>{
    const cached=cache[a.link];
    if(cached && (now - cached.ts) < CACHE_TTL && cached.iso){
      const cd=new Date(cached.iso);
      if(cd.getHours()!==0 || cd.getMinutes()!==0) return false;
    }
    if(a.pubDate && !isNaN(a.pubDate.getTime()) && (a.pubDate.getHours()!==0 || a.pubDate.getMinutes()!==0)) return false;
    return true;
  }).slice(0,10);
  if(needEnrich.length===0){
    // v293 FIX: als we niks hoeven te enrichen, gebruik dan de echte tijden uit cache (niet de middernacht uit overzicht)
    console.log('[v293] geen enrich nodig, gebruik cache tijden voor', arts.length, 'artikelen');
    arts.forEach(a=>{
      const cached=cache[a.link];
      if(cached && cached.iso){
        const cd=new Date(cached.iso);
        if(!isNaN(cd.getTime()) && (cd.getHours()!==0 || cd.getMinutes()!==0)){
          a.pubDate=cd;
          console.log('[v293] cache tijd gebruikt voor', a.title.slice(0,30), cd.toLocaleString('nl-NL'));
        }
      }
      if(a.pubDate && !isNaN(a.pubDate.getTime()) && (a.pubDate.getHours()!==0 || a.pubDate.getMinutes()!==0)){
        cache[a.link]={iso:a.pubDate.toISOString(), ts:now};
      }
    });
    setGemeenteCache(cache);
    return arts;
  }
  await Promise.allSettled(needEnrich.map(async (a)=>{
    try{
      // v293: gebruik allorigins direct voor gemeente details om KV block te omzeilen
      let html=null;
      try{
        const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(a.link)}&t=${Date.now()}`, {cache:'no-store'});
        if(r.ok){
          const j = await r.json();
          if(j.contents && j.contents.length>500){
            html=j.contents;
            console.log('[v293] allorigins OK voor', a.link.slice(-30));
          }
        }
      }catch(e){ console.log('[v293] allorigins fail', e.message); }
      if(!html){
        html = await fetchViaWorker(a.link);
      }
      const realDate = extractGemeenteDate(html);
      if(realDate && (realDate.getHours()!==0 || realDate.getMinutes()!==0)){
        a.pubDate=realDate;
        cache[a.link]={iso:realDate.toISOString(), ts:now};
      }else if(realDate){
        const d=new Date(realDate);
        d.setHours(pollingNow.getHours(), pollingNow.getMinutes(), pollingNow.getSeconds());
        a.pubDate=d;
        cache[a.link]={iso:d.toISOString(), ts:now};
      }else{
        const fallback = a.pubDate && !isNaN(a.pubDate.getTime()) ? new Date(a.pubDate) : new Date();
        if(fallback.getHours()===0 && fallback.getMinutes()===0){
          fallback.setHours(pollingNow.getHours(), pollingNow.getMinutes(), pollingNow.getSeconds());
        }
        a.pubDate=fallback;
        cache[a.link]={iso:fallback.toISOString(), ts:now};
      }
    }catch(e){
      if(a.pubDate && a.pubDate.getHours()===0){
        const fb=new Date(a.pubDate);
        fb.setHours(pollingNow.getHours(), pollingNow.getMinutes(), pollingNow.getSeconds());
        a.pubDate=fb;
      }
    }
  }));
  arts.forEach(a=>{
    // v293: alleen echte tijd bewaren, geen fake polling tijd - als geen echte tijd gevonden, laat middernacht staan (wordt later echte tijd na retry)
    if(!a.pubDate || isNaN(a.pubDate.getTime())){
      console.log('[v293] geen datum gevonden voor', a.link);
    } else if(a.pubDate.getHours()===0 && a.pubDate.getMinutes()===0 && a.pubDate.getSeconds()===0){
      console.log('[v293] nog steeds middernacht na detail fetch voor', a.link, '- behoud middernacht, retry later');
    } else {
      console.log('[v293] echte tijd gevonden voor', a.title.slice(0,30), a.pubDate.toLocaleString('nl-NL'));
    }
    if(a.pubDate && !isNaN(a.pubDate.getTime()) && (a.pubDate.getHours()!==0 || a.pubDate.getMinutes()!==0)){
      cache[a.link]={iso:a.pubDate.toISOString(), ts:now};
    }
  });
  setGemeenteCache(cache);
  return arts;
}

export { parseVechtdalCentraalECHT, getVechtdalCache, setVechtdalCache, parseRTVVechtdalECHT, getOostPollCache, setOostPollCache, parseNieuwsbriefECHT, parseRTVOostECHT, parseOostFull_OLD, parseVechtdalCentraalFallback_OLD, parseOostFull, parseVechtdalCentraalFallback, parseRTVVechtdalFull, parseRSSFull, extractGemeenteDate, extractDescAfter, parseGemeenteOverview, getGemeenteCache, setGemeenteCache, enrichGemeenteWithDetail };
