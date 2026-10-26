# 02 – Nasadenie (deploy)

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 22. 10. 2026

---

## 1. Úvod pre laika

„Nasadenie" znamená uvedenie novej verzie systému do prevádzky. Robí sa to zvlášť pre tri časti: **backend** (jadro obchodu), **web** a **administráciu**. Backend sa nasadzuje z repozitára cez Medusa Cloud, web a administrácia ako statické súbory cez Cloudflare Pages. NEXUS Worker sa nasadzuje príkazom z počítača správcu.

Tento dokument obsahuje **iba názvy premenných prostredia, nikdy ich hodnoty**. Hodnoty sa zadávajú priamo v nastavení Medusa Cloud, Cloudflare a Stripe a nikdy nejdú do repozitára, do e-mailu ani do chatu.

---

## 2. Čo kde beží a čím sa to nasadzuje

| Časť | Prostredie | Spôsob nasadenia | Výstup |
|---|---|---|---|
| Backend | Medusa Cloud, plán Develop, región `eu-central-1` | automaticky po každom nahratí do sledovanej vetvy repozitára (každé nahratie čerpá minúty buildu) | bežiaca Node služba |
| Web | Cloudflare Pages, projekt `anastasia-web` | build z repozitára | statické súbory v `storefront-prototype/dist` |
| Administrácia | Cloudflare Pages, projekt `anastasia-admin` | build z repozitára | statické súbory v `anastasia-admin/dist` |
| NEXUS Worker | Cloudflare Workers, `nexus-api-production` | príkaz `wrangler deploy` z počítača správcu | Worker a jeho väzby |
| Zálohy databázy | GitHub Actions, workflow `db-backup.yml` | plánovane každú noc, ručne podľa potreby | šifrovaný objekt v R2 |

Zdrojom pre všetky časti je jeden repozitár a jeden tag. Na spustenie 23. 10. 2026 je to tag `launch-2026-10-23`.

---

## 3. Backend na Medusa Cloud

### 3.1 Nastavenie projektu

1. Organizácia na `cloud.medusajs.com`, plán **Develop** (29 USD mesačne, uhradený, zodpovedá zmluve). Iný plán sa nevyužíva.
2. **Create project → Import from GitHub**, repozitár `anastasia-nexus`:
   - produkčná vetva `master`,
   - **Project root directory: `backend`**,
   - región `eu-central-1` (Frankfurt).
3. Pri vytvorení hneď vyplniť premenné prostredia. Bez nich prvý deploy spadne na kontrolách konfigurácie.
4. Deploy prebieha automaticky v tomto poradí: `npm ci` → `medusa build` → migrácie databázy → migration script `anastasia-bootstrap` → `medusa start`.

### 3.2 Čo Cloud spravuje sám

Tieto premenné sa **nevyplňujú**, dodáva ich Cloud: `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `PORT`, `MEDUSA_WORKER_MODE`, `EXECUTION_CONTEXT`, `SESSION_STORE` a nastavenia `MEDUSA_CLOUD_*`. Na Cloude sa ignorujú aj `S3_*` a `BACKEND_PUBLIC_URL`, pretože úložisko súborov spravuje Cloud.

Typ prostredia sa pozná podľa `MEDUSA_CLOUD_ENVIRONMENT_TYPE`, nie podľa `NODE_ENV`. Hodnota `production` znamená ostrú prevádzku, hodnoty `long-lived` a `preview-instance` sú neprodukčné a ostrý platobný kľúč v nich konfigurácia odmietne.

### 3.3 Overenie po nasadení

1. V Cloude → Deployments → Logs: build bez chyby, v logu záznam `[anastasia-bootstrap]` a verejný kľúč obchodu, žiadna chyba z konfigurácie.
2. `GET /health` na adrese backendu vráti `OK`.
3. V Cloude → Environment → Medusa Admin sa odčítajú dve verejné hodnoty: publishable key a identifikátor regiónu. Obe patria do buildu webu.

### 3.4 Správcovia administrácie

Príkaz `medusa user` na Cloude nie je dostupný. Postup je cez pozvánku:

1. V `<API>/app` (prihlásenie účtom Cloud) → Settings → Users → Invite na servisný e-mail dodávateľa.
2. Z odkazu pozvánky sa prevezme token a otvorí sa `https://admin.anastasiaoz.eu/#/pozvanka/<token>`. Heslo si pozvaný nastaví tam.
3. Z vlastnej administrácie (Nastavenia → Používatelia) sa pozve Lucia. Heslo si zvolí sama, nikto ho nepozná.

