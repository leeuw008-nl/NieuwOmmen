# Nieuw(s)Ommen Pushproef v1

Deze omgeving is volledig gescheiden van de bestaande app en Worker.

## Bestanden
- `index.html`, `app.js`: testpagina en aanmelden
- `service-worker.js`: eigen service-worker-scope
- `worker.js`: Web Push API en testverzending
- `wrangler.toml`: aparte Worker- en KV-configuratie

## Vereiste Cloudflare-inrichting vóór deployment
1. Maak een nieuwe KV-namespace aan; gebruik deze niet voor bestaande data.
2. Vervang in `wrangler.toml` de KV-placeholder door de nieuwe namespace-ID.
3. Genereer een nieuw VAPID P-256 keypair dat uitsluitend voor deze test wordt gebruikt.
4. Stel Worker secrets in: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` en een willekeurig sterk `TEST_TOKEN`.
5. Stel `VAPID_SUBJECT` en `TEST_APP_URL` in als vars.
6. Deploy uitsluitend met deze configuratie vanuit deze map: `npx wrangler deploy --config wrangler.toml`.

## Testvolgorde
1. Controleer `GET /health` en `GET /vapid`.
2. Open de testpagina via HTTPS en meld één apparaat aan.
3. Controleer in KV of het abonnement is opgeslagen; de API antwoordt alleen succesvol na teruglezen.
4. Verstuur daarna handmatig één testbericht via `POST /test-send` met `Authorization: Bearer <TEST_TOKEN>`.
5. Controleer ontvangst met de app gesloten en test het openen via de melding.

De testpagina heeft bewust geen knop om zelf pushberichten te verzenden. De geheime testtoken blijft uitsluitend aan de serverzijde. Er is geen cron-trigger en er worden geen bestaande accounts, abonnementen of KV-gegevens gelezen of gewijzigd.

## Nog te valideren
De Web Push encryptie en VAPID-ondertekening moeten vóór praktijktest met echte browserabonnementen worden gevalideerd. Een succesvolle Worker-deployment alleen geldt niet als bewijs dat push werkt.
