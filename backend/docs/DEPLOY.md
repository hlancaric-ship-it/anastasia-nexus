# Nasazení backendu ANASTASIA (Medusa v2)

**Medusa běží na klasickém Node hostu (VPS, Render, Railway, Fly, Hetzner...), NIKOLI na Cloudflare Workeru.**
Medusa potřebuje dlouho běžící Node proces, Postgres a (v produkci) Redis. NEXUS pricing Worker
na Cloudflare zůstává samostatně a Medusa ho volá server-to-server (`NEXUS_PRICING_URL`).
Storefront i admin se k Medusě připojují přes HTTPS.

## 1. Požadavky na hosting

| Komponenta | Požadavek |
|---|---|
| Node.js | 20 LTS nebo novější, npm |
| PostgreSQL | 14+, spravovaná instance se zálohami, `DATABASE_URL` s SSL (`?sslmode=require`) |
| Redis | 6.2+ / 7, povinný pro produkci (event bus, cache, workflow engine, locking); bez `REDIS_URL` se použijí in-memory moduly, které jsou jen pro lokální vývoj a jednu instanci |
| Úložiště souborů | S3-kompatibilní (AWS S3, Cloudflare R2); lokální disk na Node hostu je ephemerální |
| Doména | HTTPS, např. `api.<doména>`; reverzní proxy (Caddy/nginx) nebo PaaS TLS |
| Paměť | min. 1 GB RAM na instanci (build + admin) |

Orientační provozní náklady dle smlouvy (hosting Medusy + DB): cca 29 USD měsíčně.

## 2. Proměnné prostředí

Vzor: `.env.template`. Hodnoty se nastavují v prostředí hostingu (secrets), ne v gitu.

| Proměnná | Povinná | Popis |
|---|---|---|
| `NODE_ENV` | ano | `production` zapíná kontroly v `medusa-config.ts` |
| `DATABASE_URL` | ano | `postgres://...` |
| `JWT_SECRET`, `COOKIE_SECRET` | ano | min. 32 znaků, různé; generovat `openssl rand -hex 32` |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS` | ano | jen `https://` origin, čárkou oddělené, bez koncového `/` |
| `REDIS_URL` | produkce | `redis://` nebo `rediss://` |
| `STRIPE_API_KEY` | produkce | produkce: `sk_live_`/`rk_live_`; lokálně jen `sk_test_` (live klíč mimo produkci aplikace odmítne) |
| `STRIPE_WEBHOOK_SECRET` | produkce | `whsec_...` |
| `STRIPE_CAPTURE` | ne | výchozí `true` |
| `STRIPE_PAYMENT_METHOD_CONFIGURATION` | ne | ID konfigurace metod ze Stripe Dashboardu |
| `S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_BUCKET`, `S3_ENDPOINT` | doporučeno | všechny kromě `S3_ENDPOINT` musí být vyplněné, jinak se použije lokální disk; `S3_ENDPOINT` pro R2 |
| `BACKEND_PUBLIC_URL` | ne | veřejná URL backendu pro lokální soubory |
| `NEXUS_PRICING_URL`, `NEXUS_PRICING_API_KEY`, `NEXUS_TENANT_ID` | ano | viz `NEXUS-INTEGRATION.md`; shodné se secrety Workeru (`MEDUSA_PRICING_API_KEY`, `MEDUSA_PRICING_TENANT_ID`) |
| `ANASTASIA_REGION_COUNTRIES` | ne | výchozí `sk` |
| `ANASTASIA_WAREHOUSE_CITY/COUNTRY/ADDRESS` | ne | adresa skladu pro bootstrap |

V produkci `medusa-config.ts` spuštění odmítne (hodí chybu), pokud: není Postgres, secrety jsou slabé nebo shodné,
CORS není HTTPS, chybí live Stripe klíč nebo `whsec_`. Chybějící `REDIS_URL` a `S3_*` jen varuje.