### 3.5 Prístup pre zálohy

V Cloude → Environment → Database sa vygeneruje **read-only connection string**. Vkladá sa priamo do GitHub secretu `BACKUP_DATABASE_URL`, nikam inam.

- **Restrict public access (IP allowlist) sa nezapína.** Bežci GitHubu nemajú pevné adresy a záloha by prestala fungovať. Ochranu tvorí heslo read-only účtu a TLS, skript bez TLS spojenie odmietne.
- Právo zápisu do databázy sa nezapína. Záloha ho nepotrebuje a skript účet s právom zápisu odmietne.

---

## 4. Backend na vlastnom serveri (alternatíva)

Táto časť platí, ak by sa backend niekedy presúval z Cloudu na vlastný Node hosting. Na launch sa nevyužíva.

Požiadavky: Node.js 20 LTS alebo novší, PostgreSQL 14 a novší so zálohami a SSL, Redis 6.2 alebo 7 pre produkciu, objektové úložisko R2, doména s HTTPS a reverzná proxy, aspoň 1 GB RAM na inštanciu.

Postup:

1. Vytvoriť PostgreSQL a Redis, nastaviť premenné prostredia podľa časti 5.
2. `npm ci`
3. `npm run build` (vytvorí `.medusa/server`)
4. V adresári buildu nastaviť premenné a spustiť migrácie: `cd .medusa/server && npm ci && npx medusa db:migrate`
5. Bootstrap prebehne ako súčasť migrácií. Ručne sa dá spustiť `npx medusa exec ./src/scripts/anastasia-bootstrap.ts` z koreňa projektu. Vypíše verejný kľúč pre web.
6. Vytvoriť správcu: `npx medusa user -e <email> -p <heslo>` a heslo hneď zmeniť.
7. Spustiť `npm run start` za reverznou proxy s HTTPS. Kontrola stavu je `GET /health`.
8. Nastaviť Stripe webhook a overiť testovaciu platbu pred prechodom na ostré kľúče.
9. Overiť NEXUS: `POST /store/nexus-cart` na testovacom košíku musí vrátiť cenu zhodnú s Workerom.

Pre viac inštancií je Redis povinný. Viac inštancií s pamäťovými modulmi nefunguje.

---

## 5. Premenné prostredia – iba názvy

Hodnoty sa zadávajú v nastavení hostingu ako tajomstvá. Nikdy nie do repozitára, nikdy do dokumentácie, nikdy do e-mailu.

### 5.1 Základ a bezpečnosť

| Názov | Význam |
|---|---|
| `NODE_ENV` | `production` zapína produkčné kontroly, mimo Cloudu |
| `MEDUSA_CLOUD_ENVIRONMENT_TYPE` | typ prostredia na Cloude, určuje ostrú prevádzku |
| `DATABASE_URL` | pripojenie do PostgreSQL |
| `REDIS_URL` | pripojenie do Redis, v produkcii povinné |
| `JWT_SECRET` | podpis relačných tokenov, minimálne 32 znakov |
| `COOKIE_SECRET` | podpis cookies, minimálne 32 znakov, iný ako JWT |
| `STORE_CORS` | povolené originy pre Store API, iba HTTPS |
| `ADMIN_CORS` | povolené originy pre Admin API, iba HTTPS |
| `AUTH_CORS` | povolené originy pre prihlásenie, iba HTTPS |
| `PAYMENTS_TEST_MODE` | dočasný prepínač testovacieho platobného režimu na produkte |

### 5.2 Platby

| Názov | Význam |
|---|---|
| `STRIPE_API_KEY` | tajný kľúč Stripe, v ostrom režime ostrý kľúč |
| `STRIPE_WEBHOOK_SECRET` | podpisový kľúč webhooku Stripe |
| `STRIPE_CAPTURE` | či sa platba strhne hneď, predvolene áno |
| `STRIPE_PAYMENT_METHOD_CONFIGURATION` | identifikátor konfigurácie platobných metód zo Stripe |

