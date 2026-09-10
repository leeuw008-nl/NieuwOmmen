const MAX_PER_BRON = {'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Nieuwsbrief':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':10,'RTV Vechtdal':10};
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
function enrichGemeenteWithDetail(arts){
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

export function parseGemeenteOmmen(html){
  return parseGemeenteOverview(html);
}

// Export enrich for app.js if it wants to use it
export { enrichGemeenteWithDetail };
