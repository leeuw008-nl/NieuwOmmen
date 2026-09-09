# Nieuws Ommen v600 - PARSING LOCKED - VOLLEDIG GESCHEIDEN

## AFSPRAAK - HEILIG - NOOIT ONGevraagd AANPASSEN

Dit project is volledig gescheiden per functie, juist omdat er in het verleden ongevraagd parsing werd aangepast en daarmee de output kapot ging.

### 1. /parsing/ = LOCKED - NOOIT AANRAKEN ZONDER EXPLICIET VERZOEK
- Bevat 10 bestanden, letterlijk de werkende versie van 1 sept 2024
- Elke file is een pure functie: `parse(html) => [{title, link, pubDate, description}]`
- Geen fetch, geen cache, geen side-effects
- Als een bron stuk gaat (0/0 rood), wordt alleen gemeld: "parsing/RTV Oost.js geeft leeg terug"
- Alleen de eigenaar past parsing/ aan als een bron echt van HTML structuur verandert

Bestanden:
- De Stentor.js - 847 bytes
- RondOmmen.js
- Ommen City.js
- OudOmmen.js
- Vechtdal Centraal.js
- Natuurlijk Ommen.js
- Gemeente Ommen.js
- RTV Oost.js - 429 bytes
- RTV Vechtdal.js - 374 bytes
- Nieuwsbrief.js

### 2. /fetch/ = alleen ophalen
- fetchViaWorker.js - haalt html op via worker + allorigins + rss2json fallback (voor Vechtdal)
- cache.js - leest/schrijft localStorage cache
- Mag aangepast worden als een bron geblokkeerd wordt door Cloudflare

### 3. /enrich/ = lange beschrijvingen ZONDER parsing aan te raken
- enrichOost.js - haalt og:description uit artikel pagina, raakt parsing/RTV Oost.js NIET aan
- Hier komt "maak beschrijving langer" vandaan
- Mag aangepast worden op verzoek voor langere beschrijving

### 4. /state/ = alleen filters onthouden
- state.js - loadState / saveState

### 5. /ui/ = alleen weergave
- leds.js - groen/rood ledjes
- articles.js - render artikelen
- filters.js - render filters

### 6. /config/ = alleen adressen
- bronnen.js - BRONNEN + BRON_URLS + MAX_PER_BRON

### 7. app.js = alleen draden aan elkaar
- 48 regels
- Importeert parsing, fetch, enrich, ui
- Bevat GEEN regex, GEEN parsing logica
- loadOneSource() doet: fetch -> parse -> enrich (alleen voor Oost)

## Werkwijze voortaan

- Vraag: "RTV Oost moet langere beschrijving" => alleen enrich/enrichOost.js aanpassen
- Vraag: "Vechtdal 0/0 rood" => alleen fetch/fetchViaWorker.js aanpassen
- Vraag: "LED blijft rood" => alleen ui/leds.js aanpassen
- NOOIT meer 10 parsing files tegelijk kleiner maken

## Deploy

index.html:
```html
<script type="module" src="app.js?v=600"></script>
```

GitHub Pages: main branch / root
