import test from "node:test";
import assert from "node:assert/strict";
import { DeliveryLedgerSimulation, canonicalArticleKey } from "../delivery-simulation.js";

const article = (link = "https://example.org/nieuws/123/bericht") => ({
  title: "Testbericht",
  link
});

test("canonieke identiteit negeert alleen bekende trackingparameters en fragmenten", () => {
  assert.equal(
    canonicalArticleKey("HTTPS://Example.org/nieuws/123/bericht/?utm_source=mail&fbclid=abc#kop"),
    "https://example.org/nieuws/123/bericht"
  );
  assert.notEqual(
    canonicalArticleKey("https://example.org/nieuws/123/bericht?id=1"),
    canonicalArticleKey("https://example.org/nieuws/123/bericht?id=2")
  );
});

test("dezelfde artikelidentiteit wordt per abonnement maximaal eenmaal gereserveerd", () => {
  const ledger = new DeliveryLedgerSimulation();
  const first = ledger.claim(article(), "subscription-A");
  assert.equal(first.claimed, true);
  assert.equal(ledger.claim(article("https://example.org/nieuws/123/bericht?utm_campaign=x"), "subscription-A").claimed, false);
  assert.equal(ledger.get(article(), "subscription-A").status, "reserved");
});

test("een succesvol verzonden artikel wordt bij een herhaalde run niet opnieuw geclaimd", () => {
  const ledger = new DeliveryLedgerSimulation();
  const first = ledger.claim(article(), "subscription-A");
  ledger.markSent(first.key);
  assert.equal(ledger.get(article(), "subscription-A").status, "sent");
  assert.equal(ledger.claim(article(), "subscription-A").claimed, false);
});

test("dezelfde artikelidentiteit kan onafhankelijk per abonnement worden afgeleverd", () => {
  const ledger = new DeliveryLedgerSimulation();
  const a = ledger.claim(article(), "subscription-A");
  const b = ledger.claim(article(), "subscription-B");
  assert.equal(a.claimed, true);
  assert.equal(b.claimed, true);
  ledger.markSent(a.key);
  assert.equal(ledger.claim(article(), "subscription-A").claimed, false);
  assert.equal(ledger.get(article(), "subscription-B").status, "reserved");
});

test("een mislukte poging kan opnieuw worden geprobeerd; een gereserveerde poging niet", () => {
  const ledger = new DeliveryLedgerSimulation();
  const first = ledger.claim(article(), "subscription-A");
  assert.equal(ledger.claim(article(), "subscription-A").claimed, false);
  ledger.markFailed(first.key, "tijdelijke netwerkfout");
  const retry = ledger.claim(article(), "subscription-A");
  assert.equal(retry.claimed, true);
  assert.equal(ledger.get(article(), "subscription-A").attempts, 2);
});

test("statusovergangen zonder actieve reservering worden geweigerd", () => {
  const ledger = new DeliveryLedgerSimulation();
  assert.throws(() => ledger.markSent("ontbreekt"), /gereserveerde aflevering/);
  assert.throws(() => ledger.markFailed("ontbreekt"), /gereserveerde aflevering/);
});

test("ongeldige URL's en ontbrekende abonnement-ID's worden geweigerd", () => {
  const ledger = new DeliveryLedgerSimulation();
  assert.throws(() => canonicalArticleKey("javascript:alert(1)"), /geldige canonieke artikel-URL/);
  assert.throws(() => ledger.claim(article(), ""), /subscriptionId ontbreekt/);
});