### Funkce Fáze 1 (Klub, účet, chat, poukazy, konzultace, média, QR kupóny)

Bez těchto hodnot backend nastartuje, ale daná funkce v produkci selže nebo pošle odkaz na špatnou adresu.

| Proměnná | Popis |
|---|---|
| `MAGIC_LINK_BASE_URL` | URL potvrzení přihlášení na storefrontu |
| `ACCOUNT_URL`, `ACCOUNT_ORDERS_URL`, `ACCOUNT_BOOKINGS_URL` | odkazy v e-mailech na účet, objednávky a konzultace |
| `GIFT_VOUCHER_DELIVERY` | v produkci `notification` (jinak se kód poukazu jen zaloguje); po nasazení v adminu znovu uložit nastavení poukazů |
| `COUPON_LINK_STOREFRONT_ORIGIN` | `https://<storefront>`; bez ní admin nevygeneruje QR odkaz kupónu (500) |
| `CHAT_ADMIN_NOTIFY_EMAIL` | adresa pro souhrn nových zpráv; bez ní se souhrn jen zaloguje |
| `CONTACT_NOTIFY_EMAIL` | kam chodí zprávy z kontaktního formuláře (šablona `contact-form-admin`, odpověď jde odesílatelce); prázdné = `CHAT_ADMIN_NOTIFY_EMAIL`, bez obou formulář vrací 503 |
| `CHAT_ADMIN_URL` | URL chatu ve **vlastním** adminu (`https://<admin>/#/chat`); výchozí hodnota míří na Medusa `/app/chat`, který nepoužíváme |
| `CHAT_STOREFRONT_URL` | odkaz na chat v účtu zákaznice v e-mailu s odpovědí |
| `CHAT_RETENTION_DAYS` | retence obsahu chatu, 30–3650, výchozí 365 |
| `MEDIA_TOKEN_SECRET`, `MEDIA_DELIVERY_BASE_URL` | tajemství min. 32 znaků shodné s Workerem a URL doručení médií |
| `NEXUS_BOOKING_SYNC_SECRET` | shodné s Worker secretem `MEDUSA_BOOKING_SYNC_SECRET`; bez něj `/hooks/nexus/booking-order` vrací 503 |
| `OPS_INGEST_SECRET` | shodné s Worker secretem `OPS_INGEST_SECRET` (min. 32 znaků) |
| `LEGAL_TERMS_VERSION`, `LEGAL_PRIVACY_VERSION`, `NEWSLETTER_CONSENT_VERSION` | verze právních textů schválené vlastníkem textů |
| `ANASTASIA_FREE_SHIPPING_FROM_EUR`, `ORDER_SELF_CANCEL_BOOKING_HOURS` | doprava zdarma od částky, lhůta zrušení konzultace zákaznicí |

Klub (`pp_membership_stripe_membership`) nepotřebuje vlastní Stripe webhook: první platbu potvrzuje `settle`
po dokončení košíku a joby `membership-billing` / `membership-access-reconcile` (každých 10 minut) dohledají
přerušené platby a obnovy. Používá stejné `STRIPE_API_KEY`.

## 3. Stripe

