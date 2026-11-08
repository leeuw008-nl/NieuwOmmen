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


## 8. Ommen City 403 nader vastgesteld (8 november 2026)
- GitHub Actions run 42484489545 (commit `4c5f92137173aa46c3b78749f234f829c51a2b41`) is geslaagd. De test legde voor de bestaande openbare feedaanvraag `https://ommencity.nl/feed/` de foutrespons beperkt vast.
- Response: HTTP 403, `server: cloudflare`, `cf-mitigated: challenge`, content-type HTML. De body begint met “Just a moment...”. Dit is dus aantoonbaar een Cloudflare challenge vanuit de GitHub Actions-uitgaande verbinding, niet een gewone ontbrekende RSS-feed.
- Er is geen challenge opgelost, geen browser-/cookie-/proxy-omweg gebruikt en geen toegangsbeperking omzeild. De bron blijft in de test als niet beschikbaar gemarkeerd. Of de productie-Worker vanaf Cloudflare dezelfde challenge krijgt, is hiermee niet vastgesteld; GitHub Actions en Cloudflare Worker zijn verschillende uitvoeromgevingen.
- De test blijft veilig: pushpogingen 0, pushverzendingen 0, KV-lezingen 0, KV-schrijfacties 0. Geen Worker of cron is uitgerold of geactiveerd.


## 9. RTV Oost-parserproef en simulatie filters (8 november 2026)
- De HTML van `https://www.oost.nl/nieuws/vechtdal` bevat echte artikelkaarten met links in het patroon `/nieuws/{numeriek-id}/{slug}`. De kaart heeft een `publishedAt`-attribuut en een `h3.title`. De oude productieparser selecteerde ook navigatie-/categoriepaden zoals `/nieuws/misdaad`; daarom leverde hij categorieën in plaats van individuele artikelen.
- De geïsoleerde dry-run herkent nu alleen het artikelpad met numeriek ID en slug, leest de titel uit `h3.title` en neemt `publishedAt` over als publicatiedatum. De vijf eerste herkende artikelkaarten in de gecontroleerde run waren echte artikelen, maar hun publicatiedata waren grotendeels ouder dan zes uur. De parser is uitsluitend in `worker-push-dryrun.js` aangepast; `worker-v280.js` is niet gewijzigd.
- Run 42484808232 (commit `8e304d46de2d3736959b431ecb4580d835962777`) slaagde voor syntaxis, read-only feeddiagnostiek en veiligheidsasserties. De daaropvolgende commit verwijdert alleen tijdelijke debuguitvoer; een nieuwe Actions-run wordt gebruikt om de definitieve branch-head te valideren.
- De simulatie gebruikt exact de datumlogica van `isRecentPushArticle()` in `worker-v280.js`: tijdstempels tussen één uur in de toekomst en zes uur oud; bij `_dateOnly` uitsluitend de huidige kalenderdatum in Europe/Amsterdam.
- Momentopname van 38 uitgelezen artikelen: 12 voldeden aan de datumvoorwaarde, 28 waren ouder/anderszins buiten het venster en 1 had geen publicatiedatum. Verdeling datumgeschikt: De Stentor 5, RTV Vechtdal 2, Vechtdal Centraal 5, RTV Oost 0, overige bronnen 0.
- Van de 38 titels voldeden er 10 aan de gemeentelijke trefwoordenlijst uit `isGemeenteArtikel()`: Natuurlijk Ommen 2, OudOmmen 2, RondOmmen 2, RTV Vechtdal 2 en Vechtdal Centraal 2. Dit is een simulatie op titel/description zoals de productiecode die ontvangt; de huidige RSS-parser levert geen description mee, dus feitelijk is hier alleen titeltekst getoetst.
- De 12 datumgeschikte items zijn nadrukkelijk geen 12 gegarandeerde pushberichten. De Stentor leverde vijf datumgeschikte maar inhoudelijk niet-Ommer titels; die zouden alleen door een abonnee met een gemeente-scope worden uitgesloten wanneer de gemeentelijke trefwoorden niet matchen. De uiteindelijke selectie per gebruiker hangt af van diens bronkeuzes, scope en pushEnabled-instellingen in productie-SYNC/SUBS. Die KV is niet gelezen en kan dus niet worden nagebootst.
- Voor RTV Oost zijn er in deze meetronde 0 datumgeschikte items: de vijf uitgelezen artikelkaarten zijn oud of hebben geen `publishedAt`. De parser haalt nu echte artikelen op, maar deze feedpagina levert op dit meetmoment geen recente pushkandidaat binnen het venster.
- Ommen City bleef een Cloudflare challenge (HTTP 403); Nieuwsbrief bleef bewust overgeslagen. Geen productie-KV gelezen, geen pushpoging, geen push verzonden, geen Worker of cron uitgerold/geactiveerd.


