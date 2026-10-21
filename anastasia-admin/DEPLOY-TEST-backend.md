# Nasadení backendu (release/predani-faze1) na TEST

Cíl: dostať backend s novými právnymi textami, cookie lištou a online formulárom na odstúpenie
na testovací prostredie `https://anastasia-test-api.l-code-dynamics.com` bez chyby.

- Větev: `release/predani-faze1` (lokálne stav `1bb4855`).
- Zásady: **nič sa nenasadzuje bez súhlasu Luckyho**, hodnoty premenných sa nikdy nepišu do gitu
  ani do chatu, na teste platí len `pk_test_`/`sk_test_`, e-maily len na `@l-code-dynamics.com`.
- Testovací backend beží mimo Medusa Cloud: Docker na vlastnom serveri
  (`ops/test-server/compose.yml`, `ops/test-server/Dockerfile`), zvenku cez Cloudflare Tunnel.

---

## 1. Čo sa nasádza a odkiaľ

| Kde | Čo | Zdroj |
|---|---|---|
| Server (backend) | Medusa 2.19 – nové právne texty (seed + predvolené texty stránok), cookie lišta nie je backendová, API online odstúpenia | `backend/` (veta `release/predani-faze1`) |
| Databáza | nová tabuľka `legal_contract_withdrawal` + indexy | migrácia `backend/src/modules/legal/migrations/Migration20261021100000.ts` |
| Storefront (web) | cookie lišta, panel nastavení, stránka `/odstupenie` s formulárom, `pk_test_` | `storefront-prototype/` → `ops/test-predani/deploy.sh` |

Backend sa na serveri nestiahne z gitu ručne – `push-env.sh` posiela `backend.env` a docker compose
prestaví obraz z repo. Postup nižšie predpokladá, že repo na serveri je aktualizované
(`git fetch && git checkout <commit>` na serveri – **len so súhlasom Luckyho**).

---

## 2. Poradie krokov (každý krok končí overením)

### 2.1 Pred nasadením – záloha databázy

```bash
# na serveri, v adresári s repozitárom
docker compose -f ops/test-server/compose.yml --env-file ops/test-server/backend.env \
  exec db pg_dump -U anastasia -d anastasia -Fc -f /tmp/anastasia-pre-odstupenie.dump
docker compose -f ops/test-server/compose.yml --env-file ops/test-server/backend.env \
  exec db cp /tmp/anastasia-pre-odstupenie.dump /tmp/anastasia-pre-odstupenie.dump
```

Výstup musí byť uložený mimo kontajnera (kopia na L-Code účet / R2). **Bez zálohy sa nepokračuje** –
rollback databázy je jediný spôsob, ako vrátiť tabuľku a záznamy odstúpenia.

### 2.2 Záloha metadát obchodu (zmeny textu, ktoré urobila Lucia)

Zmeny obsahu webu Lucia sú v metadátach jediného riadka tabuľky `store`
(`anastasia_content` = bloky stránok, `anastasia_pages` = texty stránok).
Pred nasadením ich uložíme – po novom seed-e slúžia ako záloha (pozri riziko R1):

```bash
docker compose -f ops/test-server/compose.yml --env-file ops/test-server/backend.env \
  exec db psql -U anastasia -d anastasia -tAc \
  "select jsonb_pretty(metadata) from store where id = (select id from store limit 1)" \
  > anastasia_store_metadata_pred_bezpremieny.json
```

### 2.3 Migrácie

Migrácie sa spúšťajú **automaticky pri každom štarte kontajnera**
(`ops/test-server/Dockerfile`: `npx medusa db:migrate && npx medusa start`).
Idempotentné sú – bezpečné spustiť aj viackrát.

Ručne (ak treba spustiť bez reštartu):

```bash
docker compose -f ops/test-server/compose.yml --env-file ops/test-server/backend.env \
  exec backend npx medusa db:migrate
```

Nová migrácia v tejto vetve: **iba jedna**

- `Migration20261021100000` – tabuľka `legal_contract_withdrawal` (online odstúpenie od zmluvy)
  + unikátny index na `fingerprint` + indexy na `status` a `order_number`.
  - `up()` je idempotentné (`create table/index if not exists`),
  - `down()` zhadzuje **len túto tabuľku** (`drop table if exists "legal_contract_withdrawal"`),
  - žiadna `drop`/`truncate` cudzej tabuľky, žiadny `alter` existujúcej tabuľky,
  - overené na lokálnej DB (pozri §6).

