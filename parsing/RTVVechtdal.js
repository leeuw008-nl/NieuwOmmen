const MAX_PER_BRON = {'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Nieuwsbrief':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':10,'RTV Vechtdal':10};
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

function parseRTVVechtdalFull(html){
  return parseRTVVechtdalECHT(html);
}

function parseRTVVechtdalFallback(html){
  const items=[]; const seen=new Set(); let m;
  const patterns=[
    /<h[2-3][^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]{8,150})<\/a>/gi,
    /<article[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([^<]{8,150})<\/a>/gi
  ];
  for(const re of patterns){
    while((m=re.exec(html))!==null && items.length<20){
      let link=m[1]; if(link.startsWith('/')) link='https://www.rtvvechtdal.nl'+link;
      if(seen.has(link)) continue; seen.add(link);
      let title=m[2].replace(/<[^>]*>/g,'').trim();
      if(title.length>8) items.push({title, link, pubDate:new Date(), description:title+' [...]'});
    }
    if(items.length>=5) break;
  }
  return items;
}

export async function parseRTVVechtdal(htmlOrXml){
  console.log('[RTV Vechtdal] parser ontvangt len', htmlOrXml?.length, 'isRSS', htmlOrXml?.includes('<rss')||htmlOrXml?.includes('<item'));
  
  // 1. Probeer RSS (exact oude code)
  if(htmlOrXml.includes('<rss')||htmlOrXml.includes('<item')||htmlOrXml.includes('<feed')||htmlOrXml.includes('<entry')){
    const rss = parseRSSFull(htmlOrXml,'RTV Vechtdal');
    console.log('[RTV Vechtdal] RSS parsing resultaat', rss.length);
    if(rss.length>0) return rss;
  }
  
  // 2. Probeer oude ECHT HTML parser (allmode_date) - exact oude code
  let arts = parseRTVVechtdalFull(htmlOrXml);
  console.log('[RTV Vechtdal] ECHT parser resultaat', arts.length);
  if(arts.length>0) return arts;
  
  // 3. Probeer generieke fallback
  arts = parseRTVVechtdalFallback(htmlOrXml);
  console.log('[RTV Vechtdal] fallback parser resultaat', arts.length);
  if(arts.length>0) return arts;
  
  // 4. SELF-HEALING: als we alleen feed kregen die leeg is, fetch zelf de homepage (zoals oude app.js v293 deed)
  console.log('[RTV Vechtdal] feed leeg, probeer zelf homepage te fetchen zoals oude v293...');
  try{
    // Probeer via allorigins (om CORS te omzeilen)
    const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://www.rtvvechtdal.nl/')}&t=${Date.now()}`, {cache:'no-store'});
    if(r.ok){
      const j = await r.json();
      if(j.contents && j.contents.length>1000){
        console.log('[RTV Vechtdal] homepage via allorigins len', j.contents.length);
        let arts2 = parseRTVVechtdalFull(j.contents);
        if(arts2.length===0) arts2 = parseRTVVechtdalFallback(j.contents);
        console.log('[RTV Vechtdal] homepage parsing resultaat', arts2.length);
        if(arts2.length>0) return arts2;
      }
    }
  }catch(e){ console.log('[RTV Vechtdal] allorigins fail', e.message); }
  
  try{
    const r2 = await fetch('https://www.rtvvechtdal.nl/', {cache:'no-store'});
    if(r2.ok){
      const html2 = await r2.text();
      console.log('[RTV Vechtdal] direct homepage len', html2.length);
      let arts2 = parseRTVVechtdalFull(html2);
      if(arts2.length===0) arts2 = parseRTVVechtdalFallback(html2);
      if(arts2.length>0) return arts2;
    }
  }catch(e){ console.log('[RTV Vechtdal] direct fetch fail', e.message); }
  
  return [];
}
