import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const sandbox = { URL };
vm.runInNewContext(readFileSync(new URL("../article-filter.js", import.meta.url), "utf8"), sandbox);
const filter = sandbox.NieuwOmmenArticleFilter;
const now = new Date("2026-11-08T12:00:00.000Z");
const article = (overrides = {}) => ({
  title: "Voorbeeld nieuwsbericht",
  link: "https://example.org/nieuws/123/voorbeeld",
  source: "Testbron",
  pubDate: "2026-11-08T10:00:00.000Z",
  ...overrides
});

test("gedeelde filtermodule is geladen en versieerbaar", () => {
  assert.equal(filter.VERSION, "2.0.0");
  assert.ok(Object.isFrozen(filter));
});

test("Emsland telt mee in Gemeente Ommen, zowel in titel als beschrijving", () => {
  assert.equal(filter.isMunicipalityArticle({ title: "Nieuws uit Emsland" }), true);
  assert.equal(filter.isMunicipalityArticle({ title: "Nieuwe plannen", description: "Ook in Emsland" }), true);
});

test("alle gemeentelijke plaatsnamen zijn uniek en blijven herkenbaar", () => {
  const places = [...filter.MUNICIPALITY_PLACES];
  assert.ok(places.includes("Emsland"));
  assert.equal(new Set(places).size, places.length);
  for (const place of places) {
    assert.equal(filter.isMunicipalityArticle({ title: `Bericht uit ${place}` }), true, place);
  }
});

test("gemeentematching blijft hoofdletterongevoelig en behoudt substringsemantiek", () => {
  assert.equal(filter.isMunicipalityArticle({ title: "OMMEN in het nieuws" }), true);
  assert.equal(filter.isMunicipalityArticle({ title: "Een bericht zonder plaatsnaam" }), false);
  assert.equal(filter.isMunicipalityArticle({ title: "Ommenaar vertelt" }), true);
  assert.equal(filter.isMunicipalityArticle(null), false);
});

test("ongeldige titels, links, fallback-items en navigatiepagina's worden geweigerd", () => {
  for (const [input, reason] of [
    [{ ...article(), title: "" }, "missing_or_short_title"],
    [{ ...article(), title: "OK" }, "missing_or_short_title"],
    [{ ...article(), link: "javascript:alert(1)" }, "invalid_url"],
    [{ ...article(), link: "not a url" }, "invalid_url"],
    [{ ...article(), link: "https://example.org/" }, "non_article_navigation"],
    [{ ...article(), link: "https://example.org/category/ommen" }, "non_article_navigation"],
    [{ ...article(), link: "https://www.oost.nl/nieuws/vechtdal" }, "non_article_category"],
    [{ ...article(), isFallback: true }, "fallback_item"],
    [{ ...article(), title: "Bron tijdelijk offline" }, "fallback_title"]
  ]) {
    const result = filter.evaluateArticle(input);
    assert.equal(result.valid, false, JSON.stringify(input));
    assert.equal(result.reason, reason);
  }
});

test("RTV Oost artikelroute en expliciet nieuwsbriefartikel blijven geldig", () => {
  assert.equal(filter.isValidArticle(article({
    link: "https://www.oost.nl/nieuws/3715461/een-echt-artikel"
  })), true);
  assert.equal(filter.isValidArticle(article({
    articleType: "newsletter",
    link: "https://nieuwommen.leeuw008.nl/nieuwsbrief/2026-11"
  })), true);
});

test("ontbrekende, polling- en expliciet onbetrouwbare datums zijn niet betrouwbaar", () => {
  for (const input of [
    article({ pubDate: null }),
    article({ pubDate: "not-a-date" }),
    article({ _dateOrigin: "polling" }),
    article({ dateOrigin: "polling" }),
    article({ _realDate: false }),
    article({ dateOrigin: "unknown" })
  ]) {
    const info = filter.dateInfo(input);
    assert.equal(info.reliable, false);
    assert.equal(info.datePrecision, "unknown");
    assert.equal(filter.isToday(input, now), false);
    assert.equal(filter.isRecentForPush(input, now), false);
  }
});

test("echte publicatietijden volgen hetzelfde pushvenster (-1 uur tot +6 uur)", () => {
  assert.equal(filter.isRecentForPush(article({ pubDate: "2026-11-08T07:00:00.000Z" }), now), true);
  assert.equal(filter.isRecentForPush(article({ pubDate: "2026-11-08T05:00:00.000Z" }), now), false);
  assert.equal(filter.isRecentForPush(article({ pubDate: "2026-11-08T12:30:00.000Z" }), now), true);
  assert.equal(filter.isRecentForPush(article({ pubDate: "2026-11-08T14:30:00.000Z" }), now), false);
});

test("datum-zonder-tijd gebruikt de kalenderdag Europe/Amsterdam", () => {
  const today = article({ pubDate: "2026-11-08T00:00:00.000Z", _dateOnly: true });
  const yesterday = article({ pubDate: "2026-11-07T00:00:00.000Z", _dateOnly: true });
  assert.equal(filter.dateInfo(today).datePrecision, "date");
  assert.equal(filter.isToday(today, now), true);
  assert.equal(filter.isRecentForPush(today, now), true);
  assert.equal(filter.isToday(yesterday, now), false);
  assert.equal(filter.isRecentForPush(yesterday, now), false);
});

test("oud maar geldig artikel blijft inhoudelijk geldig en wordt alleen uit pushvenster gehouden", () => {
  const old = article({ pubDate: "2026-11-07T08:00:00.000Z" });
  assert.equal(filter.isValidArticle(old), true);
  assert.equal(filter.isRecentForPush(old, now), false);
});