Cookie lišta nemá migráciu – súhlas sa ukladá iba do `localStorage` prehliadača.
Súhlas v košíku (`legal_consent`) je zo staršej migrácie `Migration20261015040000` a nemení sa.

### 2.4 Promenné prostredia (iba názvy, hodnoty sa zadávajú na serveri)

Súbor `backend.env` na serveri (`~/anastasia-test/backend.env`, chmod 600) zostáva **nezmenený** –
nové funkcie nepridávajú nové povinné premenné. Pre úplnosť zoznam premenných, ktoré musia
byť vyplnené (názvy bez hodnôt; zdroj: `ops/test-server/push-env.sh`):

Povinné (bez nich backend nenastartuje v produkčnom režime):
`NODE_ENV`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL` (dopĺňa compose),
`REDIS_URL` (dopĺňa compose), `STRIPE_API_KEY` (iba `sk_test_`/`rk_test_`), `STRIPE_WEBHOOK_SECRET`.

E-mail (na teste len na `@l-code-dynamics.com`):
`ZEPTOMAIL_API_KEY`, `ZEPTOMAIL_API_URL`, `ZEPTOMAIL_FROM_EMAIL`, `ZEPTOMAIL_FROM_NAME`, `ZEPTOMAIL_REPLY_TO`,
`RESEND_API_KEY` (má prednosť pred ZeptoMailom), `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `RESEND_REPLY_TO`,
`EMAIL_RECIPIENT_ALLOWLIST`, `CONTACT_NOTIFY_EMAIL`, `CHAT_ADMIN_NOTIFY_EMAIL`.

Právne texty a súhlasy:
`LEGAL_TERMS_VERSION`, `LEGAL_PRIVACY_VERSION`, `NEWSLETTER_CONSENT_VERSION`.

Storefront/admin – CORS a odkazy:
`STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `BACKEND_PUBLIC_URL`, `MAGIC_LINK_BASE_URL`, `ACCOUNT_URL`,
`ACCOUNT_ORDERS_URL`, `ACCOUNT_BOOKINGS_URL`, `CHAT_STOREFRONT_URL`, `CHAT_ADMIN_URL`,
`COUPON_LINK_STOREFRONT_ORIGIN`, `COUPON_LINK_LEGACY_ORIGINS`, `STOREFRONT_URL`, `GIFT_VOUCHER_DELIVERY`,
`MEDIA_DELIVERY_BASE_URL`.

NEXUS a prevádzka:
`NEXUS_PRICING_URL`, `NEXUS_PRICING_API_KEY`, `NEXUS_TENANT_ID`, `NEXUS_WEBHOOK_URL`,
`NEXUS_WEBHOOK_SECRET`, `NEXUS_BOOKING_SYNC_SECRET`, `OPS_INGEST_SECRET`, `MEDIA_TOKEN_SECRET`,
`PAYMENTS_TEST_MODE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`.

**Nové?** Žiadna. `EMAIL_RECIPIENT_ALLOWLIST` a `CONTACT_NOTIFY_EMAIL` už na teste sú – treba ich
len overiť, že obsahujú `@l-code-dynamics.com` resp. adresu správkyni.

### 2.5 Build a štart

```bash
# na serveri: repo aktualizované na požadovaný commit
git fetch origin && git checkout <commit>          # len so súhlasom Luckyho
docker compose -f ops/test-server/compose.yml --env-file ops/test-server/backend.env \
  up -d --build backend
docker compose -f ops/test-server/compose.yml --env-file ops/test-server/backend.env logs -f backend
```

Log musí obsahovať `[anastasia-bootstrap] DONE` a žiadnu chybu migrácie.
Kontrola dostupnosti: `curl -fsS https://anastasia-test-api.l-code-dynamics.com/health` → `OK`.

### 2.6 Storefront (web) – nasadenie je samostatný krok

```bash
cd ops/test-predani
ANASTASIA_API_ORIGIN=https://anastasia-test-api.l-code-dynamics.com \
ANASTASIA_PUBLISHABLE_KEY=<pk_…> ANASTASIA_REGION_ID=<reg_…> \
ANASTASIA_STRIPE_PUBLISHABLE_KEY=<pk_test_…> \
./deploy.sh --dry-run        # kontrola, nič sa nenasadzuje
./deploy.sh --deploy          # až so súhlasom Luckyho
./deploy.sh --smoke           # kontrola už nasadených adries
```

---

## 3. Kontrolné curl (po nasadení na test)

Promenná shell pre skript:

```bash
API=https://anastasia-test-api.l-code-dynamics.com
PK=<publishable api key zo storefrontu>          # hodnota sa nikdy nepiše do gitu
```

