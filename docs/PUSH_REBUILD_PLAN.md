# Push-herbouw – testplan (8 november 2026)

## Veiligheidsgrenzen
- Deze branch is uitsluitend voor analyse en geïsoleerde tests.
- Geen wijziging aan `main`, de productie-Worker of de bestaande abonnementen.
- Geen echte pushverzending tijdens de eerste testfase.
- De bestaande bronfilters worden niet verwijderd uit productie; ze worden alleen in de testselectie buiten werking gelaten.
- De bestaande opslag (`SUBS`, `SYNC`, `SEEN`) wordt niet gewist of gemigreerd.

## Vastgestelde situatie in worker-v280.js
1. De cron verzamelt artikelen uit de bronnen en vergelijkt alleen de artikel-URL met de globale `SEEN.seen_links`-set.
2. Nieuwe URL's worden aan `seen` toegevoegd en opgeslagen vóór de datumcontrole, abonnementsselectie en pushverzending.
3. De verzending heeft geen afzonderlijke duurzame idempotency-registratie per combinatie artikel + abonnement.
4. `shouldSendToSub()` combineert meerdere selectielagen: accountstatus in `SYNC`, bronkeuze in `SUBS`, gemeente/regio-scope en `pushEnabled`.
5. `sendPush()` werkt de teller en laatste pushgegevens bij na HTTP-succes, maar controleert vooraf niet of hetzelfde artikel al naar dit abonnement is verzonden.
6. `service-worker.js` toont meldingen met een vaste Nieuw(s)Ommen-icon en badge. Het pushpayload bevat daarnaast icon/badge-velden. De afwijkende Android-appiconen moeten daarom ook worden onderzocht op PWA-manifest, service-worker-scope, oude registraties en eventuele andere afzender/origin.

## Risico's die eerst moeten worden uitgesloten
- Twee cron-uitvoeringen die overlappen of twee actieve schedulers.
- Dezelfde inhoud met verschillende URL-varianten (trackingparameters, redirects of canonieke URL).
- Een artikel dat opnieuw in een feed verschijnt nadat de globale SEEN-set is teruggezet, afgekapt of niet goed gelezen.
- Meerdere abonnementen/endpoints voor hetzelfde toestel of dezelfde gebruiker.
- Succesvolle pushacceptatie door de pushdienst gevolgd door een herhaalde poging, zonder idempotency-check.

## Nieuwe testselectie – gefaseerde aanpak
### Fase A – alleen verzamelen (geen push)
- Haal artikelen op uit alle tien bronnen.
- Normaliseer URL's conservatief en leg bron, titel, oorspronkelijke URL, canonieke sleutel en publicatiedatum vast.
- Registreer per cron-run een run-id en log aantallen per bron.
- Laat bestaande filters alleen als diagnostische velden meelopen; ze blokkeren niets in deze fase.
- Verzend nul pushberichten.

### Fase B – deduplicatie simuleren
- Dedupliceer eerst binnen één run op canonieke artikelidentiteit.
- Dedupliceer daarna over runs heen.
- Maak een aparte afleverstatus per artikel + abonnement: kandidaat, gereserveerd, verzonden, mislukt.
- Test herhaalde feeds, URL-varianten, overlappende runs en mislukte verzendingen.
- Een gewone Cloudflare KV read-then-write is geen atomische lock; gebruik die niet als enige garantie tegen gelijktijdige dubbele verzending. Controleer beschikbare bindings en kies een atomische opslag/lock (bijv. Durable Object of D1-transactie) vóór live verzending.

### Fase C – uniforme payload en icoon
- Eén vaste payloadstructuur en absolute icon/badge-URL's gebruiken.
- Controleren dat alle pushberichten van dezelfde Nieuw(s)Ommen-origin en service-worker-scope komen.
- Testen op een afzonderlijk testabonnement/toestel; geen productieabonnees gebruiken.

### Fase D – filters terugplaatsen
- Eerst alle bronnen toestaan, maar accounttoestemming en push-uit blijven altijd gerespecteerd.
- Daarna bronkeuze terugplaatsen.
- Daarna gemeente/regio-scope.
- Daarna datum-/actualiteitsfilter.
- Per filter een meetbare reden loggen waarom een artikel wordt toegelaten of geweigerd.

## Acceptatiecriteria vóór livegang
- Dezelfde artikelidentiteit kan per abonnement maximaal één keer als push worden geaccepteerd.
- Een herhaalde cron-run veroorzaakt geen tweede verzending.
- Een mislukte poging kan veilig opnieuw worden geprobeerd zonder duplicaat na een eerdere succesvolle acceptatie.
- Alle meldingen tonen hetzelfde Nieuw(s)Ommen-appicoon en dezelfde badge.
- De eerste testfase verstuurt aantoonbaar nul pushberichten.
- Pas na afzonderlijke goedkeuring wordt een gecontroleerde live test uitgevoerd.

## Nog te verifiëren
- De werkelijke Cloudflare dashboard-bindings en eventuele Durable Object/D1-resources; `wrangler.jsonc` bevat in de repository alleen de Worker-entrypoint en compatibiliteitsdatum.
- De ingestelde cron-triggers in Cloudflare Dashboard.
- De PWA-manifest-URL, service-worker-URL en scope op de live site en op het toestel.
