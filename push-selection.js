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
  "RTV Vechtdal": 10,
  "Vechtdal Centraal": 10
});
export function getSourceArticleLimit(sourceId) {
  return APP_SOURCE_LIMITS[sourceId] || 10;
}