1. V účtu Objednatele (LUCRAT s.r.o.) zapnout karty, Apple Pay a Google Pay (Settings > Payment methods; Apple Pay vyžaduje ověření domény storefrontu).
2. Provider v Medusě: `pp_stripe_stripe`. Storefront používá Stripe Payment Element (Apple Pay a Google Pay se zobrazí automaticky na podporovaných zařízeních).
3. Webhook endpoint ve Stripe: `https://<backend>/hooks/payment/stripe_stripe`, události minimálně
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated`, `payment_intent.canceled`.
   Signing secret vložit do `STRIPE_WEBHOOK_SECRET`.
4. Lokálně: `stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe` a test klíče.
5. Částku určuje výhradně backend (NEXUS cena -> Medusa cart -> platební relace); storefront cenu nikdy neposílá.

## 4. Notifikace (e-maily)

E-maily doručuje provider `src/modules/notification-zeptomail` (ZeptoMail HTTP API, EU datacentrum). Zapne se sám,
jakmile je nastavený `ZEPTOMAIL_API_KEY`; bez klíče zůstává provider `notification-log`, který e-maily jen zapíše
do logu (šablona a klíče dat, nikdy adresát ani obsah) – vhodné pro lokální vývoj a CI.

Šablony (SK) jsou v `src/modules/notification-zeptomail/templates.ts`: `magic-link-sk`, `booking-confirmed-sk`,
`booking-canceled-sk`, `gift-voucher-recipient-sk`, `gift-voucher-buyer-sk` (PDF v příloze), `chat-admin-digest`,
`chat-admin-reply`. Neznámá šablona skončí chybou, e-mail se neodešle naprázdno.

Postup zprovoznění:
1. V Zoho CPaaS (cpaas.zoho.eu, účet L-Code Dynamics, agent „Anastasia“ – ne sandbox) přidat doménu odesílatele a v Cloudflare vytvořit záznamy,
   které ZeptoMail vypíše: DKIM TXT a bounce CNAME, obojí **DNS only** (bez proxy). Počkat na ověření.
2. V agentovi vypnout sledování otevření/prokliků a vytvořit Send Mail token (API: `https://cpaas.zoho.eu/v1.1/email`).
3. Env: `ZEPTOMAIL_API_KEY`, `ZEPTOMAIL_FROM_EMAIL` (adresa z ověřené domény), volitelně `ZEPTOMAIL_FROM_NAME`,
   `ZEPTOMAIL_REPLY_TO`; pro doručování poukazů `GIFT_VOUCHER_DELIVERY=notification`.
4. Ověřit testovacím přihlášením (magic link) na vlastní adresu.

Chování: sledování otevření a prokliků je vypnuté (přepisování odkazů by rozbilo jednorázové přihlašovací odkazy),
neúspěšné odeslání se neopakuje (ZeptoMail nemá idempotenci, opakování by mohlo poslat e-mail dvakrát) a chyba
se zaloguje s HTTP stavem a kódem chyby ZeptoMail.

## 5. Kroky nasazení

1. Vytvořit Postgres a Redis, nastavit env (sekce 2).
2. `npm ci`
3. `npm run build` (vytvoří `.medusa/server`).
4. V `.medusa/server` nastavit env a spustit migrace: `npx medusa db:migrate` (v adresáři buildu: `cd .medusa/server && npm ci && npx medusa db:migrate`).
5. Jednorázově bootstrap e-shopu (idempotentní): `npx medusa exec ./src/scripts/anastasia-bootstrap.ts`
   (spouští se z kořene projektu, kde je zdrojový kód a `medusa-config.ts`). Vypíše publishable API klíč pro storefront.
6. Vytvořit admin uživatele: `npx medusa user -e <email> -p <heslo>` (heslo hned změnit, nikam neukládat).
7. Start: `npm run start` (`medusa start`) za reverzní proxy s HTTPS. Healthcheck: `GET /health`.
8. Nastavit Stripe webhook (sekce 3) a ověřit testovací platbu v test režimu před přepnutím na live klíče.
9. Ověřit NEXUS: `POST /store/nexus-cart` na testovacím košíku, shoda s cenou ve Workeru.

## 6. Provoz

- Zálohy Postgres (denně + PITR), pravidelné obnovení na test.
- Proces spouštět pod supervisorem (systemd/PM2/PaaS), `NODE_ENV=production`.
- Pro horizontální škálování nutný Redis; více instancí s in-memory moduly nefunguje.
- Admin dashboard běží ze stejného procesu; omezit přístup (`ADMIN_CORS`, případně IP/WAF).
- Tajemství rotovat při odchodu dodavatele nebo při podezření na únik.
