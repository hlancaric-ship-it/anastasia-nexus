# Klub (členstvo) + SafeOrder C3 – stav a overenie

Handoff: `anastasia-admin/HANDOFF-membership-safeorder-minimax.md` (MiniMax, 21. 10. 2026).
Všetko bežalo **lokálne** (lokálna PostgreSQL 16, syntetické role/DB, skutočný NEXUS Worker
v loopback bridge) – **nič sa nenasadilo, žiadny push**.

---

## 1. Klub: `tenant_id` do `entitlement.grant()` (commit 37198dc)

### Príčina
`src/lib/membership/access.ts` posielal do `entitlements.grant()` všetky údaje okrem `tenant_id`.
Služba `src/modules/entitlement/service.ts` ho vyžaduje (`„tenant_id je povinný“`), takže
obnova členstva po refunde/odstúpení padala. Oprava `tenant_id:'default'` je v veteve už
aplikovaná (commit 37198dc).

### Nájdené ďalšie volania bez `tenant_id`
Prehľad všetkých volaní, ktoré `tenant_id` vyžadujú:

| Služba | Vyžaduje `tenant_id`? | Stav |
|---|---|---|
| `entitlement.grant()` | **áno** (bez neho vyhodí chybu) | opravené |
| `booking` | nie – má vlastný default `'default'` (`modules/booking/service.ts`) | v poriadku |
| `reset-journal` | nie – model má `.default("default")` | v poriadku |
| `coupon-link` | nie – používa vlastný helper `tenant()` | v poriadku |

Volania `entitlement.grant()` v kóde (`src/`): `lib/membership/access.ts`,
`modules/entitlement/order-sync.ts`, `api/admin/entitlements/route.ts`,
`scripts/migrate-legacy-customers-orders.ts`, `scripts/e2e-digital-library.ts` – **všetky
posielajú `tenant_id`** (buď `'default'`, alebo `'default'` v skripte).

**Chýbajúce `tenant_id` zostalo v dvoch integračných kontrolách** (nie v produkčnom kóde,
ale obe padali na `„tenant_id je povinný“`):

| Súbor | Riadok | Oprava |
|---|---|---|
| `backend/integration-tests/http/entitlement-isolation-http-checks.ts` | 24 | `tenant_id: "default"` |
| `backend/integration-tests/http/protected-library-admin-http-checks.ts` | 50 | `tenant_id:'default'` |

### Nový unit test ( zachytí regresiu)
`backend/src/lib/membership/__tests__/access.unit.spec.ts`:
- mock služby `grant` teraz vyhodí `ENTITLEMENT_TENANT_REQUIRED`, ak `tenant_id` chýba
  (odzrkadľuje skutočné správanie služby) – padnúť musí **celý** test, nie len nový;
- nový test `grants with a tenant_id – the entitlement service rejects a grant without it`
  overuje, že `reconcileMembershipAccess` volá `grant` s `tenant_id:'default'`.

Overenie regresie (odobratie `tenant_id` z `access.ts`): **2 testy padajú** → test reálne chytí
chybu. Po obnovení: 10/10 OK.

---

## 2. Membership testy podľa CI workflowov

Bežalo presne ako v `.github/workflows/membership-state.yml` a `.github/workflows/membership-integration.yml`
(vlastné prostredie: `CI=true`, `DB_USERNAME=membership_synthetic`, `DB_TEMP_NAME=…`,
lokálna PostgreSQL 16, skutočný NEXUS Worker v loopback bridge cez
`backend/scripts/membership-e2e-worker.mjs`).

### `integration-tests/http/membership-state.spec.ts`
```
CI=true NODE_ENV=test TEST_TYPE=integration:http DB_HOST=localhost DB_PORT=5432 \
DB_USERNAME=membership_synthetic DB_PASSWORD=membership_synthetic_only \
DB_TEMP_NAME=anastasia_membership_ci \
DATABASE_URL=postgres://membership_synthetic:membership_synthetic_only@localhost:5432/anastasia_membership_ci \
JWT_SECRET=synthetic-membership-jwt-only COOKIE_SECRET=synthetic-membership-cookie-only \
./node_modules/.bin/jest --runTestsByPath integration-tests/http/membership-state.spec.ts --runInBand --forceExit
```
**Výsledok: PASS – 4/4 testy** (28 s)
- atomická deduplikácia aktivácie a obnovy s trvalými potvrdeniami receiptov pri súbežných hovoroch,
- neuloženie neplatnej platby a nepoužitie receiptu iného člena,
- načítanie receiptov len z prepojenej natívnej objednávky a zaznamenaných platieb,
- perzistencia dohôd pred platbou a jediná obnova po prerušenom checkoute.