Základ:

```bash
curl -fsS "$API/health"                                   # → OK
curl -fsS -o /dev/null -w '%{http_code}\n' "$API/store/products?limit=1" -H "x-publishable-api-key: $PK"   # → 200
```

Nové endpointy (právne texty):

```bash
curl -fsS "$API/store/pages/vop"          | head -c 200        # text VOP
curl -fsS "$API/store/pages/reklamacie"   | head -c 200        # reklamačné pravidlá
curl -fsS "$API/store/pages/odstupenie"   | head -c 200        # poučenie o odstúpení
curl -fsS "$API/store/pages/gdpr"         | head -c 200        # ochrana osobných údajov
curl -fsS "$API/store/pages/cookies"      | head -c 200        # informácia o cookies
curl -fsS "$API/store/content/vop"        | head -c 200        # bloky stránky (zo seeda + zmeny z adminu)
```

Online odstúpenie od zmluvy (verejné, limit 5 pokusov / 10 min / IP):

```bash
# 1) platné oznámenie → 201, id = lcw_…
curl -sS -X POST "$API/store/contract-withdrawal" \
  -H "Content-Type: application/json" -H "x-publishable-api-key: $PK" \
  -d '{"order_number":"QA-2026-0001","email":"tester@l-code-dynamics.com","items":"RESET 40+ – 1 ks","order_date":"2026-10-12","name":"QA Testovací","reason":"kontrola po nasadení","consent":true,"website":""}'

# 2) rovnaké oznámenie znova → 200 + "replayed": true (idempotencia, žiadny druhý záznam)
# 3) chybné údaje → 400 + "ok": false
# 4) bez hlavičky x-publishable-api-key → 400 "not_allowed" (normálne, takto sa nevolá)
```

Administrácia (vyžaduje token prihláseného admina – `Authorization: Bearer <token>`):

```bash
curl -fsS "$API/admin/contract-withdrawals" -H "Authorization: Bearer $ADMIN_TOKEN"     # zoznam odstúpení
curl -fsS "$API/admin/contract-withdrawals/<id>" -H "Authorization: Bearer $ADMIN_TOKEN"  # detail
# zmena stavu received → processed → closed
curl -fsS -X POST "$API/admin/contract-withdrawals/<id>" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"processed"}'
```

Všetky `/store/*` trasy vyžadujú hlavičku `x-publishable-api-key`; bez nej je odpoveď
`400 {"type":"not_allowed"}` – nie je to chyba nasadenia.

---

## 4. Ako vrátiť späť (rollback)

Poradie (od najjednoduchšieho):

1. **Storefront** – vrátiť predchádzajúci build a znova nasadiť (`deploy.sh --deploy` z predchádzajúceho commitu).
   Cookie lišta a formulár zmiznú, web funguje ďalej.
2. **Backend (bez migrácie)** – vrátiť predchádzajúci commit a `docker compose up -d --build backend`.
   Tabuľka `legal_contract_withdrawal` zostane v DB neškodne (backend ju nepoužíva).
   `/store/contract-withdrawal` prestane existovať → formulár na webe treba stiahnuť (bod 1).
3. **Backend (vrátane tabuľky)** – ručne:
   ```sql
   drop table if exists "legal_contract_withdrawal";
   delete from mikro_orm_migrations where name = 'Migration20261021100000';
   ```
   Tabuľka obsahuje iba záznamy o odstúpení (osobné údaje zákazníka) – pred zrušením ju treba
   archivovať podľa GDPR (pozri `PRAVNE-TEXTY-DOPLNIT.md`).
4. **Úplné obnovenie databázy** – z dumpu z kroku 2.1 (posledná záchrana, prepíše aj zmeny Lucy).

E-mail sa spätne neposiela – potvrdenie doručenia zákazníkovi ide len raz (kľúč `contract-withdrawal.received:<id>`).

---

## 5. Overenie semena právnych textov (nesmie prepísať zmeny Lucy)

Ako to funguje (overené v kóde aj testom):

- Zdroj pravého textu je `backend/src/lib/content/seed.json` (fallback) a
  `backend/src/lib/pages/defaults.ts` (predvolené texty stránok).
- **Zmeny, ktoré urobila Lucia, sa ukladajú do metadát obchodu** (`store.metadata.anastasia_content`
  a `store.metadata.anastasia_pages`), nie do semena.
