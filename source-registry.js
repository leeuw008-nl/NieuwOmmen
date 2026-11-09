/* Canoniek bronregister voor Nieuw(s)Ommen.
 * Dit bestand beschrijft de bestaande app-bronroutes en parser-/fallbackvolgorde.
 * Het wijzigt zelf geen netwerkgedrag; afnemers worden gefaseerd aangesloten.
 */
(function (root) {
  "use strict";

  const SOURCES = Object.freeze([
    { id: "De Stentor", name: "De Stentor", url: "https://www.destentor.nl/ommen/rss.xml", homepage: "https://www.destentor.nl/ommen/", parser: "rss", fetchOrder: ["https://www.destentor.nl/ommen/rss.xml"], fallbacks: [] },
    { id: "Gemeente Ommen", name: "Gemeente Ommen", url: "https://www.ommen.nl/actueel/", homepage: "https://www.ommen.nl/actueel/", parser: "gemeente-html-detail", fetchOrder: ["https://www.ommen.nl/actueel/"], fallbacks: [] },
    { id: "Natuurlijk Ommen", name: "Natuurlijk Ommen", url: "https://www.natuurlijkommen.nl/feed/", homepage: "https://www.natuurlijkommen.nl/", parser: "rss", fetchOrder: ["https://www.natuurlijkommen.nl/feed/"], fallbacks: [] },
    { id: "Ommen City", name: "Ommen City", url: "https://ommencity.nl/feed/", homepage: "https://ommencity.nl/", parser: "rss", fetchOrder: ["https://ommencity.nl/feed/"], fallbacks: [] },
    { id: "OudOmmen", name: "OudOmmen", url: "https://weblog.oudommen.nl/feed/", homepage: "https://weblog.oudommen.nl/", parser: "rss", fetchOrder: ["https://weblog.oudommen.nl/feed/"], fallbacks: [] },
    { id: "RondOmmen", name: "RondOmmen", url: "https://www.rondommen.nl/feed/", homepage: "https://www.rondommen.nl/", parser: "rss", fetchOrder: ["https://www.rondommen.nl/feed/"], fallbacks: [] },
    { id: "RTV Oost", name: "RTV Oost", url: "https://www.oost.nl/nieuws/vechtdal", homepage: "https://www.oost.nl/nieuws/vechtdal", parser: "rtv-oost-html", fetchOrder: ["https://www.oost.nl/nieuws/vechtdal"], fallbacks: [] },
    { id: "RTV Vechtdal", name: "RTV Vechtdal", url: "https://rtvvechtdal.nl/feed/", homepage: "https://rtvvechtdal.nl/", parser: "rtv-vechtdal-html", fetchOrder: ["https://rtvvechtdal.nl/", "https://rtvvechtdal.nl/feed/"], fallbacks: ["https://rtvvechtdal.nl/feed/"] },
    { id: "Vechtdal Centraal", name: "Vechtdal Centraal", url: "https://www.vechtdalcentraal.nl/feed/", homepage: "https://www.vechtdalcentraal.nl/", parser: "vechtdal-centraal-chain", fetchOrder: ["https://www.vechtdalcentraal.nl/feed/", "https://www.vechtdalcentraal.nl/", "https://api.rss2json.com/v1/api.json"], fallbacks: ["https://www.vechtdalcentraal.nl/", "https://api.rss2json.com/v1/api.json"] },
    { id: "Nieuwsbrief", name: "Nieuwsbrief", url: "https://ommen-push-v2.leeuw008.workers.dev/newsletter/feed", homepage: "https://nieuwommen.leeuw008.nl/", parser: "newsletter-kv", fetchOrder: ["https://ommen-push-v2.leeuw008.workers.dev/newsletter/feed"], fallbacks: [], isolatedFixtureRequired: true }
  ].map(source => Object.freeze({ ...source, fallbacks: Object.freeze(source.fallbacks) })));

  const byId = Object.freeze(Object.fromEntries(SOURCES.map(source => [source.id, source])));
  root.NieuwOmmenSourceRegistry = Object.freeze({
    VERSION: "1.0.0",
    SOURCES,
    byId
  });
})(globalThis);
