import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const sandbox = {};
vm.runInNewContext(readFileSync(new URL("../article-filter.js", import.meta.url), "utf8"), sandbox);
const filter = sandbox.NieuwOmmenArticleFilter;

test("gedeelde filtermodule is geladen en versieerbaar", () => {
  assert.equal(filter.VERSION, "1.0.0");
  assert.ok(Object.isFrozen(filter));
});

test("Emsland telt mee in Gemeente Ommen, zowel in titel als beschrijving", () => {
  assert.equal(filter.isMunicipalityArticle({ title: "Nieuws uit Emsland" }), true);
  assert.equal(filter.isMunicipalityArticle({ title: "Nieuwe plannen", description: "Ook in Emsland" }), true);
});

test("alle bestaande plaatsnamen blijven beschikbaar en zijn uniek", () => {
  const places = [...filter.MUNICIPALITY_PLACES];
  assert.ok(places.includes("Emsland"));
  assert.equal(new Set(places).size, places.length);
  for (const place of places) {
    assert.equal(filter.isMunicipalityArticle({ title: `Bericht uit ${place}` }), true, place);
  }
});

test("matching blijft hoofdletterongevoelig en behoudt bestaande substringsemantiek", () => {
  assert.equal(filter.isMunicipalityArticle({ title: "OMMEN in het nieuws" }), true);
  assert.equal(filter.isMunicipalityArticle({ title: "Een bericht zonder plaatsnaam" }), false);
  assert.equal(filter.isMunicipalityArticle({ title: "Ommenaar vertelt" }), true);
});

test("ontbrekende of niet-tekstuele velden geven geen fout", () => {
  assert.equal(filter.isMunicipalityArticle(null), false);
  assert.equal(filter.isMunicipalityArticle({ title: 42, description: null }), false);
});
