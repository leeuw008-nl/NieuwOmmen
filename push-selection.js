// Gedeelde selectie voor push: volgt de bronfilters uit renderArticles() in app.js.
export function matchesSourceSelection(sourceState, article, now = new Date(), articleFilter = globalThis.NieuwOmmenArticleFilter) {
  if (!sourceState || !sourceState.aan) return false;
  if (sourceState.vandaag && !articleFilter.isToday(article, now)) return false;
  if (sourceState.scope === "gemeente" && !articleFilter.isMunicipalityArticle(article)) return false;
  return true;
}

export function withPollingDate(article, now = new Date()) {
  if (!article || article.pubDate) return article;
  return { ...article, pubDate: now.toISOString() };
}

export function markArticleProcessed(seen, article) {
  if (seen && article && typeof article.link === "string" && article.link) seen.add(article.link);
  return seen;
}

export const APP_SOURCE_LIMITS = Object.freeze({
  "De Stentor": 25,
  "Gemeente Ommen": 10,
  "Natuurlijk Ommen": 10,
  "Ommen City": 10,
  "OudOmmen": 10,
  "RondOmmen": 20,
  "RTV Oost": 25,
  "RTV Vechtdal": 20,
  "Vechtdal Centraal": 10
});
export function getSourceArticleLimit(sourceId) {
  return APP_SOURCE_LIMITS[sourceId] || 10;
}

/**
 * Worker-equivalent of parseRTVVechtdalECHT() in app.js.
 * The source publishes date-only values; NieuwOmmen deliberately applies
 * the polling time so the "vandaag" filter behaves like the app.
 */
export function parseRTVVechtdalHtml(html, now = new Date()) {
  const items = [];
  const pollingMoment = new Date(now);
  const reFull = /<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,600}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>[\s\S]{0,800}?<div class="allmode_(?:intro|text|introtext)[^>]*>([\s\S]*?)<\/div>/gi;
  const makeDate = value => {
    const parts = value.split("-");
    if (parts.length !== 3) return new Date(pollingMoment);
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 0, 0, 0);
    if (Number.isNaN(d.getTime())) return new Date(pollingMoment);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), pollingMoment.getHours(), pollingMoment.getMinutes(), pollingMoment.getSeconds());
  };
  const makeLink = value => {
    const link = value.replace(/&amp;/g, "&");
    return link.startsWith("http") ? link : "https://www.rtvvechtdal.nl" + link;
  };
  let m;
  while ((m = reFull.exec(String(html))) !== null && items.length < 20) {
    let intro = m[4].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (intro.length > 200) intro = intro.slice(0, 200) + " [...]";
    else if (intro) intro += " [...]";
    else intro = m[3].trim() + " [...]";
    items.push({ title: m[3].trim(), link: makeLink(m[2]), pubDate: makeDate(m[1]), description: intro, source: "RTV Vechtdal" });
  }
  if (items.length) return items;
  const fallback = /<div class="allmode_date">([^<]+)<\/div>[\s\S]{0,500}?<h[2-3] class="allmode_title"><a href="([^"]+)">([^<]+)<\/a>/gi;
  while ((m = fallback.exec(String(html))) !== null && items.length < 15) {
    items.push({ title: m[3].trim(), link: makeLink(m[2]), pubDate: makeDate(m[1]), description: m[3].trim() + " [...]", source: "RTV Vechtdal" });
  }
  return items;
}