## 10. Definitieve hercontrole RTV Oost + filters (8 november 2026)
- De definitieve dry-run na het verwijderen van tijdelijke debuguitvoer is geslaagd: run 42484851676 (commit `1a79d565e3f42a2bfc4fc72af2ad1a34a9ef3e3d`). De workflowcontrole van de daarna bijgewerkte workflow is eveneens geslaagd: run 42484856576 (commit `8d6557a53c43bc249c2b73dee59eb5a7e6cda549`).
- Correctie op de voorlopige telling in §9: met de RTV Oost-parser actief zijn er 41 artikelen uitgelezen, 41 unieke canonieke URL's en 0 dubbele URL's. De bronverdeling is De Stentor 5, Gemeente Ommen 1, Natuurlijk Ommen 5, OudOmmen 5, RondOmmen 5, RTV Oost 5, RTV Vechtdal 10 en Vechtdal Centraal 5. Ommen City gaf HTTP 403; Nieuwsbrief bleef overgeslagen.
- De filterresultaten op dezelfde momentopname: 12 datumgeschikt, 28 buiten het datumvenster en 1 zonder datum. Datumgeschikt per bron: De Stentor 5, RTV Vechtdal 2 en Vechtdal Centraal 5. RTV Oost 0; zijn vijf herkende artikelkaarten waren ouder dan zes uur of misten een publicatiedatum.
- Gemeentelijke trefwoorden: 10 van 41 titels matchten. Dit is niet gelijk aan tien pushberichten. De echte abonnementskeuzes en scopes uit productie-SYNC/SUBS zijn niet uitgelezen en blijven buiten de simulatie.
- De nieuwe RTV Oost-parser is uitsluitend testcode in `worker-push-dryrun.js`. De productieparser in `worker-v280.js` is ongewijzigd en selecteert nog categorie-/navigatielinks. Een productiecorrectie is dus nog niet uitgevoerd of uitgerold.
- Veiligheidsasserties geslaagd: pushpogingen 0, pushverzendingen 0, KV-lezingen 0, KV-schrijfacties 0; geen Worker-deployment of cronactivatie.


## 11. Eerste inventarisatie app-filter versus pushfilter (8 november 2026)
Bestanden gecontroleerd op testbranch: `app.js`, `worker-v280.js` en `push.js`. Dit is een statische code-inspectie; er is geen app- of Worker-runtime aangeroepen.

### App-weergave in `app.js`
- `renderArticles()` bouwt de zichtbare lijst uit `allArticles`.
- Per bron gelden gebruikersinstellingen `aan`, `vandaag` en `scope`.
- `vandaag` betekent kalenderdag via `isSameDay()`; dit is niet hetzelfde als een rollend venster van zes uur.
- `scope==='gemeente'` gebruikt `isGemeenteArtikel()`, dat titel plus description tegen `GEMEENTE_ZOEK` controleert.
- Er is geen algemene zes-uursactualiteitsfilter in `renderArticles()`. De app kan dus artikelen tonen die ouder zijn dan zes uur zolang de gebruiker niet voor VANDAAG heeft gekozen.
- De zoekbalk filtert aanvullend op titel, description en bron.
- Bronkeuze en scope zijn opgeslagen in `nieuwsommen_bronnen_v2`.

