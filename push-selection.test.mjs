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

test("Gemeente Ommen herkent datum en echte tijd zoals de app", async () => {
  const { parseGemeenteOverviewHtml, extractGemeenteDateHtml } = await import("./push-selection.js");
  const html='<h2><a href="/actueel/test">Ommen maakt plannen bekend</a></h2><p>10 november 2026, 12:35</p><p>Dit is een beschrijving van het bericht voor inwoners van Ommen.</p>';
  const [article]=parseGemeenteOverviewHtml(html,now);
  assert.equal(article.link,"https://www.ommen.nl/actueel/test");
  assert.equal(article.pubDate.getHours(),12);
  assert.equal(article.pubDate.getMinutes(),35);
  const meta=extractGemeenteDateHtml('<meta property="article:published_time" content="2026-11-10T11:20:00Z">');
  assert.equal(meta.toISOString(),"2026-11-10T11:20:00.000Z");
});

test("bezorgstatus voorkomt dubbele push en laat mislukte bezorging opnieuw proberen", async () => {
  const { getPendingDeliverySubscriptions, areDeliveriesComplete } = await import("./push-selection.js");
  const eligible=[{_id:"sub-a"},{_id:"sub-b"}];
  const delivered=new Set(["sub-a"]);
  assert.deepEqual(getPendingDeliverySubscriptions(eligible,delivered),[{_id:"sub-b"}]);
  assert.equal(areDeliveriesComplete(eligible,delivered),false);
  delivered.add("sub-b");
  assert.deepEqual(getPendingDeliverySubscriptions(eligible,delivered),[]);
  assert.equal(areDeliveriesComplete(eligible,delivered),true);
  const failedAttempt=new Set();
  assert.deepEqual(getPendingDeliverySubscriptions(eligible,failedAttempt),eligible);
  assert.equal(areDeliveriesComplete(eligible,failedAttempt),false);
});

import { processArticleDeliveries } from "./push-cron.js";

test("cron-integratie: mislukte push wordt later hervat zonder dubbele push", async () => {
  const article={link:"https://example.nl/a",source:"De Stentor",title:"Test"};
  const subs=[{_id:"sub-a"},{_id:"sub-b"},{_id:"sub-c"}];
  // Simuleer Cloudflare KV: elke cronrun laadt en bewaart een JSON-lijst.
  const mockKV=new Map();
  const loadDelivered=()=>new Set(JSON.parse(mockKV.get(article.link)||"[]"));
  const saveDelivered=async(link,ids)=>mockKV.set(link,JSON.stringify([...ids]));
  let delivered=loadDelivered();
  const attempts=[];
  let failB=true;
  const first=await processArticleDeliveries({
    article,subscriptions:subs,env:{},
    shouldSendToSub:async()=>true,
    sendPush:async sub=>{attempts.push(sub._id);if(sub._id==="sub-b"&&failB)return {ok:false};return {ok:true};},
    delivered,capacity:2,saveDelivered
  });
  assert.equal(first.attempts,2);
  assert.equal(first.accepted,1);
  assert.equal(first.failed,1);
  assert.equal(first.complete,false);
  assert.deepEqual([...loadDelivered()],["sub-a"]);
  failB=false;
  // Nieuwe cronrun: herstel status uitsluitend vanuit de KV-simulatie.
  delivered=loadDelivered();
  const second=await processArticleDeliveries({
    article,subscriptions:subs,env:{},
    shouldSendToSub:async()=>true,
    sendPush:async sub=>{attempts.push(sub._id);return {ok:true};},
    delivered,capacity:2,saveDelivered
  });
  assert.equal(second.complete,true);
  assert.equal(second.accepted,2);
  assert.deepEqual(attempts,["sub-a","sub-b","sub-b","sub-c"]);
  assert.deepEqual([...loadDelivered()],["sub-a","sub-b","sub-c"]);
  assert.equal(mockKV.size,1);
});

test("cron-integratie: filters bepalen eligible abonnementen en geen push buiten selectie", async () => {
  const article={link:"https://example.nl/b"};
  const subs=[{_id:"on"},{_id:"off"}];
  const sent=[];
  const result=await processArticleDeliveries({
    article,subscriptions:subs,env:{},
    shouldSendToSub:async sub=>sub._id==="on",
    sendPush:async sub=>{sent.push(sub._id);return {ok:true};},
    delivered:new Set(),capacity:35
  });
  assert.deepEqual(sent,["on"]);
  assert.equal(result.eligible,1);
  assert.equal(result.complete,true);
});


test("cron-integratie: harde limiet van 35 pogingen laat resterende abonnementen open", async () => {
  const article={link:"https://example.nl/c"};
  const subs=Array.from({length:40},(_,i)=>({_id:`sub-${i+1}`}));
  const sent=[];
  const first=await processArticleDeliveries({
    article,subscriptions:subs,env:{},
    shouldSendToSub:async()=>true,
    sendPush:async sub=>{sent.push(sub._id);return {ok:true};},
    delivered:new Set(),capacity:35
  });
  assert.equal(first.attempts,35);
  assert.equal(first.accepted,35);
  assert.equal(first.remaining,5);
  assert.equal(first.complete,false);
  assert.equal(sent.length,35);

  const second=await processArticleDeliveries({
    article,subscriptions:subs,env:{},
    shouldSendToSub:async()=>true,
    sendPush:async sub=>{sent.push(sub._id);return {ok:true};},
    delivered:first.delivered,capacity:35
  });
  assert.equal(second.attempts,5);
  assert.equal(second.remaining,0);
  assert.equal(second.complete,true);
  assert.equal(sent.length,40);
});

test("cron-integratie: artikel zonder eligible abonnementen vraagt geen pushpogingen", async () => {
  const result=await processArticleDeliveries({
    article:{link:"https://example.nl/d"},
    subscriptions:[{_id:"sub-a"},{_id:"sub-b"}],
    env:{},
    shouldSendToSub:async()=>false,
    sendPush:async()=>{assert.fail("sendPush mag niet worden aangeroepen");},
    delivered:new Set(),capacity:35
  });
  assert.equal(result.eligible,0);
  assert.equal(result.attempts,0);
  assert.equal(result.remaining,0);
  assert.equal(result.complete,true);
});