- `mergeContent()` (bloky) a `readPages()` (texty stránok) vždy dávajú **prednosť uloženej hodnote**;
  semeno slúži iba ako fallback. Znovu spustený seed teda existujúce zmeny **neprepíše**.
  Overené unit testom `backend/src/lib/content/__tests__/content.unit.spec.ts`
  („zmena prebije pôvodný text“) a `backend/src/lib/pages/__tests__` + `backend/src/api/admin/pages/route.ts`
  (uložená stránka má prednosť pred `default_html`).
- **Kontrola po nasadení** (zadarmo, bez zásahu do zmenených údajov):
  ```bash
  curl -fsS "$API/store/content/vop" -H "x-publishable-api-key: $PK" | head -c 300
  ```
  Ak sa v `store.metadata` nachádza kľúč poľa s hodnotou != fallback, text zostal Lucia.
  Porovnanie uložených zmien s novým semom: §2.2 (záloha metadát) – porovnať `anastasia_content.fields`
  s kľúčmi v `backend/src/lib/content/seed.json`.

---

## 6. Čo bolo overené a s akým výsledkom

Všetko bežalo **lokálne** (lokálna PostgreSQL 16, lokálny Medusa na `localhost:9000`,
lokálny storefront na `localhost:4187`), **nie na produkcii a nie na teste**.

| Overenie | Príkaz | Výsledok |
|---|---|---|
| Typy backendu | `cd backend && npx tsc --noEmit` | bez chyby (0 diagnostik) |
| Unit testy backendu | `cd backend && npm run test:unit` | 139 sád / 1424 testov – všetky prešli |
| Testy storefrontu | `cd storefront-prototype && node --test "test/*.test.mjs"` | 112 testov – všetky prešli |
| E2E platby kartou bez súhlasu s cookies (Stripe fix) | `node storefront-prototype/test/browser-checkout-stripe.mjs` | PASS (5 kontrol) |
| QA cookie lišty a formuláru odstúpenia | `node storefront-prototype/test/browser-legal-qa.mjs` | 8 z 9 kontrol OK (1 známy defekt – R3) |
| Migrácia `up()` – idempotencia | 2× `npx medusa db:migrate` na prázdnej DB | 2. beh: „Database already up-to-date“, žiadna chyba |
| Migrácia `up()` – dáta zostávajú | opakované `up()` cez syntentické záznamy | `legal_consent`, `legal_withdrawal`, `newsletter_consent`, `newsletter_consent_event`, `legal_rate_limit` – počty nezmenené |
| Migrácia `down()` – rollback | `down()` na syntentických dátach | zhodil **len** `legal_contract_withdrawal`; ostatné tabuľky a ich dáta nedotknuté |
| Migrácia po `down()` | `up()` po `down()` | tabuľka sa znovu vytvorila (prázdna) |
| API online odstúpenia | `POST /store/contract-withdrawal` proti lokálnemu backendu | 201 + `{"ok":true,"replayed":false}`; opakované rovnaké oznámenie → 200 + `replayed:true` |
| Screenshoty QA | `anastasia-admin/qa-deploy/` | `cookies-lista-390/1440.png`, `odstupenie-formular-390/1440.png`, `odstupenie-stranka-390/1440.png`, `odstupenie-odoslane-1440.png` |

---

## 7. Nalezené problémy a rizika (pred nasadením prečítať)

**R1 – Zmeny textu v admine môžu po nasadení „zmiznúť“ (kľúče semena sú indexové).**
Kľúče polí v `seed.json` majú tvar `<stranka>__<sekcia>__<index>-<typ>`. Commit `95c6df3` prepísal
stránky `vop`, `reklamacie` a `gdpr` z klienta: pri porovnaní semena pred a po je
**77 kľúčov odstránených, 105 pridaných, 59 kľúčov má iný text**. Ak Lucia na teste už upravila
pole s kľúčom, ktorý v novom seode neexistuje, jej zmena sa po nasadení zobrazí ako pôvodný text
(seed) a v `store.metadata` zostane ako osamotený záznam.
*Ochrana:* krok 2.2 (záloha metadát) + po nasadení porovnať kľúče `anastasia_content.fields`
s kľúčmi v `seed.json`; osamotené kľúče prepísať ručne cez admin (POST `/admin/content`).
*Ďalšie:* pri každej regenerácii semena (`scripts/generate-content-seed.mjs`) treba kľúče skontrolovať.

