# ANASTASIA × NEXUS – produkční runbook pro spuštění 23. 10. 2026

Stav: 18. 10. 2026, integrační větev `claude/integration-launch` (PR #43). Nic není nasazeno ani mergnuto.
Dokument obsahuje jen postup a názvy proměnných. **Žádné skutečné klíče.** Hodnoty se zadávají přímo do hostingu,
Cloudflare a Stripe a nikdy nejdou do gitu ani do chatu s klientem.

Podrobnosti, na které runbook odkazuje:
- backend: `backend/docs/DEPLOY.md` (env §2, Stripe §3, ZeptoMail §4, kroky §5);
- NEXUS: `backend/NEXUS-INTEGRATION.md`;
- legacy redirecty: `backend/docs/wp/edge-redirects.md`;
- admin: `anastasia-admin/README.md`.

## 0. Architektura a domény

Domény jsou návrh, potvrzuje je vlastník (viz §9). DNS všech domén je na Cloudflare.

| Část | Kde běží | Doména (návrh) | Volá |
|---|---|---|---|
| Storefront (statický) | Cloudflare Pages, projekt `anastasia-web` | `www.anastasiaoz.eu` | backend, Stripe.js |
| Vlastní admin (statický) | Cloudflare Pages, projekt `anastasia-admin` | `admin.anastasiaoz.eu` (za Cloudflare Access) | backend |
| Backend Medusa 2.19 | Node 20 hosting + PostgreSQL 14+ + Redis | `api.anastasiaoz.eu` | NEXUS, Stripe, ZeptoMail, R2 |
| NEXUS Worker | Cloudflare Workers `nexus-api-production`, D1 `nexus-voucher`, DO `VOUCHER_SECURITY` | `nexus.anastasiaoz.eu` | backend (booking sync, ops events) |
| Obrázky produktů | R2 + veřejná doména | `media.anastasiaoz.eu` | – |

Storefront nikdy nevolá NEXUS přímo. Cenu počítá výhradně backend přes NEXUS (`/store/nexus-cart`, `/store/nexus-checkout`).

## 1. Párování tajemství (musí sedět na obou stranách)

Každé tajemství vygenerovat jednou (`openssl rand -hex 32`) a vložit na obě strany. Neshoda se projeví jako 401 nebo 503, nikdy jako tichá chyba.

| Backend (env hostingu) | NEXUS Worker (`wrangler secret put … --env production`) | Směr | Při neshodě |
|---|---|---|---|
| `NEXUS_PRICING_URL` = `https://nexus.anastasiaoz.eu/api/nexus/pricing` | – | backend → Worker | košík 503 |
| `NEXUS_PRICING_API_KEY` | `MEDUSA_PRICING_API_KEY` | backend → Worker | košík 503 |
| `NEXUS_TENANT_ID` (např. `anastasia`) | `MEDUSA_PRICING_TENANT_ID` | obě | košík 503 |
| `NEXUS_SAFEORDER_URL` (prázdné = odvodí se z pricing URL) | – | backend → Worker | pokladna 503 |
| `NEXUS_MEDUSA_WEBHOOK_URL` = `https://nexus.anastasiaoz.eu/api/webhooks/medusa` | – | backend → Worker | události se nedoručí |
| `NEXUS_MEDUSA_WEBHOOK_SECRET` | `MEDUSA_WEBHOOK_SECRET` | backend → Worker | 401 ve Workeru |
| `NEXUS_BOOKING_SYNC_SECRET` | `MEDUSA_BOOKING_SYNC_SECRET` + `MEDUSA_BOOKING_SYNC_URL` = `https://api.anastasiaoz.eu/hooks/nexus/booking-order` | Worker → backend | 503/401, termín se nepotvrdí |
| `OPS_INGEST_SECRET` | `OPS_INGEST_SECRET` + `OPS_INGEST_URL` = `https://api.anastasiaoz.eu/hooks/ops/edge-events`, `OPS_INGEST_TENANT_ID` | Worker → backend | 401, chybí provozní události |
| `MEDIA_TOKEN_SECRET` | `MEDIA_TOKEN_SECRET` | obě | chráněná média 401 (fáze 2) |
| – | `HMAC_SECRET` (jen Worker, poukazy NEXUS; **nesmí** být shodný s pricing klíčem) | – | – |
| – | `MEDUSA_PRICING_POLICY_JSON` | – | košík 503 (Worker odmítne chybějící politiku) |
| – | `ENVIRONMENT=production` | – | bez něj by Worker nebyl v přísném CORS režimu |
| – | `ALLOWED_ORIGINS` = `https://www.anastasiaoz.eu` | – | – |

`MEDUSA_PRICING_POLICY_JSON` musí obsahovat `loyaltyTiers`, `brandLimits`, `categoryLimits` a `brandSaleDiscounts`.
Klíče `loyaltyTiers` odpovídají skupinám z bootstrapu: `ZR1` Bronze, `ZR2` Silver, `ZR3` Gold, `ZR4` VIP.
Na launch jsou úrovně **prázdné** (`"loyaltyTiers":{}`), tedy bez věrnostních slev; stejně běželo E2E.
Procenta si zvolí Lucia sama v adminu, jakmile bude editor politiky (fáze 2, §9). Do té doby je nevymýšlíme.

## 2. Pořadí nasazení (den D-2 až D)

Každý krok končí ověřením. Bez zeleného ověření se nepokračuje.

### 2.1 Merge a tag (Jose)
1. Review a merge PR #43 (obsahuje #38–#42) do `master`. CI musí být zelené na posledním commitu.
2. Tag `launch-2026-10-23` na merge commitu. Z tohoto tagu se buildují všechny části.

### 2.2 PostgreSQL a Redis
1. Spravovaný PostgreSQL 14+ v EU: SSL (`?sslmode=require`), denní snapshot, PITR alespoň 7 dní, šifrování at rest.
2. Redis 7 (`rediss://`), ve stejném regionu jako backend.
3. Aplikační DB uživatel bez superuser práv.

### 2.3 Backend
Postup je v `backend/docs/DEPLOY.md` §5. Doplňky pro launch:
1. Env podle DEPLOY §2 včetně „Funkce Fáze 1“.
   - `medusa-config` v `NODE_ENV=production` vyžaduje silné secrety, HTTPS CORS, **live** Stripe klíč a `whsec_`; testovací klíč odmítne.
     Mimo produkci naopak odmítne live klíč. Smoke test s testovacími kartami proto běží jako fáze A (§3) se stejným buildem
     a `NODE_ENV=staging` a testovacím Stripe klíčem. Ostrý start (fáze B) běží s `NODE_ENV=production` a live klíčem.
   - CORS:
     - `STORE_CORS=https://www.anastasiaoz.eu`;
     - `ADMIN_CORS=https://admin.anastasiaoz.eu`;
     - `AUTH_CORS=https://www.anastasiaoz.eu,https://admin.anastasiaoz.eu`.
   - URL do e-mailů:
     - `MAGIC_LINK_BASE_URL=https://www.anastasiaoz.eu/prihlasenie/potvrdit`;
     - `ACCOUNT_URL=https://www.anastasiaoz.eu/ucet` a odvozené URL objednávek a konzultací;
     - `CHAT_ADMIN_URL=https://admin.anastasiaoz.eu/#/chat`;
     - `COUPON_LINK_STOREFRONT_ORIGIN=https://www.anastasiaoz.eu`.
   - Pošta:
     - `GIFT_VOUCHER_DELIVERY=notification`;
     - `CONTACT_NOTIFY_EMAIL` a `CHAT_ADMIN_NOTIFY_EMAIL` = schránka Lucie.
   - Právní texty: `LEGAL_TERMS_VERSION`, `LEGAL_PRIVACY_VERSION` a `NEWSLETTER_CONSENT_VERSION`. Bez `NEWSLETTER_CONSENT_VERSION` newsletter v patičce slušně odmítne přihlášení.
   - Obrázky: `S3_*` na R2 bucket obrázků, `S3_FILE_URL=https://media.anastasiaoz.eu`.
2. **Záloha před migrací** (i na prázdné DB, kvůli ověření postupu): `pg_dump -Fc -f pre-migrate-<datum>.dump "$DATABASE_URL"`.
   Dump uložit šifrovaně mimo server a zkusit `pg_restore --list`.
3. `npm ci && npm run build`, pak v `.medusa/server` `npx medusa db:migrate`.
4. `npx medusa exec ./src/scripts/anastasia-bootstrap.ts` (idempotentní). Vypíše publishable key `pk_…` a založí region `reg_…`.
   Obě hodnoty jsou veřejné a jdou do buildu storefrontu.
5. Admin uživatel: `npx medusa user -e <e-mail Lucie> -p <dočasné heslo>`. Heslo předat jiným kanálem a hned změnit.
6. Start za HTTPS.
   - Ověření: `curl -fsS https://api.anastasiaoz.eu/health` vrátí `OK`.
   - V logu nesmí být varování o chybějícím `REDIS_URL` ani `S3_*`.

### 2.4 NEXUS Worker
```sh
cd nexus
npx wrangler d1 migrations list nexus-voucher --remote --env production      # co chybí (0001–0007)
npx wrangler d1 export nexus-voucher --remote --env production --output pre-launch-nexus.sql   # záloha D1
npx wrangler d1 migrations apply nexus-voucher --remote --env production
# secrets z §1 (každý zvlášť, hodnotu zadat interaktivně, nikdy jako argument):
npx wrangler secret put MEDUSA_PRICING_API_KEY --env production
#   … MEDUSA_WEBHOOK_SECRET, MEDUSA_BOOKING_SYNC_SECRET, MEDUSA_BOOKING_SYNC_URL, OPS_INGEST_SECRET,
#     OPS_INGEST_URL, OPS_INGEST_TENANT_ID, HMAC_SECRET, MEDIA_TOKEN_SECRET,
#     MEDUSA_PRICING_POLICY_JSON (JSON politika z §1),
#     ENVIRONMENT (=production), MEDUSA_PRICING_TENANT_ID (=anastasia), ALLOWED_ORIGINS (=https://www.anastasiaoz.eu)
npx wrangler secret list --env production    # kontrola: 13 názvů výše, hodnoty se nevypisují
npx wrangler deploy --env production
```
- Custom domain `nexus.anastasiaoz.eu` přidat na Worker: Workers → Settings → Domains.
- Ověření: v adminu Prehľad → Pripravenosť obchodu bez blokeru NEXUS a `POST /store/nexus-cart` na testovacím košíku vrátí cenu.

`ENVIRONMENT`, `MEDUSA_PRICING_TENANT_ID` a `ALLOWED_ORIGINS` nejsou tajné, Worker je ale čte stejně ze secrets i z vars.
Jako secrets přežijí každý `wrangler deploy`. Varianta s `vars` v `env.production` ve `wrangler.jsonc` je §8/3.

### 2.5 Storefront (Cloudflare Pages)
- Pages projekt napojený na repo, produkční větev `master`.
- Root directory: kořen repa. Build potřebuje `backend/docs/wp/redirects-map.csv`.
- Build command: `node storefront-prototype/build.mjs`.
- Output: `storefront-prototype/dist`.
- Node 20+. Storefront nemá npm závislosti.

| Pages env (Production) | Hodnota |
|---|---|
| `ANASTASIA_SITE_URL` | `https://www.anastasiaoz.eu` (zapne canonical, sitemap, robots, HSTS) |
| `ANASTASIA_API_ORIGIN` | `https://api.anastasiaoz.eu` |
| `ANASTASIA_MEDIA_ORIGIN` | `https://media.anastasiaoz.eu` |
| `ANASTASIA_PUBLISHABLE_KEY` | `pk_…` z bootstrapu |
| `ANASTASIA_REGION_ID` | `reg_…` z bootstrapu |
| `ANASTASIA_STRIPE_PUBLISHABLE_KEY` | `pk_test_…`, po smoke testu `pk_live_…`, pak nový build |
| `SITE_THEME` | volitelně, výchozí motiv |

Neplatný tvar hodnoty build zastaví. Bez https se produkční build nedokončí.
Custom domain `www.anastasiaoz.eu` přidat v Pages → Custom domains.

### 2.6 Vlastní admin (Cloudflare Pages)
- Build: `cd anastasia-admin && ANASTASIA_API_ORIGIN=https://api.anastasiaoz.eu ANASTASIA_MEDIA_ORIGIN=https://media.anastasiaoz.eu node build.mjs`.
- Output: `anastasia-admin/dist`.
- Doména `admin.anastasiaoz.eu`. Doporučeno ji navíc chránit Cloudflare Access (e-mail OTP pro Lucii a správce) jako druhou vrstvu před přihlášením Medusy.
- Po prvním přihlášení:
  1. Nastavenia → Vzhľad.
  2. Poukazy → Nastavenie poukazov → **Uložiť** (DEPLOY §2 to vyžaduje kvůli `GIFT_VOUCHER_DELIVERY`).
  3. Konzultácie → typy a týždenná dostupnosť.

### 2.7 Stripe
Postup je v DEPLOY §3.
1. Endpoint `https://api.anastasiaoz.eu/hooks/payment/stripe_stripe` s událostmi:
   - `payment_intent.succeeded`;
   - `payment_intent.payment_failed`;
   - `payment_intent.amount_capturable_updated`;
   - `payment_intent.canceled`.
2. Signing secret uložit do `STRIPE_WEBHOOK_SECRET`.
3. Testovací a live režim mají **každý vlastní endpoint a vlastní `whsec_`**.
4. Apple Pay: ověřit doménu `www.anastasiaoz.eu` (Settings → Payment method domains).
5. Klub nepotřebuje vlastní webhook (DEPLOY §2).

### 2.8 Cloudflare DNS, TLS a redirecty
1. Záznamy:
   - `www` → Pages `anastasia-web`;
   - `admin` → Pages `anastasia-admin`;
   - `nexus` → Worker;
   - `media` → R2;
   - `api` → backend hosting (proxied, nebo DNS only dle hostingu).
2. SSL/TLS: Full (strict), Always Use HTTPS, HSTS až po ověření všech subdomén.
3. **Legacy URL** (`backend/docs/wp/edge-redirects.md`):
   - 27 starých cest z GSC na novém webu existuje beze změny (build to hlídá);
   - 16 je jen přesměrování schématu a hostu. Řeší je Redirect Rule:
     - `anastasiaoz.eu/*` → `https://www.anastasiaoz.eu/${1}`, 301, zachovat query;
     - přesměrování z `http` řeší Always Use HTTPS.
   - **NEXUS Worker se na `www` neroutuje.** Neobsluhuje stránky webu a vrátil by 404.
   - Mapa starých cest produktů je prázdná, dokud se neimportuje katalog s `legacy_path` (fáze 2).
4. DNSSEC: při přechodu z Websupportu nejdřív vypnout DS u registrátora, pak přesunout NS, pak zapnout DNSSEC v Cloudflare.
5. Pošta (MX, SPF) zůstává na Active24. Přidat jen záznamy ZeptoMail (§2.9).

### 2.9 ZeptoMail
Postup je v DEPLOY §4.
1. Doména odesílatele `anastasiaoz.eu`: DKIM TXT a bounce CNAME **DNS only**.
2. SPF na Active24 rozšířit o include ZeptoMail, pokud ho ZeptoMail vyžaduje.
3. Env: `ZEPTOMAIL_API_KEY`, `ZEPTOMAIL_FROM_EMAIL=noreply@anastasiaoz.eu`, `ZEPTOMAIL_FROM_NAME=ANASTASIA` a `ZEPTOMAIL_REPLY_TO` (schránka Lucie).
4. Ověření:
   - magic link na vlastní adresu;
   - kontaktní formulář: e-mail Lucii, „Odpovedať“ jde odesílatelce.

## 3. Smoke test

**Fáze A**: produkční infrastruktura a domény, `NODE_ENV=staging`, testovací Stripe klíč a testovací webhook endpoint.

Testovací karta `4242…` / 3DS `4000 0027 6000 3184`. Jen syntetické zákaznice s vlastními adresami týmu.

| # | Kontrola | Očekávání |
|---|---|---|
| 1 | Registrace magic linkem | e-mail dorazí, účet otevřen |
| 2 | Produkt → košík → doprava → pokladna | cena z NEXUS, doprava 6 €, DPH, objednávka v adminu |
| 3 | Admin: příprava → odeslání → refund 1 € | e-mail o odeslání, refund ve Stripe |
| 4 | Klub s 3DS | členství aktivní v účtu i adminu |
| 5 | Dárkový poukaz 50 € → uplatnění | e-mail obdarované s kódem, zůstatek se odečte |
| 6 | Konzultace: termín na webu → platba | termín `confirmed`, e-mail, v adminu |
| 7 | Kontakt + newsletter v patičce | e-mail Lucii, souhlas v adminu Newsletter |
| 8 | Chat z účtu → odpověď z adminu | e-mail se odkazem do účtu |
| 9 | `https://anastasiaoz.eu/zdrava-lekaren?utm_source=x` | 301 na `www`, query zachována |
| 10 | Admin Prehľad → Pripravenosť | žádný blocker |

**Fáze B**, přepnutí na live:
1. Backend: `NODE_ENV=production`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` (live endpoint) a restart. Start zároveň ověří silné secrety a HTTPS CORS.
2. Pages: `ANASTASIA_STRIPE_PUBLISHABLE_KEY=pk_live_…` a nový build.
3. Jedna skutečná malá platba vlastní kartou týmu → plný refund.
4. Teprve pak zveřejnit.

## 4. Zálohy

| Co | Jak | Kdo |
|---|---|---|
| PostgreSQL | denní snapshot + PITR ≥ 7 dní u poskytovatele; týdně `pg_dump -Fc` šifrovaně off-site (např. R2 s omezeným tokenem) | provoz (L-Code) |
| Před každou migrací | ruční `pg_dump -Fc`, ověřit `pg_restore --list` | kdo nasazuje |
| D1 `nexus-voucher` | Time Travel (30 dní) + `wrangler d1 export` před migrací | kdo nasazuje |
| R2 obrázky | originály jsou i v repu/importu; lifecycle bez mazání | – |
| Restore drill | 1× před launchem: dump → `pg_restore --single-transaction` do nové DB → `db:migrate` beze změn → počty řádků | L-Code |

Cíl (návrh, schvaluje vlastník): RPO 24 h (s PITR minuty), RTO 4 h.
Lokální postup obnovy je ověřený (INTEGRATION-REPORT §1, Bezpečnost). Produkční drill zatím neproběhl.

## 5. Rollback

| Část | Postup | Data |
|---|---|---|
| Storefront / admin | Pages → Deployments → předchozí → *Rollback* | žádná |
| NEXUS Worker | `npx wrangler rollback --env production` | D1 migrace jsou aditivní; při poškození D1 Time Travel restore na čas před migrací |
| Backend kód | nasadit předchozí tag/release | migrace Medusy jsou aditivní, starší kód nad novějším schématem běží |
| Backend data | `pg_restore --single-transaction` dumpu do **nové** DB → přepnout `DATABASE_URL` → restart; nebo PITR | objednávky vzniklé po dumpu dohledat ve Stripe |
| Platby | Stripe → vypnout webhook endpoint / vrátit test klíče; storefront do údržby přes rollback Pages | Klub joby se zastaví s procesem a nic neúčtují |

Rozhodnutí o rollbacku dat dělá Lucky nebo Jose. Kód a Pages může vrátit kdokoli z týmu.

## 6. Provoz po spuštění

1. První týden kontrolovat denně:
   - admin Prehľad (pripravenosť);
   - log backendu `level=error`;
   - Stripe → Webhooks (žádné failed).
2. 25. 10. (přechod na zimní čas): zkontrolovat obnovy Klubu v adminu Klub → Obnovy platieb (INTEGRATION-REPORT P2).
3. ZeptoMail: v Zoho CPaaS sledovat bounce a odmítnutí.

## 7. Co dodá vlastník (Lucia / LUCRAT s.r.o.)

| # | Co | Proč | Termín |
|---|---|---|---|
| 1 | Přístup do Stripe účtu LUCRAT (live): zapnuté platební metody, ověřená firma, vytvoření webhooků (nebo pozvánka pro L-Code) | live platby | 21. 10. |
| 2 | Schválené verze právních textů (VOP, ochrana údajů, souhlas s newsletterem) → `LEGAL_*_VERSION`, `NEWSLETTER_CONSENT_VERSION` | souhlasy v pokladně a newsletteru | 21. 10. |
| 3 | E-mailová schránka pro zprávy z webu a chatu (`CONTACT_NOTIFY_EMAIL`, `CHAT_ADMIN_NOTIFY_EMAIL`, `ZEPTOMAIL_REPLY_TO`) | kontakt, chat | 20. 10. |
| 4 | Potvrzení domén (§0) a přístup k registrátorovi kvůli DNSSEC/NS | DNS | 20. 10. |
| 5 | Doprava zdarma od částky, lhůta zrušení konzultace | env | 20. 10. |
| 6 | Katalog produktů a typy konzultací (lze zadat v adminu) | obsah obchodu | 22. 10. |
| 7 | Úhrada hostingu backendu + DB (cca 29 USD/měs. dle smlouvy) | provoz | 20. 10. |

## 8. Rozhodnutí a úkoly pro L-Code (Lucky / Jose)

1. **Hosting backendu + PostgreSQL + Redis** – volba poskytovatele (EU region, PITR). P0, bez toho nelze spustit.
2. Odsouhlasit dvoufázový smoke test (§3: fáze A `NODE_ENV=staging` + test klíče, fáze B produkce + jedna skutečná platba s refundem). Rozhoduje Jose.
3. Volitelně přesunout `ENVIRONMENT`, `MEDUSA_PRICING_TENANT_ID` a `ALLOWED_ORIGINS` do `vars` v `env.production` ve `wrangler.jsonc`, až budou domény potvrzené (malý PR).
4. Merge PR #43 → tag.
5. Cloudflare Access pro `admin.` (doporučení).

## 9. Fáze 2 (není nutné na 23. 10.)

- Editor věrnostních úrovní Bronze–VIP v adminu (funkce `loyalty`): procenta si nastaví Lucia sama, politika verzovaná na backendu → NEXUS.

- Materiály a faktury v účtu (R2 `MEDIA_BUCKET` binding ve Workeru, chráněná média).
- Legacy 301 cesty produktů po importu katalogu s `legacy_path` (`export-edge-redirects.ts` → manifest Workeru, route jen pro tyto cesty).
- SKU pro starší typy konzultací vzniklé před `3ecd65f` (nové typy z adminu SKU mají).
- Živý chat (polling), segmentace a rozesílka newsletteru, RBAC rolí v adminu.
- P2 položky z INTEGRATION-REPORT §3.
