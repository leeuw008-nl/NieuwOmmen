# Push-herbouw – eerste technische bevindingen
Datum: 8 november 2026
Branch: test/push-rebuild-2026-11-08

## 1. Cron en uitvoering
- De Worker-code bevat een `scheduled(event, env, ctx)`-handler.
- De Worker-rootresponse vermeldt expliciet `cron 0 */1 * * *` (ieder uur op minuut 0).
- `wrangler.jsonc` bevat géén `triggers.crons`-configuratie. De daadwerkelijk actieve cron-triggers zijn dus niet uit de repository vast te stellen; Cloudflare Dashboard moet worden gecontroleerd.
- De handler heeft geen expliciete globale lock of run-id/idempotency-guard. Twee overlappende of dubbel geconfigureerde cron-triggers kunnen daardoor dezelfde feed-items gelijktijdig verwerken.

## 2. Huidige deduplicatie
- `getSeenLinks()` leest één globale lijst `SEEN.seen_links`.
- De cron doet read → verzamelt nieuwe links → schrijft de lijst weg vóór datum- en abonnementsfilters.
- De lijst wordt beperkt tot de laatste 500 links.
- Dit is geen atomische claim/lock. Bij gelijktijdige runs kunnen beide runs dezelfde oude lijst lezen en hetzelfde artikel als nieuw behandelen.
- Er is geen duurzame afleverstatus per artikel + abonnement. `sendPush()` verhoogt alleen achteraf `pushCount` en bewaart `lastPushTitle`/tijd.
- Een retry na een onzekere netwerkuitkomst kan daarom ook opnieuw afleveren.

## 3. Push-identiteit en Android-melding
- RSS-artikelen krijgen als identiteit in de cron feitelijk hun feed-URL; parser maakt geen eigen stabiele artikel-ID.
- `sendPush()` gebruikt `article.id || article.link` als payload-id. Voor gewone RSS-items is dit doorgaans de URL.
- De serviceworker zet `tag: data.id || link`. Bij exact dezelfde tag binnen dezelfde serviceworkerregistratie hoort de browser de melding te vervangen in plaats van als afzonderlijke melding te stapelen.
- Twee zichtbare identieke Android-meldingen wijzen daarom op ten minste één van: verschillende URL-/ID-waarden, verschillende serviceworkerregistraties/scopes/origins, of een andere push-afzender/Worker. Dit is nog geen sluitend bewijs voor één oorzaak.

## 4. Icoonbevinding
- Worker-payload gebruikt `/icons/icon-192x192.png` en `/icons/badge-lion-96x96.png`.
- De serviceworker overschrijft de zichtbare notification icon met absolute URL `https://nieuwommen.leeuw008.nl/icons/icon-192x192.png` en badge `/icons/badge-lion-96x96.png`.
- Manifest bevat meerdere app-iconen (72, 96, 192, 512 en maskable 512).
- De verschillende Android-iconen kunnen ontstaan door verschillende origins/registraties of doordat Android/browser terugvalt op een site-/app-icoon wanneer een notificatie-icon niet goed wordt geladen. Live toestelregistraties en werkelijk afgeleverde payloads moeten worden gecontroleerd.

## 5. Conclusie en eerstvolgende verificaties
1. Cloudflare Dashboard: alle Cron Triggers van `ommen-push-v2` controleren; bevestigen dat er exact één actieve trigger is en het schema noteren.
2. Cloudflare Dashboard: controleren of er nog een tweede Worker/route/omgeving is die dezelfde bronnen pusht.
3. Live site: registratie(s), scope en script-URL van serviceworkers controleren; ook eventuele oude PWA-installatie/origin controleren.
4. Logging toevoegen op testbranch: unieke run-id, cron expression, scheduledTime, start/eindtijd en artikelcanonicalisatie; uitsluitend dry-run.
5. Pas daarna idempotente aflevering ontwerpen. KV read-then-write is geen veilige atomische lock; voor harde bescherming tegen overlappende runs is een atomische claim/lock nodig (bijv. Durable Object of D1-transactie).

## Veiligheidsstatus
Geen live Worker, cron-trigger, abonnement, KV-data of productie-push gewijzigd. Deze bevindingen zijn alleen documentatie op de testbranch.


