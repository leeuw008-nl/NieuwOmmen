import test from "node:test";
import assert from "node:assert/strict";
import "./article-filter.js";
import { matchesSourceSelection, withPollingDate } from "./push-selection.js";
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
