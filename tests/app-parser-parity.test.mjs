import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const parserModule = readFileSync(new URL("../app-source-parsers.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker-push-dryrun.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function functionSource(source, name) {
  const match = new RegExp("^(?:async )?function\\s+" + name + "\\s*\\(", "m").exec(source);
  assert.ok(match, "functie ontbreekt: " + name);
  const start = match.index;
  const next = [source.indexOf("\nfunction ", start + 1), source.indexOf("\nasync function ", start + 1)]
    .filter(index => index >= 0);
  let end = next.length ? Math.min(...next) : source.length;
  const exportAt = source.indexOf("\nexport {", start);
  if (exportAt >= 0 && exportAt < end) end = exportAt;
  return source.slice(start, end).trim();
}

const parserFunctions = [
  "parseVechtdalCentraalECHT",
  "parseRTVVechtdalECHT",
  "parseRTVOostECHT",
  "parseNieuwsbriefECHT",
  "parseOostFull_OLD",
  "parseVechtdalCentraalFallback_OLD",
  "parseOostFull",
  "parseVechtdalCentraalFallback",
  "parseRTVVechtdalFull",
  "parseRSSFull",
  "extractGemeenteDate",
  "extractDescAfter",
  "parseGemeenteOverview",
  "enrichGemeenteWithDetail"
];

test("app.js en index.html zijn teruggezet naar de ongewijzigde main-versies", () => {
  assert.doesNotMatch(app, /SOURCE_REGISTRY|source-registry\.js/);
  assert.doesNotMatch(html, /source-registry\.js/);
  assert.match(html, /app\.js\?v=339/);
});

test("alle bronparserfuncties in de pushmodule zijn byte-voor-byte gelijk aan app.js", () => {
  for (const name of parserFunctions) {
    assert.equal(functionSource(parserModule, name), functionSource(app, name), name + " wijkt af van app.js");
  }
});

test("push-dry-run gebruikt uitsluitend de oorspronkelijke app-parsermodule", () => {
  assert.match(worker, /from "\.\/app-source-parsers\.js"/);
  assert.doesNotMatch(worker, /function\s+(?:parseRSS|parseRTVOost|parseRTVVechtdal|parseGemeenteOverview|parseVechtdalCentraalHTML)\s*\(/);
  assert.match(worker, /pushAttempts:0,pushSent:0,kvReads:0,kvWrites:0/);
  assert.match(worker, /scheduledHandler:false/);
  assert.match(worker, /not_tested_production_kv/);
  assert.doesNotMatch(worker, /sendPush|scheduled\s*\(/);
});

test("de collector gebruikt dezelfde bronroutes en fallbackvolgorde als loadOneSource in app.js", () => {
  assert.match(worker, /https:\/\/www\.ommen\.nl\/actueel\//);
  assert.match(worker, /https:\/\/rtvvechtdal\.nl\//);
  assert.match(worker, /https:\/\/www\.vechtdalcentraal\.nl\/feed\//);
  assert.match(worker, /api\.rss2json\.com/);
  assert.match(worker, /parseOostFull\(html\)/);
  assert.match(worker, /parseRTVVechtdalFull\(html\)/);
  assert.match(worker, /parseGemeenteOverview\(html\)/);
  assert.match(worker, /parseVechtdalCentraalFallback\(body\)/);
});
