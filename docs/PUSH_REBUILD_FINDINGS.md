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