### 5.3 NEXUS

| Názov | Význam |
|---|---|
| `NEXUS_PRICING_URL` | adresa cenovej služby |
| `NEXUS_PRICING_API_KEY` | kľúč backendu voči Workeru, musí sa zhodovať s `MEDUSA_PRICING_API_KEY` |
| `NEXUS_TENANT_ID` | identifikátor obchodu, musí sa zhodovať s `MEDUSA_PRICING_TENANT_ID` |
| `NEXUS_SAFEORDER_URL` | adresa posudzovania rizika, prázdne znamená odvodenie z cenovej adresy |
| `NEXUS_OPERATIONS_URL` | adresa prevádzkových udalostí, prázdne znamená odvodenie |
| `NEXUS_MEDUSA_WEBHOOK_URL` | adresa, kam NEXUS posiela udalosti |
| `NEXUS_MEDUSA_WEBHOOK_SECRET` | podpis udalostí, musí sa zhodovať s `MEDUSA_WEBHOOK_SECRET` |
| `NEXUS_BOOKING_SYNC_SECRET` | podpis synchronizácie rezervácií, musí sa zhodovať s `MEDUSA_BOOKING_SYNC_SECRET` |
| `OPS_INGEST_SECRET` | podpis prevádzkových udalostí z okraja |
| `OPS_INGEST_TENANT_ID` | identifikátor obchodu pre prevádzkové udalosti |

### 5.4 E-maily a odkazy

| Názov | Význam |
|---|---|
| `RESEND_API_KEY` | kľúč e-mailovej služby Resend, bez neho sa e-maily iba logujú |
| `RESEND_FROM_EMAIL` | adresa odosielateľa z overenej domény |
| `RESEND_FROM_NAME` | meno odosielateľa |
| `RESEND_REPLY_TO` | adresa pre odpovede |
| `EMAIL_RECIPIENT_ALLOWLIST` | zoznam adries, kam sa v testovacom režime smie posielať |
| `CONTACT_NOTIFY_EMAIL` | kam chodia správy z kontaktného formulára |
| `CHAT_ADMIN_NOTIFY_EMAIL` | kam chodí súhrn nových správ z chatu |
| `CHAT_ADMIN_URL` | odkaz na chat vo vlastnej administrácii |
| `CHAT_STOREFRONT_URL` | odkaz na chat v účte zákazníka |
| `MAGIC_LINK_BASE_URL` | adresa potvrdenia prihlásenia |
| `ACCOUNT_URL` | adresa zákazníckeho účtu |
| `ACCOUNT_ORDERS_URL` | adresa objednávok v účte, prázdne znamená odvodenie z `ACCOUNT_URL` |
| `ACCOUNT_BOOKINGS_URL` | adresa konzultácií v účte, prázdne znamená odvodenie z `ACCOUNT_URL` |

### 5.5 Newsletter

| Názov | Význam |
|---|---|
| `NEWSLETTER_UNSUBSCRIBE_SECRET` | kľúč na podpis odhlasovacieho odkazu, bez neho sa neodošle nič |
| `NEWSLETTER_BATCH` | najviac e-mailov za jeden beh úlohy, predvolene 40 |
| `NEWSLETTER_DAILY_LIMIT` | najviac e-mailov za 24 hodín, predvolene 90 |
| `NEWSLETTER_PUBLIC_URL` | verejná adresa backendu pre odhlasovací odkaz |

### 5.6 Médiá a obsah

