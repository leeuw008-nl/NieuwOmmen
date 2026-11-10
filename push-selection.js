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
