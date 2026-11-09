# Artikelvergelijking app ↔ push-Worker — bevindingen (9 november 2026)

## Doel en veiligheidsgrenzen

Deze analyse is uitsluitend voor `test/push-rebuild-2026-11-08`. Er is geen productiecode aangepast, geen Worker gedeployed, geen productie-KV gelezen of geschreven en geen pushbericht verzonden.

Doel is eerst een eerlijke vergelijking te maken: dezelfde bronrespons, dezelfde parseruitkomst en daarna dezelfde inhoudelijke filterbeslissing. De bestaande `worker-push-dryrun.js` is op dit moment nog geen volledige app↔Worker-pariteitstest.

## Vastgestelde verschillen in de broninventaris

Vergelijking van `app.js` (`BRON_URLS` en `loadOneSource()`) met `worker-push-dryrun.js` (`SOURCES` en `collect()`):

| Bron | App | Huidige dry-run | Gevolg |
|---|---|---|---|
| De Stentor | `https://www.destentor.nl/ommen/rss.xml` | dezelfde feed | URL gelijk; parser/veldnormalisatie moet nog gelijkgetrokken worden |
| Gemeente Ommen | `https://www.ommen.nl/actueel/` (HTML-overzicht + detailverrijking) | `https://www.ommen.nl/feed/` (RSS) | andere bronroute en andere artikelverzameling |
| Natuurlijk Ommen | `https://www.natuurlijkommen.nl/feed/` | dezelfde feed | URL gelijk; parser/veldnormalisatie moet nog gelijkgetrokken worden |
| Ommen City | `https://ommencity.nl/feed/` | dezelfde feed | URL gelijk; parser/veldnormalisatie moet nog gelijkgetrokken worden |
| OudOmmen | `https://weblog.oudommen.nl/feed/` | dezelfde feed | URL gelijk; parser/veldnormalisatie moet nog gelijkgetrokken worden |
| RondOmmen | `https://www.rondommen.nl/feed/` | dezelfde feed | URL gelijk; parser/veldnormalisatie moet nog gelijkgetrokken worden |
| RTV Oost | `https://www.oost.nl/nieuws/vechtdal` met app-parser en fallback | dezelfde pagina met vereenvoudigde HTML-anchorparser | URL gelijk, maar selectie, titels en datums kunnen verschillen |
| RTV Vechtdal | eerst `https://rtvvechtdal.nl/`, daarna RSS-fallback | homepage | primaire URL gelijk; parser/uitwijkgedrag verschilt |
| Vechtdal Centraal | feed, daarna homepage, daarna rss2json-fallback | alleen feed | fallbackketen ontbreekt in dry-run |
| Nieuwsbrief | Worker-endpoint `/newsletter/feed` | bewust overgeslagen | niet vergelijkbaar zolang de productie-KV-afhankelijke feed niet veilig geïsoleerd beschikbaar is |

## Vastgestelde parser- en datumverschillen

1. De app verrijkt Gemeente Ommen-overzichtsartikelen met detailpagina's; de dry-run leest momenteel RSS.
2. De app gebruikt voor RTV Oost een specifieke parser die `publishedAt` uitleest, plus een pollingfallback. De dry-run gebruikt een veel eenvoudiger anchorparser.
3. De app heeft voor Vechtdal Centraal drie routes (feed, homepage en rss2json). De dry-run test alleen de feed.
4. De app kent op meerdere plekken legacy-parseruitkomsten met `pubDate: new Date()` en `_dateOrigin: 'polling'`. De gedeelde filter herkent zulke pollingdatums als onbetrouwbaar voor actualiteitsselectie. De dry-run geeft bij RSS zonder datum `pubDate: null`. Die representaties zijn inhoudelijk verwant, maar niet identiek.
5. De app bouwt bron-ID, bronnaam, fallbackstatus en soms beschrijving op een andere plek op dan de dry-run. Vergelijking moet daarom plaatsvinden ná expliciete normalisatie naar één artikelcontract.
6. De app-weergave gebruikt `isToday()` voor de VANDAAG-voorkeur; de pushdry-run gebruikt `isRecentForPush()`. Dit zijn bewust verschillende kanaalvoorwaarden en mogen niet worden verward met de gedeelde inhoudelijke geldigheids-/relevantie-uitkomst.

## Conclusie

Een rechtstreekse vergelijking van de huidige dry-run-aantallen met de app-aantallen zou misleidend zijn. De dry-run haalt voor minstens Gemeente Ommen een andere route op, mist fallbackroutes voor Vechtdal Centraal en gebruikt andere parserlogica voor RTV Oost. De bestaande dry-run kan daarom nog niet bewijzen waarom een specifiek app-artikel wel of niet als pushkandidaat verschijnt.

## Volgende technische stap

Maak eerst een gedeelde broninventaris/collectorcontract voor app en Worker, zonder de bestaande app- of pushwerking te veranderen:

- per bron één primaire URL en expliciete fallbackvolgorde;
- per bron vastgelegde parser en parser-versie;
- één normalisatie naar `{source, title, link, description, publishedAt, datePrecision, dateOrigin, articleType, isFallback}`;
- bewaar de oorspronkelijke bronvelden en parserroute in diagnostiek;
- voer daarna exact dezelfde genormaliseerde artikelset door de gedeelde filter;
- rapporteer per artikel de bron, canonieke URL, datumherkomst, app-uitkomst, push-inhoudelijke uitkomst en aparte afleverreden.

De Nieuwsbrief blijft in de eerste vergelijking expliciet uitgesloten zolang daarvoor geen geïsoleerde testfixture bestaat. De dry-run moet aantoonbaar `pushAttempts=0`, `pushSent=0`, `kvReads=0` en `kvWrites=0` houden.

## Relevante code

- `app.js`: `BRON_URLS`, `loadOneSource()`, `renderArticles()`, `refreshNews()`
- `article-filter.js`: gedeelde validatie, gemeentematching en datumregels
- `worker-push-dryrun.js`: huidige geïsoleerde collector en filterdiagnostiek
- `worker-v280.js`: pushselectie, abonnementsfilters en huidige productie-Workerlogica