### Pushselectie in `worker-v280.js`
- `isRecentPushArticle()` vereist een geldige publicatiedatum; normaal geldt een rollend venster van maximaal zes uur oud en één uur toekomst. Bij `_dateOnly` geldt alleen de huidige datum in Europe/Amsterdam.
- `shouldSendToSub()` controleert daarnaast account-/SYNC-status, pushEnabled, bronkeuze en `sourceScopes`.
- De gemeentecontrole gebruikt eveneens `isGemeenteArtikel()`. De actuele lijsten bevatten dezelfde plaatsnamen, waaronder Emsland, maar de app-lijst bevat dubbele vermeldingen. De implementaties waren afzonderlijk onderhouden.
- De pushselectie gebruikt dus andere actualiteitsregels dan de standaard app-weergave.

### Extra structureel verschil: artikelverzameling
- De app heeft eigen parsers in `app.js` en bestanden onder `parsing/`; de Worker heeft eigen `fetchBron()`-/parserlogica in `worker-v280.js`.
- De bronconfiguraties zijn niet volledig gelijk: bijvoorbeeld de app gebruikt voor Gemeente Ommen `/actueel/`, terwijl de Worker-bronconfiguratie `/feed/` gebruikt; RTV Vechtdal gebruikt in de app een homepage-/HTML-parser en in de Worker een eigen bronparser.
- Sommige app-parsers kennen een pollingmoment of `new Date()` toe wanneer een bron geen precieze publicatietijd levert. Dat kan een artikel ten onrechte actueel laten lijken. Dit moet per bron worden genormaliseerd en expliciet als echte datum, datum-zonder-tijd of onbekende datum worden gemodelleerd.
- Eén gedeelde filter kan de verschillen alleen oplossen als beide kanten ook hetzelfde genormaliseerde artikelcontract en dezelfde bron-/parseruitkomsten gebruiken. Alleen een gedeelde functie met twee verschillende artikelverzamelingen is onvoldoende.

### Conclusie en volgende technische stap
De verschillen zijn bevestigd. Het ontwerp wordt daarom uitgebreid tot één gedeelde artikelpipeline: bron ophalen/parsen naar één canoniek artikelcontract, daarna één gedeelde inhoudelijke filter/classificatie, en pas daarna de aparte app-weergavevoorkeuren respectievelijk push-aflevervoorwaarden. De app en Worker mogen geen eigen kopieën van gemeentelijke trefwoorden, datumregels of artikelgeldigheid houden.
- Eerst worden alle bronparsers, datumsemantiek en gemeentelijke trefwoorden vergeleken en als fixtures vastgelegd.
- Daarna wordt de gedeelde module ontworpen en getest in isolatie; pas vervolgens worden app.js en Worker op de testbranch aangesloten.
- Geen productiecode, productie-KV, abonnementen, cron of pushverzending is bij deze inventarisatie gewijzigd of gebruikt.


## 12. Verdiepte inventarisatie parsers, datums en gemeenteclassificatie (8 november 2026)

### 12.1 Gemeenteclassificatie is aantoonbaar niet identiek
De actuele `app.js`-lijst en de actuele lijst in `worker-v280.js` bevatten beide `Emsland`. De Worker-lijst is niet korter op dit punt; de app-lijst bevatte wel dubbele vermeldingen van `Stegeren` en `Ommerschans`. Beide losse implementaties gebruikten dezelfde eenvoudige substring-match op `title + description`. De eerdere inventarisatie die stelde dat Emsland in de Worker ontbrak, was onjuist en is hiermee gecorrigeerd.
Gevolg: voor Emsland was in deze actuele code geen inhoudelijk classificatieverschil aangetoond. Het onderhoudsrisico bleef wel bestaan doordat twee afzonderlijke lijsten konden gaan afwijken. Substring-match kan toevallige deelwoordmatches opleveren; de eerste centralisatiestap behoudt dit bestaande gedrag bewust om geen onverwachte wijziging in de selectie te introduceren.

