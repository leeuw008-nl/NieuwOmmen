import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const sandbox = {};
vm.runInNewContext(readFileSync(new URL("../source-registry.js", import.meta.url), "utf8"), sandbox);
const registry = sandbox.NieuwOmmenSourceRegistry;

test("bronregister is geladen, versieerbaar en onveranderlijk", () => {
  assert.equal(registry.VERSION, "1.0.0");
  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.SOURCES));
});

test("bronregister bevat exact de tien bekende Nieuw(s)Ommen-bronnen", () => {
  assert.deepEqual(Array.from(registry.SOURCES, source => source.id), [
    "De Stentor", "Gemeente Ommen", "Natuurlijk Ommen", "Ommen City",
    "OudOmmen", "RondOmmen", "RTV Oost", "RTV Vechtdal",
    "Vechtdal Centraal", "Nieuwsbrief"
  ]);
  assert.equal(Object.keys(registry.byId).length, 10);
});

test("iedere bron heeft een unieke ID, absolute HTTPS-routes en parsercontract", () => {
  const ids = registry.SOURCES.map(source => source.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const source of registry.SOURCES) {
    assert.ok(source.name, source.id);
    assert.ok(["rss", "gemeente-html-detail", "rtv-oost-html", "rtv-vechtdal-html", "vechtdal-centraal-chain", "newsletter-kv"].includes(source.parser), source.id);
    assert.equal(new URL(source.url).protocol, "https:");
    assert.equal(new URL(source.homepage).protocol, "https:");
    assert.ok(Array.isArray(source.fetchOrder) && source.fetchOrder.length > 0, source.id);\n    for (const route of source.fetchOrder) assert.equal(new URL(route).protocol, "https:");\n    for (const fallback of source.fallbacks) assert.equal(new URL(fallback).protocol, "https:");
    assert.equal(registry.byId[source.id].id, source.id);
  }
});

test("gemeente-, RTV- en Vechtdal-fallbackroutes zijn expliciet vastgelegd", () => {
  assert.equal(registry.byId["Gemeente Ommen"].url, "https://www.ommen.nl/actueel/");
  assert.equal(registry.byId["RTV Oost"].parser, "rtv-oost-html");
  assert.deepEqual(Array.from(registry.byId["RTV Vechtdal"].fetchOrder), ["https://rtvvechtdal.nl/", "https://rtvvechtdal.nl/feed/"]);
  assert.deepEqual(Array.from(registry.byId["Vechtdal Centraal"].fetchOrder), [
    "https://www.vechtdalcentraal.nl/",
    "https://api.rss2json.com/v1/api.json"
  ]);
});

test("nieuwsbrief is herkenbaar als KV-afhankelijke route met geïsoleerde fixture-eis", () => {
  const newsletter = registry.byId["Nieuwsbrief"];
  assert.equal(newsletter.parser, "newsletter-kv");
  assert.equal(newsletter.isolatedFixtureRequired, true);
});