**R2 – E-mail zákazníkovi sa na teste neposlanie (je to zamýšľané).**
`EMAIL_RECIPIENT_ALLOWLIST=@l-code-dynamics.com` zablokuje potvrdenie doručenia zákazníkovi
(posielateľ mimo allowlistu je potlačený, záznam v DB má stav `success`, API vráti 201).
Záznam odstúpenia sa uloží aj tak, e-mail pre správcu (`CONTACT_NOTIFY_EMAIL`) dorazí.
*Ochrana:* na teste netestovať „e-mail prišiel zákazníkovi“ – overiť záznam v DB a e-mail u správcu.
Na ostré nasadenie allowlist zrušiť (priechodnosť e-mailov pre zákazníkov) – vidí
`docs/launch/DEPLOY-RUNBOOK-2026-10-23.md` §Príloha A.

**R3 – Odkaz „Nastavenia cookies“ v pätičke neotvorí panel, ale preskočí na `/cookies`.**
`storefront-prototype/public/app.mjs` (obsluha kliknutí na `a[href]`, okolo riadku 273-281)
ignoruje `event.defaultPrevented` a po 220 ms volá `location.assign(url.href)`.
Obsluha súhlasu v `public/consent.mjs` síce volá `preventDefault()`, ale odoslanie odkazu
sa tým nezastaví. Reprodukované v QA (`browser-legal-qa.mjs`, kontrola „odkaz v pätičke“).
*Dopad:* zákazník si cez odkaz v pätičke panel nezobrazí (musí kliknúť „Nastaviť“ v lište).
*Fix (malý, 1 riadok):* v `app.mjs` pred `preventDefault()` overiť `if(event.defaultPrevented)return;`
alebo v `consent.mjs` počítať s tým, že navigácia prebehne. **Nezmenené** – patrí do ďalšej opravy,
aby sa do testu nedostala neodsúhlasená zmena.

**R4 – Limit formulára odstúpenia: 5 pokusov / 10 min / IP (`legalRate`).**
Kontrolné curl-y sa môžu skončiť `429` s hlavičkou `Retry-After`.
*Ochrana:* pri testovaní z jednej IP nerobiť viac ako 5 požiadaviek; pri `429` počkať podľa `Retry-After`
alebo vymazať záznam v `legal_rate_limit` (len na teste, na produkciu sa nesiahá).

**R5 – Obsah formulára a e-mailov má placeholders.**
V texte lišty cookies je placeholder `[doplní prevádzkovateľ]` (kategórie analytické/marketingové),
v znení právnych textov ďalšie placeholdery – zoznam je v `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md`.
Dokým ich Lucia nedoplní, lišta vyzerá ako neúplná. **Na test ide aj tak** (je to 1:1 znenie z dokumentu klientky),
na ostré nasadenie to musí byť vyplnené.

**R6 – Texty na webe idú zo statického storefrontu, nie z backendu.**
Legal stránky a text lišty sa čítajú z `storefront-prototype/src/legacy-content.json`.
Zmeny, ktoré urobí Lucia v adminu (Obsah → Stránky), sa na webe prejavia až po úprave prepojenia
web → `/store/content/:page`. Pri predaní Fázy 1 je to v poriadku (web = 1:1 znenie klientky),
ale treba o tom vedieť.

**R7 – `LEGAL_TERMS_VERSION` / `LEGAL_PRIVACY_VERSION` musia sedieť s tým, čo zákazník prijíma.**
Pri zmene znenia treba zvýšiť verziu v `backend.env`, inak staré súhlasy v košíku zostanú „platné“.

**R8 – Chýbajúce kľúče v `dist/config.mjs` pre test.** Storefront potrebuje `ANASTASIA_API_ORIGIN`,
`ANASTASIA_PUBLISHABLE_KEY`, `ANASTASIA_REGION_ID`, `ANASTASIA_STRIPE_PUBLISHABLE_KEY` (iba `pk_test_`).
`deploy.sh` to kontroluje a pri `pk_live_` alebo tajnom kľúči build odmietne.

**R9 – CORS.** Web, admin a backend musia mať navzájom nastavené `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS`.
Po zmene adresy testovacieho webu treba CORS na backende upraviť, inak web hlási
„blocked by CORS policy“ a katalog aj formulár odstúpenia nepracujú (overené pri lokálnom behu).

---

## 8. Čo treba od Luckyho pred nasadením

1. Potvrdenie, že sa smie nasadiť na test (krok 2.5 + 2.6) – bez toho sa nenasádza nič.
2. Rozhodnutie, či sa pred nasadením opraví R3 (odkaz v pätičke) – odporúčam opraviť, je to 1 riadok.
3. Informácia, či už boli na teste robené zmeny textu v admine (R1) – ak áno, treba export metadát
   a porovnanie kľúčov pred nasadením.