### 12.2 Datumsemantiek per bron (huidige code)
| Bron / route | App-gedrag | Worker-gedrag | Geconstateerd risico |
|---|---|---|---|
| Algemene RSS/Atom | `parseRSSFull()` gebruikt `new Date()` als datum ontbreekt of niet wordt gevonden | `extractRssDate()` geeft `null`; `parseRSS()` bewaart dit als null | App kan een artikel zonder publicatiedatum als zojuist gepubliceerd behandelen; push weigert het |
| Gemeente Ommen | Overzicht parseert datum; detailverrijking kan bij ontbrekende echte tijd de pollingtijd invullen en opslaan | Worker gebruikt RSS `/feed/` en RSS-datum; geen overeenkomstige HTML-detailverrijking | Andere bronroute en andere datumkwaliteit; huidige app kan onbekende datum als actueel presenteren |
| RTV Oost | Eerst `publishedAt`; bij parserfallback wordt pollingtijd uit localStorage gebruikt | Worker generieke linkparser maakt artikelen met `pubDate:null` | App kan fallback-artikelen als recent tonen; Worker weigert ze |
| RTV Vechtdal | Homepage-parser kent `new Date()` toe; RSS-parser kent ook huidige datum toe als pubDate ontbreekt | Homepage-parser zet kalenderdatum op ISO-middernacht en `_dateOnly:true`; RSS zonder datum wordt null | App behandelt datumloze/alleen-datum-items als exact nu; Worker behandelt datum-only als kalenderdag en onbekend als ongeldig |
| Vechtdal Centraal | HTML-fallback kent `new Date()` toe; RSS gebruikt huidige datum bij ontbrekende pubDate | Worker gebruikt RSS-parser en kan geen RSS-datum als null bewaren | App-fallback kan oude of onbekende artikelen als nieuw sorteren/tonen; Worker weigert ontbrekende datum |
| Nieuwsbrief | Parser zet standaard `new Date()` en vervangt die alleen bij geldige datum | Nieuwsbrief is aparte KV-route; scheduled-bronloop slaat nieuwsbrief over | Niet in de gewone bronpipeline; aparte contract-/filterintegratie vereist |

### 12.3 Parserarchitectuur en bronconfiguratie
- De actieve app-parsers staan grotendeels inline in `app.js`. De map `parsing/` bevat losse exports met oudere of afwijkende varianten. Deze map mag niet zonder verificatie als de runtime-parser van de app worden beschouwd.
- De app en Worker hebben verschillende bronconfiguraties. Voorbeeld: Gemeente Ommen gebruikt in de app `https://www.ommen.nl/actueel/` als HTML-overzicht, maar de Worker gebruikt `https://www.ommen.nl/feed/` als RSS.
- RTV Oost gebruikt in de app een parser op `publishedAt` en een lokale pollingcache; de Worker gebruikt een eenvoudige generieke linkparser.
- RTV Vechtdal gebruikt in de app de homepage en heeft RSS als fallback; de Worker probeert de homepage en valt daarna terug op RSS.
- Vechtdal Centraal heeft in de app meerdere routes: feed, homepage en rss2json-fallback. De Worker gebruikt alleen de feed.
- De bronconfiguratie en parserkeuze moeten dus eerst als één expliciet bronregister worden vastgelegd. Een gedeelde filter bovenop twee verschillende bronroutes is niet voldoende.

