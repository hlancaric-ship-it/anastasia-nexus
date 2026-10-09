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

## 3. Stripe

1. V účtu Objednatele (LUCRAT s.r.o.) zapnout karty, Apple Pay a Google Pay (Settings > Payment methods; Apple Pay vyžaduje ověření domény storefrontu).
2. Provider v Medusě: `pp_stripe_stripe`. Storefront používá Stripe Payment Element (Apple Pay a Google Pay se zobrazí automaticky na podporovaných zařízeních).
3. Webhook endpoint ve Stripe: `https://<backend>/hooks/payment/stripe_stripe`, události minimálně
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.amount_capturable_updated`, `payment_intent.canceled`.
   Signing secret vložit do `STRIPE_WEBHOOK_SECRET`.
4. Lokálně: `stripe listen --forward-to localhost:9000/hooks/payment/stripe_stripe` a test klíče.
5. Částku určuje výhradně backend (NEXUS cena -> Medusa cart -> platební relace); storefront cenu nikdy neposílá.

## 4. Notifikace (e-maily)

Výchozí je placeholder provider `notification-local` (zapisuje do logu, kanály `email` a `feed`), aby objednávkové
workflow fungovalo bez SMTP. Před ostrým provozem je nutné přidat skutečný e-mailový provider
(Resend nebo SMTP): vytvořit modul provideru v `src/modules/<nazev>` (třída dědící `AbstractNotificationProviderService`,
`channels: ["email"]`), registrovat v `medusa-config.ts` v poli `providers` modulu notification místo lokálního
a doplnit klíče do env. Bez toho zákaznice nedostanou potvrzovací e-mail.

## 5. Kroky nasazení

1. Vytvořit Postgres a Redis, nastavit env (sekce 2).
2. `npm ci`
3. `npm run build` (vytvoří `.medusa/server`).
4. V `.medusa/server` nastavit env a spustit migrace: `npx medusa db:migrate` (v adresáři buildu: `cd .medusa/server && npm ci && npx medusa db:migrate`).
5. Jednorázově bootstrap e-shopu (idempotentní): `npx medusa exec ./src/migration-scripts/anastasia-bootstrap.ts`
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
