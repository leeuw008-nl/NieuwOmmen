// Gedeelde selectie voor push: volgt de bronfilters uit renderArticles() in app.js.
export function matchesSourceSelection(sourceState, article, now = new Date(), articleFilter = globalThis.NieuwOmmenArticleFilter) {
  if (!sourceState || !sourceState.aan) return false;
  if (sourceState.vandaag && !articleFilter.isToday(article, now)) return false;
  if (sourceState.scope === "gemeente" && !articleFilter.isMunicipalityArticle(article)) return false;
  return true;
}
