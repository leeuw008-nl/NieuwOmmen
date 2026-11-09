# App- en pushparserpariteit — herstel en uitgangspunten (9 november 2026)

## Besluit

De bestaande bronparsers in de app zijn leidend. Ze zijn na langdurig werk betrouwbaar gemaakt en worden niet opnieuw ontworpen, vereenvoudigd of vervangen. De pushverwerking moet exact dezelfde parserfuncties gebruiken.

## Herstel van de app

- `app.js` is teruggezet naar exact dezelfde inhoud als `main`.
- `index.html` is teruggezet naar exact dezelfde inhoud als `main`.
- De app laadt geen `source-registry.js` meer.
- De oorspronkelijke `BRONNEN`, `BRON_URLS`, parserfuncties en `loadOneSource()` zijn daarmee weer leidend.
- De toegevoegde bronregistry is verwijderd.

## Push-dry-run

De geïsoleerde `worker-push-dryrun.js` importeert de bestaande parserfuncties uit `app-source-parsers.js`. Die module bevat kopieën van de parserfuncties uit de herstelde `app.js`. De regressietest vergelijkt de functie-inhoud rechtstreeks met `app.js`, zodat afwijkingen voortaan worden gedetecteerd.

De gelijkgetrokken parserfuncties zijn:
- RSS/Atom: `parseRSSFull`
- Gemeente Ommen: `parseGemeenteOverview`, `extractDescAfter`, `extractGemeenteDate` en `enrichGemeenteWithDetail`
- RTV Oost: `parseRTVOostECHT`, `parseOostFull` en de oorspronkelijke fallback
- RTV Vechtdal: `parseRTVVechtdalECHT` en `parseRTVVechtdalFull`
- Vechtdal Centraal: `parseVechtdalCentraalECHT` en de oorspronkelijke fallback

De collector gebruikt de oorspronkelijke app-routes en volgorde:
- Gemeente Ommen: HTML-overzicht en detailverrijking.
- RTV Oost: de bestaande Vechtdal-HTML-parser.
- RTV Vechtdal: eerst de homepage, daarna de RSS-fallback.
- Vechtdal Centraal: eerst de feed, daarna de homepage, daarna rss2json.
- De overige nieuwsbronnen: de bestaande RSS-parser.

Alleen de transport-/opslagadapter verschilt waar de browseromgeving dat vereist: de dry-run heeft geen browser-`localStorage` of app-proxy. De parserfuncties zelf blijven gelijk. De dry-run gebruikt voor de tijdelijke parsercache geheugen binnen de uitvoering; dit is geen wijziging van de cache in de app.

## Filter en veiligheidsgrenzen

De bestaande `article-filter.js` blijft de gedeelde filtermodule. De dry-run voert geen pushberichten uit en leest of schrijft geen KV:
- `pushAttempts = 0`
- `pushSent = 0`
- `kvReads = 0`
- `kvWrites = 0`
- geen scheduled handler of cron

De Nieuwsbrief blijft overgeslagen omdat de feed productie-KV leest. Hiervoor is eerst een geïsoleerde fixture nodig.

## Validatie

`tests/app-parser-parity.test.mjs` controleert dat de gekopieerde parserfuncties byte-voor-byte overeenkomen met de oorspronkelijke functies in `app.js`, dat de appbestanden zijn hersteld en dat de dry-run de oorspronkelijke routes gebruikt.

De GitHub Actions-workflow is handmatig gestartbaar en is nog niet uitgevoerd. Er wordt dus nog geen claim gedaan dat de workflow of de live dry-run succesvol is.

## Reikwijdte

Alle wijzigingen staan uitsluitend op `test/push-rebuild-2026-11-08`. De productie-app en productie-Worker zijn niet aangepast of gedeployed. De volgende stap is de regressietest en daarna een geïsoleerde dry-run; pas na controle van de uitkomsten kan worden besloten over eventuele productie-invoering.