### `integration-tests/http/membership-checkout-e2e.spec.ts`
NEXUS Worker zabalený esbuildom (`nexus/workers/api/index.ts` → `worker.mjs`) a spustený cez
`backend/scripts/membership-e2e-worker.mjs` (port z `ready.json`), potom:
```
CI=true TEST_TYPE=integration:http NODE_ENV=test DB_HOST=localhost DB_PORT=5432 \
DB_USERNAME=membership_synthetic DB_PASSWORD=membership_synthetic_only \
DB_TEMP_NAME=anastasia_membership_e2e_ci \
DATABASE_URL=postgres://membership_synthetic:membership_synthetic_only@localhost:5432/anastasia_membership_e2e_ci \
JWT_SECRET=… COOKIE_SECRET=… LEGAL_TERMS_VERSION=synthetic-terms-v1 \
LEGAL_PRIVACY_VERSION=synthetic-privacy-v1 NEWSLETTER_CONSENT_VERSION=synthetic-newsletter-v1 \
MEDIA_TOKEN_SECRET=… ANASTASIA_FREE_SHIPPING_FROM_EUR=100 \
NEXUS_PRICING_URL=http://127.0.0.1:<port>/api/nexus/pricing \
NEXUS_SAFEORDER_URL=http://127.0.0.1:<port>/api/nexus/safeorder \
NEXUS_PRICING_API_KEY=synthetic-membership-service NEXUS_TENANT_ID=anastasia \
./node_modules/.bin/jest --runTestsByPath integration-tests/http/membership-checkout-e2e.spec.ts --runInBand --forceExit
```
**Výsledok: PASS – 1/1 test** (28 s) – natívny checkout ledger: SafeOrder pred zachytením platby,
obnova členstva, replay, vlastníctvo, zastavenie a refund.

### Ostatné kontroly z tých istých workflowov
| Kontrola | Príkaz | Výsledok |
|---|---|---|
| Typy | `cd backend && npx tsc --noEmit` | 0 diagnostik |
| Mapa admin funkcií | `python3 backend/scripts/check-admin-function-map.py` | PASS (54 funkcií, 118 custom + 259 natívnych trás) |
| Unit testy | `cd backend && npm run test:unit` | 144 sád / 1457 testov – všetky prešli |

---

## 3. SafeOrder C3 – príčina pádu

### Príznak
`integration-tests/http/safeorder-persistence.spec.ts:202` → `expect(arrivals).toBe(2)`,
**Received: 0**. Obe súbežné objednávky s jednorazovým kupónom prešli a vytvorili **dve
objednávky** (oba logy: `order_…S3KXF6S6N5H22HJJQ9XM`, `order_…S3M1YJ0QYESP1STVFMSW`,
cena 45 € = 50 € − 10 %).

### Príčina
Scenár C3 bol napísaný pre **starý mechanizmus Medusy** (commit `44dbf33`, 13. 10. 2026):
kupón bol pripojený ku košíku ako Medusa promotion, pri dokončení košíka sa volalo
Medusa `promotions.registerUsage` a limit sa kontroloval atomicky v Meduse → druhý súbežný
checkout padal s `„Promotion usage exceeds the limit“`.

**Commit `fa6a892` (21. 10. 2026, táto vetva) mechanizmus zmenil** (kvôli dvojitému započítaniu
použitia kupónu):
- `src/lib/pricing/coupon-usage.ts` – použitie sa započítava **až po vytvorení objednávky**
  (`recordCouponUsage`, jeden atomický CTE: značka `nexus_coupon_usage` na objednávke +
  `promotion.used = used + 1` iba ak `used < limit`),
- `src/workflows/hooks.ts` – Medusa `registerUsage` sa **nepoužíva**; zostala len read-only
  kontrola `couponLimitState` pred objednávkou (`COUPON_LIMIT_EXHAUSTED` → 409),
- `src/api/store/nexus-checkout/route.ts` – zápis po objednávke; udalosť `coupon.duplicate` /
  `coupon.used` / `coupon.limit_exhausted`; **chyba nesmie zrušiť hotovú objednávku**.

Preto `registerUsage` vôbec nezavolá (`arrivals = 0`) a limit sa už nevyhodnocuje v Meduse –
**test C3 bol po zmene produktu zastaraný**, nie je chybou backendu. Backend navyše používa vlastný
výpočet ceny cez NEXUS Worker (`couponDiscountPercent` v `api/store/nexus-cart/route.ts`),
takže Medusa promotion sa na košík nikdy nepripája.

### Čo test po zmene musí overovať
Zaručenie, ktoré dnešný kód naozaj dáva:
1. `promotion.used` sa zvýši **presne raz** (atomický CTE s podmienkou `used < limit`),
2. druhá (súbežná) objednávka zostane stáť a je označená udalosťou `coupon.limit_exhausted`
   (admin ju vidí v prehľade), **nesmie** zrušiť hotovú objednávku,
3. ak druhý checkout príde neskôr (po zápise použitia), dostane `409 COUPON_LIMIT_EXHAUSTED`
   a objednávka nevznikne.

Úprava testu je v `backend/integration-tests/http/safeorder-persistence.spec.ts` (scenár C3),
s popisom v kóme.

---

## 4. Stav a čo ďalej

| Bod | Stav |
|---|---|
| Klub: `tenant_id` do `entitlement.grant()` | **opravené** (37198dc) + dve ďalšie integračné kontroly opravené |
| Unit test na grant s `tenant_id` | **pridaný** (chytí regresiu, overené) |
| Prehľad ďalších služieb s `tenant_id` | **hotovo** (booking/reset-journal/coupon-link majú default, entitlement je jediný striktný) |
| `membership-state.spec.ts` podľa CI | **PASS 4/4** |
| `membership-checkout-e2e.spec.ts` podľa CI | **PASS 1/1** |
| SafeOrder C3 | príčina nájdená (zastaraný test po `fa6a892`) – oprava testu v samostatnom kroku |
| Všetky unit testy | **PASS** (144 sád / 1457 testov) |

Nasadenie na test/produkciu sa nemení – ide o testy a ich opravu.