| Názov | Význam |
|---|---|
| `MEDIA_TOKEN_SECRET` | podpis odkazov na chránené médiá, minimálne 32 znakov, zhodné s Workerom |
| `MEDIA_DELIVERY_BASE_URL` | adresa doručovania médií cez Worker |
| `PROTECTED_R2_ENDPOINT`, `PROTECTED_R2_BUCKET`, `PROTECTED_R2_ACCESS_KEY_ID`, `PROTECTED_R2_SECRET_ACCESS_KEY` | súkromný bucket plateného obsahu, odkiaľ backend vydáva odkazy. Bez nich sa PDF a videá v knižnici neotvoria |
| `COUPON_LINK_STOREFRONT_ORIGIN` | origin webu pre generovanie QR odkazov kupónov |
| `COUPON_LINK_LEGACY_ORIGINS` | povolené pôvodné originy pre import už vydaných QR odkazov |
| `GIFT_VOUCHER_DELIVERY` | spôsob doručenia darčekových poukazov, v produkcii `notification` |
| `LEGAL_TERMS_VERSION` | verzia obchodných podmienok schválená vlastníkom textov |
| `LEGAL_PRIVACY_VERSION` | verzia zásad ochrany údajov |
| `NEWSLETTER_CONSENT_VERSION` | verzia súhlasu s newsletterom |

### 5.7 Obchodné nastavenia a retencia

| Názov | Význam |
|---|---|
| `ANASTASIA_REGION_COUNTRIES` | krajiny regiónu, predvolene Slovensko |
| `ANASTASIA_WAREHOUSE_CITY` | mesto skladu pre bootstrap |
| `ANASTASIA_WAREHOUSE_COUNTRY` | krajina skladu pre bootstrap |
| `ANASTASIA_WAREHOUSE_ADDRESS` | adresa skladu pre bootstrap |
| `ANASTASIA_FREE_SHIPPING_FROM_EUR` | hranica dopravy zdarma pri zakladaní dopravy |
| `ORDER_SELF_CANCEL_BOOKING_HOURS` | lehota na zrušenie konzultácie zákazníkom, predvolene 24 hodín |
| `CHAT_RETENTION_DAYS` | ako dlho sa uchováva obsah chatu, predvolene 365 dní |
| `OPS_EVENT_RETENTION_DAYS` | retencia prevádzkových udalostí, predvolene 90 dní |
| `OPS_AUDIT_RETENTION_DAYS` | retencia auditu administrácie, predvolene 1095 dní |

### 5.8 Úložisko na vlastnom serveri

Tieto názvy sa týkajú iba vlastného Node hostingu. Na Medusa Cloud sa nevyplňujú: `S3_BUCKET`, `S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT`, `BACKEND_PUBLIC_URL`.

### 5.9 Čo konfigurácia odmietne

V ostrom režime štart zlyhá, ak nie je PostgreSQL, ak sú tajomstvá slabé alebo rovnaké, ak niektorý CORS origin nie je HTTPS, ak chýba ostrý platobný kľúč alebo podpis webhooku, alebo ak je ostrý kľúč mimo ostrého prostredia. Chýbajúci `REDIS_URL` a `S3_*` iba varujú.

---

## 6. Web (Cloudflare Pages)

- Pages projekt napojený na repozitár, produkčná vetva `master`.
- Root directory: koreň repozitára. Build potrebuje `backend/docs/wp/redirects-map.csv`.
- Build command: `node storefront-prototype/build.mjs`
- Output: `storefront-prototype/dist`
- Node 20 a novší. Web nemá závislosti z npm.

Premenné prostredia (Production), iba názvy: `ANASTASIA_SITE_URL`, `ANASTASIA_API_ORIGIN`, `ANASTASIA_MEDIA_ORIGIN`, `ANASTASIA_PUBLISHABLE_KEY`, `ANASTASIA_REGION_ID`, `ANASTASIA_STRIPE_PUBLISHABLE_KEY`, voliteľne `SITE_THEME`.

- Neplatný tvar hodnoty build zastaví. Bez HTTPS sa produkčný build nedokončí.
- `ANASTASIA_MEDIA_ORIGIN` určuje, odkiaľ sa smú načítavať obrázky produktov. Kým nie je nastavená správne, obrázky sa na webe nezobrazia, nič iné to neovplyvní.
- Vlastná doména `www.anastasiaoz.eu` sa pridá v Pages → Custom domains.

---

## 7. Administrácia (Cloudflare Pages)

