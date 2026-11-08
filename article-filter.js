/* Nieuw(s)Ommen gedeelde artikelregels.
 * Eén bronbestand voor browser (klassiek script), Cloudflare Worker en tests.
 * Wijzig filterregels uitsluitend hier; verhoog VERSION bij iedere inhoudelijke wijziging.
 */
(function (root) {
  "use strict";

  const VERSION = "2.0.0";
  const MUNICIPALITY_PLACES = Object.freeze([
    "Ommen", "Lemele", "Vilsteren", "Beerze", "Beerzerveld", "Witharen",
    "Archem", "Arriën", "Arriërveld", "Besthmen", "Dalmsholte", "Eerde",
    "Emsland", "Giethmen", "Hoogengraven", "Junne", "Nieuwebrug",
    "Ommerbosch", "Ommerkanaal", "Ommerschans", "Ommerveld", "Rotbrink",
    "Stegeren", "Stegerveld", "Varsen", "Vinkenbuurt", "Zeesse",
    "Beerzerpoort"
  ]);
  const MUNICIPALITY_TERMS = Object.freeze(MUNICIPALITY_PLACES.map(place => place.toLocaleLowerCase("nl-NL")));
  const NON_ARTICLE_SEGMENTS = new Set([
    "category", "categorie", "tag", "tags", "author", "auteur", "onderwerp",
    "topics", "zoeken", "search", "pagina", "page", "archief", "archive"
  ]);
  const FALLBACK_TITLES = new Set([
    "geen artikelen", "geen nieuws", "bron tijdelijk offline", "fout bij laden",
    "ophalen artikel", "laden..."
  ]);

  function parseDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    if (typeof value === "number" && Number.isFinite(value)) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "string" && value.trim()) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function dateInfo(article) {
    const d = parseDate(article?.publishedAt ?? article?.pubDate ?? article?.date);
    const explicitOrigin = typeof article?.dateOrigin === "string" ? article.dateOrigin : "";
    const legacyPolling = article?._dateOrigin === "polling" || article?.isPollingDate === true;
    const dateOnly = article?.datePrecision === "date" || article?._dateOnly === true;
    const fallbackDate = article?.isFallback === true || legacyPolling || explicitOrigin === "polling" || article?._realDate === false || explicitOrigin === "unknown";
    const precision = fallbackDate || !d ? "unknown" : (dateOnly ? "date" : (article?.datePrecision === "instant" ? "instant" : "instant"));
    const origin = fallbackDate ? "polling" : (explicitOrigin || (dateOnly ? "source-date" : (d ? (article?._realDate === false ? "unknown" : "source-timestamp") : "unknown")));
    return { date: d, datePrecision: precision, dateOrigin: origin, reliable: !!d && !fallbackDate };
  }

  function isMunicipalityArticle(article) {
    const title = typeof article?.title === "string" ? article.title : "";
    const description = typeof article?.description === "string" ? article.description : "";
    const text = (title + " " + description).toLocaleLowerCase("nl-NL");
    return MUNICIPALITY_TERMS.some(term => text.includes(term));
  }

  function articleType(article, url) {
    const explicit = String(article?.articleType || "").toLowerCase();
    if (["category", "navigation", "newsletter"].includes(explicit)) return explicit;
    if (explicit === "article") return "article";
    const p = url.pathname.toLowerCase().replace(/\/+$/, "");
    const parts = p.split("/").filter(Boolean);
    if (!parts.length) return "navigation";
    if (parts.some(part => NON_ARTICLE_SEGMENTS.has(part))) return "navigation";
    // RTV Oost uses /nieuws/vechtdal for its section and /nieuws/{id}/{slug} for stories.
    if (url.hostname.endsWith("oost.nl") && p === "/nieuws/vechtdal") return "category";
    if (parts[parts.length - 1] === "nieuws" || parts[parts.length - 1] === "news") return "category";
    return "article";
  }

  function evaluateArticle(article) {
    if (!article || typeof article !== "object") return { valid: false, reason: "not_an_object", articleType: "unknown" };
    if (article.isFallback === true) return { valid: false, reason: "fallback_item", articleType: "unknown" };
    const title = typeof article.title === "string" ? article.title.replace(/\s+/g, " ").trim() : "";
    if (title.length < 3) return { valid: false, reason: "missing_or_short_title", articleType: "unknown" };
    if (FALLBACK_TITLES.has(title.toLocaleLowerCase("nl-NL"))) return { valid: false, reason: "fallback_title", articleType: "unknown" };
    const rawLink = typeof article.link === "string" ? article.link.trim() : "";
    let url;
    try { url = new URL(rawLink); } catch { return { valid: false, reason: "invalid_url", articleType: "unknown" }; }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return { valid: false, reason: "invalid_url", articleType: "unknown" };
    }
    const type = articleType(article, url);
    if (type !== "article" && type !== "newsletter") return { valid: false, reason: "non_article_" + type, articleType: type };
    const date = dateInfo(article);
    return {
      valid: true,
      reason: "valid_article",
      articleType: type,
      datePrecision: date.datePrecision,
      dateOrigin: date.dateOrigin,
      hasReliableDate: date.reliable,
      municipalityMatch: isMunicipalityArticle(article)
    };
  }

  function isValidArticle(article) {
    return evaluateArticle(article).valid;
  }

  function amsterdamDateKey(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date);
  }

  function isToday(article, now = new Date()) {
    const info = dateInfo(article);
    if (!info.reliable) return false;
    try { return amsterdamDateKey(info.date) === amsterdamDateKey(now); }
    catch { return false; }
  }

  function isRecentForPush(article, now = new Date(), maxAgeMs = 6 * 60 * 60 * 1000, futureToleranceMs = 60 * 60 * 1000) {
    const info = dateInfo(article);
    if (!info.reliable) return false;
    if (info.datePrecision === "date") return isToday(article, now);
    const ageMs = now.getTime() - info.date.getTime();
    return ageMs >= -futureToleranceMs && ageMs <= maxAgeMs;
  }

  root.NieuwOmmenArticleFilter = Object.freeze({
    VERSION,
    MUNICIPALITY_PLACES,
    isMunicipalityArticle,
    dateInfo,
    evaluateArticle,
    isValidArticle,
    isToday,
    isRecentForPush
  });
})(globalThis);
