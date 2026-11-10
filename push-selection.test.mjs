import test from "node:test";
import assert from "node:assert/strict";
import "./article-filter.js";
import { matchesSourceSelection, withPollingDate, markArticleProcessed, getSourceArticleLimit } from "./push-selection.js";
const filter = globalThis.NieuwOmmenArticleFilter;
const now = new Date("2026-11-10T10:00:00+01:00");
const todayOmmen = { title: "Ommen krijgt nieuwe plannen", description: "", link: "https://example.nl/nieuws/ommen-plannen", pubDate: "2026-11-10T09:00:00+01:00" };
const yesterdayOmmen = { ...todayOmmen, pubDate: "2026-11-09T09:00:00+01:00" };
const todayRegion = { ...todayOmmen, title: "Nieuws uit Zwolle" };
test("uitgeschakelde bron levert geen push", () => assert.equal(matchesSourceSelection({ aan: false, vandaag: false, scope: "regio" }, todayOmmen, now, filter), false));
test("bron aan, regio en meer toont artikel", () => assert.equal(matchesSourceSelection({ aan: true, vandaag: false, scope: "regio" }, todayRegion, now, filter), true));
test("vandaag sluit artikel van gisteren uit", () => assert.equal(matchesSourceSelection({ aan: true, vandaag: true, scope: "regio" }, yesterdayOmmen, now, filter), false));
test("vandaag laat artikel van vandaag toe", () => assert.equal(matchesSourceSelection({ aan: true, vandaag: true, scope: "regio" }, todayOmmen, now, filter), true));
test("gemeente sluit regionaal artikel zonder Ommen-match uit", () => assert.equal(matchesSourceSelection({ aan: true, vandaag: false, scope: "gemeente" }, todayRegion, now, filter), false));
test("gemeente laat artikel met Ommen-match toe", () => assert.equal(matchesSourceSelection({ aan: true, vandaag: false, scope: "gemeente" }, todayOmmen, now, filter), true));
test("pollingtijd volgt het gedrag van de app-parser bij vandaag-filter", () => assert.equal(filter.isToday({ ...todayOmmen, pubDate: now.toISOString() }, now), true));

test("Worker kent pollingtijd toe aan elk artikel zonder datum", () => {
  const article = withPollingDate({ title: "Nieuw artikel", link: "https://example.nl/nieuw" }, now);
  assert.equal(article.pubDate, now.toISOString());
  assert.equal(filter.isToday(article, now), true);
});

test("verwerkt artikel wordt als gezien geregistreerd om herhaalde push te voorkomen", () => {
  const seen = new Set();
  markArticleProcessed(seen, todayOmmen);
  assert.equal(seen.has(todayOmmen.link), true);
});

test("Worker haalt dezelfde aantallen per bron op als de app", () => {
  assert.equal(getSourceArticleLimit("De Stentor"), 25);
  assert.equal(getSourceArticleLimit("RondOmmen"), 20);
  assert.equal(getSourceArticleLimit("Gemeente Ommen"), 10);
  assert.equal(getSourceArticleLimit("RTV Oost"), 10);
  assert.equal(getSourceArticleLimit("RTV Vechtdal"), 20);
});

test("RTV Vechtdal gebruikt dezelfde volledige HTML-structuur als de app", async () => {
  const { parseRTVVechtdalHtml } = await import("./push-selection.js");
  const html = '<div class="allmode_date">10-11-2026</div><h2 class="allmode_title"><a href="/nieuws/test">Testbericht</a></h2><div class="allmode_intro">Beschrijving</div>';
  const now = new Date("2026-11-10T14:20:30");
  const [article] = parseRTVVechtdalHtml(html, now);
  assert.equal(article.title, "Testbericht");
  assert.equal(article.link, "https://www.rtvvechtdal.nl/nieuws/test");
  assert.equal(article.pubDate.getHours(), 14);
  assert.equal(article.pubDate.getMinutes(), 20);
});

test("RTV Oost volgt app-parser met echte publishedAt en gemeenterelevantie", async () => {
  const { parseRTVOostHtml } = await import("./push-selection.js");
  const html = '<div publishedAt="2026-11-10T12:15:00Z"><a href="/nieuws/ommen-test-123456"><div class="name-label">112</div><h3>Brandweer rukt uit in Ommen</h3></a></div>';
  const [article] = parseRTVOostHtml(html, now);
  assert.equal(article.title, "112: Brandweer rukt uit in Ommen");
  assert.equal(article.link, "https://www.oost.nl/nieuws/ommen-test-123456");
  assert.equal(new Date(article.pubDate).toISOString(), "2026-11-10T12:15:00.000Z");
});
