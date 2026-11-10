import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker-v280.js";

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
function mockKV(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k,v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return {
    data,
    async get(key, type) {
      const value = data.get(key);
      if (value === undefined) return null;
      if (type === "json") { try { return JSON.parse(value); } catch { return value; } }
      return value;
    },
    async put(key, value) { data.set(key, String(value)); },
    async delete(key) { data.delete(key); },
    async list() { return { keys: [...data.keys()].map(name => ({ name })) }; }
  };
}

test("scheduled Worker: haalt artikel op, selecteert abonnement, verstuurt en registreert push", async () => {
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const vapidPrivate = await crypto.subtle.exportKey("jwk", vapid.privateKey);
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey));
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));

  const subs = mockKV({
    "stable-sub-id": {
      endpoint: "https://push.example.test/send",
      keys: { p256dh: b64url(uaPublic), auth: b64url(auth) },
      userId: "user-1",
      pushEnabled: true
    }
  });
  const sync = mockKV({
    "user-1": { state: { "De Stentor": { aan: true, vandaag: false, scope: "regio" } } }
  });
  const seen = mockKV();
  const env = {
    SUBS: subs, SYNC: sync, SEEN: seen,
    VAPID_PRIVATE_KEY: JSON.stringify(vapidPrivate),
    VAPID_PUBLIC_KEY: b64url(vapidPublic),
    VAPID_SUBJECT: "mailto:test@example.test"
  };

  const now = new Date();
  const rss = `<rss><channel><item><title>Ommen testbericht voor cron</title><link>https://example.nl/nieuws/ommen-testbericht</link><pubDate>${now.toUTCString()}</pubDate></item></channel></rss>`;
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls = { sources: 0, fallbackFeeds: 0, pushes: 0 };
  globalThis.setTimeout = callback => { callback(); return 0; };
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith("https://push.example.test/")) {
      calls.pushes++;
      return new Response("", { status: 201 });
    }
    calls.sources++;
    if (String(url).includes("rtvvechtdal.nl/feed/")) calls.fallbackFeeds++;
    if (String(url).includes("destentor.nl/ommen/rss.xml")) {
      return new Response(rss, { status: 200 });
    }
    return new Response("<rss><channel></channel></rss>", { status: 200 });
  };

  try {
    await worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, env, {});
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.equal(calls.sources, 10, "negen broncontroles plus één RTV Vechtdal-feedfallback");
  assert.equal(calls.fallbackFeeds, 1, "RTV Vechtdal gebruikt de bestaande feedfallback als de homepage geen items bevat");
  assert.equal(calls.pushes, 1, "exact één geschikte push wordt naar de pushservice gestuurd");
  const savedSub = await subs.get("stable-sub-id", "json");
  assert.equal(savedSub.pushCount, 1, "pushadministratie wordt na HTTP-succes bijgewerkt");
  assert.ok(savedSub.lastPush > 0);
  const seenLinks = await seen.get("seen_links", "json");
  assert.ok(seenLinks.includes("https://example.nl/nieuws/ommen-testbericht"));
  assert.equal([...seen.data.keys()].some(key => key.startsWith("delivery_")), false, "voltooide bezorgstatus wordt opgeruimd");
});


