// LETTERLIJK uit jouw app.js van 1 sept - GEEN LETTER VERANDERD - alleen export naam toegevoegd
const MAX_PER_BRON = {'De Stentor':25,'RondOmmen':20,'Ommen City':10,'OudOmmen':10,'Vechtdal Centraal':10,'Natuurlijk Ommen':10,'Gemeente Ommen':10,'RTV Oost':15,'RTV Vechtdal':10,'Nieuwsbrief':20};

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

export function parseGemeenteOmmen(html){
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