/** Mirrors parseRTVOostECHT() in app.js, including its real-date and polling fallback paths. */
export function parseRTVOostHtml(html, now = new Date()) {
  const items = [];
  let m;
  const reReal = /<div[^>]*publishedAt=["']([^"']+)["'][^>]*>[\s\S]*?<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-overijssel)[^"']{10,150})["'][^>]*>[\s\S]*?<div[^>]*class="[^"]*name-label[^"]*"[^>]*>([^<]{2,20})<\/div>[\s\S]*?<h[2-3][^>]*>([^<]{12,200})<\/h3>/gi;
  const fullLink = link => link.startsWith("/") ? "https://www.oost.nl" + link : link;
  const add = (link, title, date) => {
    if (!items.some(x => x.link === link)) items.push({ title, link, pubDate: date, description: title + " [...]", source: "RTV Oost" });
  };
  while ((m = reReal.exec(String(html))) !== null && items.length < 25) {
    const link = fullLink(m[2]);
    const category = m[3].trim().toUpperCase();
    const title = m[4].trim();
    if (["ALLE NIEUWS", "ZWOLLE", "TWENTE"].includes(title.toUpperCase())) continue;
    let date = new Date(m[1]);
    if (Number.isNaN(date.getTime())) date = new Date(now);
    const finalTitle = ["NIEUWS", "112", "ECONOMIE", "SPORT"].includes(category) ? category + ": " + title : title;
    add(link, finalTitle, date);
  }
  if (items.length === 0) {
    const re2 = /<div[^>]*publishedAt=["']([^"']+)["'][^>]*>[\s\S]*?<a[^>]+href=["'](\/nieuws\/[^"']{10,150})["'][^>]*>[\s\S]*?<h[2-3][^>]*>([^<]{12,200})<\/h3>/gi;
    while ((m = re2.exec(String(html))) !== null && items.length < 25) {
      const link = fullLink(m[2]);
      const title = m[3].trim();
      if (title.toLowerCase().includes("alle nieuws")) continue;
      const date = new Date(m[1]);
      if (Number.isNaN(date.getTime())) continue;
      add(link, title, date);
    }
  }
  if (items.length === 0) {
    const reBlock = /<a[^>]+href=["'](\/nieuws\/(?!zwolle|twente|enschede|vechtdal|salland|kop-van-overijssel)[^"']{10,150})["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = reBlock.exec(String(html))) !== null && items.length < 20) {
      const link = fullLink(m[1]);
      const inner = m[2];
      const catMatch = inner.match(/<(?:span|div)[^>]*>\s*(NIEUWS|112|ECONOMIE|SPORT)\s*<\/(?:span|div)>/i);
      const category = catMatch ? catMatch[1].toUpperCase() : "";
      const titleMatch = inner.match(/<h[23][^>]*>([^<]{12,180})<\/h[23]>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";
      if (!title || title.length < 12 || ["alle nieuws", "zwolle", "twente", "enschede", "vechtdal", "salland", "kop van overijssel"].includes(title.toLowerCase())) continue;
      const finalTitle = category ? category + ": " + title : title;
      add(link, finalTitle, new Date(now));
    }
  }
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return items;
}


const NL_MONTHS = Object.freeze({januari:0,februari:1,maart:2,april:3,mei:4,juni:5,juli:6,augustus:7,september:8,oktober:9,november:10,december:11});
export function extractGemeenteDateHtml(html) {
  const text=String(html||"").replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim();
  const patterns=[
    /(\\d{1,2})\\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\\s+(\\d{4})\\s*,?\\s*(?:om|\\-)?\\s*(\\d{1,2})\\s*:\\s*(\\d{2})/i,
    /(\\d{1,2})\\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\\s+(\\d{4})[^\\d]{0,20}(\\d{1,2})\\s*:\\s*(\\d{2})/i
  ];
  for(const re of patterns){const m=text.match(re);if(m){const d=new Date(+m[3],NL_MONTHS[m[2].toLowerCase()],+m[1],+m[4],+m[5]);if(!Number.isNaN(d.getTime()))return d;}}
  const d=text.match(/(\\d{1,2})\\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\\s+(\\d{4})/i);
  if(d){const re=new RegExp(d[0].replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")+"[\\s\\S]{0,400}?(\\d{1,2})\\s*:\\s*(\\d{2})","i");const tm=text.match(re);if(tm){const dt=new Date(+d[3],NL_MONTHS[d[2].toLowerCase()],+d[1],+tm[1],+tm[2]);if(!Number.isNaN(dt.getTime()))return dt;}}
  const metas=[
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /"datePublished"\\s*:\\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i
  ];
  for(const re of metas){const m=String(html||"").match(re);if(m){const dt=new Date(m[1]);if(!Number.isNaN(dt.getTime()))return dt;}}
  if(d){const dt=new Date(+d[3],NL_MONTHS[d[2].toLowerCase()],+d[1],0,0,0);if(!Number.isNaN(dt.getTime()))return dt;}
  return null;
}
export function extractGemeenteDescription(html,pos=0) {
  const clean=String(html||"").replace(/<!--[\\s\\S]*?-->/g," ");
  const slice=clean.substring(pos,pos+1500);
  const re=/<(p|div)[^>]*>([\\s\\S]*?)<\\/\\1>/gi;let m;
  while((m=re.exec(slice))!==null){let txt=m[2].replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim();if(txt.length<30||txt.length>400||/^\\d{1,2}\\s+\\w+\\s+\\d{4}/.test(txt)||txt.includes("Facebook")&&txt.includes("Instagram")||/prefetch|wp-admin/i.test(txt)||/^(Lees meer|Meer lezen|Home|Actueel)$/i.test(txt))continue;return (txt.length>180?txt.slice(0,177)+" [...]":txt+" [...]");}
  return " [...]";
}
export function parseGemeenteOverviewHtml(html,now=new Date()) {
  const clean=String(html||"").replace(/<!--[\\s\\S]*?-->/g," ");
  const out=[],seen=new Set();
  const re=/<h[23][^>]*>\\s*<a[^>]+href=["']([^"']*\\/actueel\\/[^"'?#]+)["'][^>]*>([\\s\\S]*?)<\\/a>\\s*<\\/h[23]>/gi;
  let m;
  while((m=re.exec(clean))!==null&&out.length<10){const title=m[2].replace(/<[^>]*>/g,"").trim();if(title.length<8)continue;const link=m[1].startsWith("http")?m[1]:"https://www.ommen.nl"+m[1];if(seen.has(link))continue;seen.add(link);const block=clean.substring(Math.max(0,m.index-500),m.index+2500);const pubDate=extractGemeenteDateHtml(block);out.push({title:title.slice(0,130),link,source:"Gemeente Ommen",pubDate,description:extractGemeenteDescription(clean,m.index),_dateOnly:!!pubDate&&pubDate.getHours()===0&&pubDate.getMinutes()===0&&pubDate.getSeconds()===0});}
  return out;
}