- Build: `cd anastasia-admin && ANASTASIA_API_ORIGIN=<adresa API> ANASTASIA_MEDIA_ORIGIN=<origin obrázkov> node build.mjs`
- Output: `anastasia-admin/dist`
- Doména `admin.anastasiaoz.eu`. Odporúčame ju chrániť aj Cloudflare Access (overenie e-mailovým kódom pre Luciu a správcu) ako druhá vrstva pred prihlásením.
- Origin administrácie musí byť v `ADMIN_CORS` a `AUTH_CORS` backendu.
- Build zapisuje adresu jadra do hlavičky stránky, nastavuje CSP s povoleným pripojením len na jadro, `noindex`, `X-Frame-Options: DENY` a HSTS. Bez HTTPS originu build skončí chybou.

Po prvom prihlásení do administrácie: Nastavenia → Vzhľad, potom Poukazy → Nastavenie poukazov → Uložiť (kvôli `GIFT_VOUCHER_DELIVERY`), potom Konzultácie → typy a týždenná dostupnosť.

Administrácia Medusy na `<API>/app` zostáva len pre servisné zásahy dodávateľa.

---

## 8. NEXUS Worker

1. Skontrolovať stav migrácií D1: `npx wrangler d1 migrations list nexus-voucher --remote --env production`
2. Pred migráciou spraviť zálohu: `npx wrangler d1 export nexus-voucher --remote --env production --output pre-launch-nexus.sql`
3. Aplikovať migrácie: `npx wrangler d1 migrations apply nexus-voucher --remote --env production`
4. Nastaviť tajomstvá, každé zvlášť, hodnotu zadávať interaktívne a nikdy ako argument príkazu. Názvy: `MEDUSA_PRICING_API_KEY`, `MEDUSA_PRICING_TENANT_ID`, `MEDUSA_PRICING_POLICY_JSON`, `MEDUSA_WEBHOOK_SECRET`, `MEDUSA_BOOKING_SYNC_SECRET`, `MEDUSA_BOOKING_SYNC_URL`, `OPS_INGEST_SECRET`, `OPS_INGEST_URL`, `OPS_INGEST_TENANT_ID`, `HMAC_SECRET`, `MEDIA_TOKEN_SECRET`, `ENVIRONMENT`, `ALLOWED_ORIGINS`.
5. Skontrolovať, že existuje všetkých 13 názvov: `npx wrangler secret list --env production` Hodnoty sa nevypisujú.
6. Nasadit: `npx wrangler deploy --env production`
7. Pridať vlastnú doménu `nexus.anastasiaoz.eu` vo Workers → Settings → Domains.

Overenie: v administrácii Prehľad → Pripravenosť obchodu nesmie hlásiť blokér NEXUS a `POST /store/nexus-cart` na testovacom košíku musí vrátiť cenu.

Poradie voči backendu nezáleží. Backend bez Workera vráti v košíku 503 a nič nezapíše. Worker bez backendu iba nedoručí synchronizáciu.

`ENVIRONMENT`, `MEDUSA_PRICING_TENANT_ID` a `ALLOWED_ORIGINS` nie sú tajné, Worker ich však číta rovnako zo secretov aj z premenných. Ako secrety prežijú každý deploy.

Politika `MEDUSA_PRICING_POLICY_JSON` musí obsahovať vernostné úrovne, limity značiek, limity kategórií a zľavy značiek. Na spustenie boli vernostné úrovne prázdne, teda bez vernostných zliav. Percentá sa nevymýšľajú, nastavujú sa v administrácii.

---

## 9. Cloudflare DNS, TLS a presmerovania

1. Záznamy: `www` na Pages `anastasia-web`, `admin` na Pages `anastasia-admin`, `nexus` na Worker. Záznam `api` sa na pláne Develop nezakladá, API má pridelenú adresu od Cloudu.
2. SSL/TLS: Full (strict), Always Use HTTPS, HSTS až po overení všetkých subdomén.
3. Staré adresy: 27 ciest existuje na novom webe bez zmeny, 16 ciest sa presmeruje pravidlom z `anastasiaoz.eu` na `www.anastasiaoz.eu` s kódom 301 a zachovaním query. Presmerovanie z `http` rieši Always Use HTTPS.
4. DNSSEC pri prechode od registrátora: najprv vypnúť DS u registrátora, potom presunúť NS, potom zapnúť DNSSEC v Cloudflare.
5. Pošta zostáva na Active24. Pridávajú sa iba záznamy pre doručovanie e-mailov, a to bez proxy (DNS only).