### 12.4 Voorgesteld canoniek artikelcontract
De gedeelde pipeline moet per artikel ten minste de volgende velden opleveren:
- `id`: stabiele canonical artikelidentificatie;
- `sourceId`: één vaste bron-ID uit centraal bronregister;
- `title`, `description`, `link`: opgeschoonde tekst en canonical URL;
- `publishedAt`: ISO-8601 UTC-timestamp of `null`;
- `datePrecision`: `instant`, `date` of `unknown`;
- `dateOrigin`: bijvoorbeeld `rss`, `jsonld`, `publishedAt`, `detail` of `unknown`;
- `articleType`: `article`, `newsletter`, `category`, `navigation` of `unknown`;
- `isFallback`: expliciete indicatie van fallback-/storingsitems;
- `filterVersion`: versie van normalisatie/classificatie.
Pollingtijd mag nooit worden opgeslagen als publicatietijd. Als de bron geen publicatiedatum geeft, blijft `publishedAt=null` en `datePrecision='unknown'`; een eventuele sorteerfallback is presentatiegedrag en mag geen actualiteitsbeslissing beïnvloeden.

### 12.5 Eerste regressie-fixturematrix
Deze gevallen moeten identiek door app en push door de gedeelde inhoudelijke filter lopen:
1. Exact dezelfde titel/description met plaatsnaam Emsland: classificatie moet positief zijn in zowel titel als description.
2. Hoofdlettervarianten en de bestaande substringsemantiek worden expliciet getest; overstap naar woordgrenzen is een afzonderlijk inhoudelijk besluit en maakt geen deel uit van deze centralisatiestap.
3. Plaatsnaam in titel, alleen in description, en in geen van beide.
4. Geldige RSS-timestamp binnen 6 uur, exact op 6 uur, ouder dan 6 uur en 1 uur in de toekomst.
5. Datum-only artikel vandaag, gisteren en rond middernacht Europe/Amsterdam.
6. Ontbrekende, lege en ongeldige datum: nooit automatisch `new Date()` als publicatiedatum.
7. RTV Oost artikelkaart met echte `publishedAt`, zonder datum, en een categorielink zoals `/nieuws/vechtdal`.
8. RTV Vechtdal HTML-kaart met kalenderdatum versus RSS-item met tijd.
9. Vechtdal Centraal feedartikel versus HTML-fallback; dezelfde canonical URL moet dezelfde artikelidentiteit opleveren.
10. Gemeente Ommen HTML-overzicht versus RSS-item; dezelfde publicatie mag niet twee verschillende classificaties of datums krijgen.
11. Category-/tag-/navigation-links, lege titels, fallback-storingsmeldingen en ongeldige links worden niet als nieuwsartikel geaccepteerd.
12. Trackingparameters en URL-fragmenten veranderen de artikelidentiteit niet.
13. Nieuwsbrief krijgt een expliciet apart artikeltype en wordt niet per ongeluk als reguliere bron behandeld.

### 12.6 Besluit voor implementatievolgorde
1. Maak eerst het centrale bronregister en documenteer per bron de gewenste primaire route, toegestane fallback en parser.
2. Leg vervolgens datumextractie en datumprecisie vast; verwijder impliciete pollingtijd als publicatiedatum.
3. Eerste implementatiestap: centraliseer de gemeentelijke plaatsnamencontrole in één fysiek bestand en koppel app, Worker en dry-run daaraan.
4. Test dezelfde module met fixtures; pas daarna worden normalisatie, artikelgeldigheid, bronclassificatie en datumsemantiek als volgende gedeelde onderdelen toegevoegd.
5. De gedeelde inhoudelijke filter bepaalt uiteindelijk artikelgeldigheid en relevantie; gebruikersvoorkeuren, accountstatus, push-toestemming, deduplicatie en aflevering blijven aparte vervolgstappen.
Alle stappen blijven op `test/push-rebuild-2026-11-08`. Geen productiecode, KV, abonnementen, cron of pushverzending is gewijzigd of gebruikt.


