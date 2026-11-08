/* Nieuw(s)Ommen gedeelde artikelregels.
 * Eén bronbestand voor browser (klassiek script), Cloudflare Worker en tests.
 * Wijzig filterregels uitsluitend hier; verhoog VERSION bij iedere inhoudelijke wijziging.
 */
(function (root) {
  "use strict";

  const VERSION = "1.0.0";
  const MUNICIPALITY_PLACES = Object.freeze([
    "Ommen", "Lemele", "Vilsteren", "Beerze", "Beerzerveld", "Witharen",
    "Archem", "Arriën", "Arriërveld", "Besthmen", "Dalmsholte", "Eerde",
    "Emsland", "Giethmen", "Hoogengraven", "Junne", "Nieuwebrug",
    "Ommerbosch", "Ommerkanaal", "Ommerschans", "Ommerveld", "Rotbrink",
    "Stegeren", "Stegerveld", "Varsen", "Vinkenbuurt", "Zeesse",
    "Beerzerpoort"
  ]);
  const MUNICIPALITY_TERMS = Object.freeze(MUNICIPALITY_PLACES.map(place => place.toLocaleLowerCase("nl-NL")));

  function isMunicipalityArticle(article) {
    const title = typeof article?.title === "string" ? article.title : "";
    const description = typeof article?.description === "string" ? article.description : "";
    const text = (title + " " + description).toLocaleLowerCase("nl-NL");
    // Bewust dezelfde substringsemantiek als de bestaande app en Worker:
    // eerst centraliseren; woordgrenswijzigingen krijgen afzonderlijke regressietests.
    return MUNICIPALITY_TERMS.some(term => text.includes(term));
  }

  root.NieuwOmmenArticleFilter = Object.freeze({
    VERSION,
    MUNICIPALITY_PLACES,
    isMunicipalityArticle
  });
})(globalThis);