---

## 10. Poradie nasadenia a smoke test

Každý krok končí overením. Bez zeleného overenia sa nepokračuje. Poradie: zlúčenie a tag, projekt a prostredie v Cloude, zálohy, NEXUS Worker, web, administrácia, Stripe, DNS a presmerovania, e-maily.

Smoke test má dve fázy na tom istom prostredí. Mení sa iba platobný režim.

- **Fáza A** – testovací platobný režim, testovací kľúč, testovací webhook, testovací verejný kľúč vo webe. Testovacie karty, iba syntetickí zákazníci s adresami tímu.
- **Fáza B** – ostrý kľúč, ostrý webhook, `PAYMENTS_TEST_MODE` sa zmaže, nový build webu, jedna skutočná malá platba vlastnou kartou a plné vrátenie. Až potom sa obchod zverejní.

Kontrolný zoznam fázy A:

| # | Kontrola | Očakávanie |
|---|---|---|
| 1 | Registrácia prihlasovacím odkazom | e-mail dorazí, účet sa otvorí |
| 2 | Produkt → košík → doprava → pokladňa | cena z NEXUS, doprava, DPH, objednávka v administrácii |
| 3 | Administrácia: príprava → odoslanie → vrátenie 1 € | e-mail o odoslaní, vrátenie v Stripe |
| 4 | Klub s overením 3DS | členstvo aktívne v účte aj v administrácii |
| 5 | Darčekový poukaz → uplatnenie | e-mail obdarovanému s kódom, zostatok sa odpočíta |
| 6 | Konzultácia: termín na webe → platba | termín potvrdený, e-mail, záznam v administrácii |
| 7 | Kontaktný formulár a newsletter v pätičke | e-mail Vám, súhlas v administrácii |
| 8 | Chat z účtu → odpoveď z administrácie | e-mail s odkazom do účtu |
| 9 | Stará adresa s parametrom kampane | presmerovanie 301 na `www`, query zachovaná |
| 10 | Administrácia → Prehľad → Pripravenosť | žiadny blokér |
| 11 | Obrázok produktu z administrácie je vidieť na webe | overí nastavenie `ANASTASIA_MEDIA_ORIGIN` |
| 12 | Cloud → Logs: bežia plánované úlohy | záznamy úloh bez chýb |

Upratanie po fáze A: testovacie objednávky, zákazníkov a členstvá zrušiť, testovacie poukazy zneplatniť. Databáza sa nikdy nemaže celá, je v nej bootstrap.

---

## 11. Rollback

| Časť | Postup | Dáta |
|---|---|---|
| Web a administrácia | Pages → Deployments → predchádzajúce nasadenie → Rollback | žiadne |
| NEXUS Worker | `npx wrangler rollback --env production` | migrácie D1 sú prídavné, pri poškodení sa použije Time Travel |
| Kód backendu | Medusa Cloud → Deployments → predchádzajúce úspešné nasadenie → Redeploy, alebo reverzný commit do `master` | Redeploy **nevracia databázu**, migrácie sú prídavné |
| Dáta backendu | overená záloha z R2 → Cloud → Database → Import, postup v `04-ZALOHY-A-OBNOVA.md` | objednávky vzniknuté po čase zálohy dohľadať v Stripe |
| Premenné | zmena hodnoty a Redeploy. Neplatná kombinácia nasadenie zastaví a beží predchádzajúca verzia | žiadne |
| Platby | v Stripe vypnúť webhook alebo vrátiť testovacie kľúče a testovací režim, web do údržby cez rollback Pages | klubové úlohy nič neúčtujú, kým neprejde platba |

Rozhodnutie o rollbacku dát robí dodávateľ po dohode s Vami. Kód, web a administráciu môže vrátiť ktokoľvek z tímu.

---

## 12. Bezpečnostné pravidlo nasadenia

Hodnoty premenných sa nezapisujú do repozitára, do dokumentácie, do ticketu, do chatu so zákazníkom ani do e-mailu. Pri odchode dodávateľa alebo pri podozrení na únik sa všetky tajomstvá rotujú, teda vymenia za nové. Zoznam účtov a ich vlastníctvo je v `07-PRISTUPY-A-UCTY.md`.
