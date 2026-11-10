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
  "RTV Oost": 10,
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