test("scheduled Worker: mislukte push blijft open en wordt in volgende cron opnieuw geprobeerd", async () => {
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const vapidPrivate = await crypto.subtle.exportKey("jwk", vapid.privateKey);
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey));
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const subs = mockKV({
    "stable-sub-id": {
      endpoint: "https://push.example.test/retry",
      keys: { p256dh: b64url(uaPublic), auth: b64url(auth) },
      userId: "user-1", pushEnabled: true
    }
  });
  const sync = mockKV({
    "user-1": { state: { "De Stentor": { aan: true, vandaag: false, scope: "regio" } } }
  });
  const seen = mockKV();
  const env = {
    SUBS: subs, SYNC: sync, SEEN: seen,
    VAPID_PRIVATE_KEY: JSON.stringify(vapidPrivate),
    VAPID_PUBLIC_KEY: b64url(vapidPublic),
    VAPID_SUBJECT: "mailto:test@example.test"
  };
  const rss = `<rss><channel><item><title>Ommen retrytest</title><link>https://example.nl/nieuws/ommen-retrytest</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const attempts = [];
  globalThis.setTimeout = callback => { callback(); return 0; };
  globalThis.fetch = async url => {
    if (String(url).startsWith("https://push.example.test/")) {
      attempts.push(attempts.length + 1);
      return new Response("", { status: attempts.length === 1 ? 503 : 201 });
    }
    if (String(url).includes("destentor.nl/ommen/rss.xml")) return new Response(rss, { status: 200 });
    return new Response("<rss><channel></channel></rss>", { status: 200 });
  };
  try {
    await worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, env, {});
    const firstSeen = await seen.get("seen_links", "json");
    assert.equal(firstSeen?.includes("https://example.nl/nieuws/ommen-retrytest") || false, false,
      "na HTTP 503 mag artikel niet als gezien worden gemarkeerd");
    const deliveryKeysAfterFailure = [...seen.data.keys()].filter(key => key.startsWith("delivery_"));
    assert.equal(deliveryKeysAfterFailure.length, 1, "bezorgstatus blijft beschikbaar voor retry");
    assert.deepEqual(await seen.get(deliveryKeysAfterFailure[0], "json"), [],
      "mislukte endpoint wordt niet als bezorgd opgeslagen");

    await worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() + 3600000 }, env, {});
    assert.equal(attempts.length, 2, "tweede cron probeert hetzelfde endpoint opnieuw");
    const savedSub = await subs.get("stable-sub-id", "json");
    assert.equal(savedSub.pushCount, 1, "alleen de geslaagde tweede poging telt mee");
    const finalSeen = await seen.get("seen_links", "json");
    assert.ok(finalSeen.includes("https://example.nl/nieuws/ommen-retrytest"));
    assert.equal([...seen.data.keys()].some(key => key.startsWith("delivery_")), false,
      "na succesvolle retry wordt tijdelijke bezorgstatus opgeruimd");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});


test("scheduled Worker: verstuurt alleen naar abonnementen die de app-bronselectie toestaat", async () => {
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const vapidPrivate = await crypto.subtle.exportKey("jwk", vapid.privateKey);
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey));
  const makeSub = async userId => {
    const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
    return {
      endpoint: `https://push.example.test/${userId}`,
      keys: { p256dh: b64url(uaPublic), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
      userId, pushEnabled: true
    };
  };
  const subs = mockKV({
    "sub-on": await makeSub("user-on"),
    "sub-off": await makeSub("user-off")
  });
  const sync = mockKV({
    "user-on": { state: { "De Stentor": { aan: true, vandaag: false, scope: "regio" } } },
    "user-off": { state: { "De Stentor": { aan: false, vandaag: false, scope: "regio" } } }
  });
  const seen = mockKV();
  const env = {
    SUBS: subs, SYNC: sync, SEEN: seen,
    VAPID_PRIVATE_KEY: JSON.stringify(vapidPrivate),
    VAPID_PUBLIC_KEY: b64url(vapidPublic),
    VAPID_SUBJECT: "mailto:test@example.test"
  };
  const rss = `<rss><channel><item><title>Ommen bronselectietest</title><link>https://example.nl/nieuws/ommen-selectietest</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const pushedEndpoints = [];
  globalThis.setTimeout = callback => { callback(); return 0; };
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.startsWith("https://push.example.test/")) {
      pushedEndpoints.push(value);
      return new Response("", { status: 201 });
    }
    if (value.includes("destentor.nl/ommen/rss.xml")) return new Response(rss, { status: 200 });
    return new Response("<rss><channel></channel></rss>", { status: 200 });
  };
  try {
    await worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, env, {});
    assert.deepEqual(pushedEndpoints, ["https://push.example.test/user-on"]);
    assert.equal((await subs.get("sub-on", "json")).pushCount, 1);
    assert.equal((await subs.get("sub-off", "json")).pushCount || 0, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});


test("scheduled Worker: Vechtdal Centraal gebruikt homepage-parser als de RSS-feed leeg is", async () => {
  const subs = mockKV();
  const sync = mockKV();
  const seen = mockKV();
  const env = { SUBS: subs, SYNC: sync, SEEN: seen };
  const html = '<h2 class="entry-title"><a href="/nieuws/ommen-fallback">Ommen opent een nieuw dorpsplein</a></h2>';
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls = { feed: 0, homepage: 0 };
  globalThis.setTimeout = callback => { callback(); return 0; };
  globalThis.fetch = async url => {
    const value = String(url);
    if (value === "https://www.vechtdalcentraal.nl/feed/") {
      calls.feed++;
      return new Response("<rss><channel></channel></rss>", { status: 200 });
    }
    if (value === "https://www.vechtdalcentraal.nl/") {
      calls.homepage++;
      return new Response(html, { status: 200 });
    }
    return new Response("<rss><channel></channel></rss>", { status: 200 });
  };
  try {
    await worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now() }, env, {});
    assert.equal(calls.feed, 1);
    assert.equal(calls.homepage, 1, "homepage wordt alleen als fallback opgehaald");
    const seenLinks = await seen.get("seen_links", "json");
    assert.ok(seenLinks.includes("https://www.vechtdalcentraal.nl/nieuws/ommen-fallback"));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});