## 6. Verificatie bronparser (testbranch, 8 november 2026)
- De geïsoleerde dry-run is afgestemd op de productieparser: maximaal vijf RSS/Atom-items per bron, dezelfde User-Agent als `fetchBron()`, dezelfde gespecialiseerde parser voor RTV Oost en RTV Vechtdal, en dezelfde prioriteitsvolgorde voor publicatiedatumvelden.
- Laatste gecontroleerde run na datumparser-afstemming: GitHub Actions run 42484144103, geslaagd (commit `88ac0247e1dbe88ef14eca76ff69ead6da68b94b`). Acht reguliere bronnen gaven HTTP 200; Ommen City gaf HTTP 403; de nieuwsbrief is bewust overgeslagen. Er werden 33 artikelen uitgelezen, 33 unieke canonieke URL's en nul dubbele URL's gevonden.
- De HTTP 403 voor Ommen City bleef bestaan met dezelfde User-Agent als productie. De oorzaak is niet vastgesteld; dit kan een server-/botfilter of netwerkafhankelijk toegangsbeleid zijn. Niet omzeilen en niet als geslaagde bron tellen.
- De nieuwsbriefroute is in `worker-v280.js` gedefinieerd als `/newsletter/feed` en `/api/newsletter/feed` op de Worker. Deze route leest `NEWSLETTER`-KV. De eerdere test-URL op het website-domein was daarom onjuist. De dry-run slaat de nieuwsbrief bewust over om productie-KV niet te lezen; de cron slaat deze bron eveneens over.
- De 33/33-uitkomst is slechts een momentopname van de eerste vijf items per bereikbare reguliere bron. Zij bewijst geen volledigheid over alle feeditems en nul URL-duplicaten bewijst niet dat inhoudelijk identieke artikelen met verschillende URL's ontbreken.
- Na de laatste kleine aanpassing van de datumparser is een nieuwe Actions-run vereist; run 42484093153 hoort bij commit `d63c5d81503d1764b91055ff3eeb2e88f41ebb71`, niet bij de huidige branch-head.


## 7. Inhoudelijke vergelijking met productieparser (8 november 2026)
- De geïsoleerde test bevat nu de parserfuncties `extractRssDate()`, `parseRSS()` en `parseRTVVechtdal()` uit `worker-v280.js`. Ook de RTV Oost-regel volgt de productiecode. De limiet is per productieregel toegepast: RSS maximaal 5, RTV Vechtdal maximaal 10.
- GitHub Actions run 42484354192 (commit `f44a0a5526f302ae226294ad42014cf0b7adb660`) slaagde. De parser leverde 38 items op: De Stentor 5, Gemeente Ommen 1, Natuurlijk Ommen 5, OudOmmen 5, RondOmmen 5, RTV Oost 2, RTV Vechtdal 10 en Vechtdal Centraal 5. Ommen City gaf HTTP 403; Nieuwsbrief is bewust overgeslagen.
- Er waren 38 unieke canonieke URL's en 0 dubbele URL's in deze momentopname.
- Inhoudelijke kwaliteitsbevindingen: de Gemeente Ommen-feed leverde alleen het oude standaardbericht “Hello world!” uit 2022. De vijf De Stentor-items bevatten onder meer Hardenberg, Zwolle en sportnieuws buiten Ommen; de feed-URL `/ommen/rss.xml` garandeert dus niet dat alle items specifiek over Ommen gaan.
- De huidige RTV Oost-parser selecteert op algemene links die beginnen met `/nieuws/`. De twee gevonden resultaten (“Misdaad & 112” en “Mens & Maatschappij”) zijn categorie-/navigatielinks en geen individuele nieuwsartikelen. Dit is een bestaande parserbeperking in productie, niet een verschil tussen dry-run en productie.
- De eerste vijf items van Natuurlijk Ommen, OudOmmen en RondOmmen waren op het meetmoment ouder dan de productiegrens van zes uur. Ze worden door `isRecentPushArticle()` niet als pushkandidaat toegelaten. De twee nieuwste RTV Vechtdal-items hadden de datum van de meetdag; de overige acht hadden een oudere datum. Vechtdal Centraal leverde vijf items met tijdstempels binnen de laatste zes uur.
- Dit is een inhoudelijke momentopname; feedvolgorde en inhoud veranderen. De dry-run verzendt geen push en leest geen productie-KV. De genoemde datumfilterbeoordeling is een simulatie op basis van de uitgelezen publicatiedata, geen daadwerkelijke cron-uitvoering.
- Ommen City: HTTP 403 blijft onverklaard. Geen poging gedaan om toegangsbeperkingen te omzeilen. Volgende veilige diagnostiek is alleen het vastleggen van responseheaders en een beperkte foutmelding van dezelfde openbare feedaanvraag.