## 13. Technische integratiekeuze en eerste gedeelde filterimplementatie (8 november 2026)
### Browser/Worker-compatibiliteit
- `index.html` laadt `app.js` met een gewone klassieke `<script>`; dit is geen ES-module.
- `worker-v280.js` is een ES-module Worker.
- Er is geen package/build-configuratie in de root die de app momenteel bundelt.
- Voorkeursontwerp voor één fysieke implementatie: een kleine zelfstandige, browser- en Worker-compatibele shared file zonder DOM- of Cloudflare-afhankelijkheden. De app laadt die vóór `app.js` als klassiek script; de module-Worker laadt exact hetzelfde bestand als side-effect import. De gedeelde API wordt via één gecontroleerde globale namespace beschikbaar gemaakt. Node-tests kunnen dezelfde bronfile rechtstreeks laden.
- Dit ontwerp voorkomt twee handmatig bijgehouden filterkopieën en vermijdt een brede migratie van de bestaande app naar ES-modules.
- De keuze is uitgevoerd op de testbranch: `article-filter.js` is één browser- en Worker-compatibele bronfile zonder DOM-/Cloudflare-afhankelijkheden. De app laadt deze vóór `app.js` als klassiek script; `worker-v280.js` en de geïsoleerde dry-run laden exact hetzelfde bestand via side-effect import.
- De API staat onder `globalThis.NieuwOmmenArticleFilter`; de eerste versie is `1.0.0`. De module bevat de centrale plaatsnamenlijst en `isMunicipalityArticle()`.
- De app, test-Worker en dry-run gebruiken nu deze functie in plaats van hun eigen gemeentelijke trefwoordenlijst. De lijst is ontdubbeld; Emsland is expliciet opgenomen.
- De bestaande substringsemantiek is bewust behouden om de selectie niet stilzwijgend te veranderen. Hoofdletterongevoeligheid, Emsland in titel/beschrijving, alle plaatsen en de huidige substringuitkomst hebben regressietests.
- `index.html` laadt `article-filter.js?v=1` vóór `app.js?v=339`. De app-cacheversie is verhoogd.
- GitHub Actions voert nu syntaxchecks en `node --test tests/article-filter.test.mjs` uit. De geïsoleerde dry-run kopieert de shared file mee naar zijn tijdelijke modulemap.
- Dit is nadrukkelijk de eerste centralisatiestap: de parsernormalisatie, artikelgeldigheid, categorie-/navigatieclassificatie en datumsemantiek zijn nog niet volledig gedeeld. De app-weergavevoorkeur VANDAAG en de push-aflevergrens van zes uur blijven voorlopig afzonderlijke kanaalregels. Geen productiecode is uitgerold; geen productie-KV gelezen/geschreven en geen push verzonden.

### Inhoudelijke bevestiging plaatsnamen
De gebruiker heeft bevestigd: Emsland hoort bij de plaatsnamen die voor de filter 'Gemeente Ommen' meetellen. De gedeelde lijst bevat Emsland.


## 14. Eerste gedeelde filter getest (8 november 2026)
- GitHub Actions-run [42488675070](https://github.com/leeuw008-nl/NieuwOmmen/actions/runs/42488675070), commit `1e91d46f6b64894f1c769849dde42ef8e55bf28a`, is geslaagd.
- De JavaScript-syntaxchecks voor `worker-push-dryrun.js`, `worker-v280.js`, `article-filter.js` en `app.js` zijn geslaagd.
- De vijf regressietests voor de gedeelde gemeentefilter zijn geslaagd (5 passed, 0 failed).
- De read-only feeddiagnostiek is geslaagd en de veiligheidsasserties bevestigen: `pushAttempts=0`, `pushSent=0`, `kvReads=0`, `kvWrites=0`; de dry-run heeft geen `scheduled()`-handler.
- Ommen City bleef in deze run HTTP 403 / Cloudflare challenge; de nieuwsbrief bleef bewust overgeslagen omdat die route productie-KV zou lezen.
- De run valideert de code op commit `1e91d46`; de latere commit `1849c98` heeft alleen de bevindingendocumentatie bijgewerkt. Er is geen deployment of wijziging aan `main` uitgevoerd.
