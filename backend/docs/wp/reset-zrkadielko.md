# Zrkadielko – členská zóna RESET 40+ (backend + API)

**Balík:** RESET 40+ / členská zóna 1:1 se starým webem
**Větev:** `release/predani-faze1`
**Stav:** `IMPLEMENTED_UNVERIFIED` (backend a API hotové a pokryté testy; **naplnění obsahu a právní souhlas čekají na Luciu**)
**Datum:** 21. 10. 2026

---

## 1. Co starý web měl a co chybí v novém systému

Reference (screenshoty starého webu z telefonu):
`~/anastasia-nexus-codex-storefront-design/storefront-prototype/design/reference-lucia-21-10/`

| Prvek starého webu | Nový systém před zásahem | Nový systém po zásahu |
|---|---|---|
| Program: „Vyplňte prosím VSTUPNÝ DOTAZNÍK“ + odkaz na externí dotazník (Tally) | chýbí | `GET /store/reset-program` → `entry_questionnaire_url` |
| „Týždeň číslo 1 >> … Týždeň číslo 16 >>“ | chýbí | 16 týdnů v datovém modelu (`program_structure`) + API |
| „Záverečné zhrnutie >>“ | chýbí | `final_summary` v datovém modelu + API |
| Stránka týdne: text, „Stiahnuť materiály pre samoštúdium >>“ | chýbí | `weeks[].intro` + `weeks[].materials` |
| „2. deň – stiahnuť pracovný list“ … „7. deň“ | chýbí | `weeks[].days[]` (dni 2–7) |
| **Zrkadielko**: tabulka záznamů zákazníka, tlačítko „Pridať“, sloupce DÁTUM, ENERGIA (1–10), SPÁNOK (1–10), STRES (1–10) a další sloupce, úprava a smazání záznamu | chybí | nový modul `reset-journal` + store API |

**Co se NEVYMÝŠLÍ:** zoznam metrik, texty týdnů, pracovních listů i záverečného zhrnutia. Datový model
je pripravený, obsah dodá Lucia (viz §7).

---

## 2. Datový model

### 2.1 Tabuľka `reset_journal_entry` (nový modul `reset-journal`)

`backend/src/modules/reset-journal/`

| Stĺpec | Typ | Význam |
|---|---|---|
| `id` | text (`rje…`) | primárny kľúč |
| `tenant_id` | text, default `default` | izolácia tenanta |
| `customer_id` | text | **vlastník záznamu** – na tomto stĺpci je ohrančený každý dotaz |
| `entitlement_id` | text nullable | prístup, ktorým si zákazníčka program otvorila |
| `program` | text | program, ku ktorému záznam patrí (`reset-40-plus`) |
| `week` | integer nullable | týždeň programu 1–16 (nullable – záznam nemusí byť viazaný na týždeň) |
| `entry_date` | timestamptz | kalendárny deň záznamu (UTC polnoc daného dňa) |
| `metrics` | jsonb | `{ "<key>": 1..10 }` |
| `created_at` / `updated_at` / `deleted_at` | — | štandard Medusa stĺpce |

Indexy: `(customer_id, program)`, `(customer_id, program, entry_date)`, `(entitlement_id)`.

Migrácia: `backend/src/modules/reset-journal/migrations/Migration20261021120000.ts`
(`up` vytvára tabuľku a indexy, **`down` tabuľku dropne** – `drop table if exists … cascade`).

Modul je zapísaný v `backend/medusa-config.ts` (jediný riadok:
`{ resolve: "./src/modules/reset-journal" }`). Bez toho sa tabuľka vôbec nevytvorí.

### 2.2 Štruktúra programu (metadáta produktu, žiadna nová tabuľka)

Pôvodná knihovna (`product.metadata.protected_media` + `backend/src/lib/protected-library/manifest.ts`)
je **plochý zoznam súborov** – nepozná týždne, dni, pracovné listy ani vstupný dotazník
(pre `reset-40-plus` je tam 17 chránených médií `lekcia-00 … lekcia-17` s názvami „Lekcia 1 … Lekcia 17“;
**priradenie lekcií k 16 týždňom nie je zadefinované a nedohaduje sa**).

Preto je doplnený dátový model programu v `product.metadata.program_structure`:

```jsonc
{
  "total_weeks": 16,
  "entry_questionnaire_url": "https://tally.so/r/440GBr",
  "final_summary": { "title": "Záverečné zhrnutie", "materials": [ { "key": "…", "title": "…", "kind": "document" } ] },
  "weeks": [
    {
      "week": 1,
      "title": null,            // null = ešte nedodané Luciou
      "intro": null,            // text týždňa
      "materials": [],          // materiály na samoštúdium
      "days": [ { "day": 2, "label": "2. deň", "materials": [] } ]  // pracovné listy po dňoch
    }
  ]
}
```

Schéma a sanitizácia: `backend/src/lib/reset-program/structure.ts`
(`parseProgramStructure`, `programSkeleton`, `effectiveProgramStructure`).
Poškodené údaje sa preskakujú, prázdna/neplatná štruktúra sa nahradí **kostrou programu**
(16 týždňov, dni 2–7, prázdny záverečný zhrnutie, odkaz na dotazník) s príznakom
`content_ready: false` – rozhranie tak nikdy neukáže rozbitú štruktúru.

`materials[].key` je kľúč chráneného súboru z rovnakého registra ako `protected_media`
(dorúčenie cez `POST /store/media-access`).

---

## 3. Konfigurácia (jedno miesto)

`backend/src/lib/reset-program/config.ts`

| Prvok | Predvolená hodnota | Prepis |
|---|---|---|
| `RESET_PROGRAM_KEY` | `reset-40-plus` | – |
| `RESET_PROGRAM_TOTAL_WEEKS` | `16` | – |
| `RESET_PROGRAM_WORKLIST_DAYS` | `[2,3,4,5,6,7]` | – |
| `RESET_ENTRY_QUESTIONNAIRE_URL` | `https://tally.so/r/440GBr` | `metadata.program_structure.entry_questionnaire_url` |
| `RESET_JOURNAL_METRICS` | `energia`, `spanok`, `stres` (1–10) | `metadata.reset_journal_metrics` |
| `RESET_JOURNAL_TIMEZONE` | `Europe/Bratislava` | – |

* Zoznam metrik je **konfigurovatelný na jednom mieste**; prepis v metadátach produktu
  (`reset_journal_metrics`: `{key, label, min, max, order}`) sa použije bez zásahu do kódu.
  Neplatný prepis sa **ignoruje** a použije sa predvolený zoznam (fail-safe).
* Administrátor má dnes **iba čítanie**: `GET /admin/reset-program` vráti účinnú konfiguráciu
  metrik a štruktúru programu. Zápis do metadát produktu je na strane administrácie (Lucia).
* Metrika = `{key, label (SK), min, max}`. Predvolene sú tri metriky **potvrdené zo starého webu**
  (ENERGIA, SPÁNOK, STRES). Piati stĺpec sa na screenshotu začína na „NA…“ – **názov nedohadujeme** (§7).

---

## 4. API

### 4.1 Store API (len prihlásená zákazníčka s aktívnym prístupom k programu)

Middleware: `backend/src/api/store/reset-journal/middlewares.ts`
(`authenticate("customer", ["session","bearer"])`), zapojené v `backend/src/api/middlewares.ts`.
Bez aktívneho entitlementu na program je odpoveď **403** (nie 404 – klientka má vidieť, že nemá prístup).

| Endpoint | Popis |
|---|---|
| `GET /store/reset-journal` | vlastné záznamy + konfigurácia metrik (`?limit=`, `?offset=`) |
| `POST /store/reset-journal` | nový záznam: `{ "date": "YYYY-MM-DD", "week": 1..16, "metrics": { "energia": 7 } }` |
| `PATCH /store/reset-journal/:id` | úprava vlastného záznamu (`date`, `week`, `metrics`) || `DELETE /store/reset-journal/:id` | zmazanie vlastného záznamu |
| `GET /store/reset-program` | štruktúra programu (16 týždňov, pracovné listy, záverečné zhrnutie, vstupný dotazník) + metriky |

Príklad odpovede `GET /store/reset-journal`:

```json
{
  "program": "reset-40-plus",
  "metrics": [ { "key": "energia", "label": "Energia", "min": 1, "max": 10, "order": 10 } ],
  "entries": [ { "id": "rje_…", "week": 3, "date": "2026-08-14", "metrics": { "energia": 7 }, "created_at": "…", "updated_at": "…" } ],
  "count": 1, "limit": 50, "offset": 0
}
```

### 4.2 Admin API (iba čítanie)

`GET /admin/reset-program[?product_id=…]` → účinné metriky + štruktúra programu.
**Obsah záznamov Zrkadielka sa zámerne nezobrazuje** – sú to údaje o zdraví/pohodí zákazníčky
a patria jej (prístup má len zákazníčka cez store API).

### 4.3 Pravidlá a chybové kódy

| Kód | HTTP | Význam |
|---|---|---|
| `unauthorized` | 401 | nie je prihlásená zákazníčka |
| `forbidden` | 403 | nemá aktívny prístup k programu |
| `invalid_data` | 400 | chýba dátum / hodnotenia / nič na úpravu |
| `not_found` | 404 | záznam neexistuje **alebo patrí inej zákazníčke** (rozdiel sa neukazuje) |
| `JOURNAL_DATE_IN_FUTURE` | 400 | dátum je v budúcnosti (porovnanie v časovom pásme zákazníčky) |
| `JOURNAL_DATE_INVALID` | 400 | dátum nie je platný kalendárny deň |
| `JOURNAL_METRIC_OUT_OF_RANGE` | 400 | hodnota mimo `min..max` (predvolene 1–10) |
| `JOURNAL_METRIC_UNKNOWN` | 400 | kľúč metriky nie je v konfigurácii |
| `JOURNAL_METRIC_INVALID` | 400 | hodnota nie je celé číslo |
| `JOURNAL_METRICS_EMPTY` | 400 | žiadna hodnota |
| `JOURNAL_WEEK_INVALID` | 400 | týždeň mimo 1–16 |
| `JOURNAL_DAILY_LIMIT` | 429 | denný limit záznamov (10/deň) dosiahnutý |

**Denný limit:** 10 záznamov na kalendárny deň a program. Kontrola aj zápis prebiehajú
v jednej transakcii s advisory zámkom zákazníčky – súbežné požiadavky limit neobídú.

---

## 5. GDPR

* **Export osobných údajov** (`GET /store/customers/me/export`) obsahuje nový blok `reset_journal`
  (`backend/src/lib/customer-privacy/export.ts`).
* **Výmaz zákazníka** (tombstone `customer_erasure`, `backend/src/modules/customer-privacy/erase.ts`)
  odstraňuje záznamy Zrkadielka **natvrdo** (soft delete by nechal údaje o zdraví v databáze).
  Pridaná je kontrola existencie tabuľky, aby výmaz nepadal pred nasadením migrácie.
* Záznam patrí výhradne zákazníčke: každý dotaz v module je ohraničený `customer_id`
  (izolácia je v dátovej vrstve, nie len v kontrole trasy).
* `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md` – **bod 17**: Zrkadielko = údaje o zdraví/pohodí,
  potvrdiť právny základ (súhlas), správcu, príjemcov a dobu uchovávania.

---

## 6. Overenie

### 6.1 Testy (jednotkové)

```
cd backend && npx tsc --noEmit          # bez chyby
cd backend && npm run test:unit         # 1456 testov, 0 chýb
```

Nové testy:

| Súbor | Pokrýva |
|---|---|
| `backend/src/modules/reset-journal/__tests__/policy.unit.spec.ts` | dátum, dnešný deň v TZ, rozsah hodnôt 1–10, týždeň 1–16, denný limit |
| `backend/src/modules/reset-journal/__tests__/service.unit.spec.ts` | vlastníctvo (filter aj v SQL), dátum v budúcnosti, limit, úprava a zmazanie |
| `backend/src/lib/reset-program/__tests__/config.unit.spec.ts` | zoznam metrik, prepis v metadátach, programový kľúč |
| `backend/src/lib/reset-program/__tests__/structure.unit.spec.ts` | kostra 16 týždňov, dni 2–7, sanitizácia, `content_ready` |
| `backend/src/api/store/reset-journal/__tests__/route.unit.spec.ts` | 401/403/404, vlastné záznamy, cudzí záznam |
| `backend/integration-tests/http/reset-journal-http-checks.ts` | skutočné HTTP + PostgreSQL: izolácia zákazníčiek, validácia, export, výmaz |
| `backend/integration-tests/http/reset-journal.spec.ts` | samostatný integračný beh (Medusa + Postgres) pre CI |

### 6.2 Integrácia (HTTP + PostgreSQL)

Scenár `backend/integration-tests/http/reset-journal-http-checks.ts` beží nad **skutočným
Medusa HTTP a PostgreSQL** (migrácia modulu, entitlement, export, výmaz).

* samostatný špec: `backend/integration-tests/http/reset-journal.spec.ts` (iba syntetické údaje,
  vlastná dočasná databáza),
* CI: `.github/workflows/reset-journal.yml` (Postgres služba `reset_journal_synthetic`,
  databáza `anastasia_reset_journal_ci`),
* lokálne (súkromný syntetický cluster):
  `python3 backend/scripts/verify-safeorder-local.py --spec integration-tests/http/reset-journal.spec.ts`,
* scenár je zapojený aj do sériového behu `backend/integration-tests/http/safeorder-persistence.spec.ts`.

### 6.3 Čo je overené a čo nie

| Tvrdenie | Stav |
|---|---|
| Jednotkové testy politiky, služby, konfigurácie a tras prechádzajú | `VERIFIED` (spustené) |
| `tsc --noEmit` bez chyby | `VERIFIED` (spustené) |
| Izolácia zákazníčiek, validácia, export a výmaz v skutočnom HTTP + PG | `VERIFIED` (spustené v syntetickom clusteri) |
| Migrácia modulu vytvorí tabuľku a indexy | `VERIFIED` (beh nad čistou databázou) |
| Obsah programu (texty, pracovné listy) | `NOT_IMPLEMENTED` – dodá Lucia |
| Právny základ (súhlas) | `NOT_IMPLEMENTED` – potvrdenie od Lucie (bod 17) |
| Frontend členskej zóny | `NOT_IMPLEMENTED` – iný balík |

### 6.4 Nálezy mimo balíka (pre informáciu, neopravené)

Pri behu integračných scenárov na veteve `release/predani-faze1` sa potvrdili dve **predchádzajúce**
(problémy mimo balíka Zrkadielko):

1. `backend/integration-tests/http/safeorder-persistence.spec.ts` – zlyháva v scenári
   „C3_CONCURRENT_SINGLE_USE“ (`expect(arrivals).toBe(2)`), teda ešte pred dosiahnutím scenárov
   Zrkadielka. **Overené na základnom commite `6398912` aj s mojimi zmenami** → nejde o regresiu
   balíka Zrkadielko.
2. `backend/src/modules/entitlement/service.ts` vyžaduje pri `grant()` `tenant_id`, ale
   `backend/src/lib/membership/access.ts` ho neposiela a `entitlement-isolation-http-checks.ts`
   ho taktiež neposiela → club prístup a tento integračný scenár sú na veteve rozbité.
   Patrí to balíku entitlement/tenanta, nie Zrkadielku.

---

## 7. Čo chýba od Lucie (otázky a chýbajúci obsah)

1. **Kompletný zoznam stĺpcov Zrkadielka.** Na starom webe sú DÁTUM, ENERGIA (1–10), SPÁNOK (1–10),
   STRES (1–10) a ďalší stĺpec, ktorý sa na screenshotu začína na „NA…“ – jeho názov sa nedá
   prečítať. Po potvrdení sa doplní do `RESET_JOURNAL_METRICS` (alebo do `metadata.reset_journal_metrics`)
   bez zásahu do logiky.
2. **Obsah programu:** texty 16 týždňov, materiály na samoštúdium, pracovné listy po dňoch
   (2.–7. deň), text záverečného zhrnutia a odkaz na vstupný dotazník
   (zo starého webu `https://tally.so/r/440GBr` – potvrdiť, či ostáva).
3. **Priradenie chránených médií k týždňom.** V R2 je 17 lekcií (`lekcia-00 … lekcia-17`),
   k 16 týždňom sa nedajú priradiť bez Luciinho rozhodnutia.
4. **Právny základ súhlasu** (bod 17 v `PRAVNE-TEXTY-DOPLNIT.md`): forma súhlasu, správca,
   príjemcovia (NEXUS Worker?) a doba uchovávania.
5. **Prihlasovanie do členskej zóny na strane storefrontu** – backend je hotový, UI je iný balík.

---

## 8. Riziká a poznámky

* **Žiadne produkčné zásahy** – nič nebolo nasadené, nič sa nezmenilo mimo lokálnej DB.
* `medusa-config.ts` bol upravený o **jeden riadok** (registrácia modulu) – bez neho tabuľka
  nevznikne. `package.json`/lockfile/.env sa nemenili, nových závislostí nie je.
* Zmazanie záznamu je natvrdo (soft delete by ponechal údaje o zdraví v DB) – medzi opravami
  a výmazom ostáva v DB, preto je denný limit a export dôležité.
* Hodnoty metrik sú **zdravotné údaje**: neposielajú sa do NEXUS Workera, nezobrazujú sa
  v administrácii ani v logoch.
* Frontend (členská zóna 1:1 se starým webem) nie je súčasťou tohto balíka.

---

## 9. Súbory balíka

```
backend/medusa-config.ts                                            (1 riadok – registrácia modulu)
backend/src/api/middlewares.ts                                      (zapojenie middleware)
backend/src/api/store/reset-journal/middlewares.ts
backend/src/api/store/reset-journal/route.ts                        (GET, POST)
backend/src/api/store/reset-journal/[id]/route.ts                   (PATCH, DELETE)
backend/src/api/store/reset-journal/helpers.ts
backend/src/api/store/reset-journal/__tests__/route.unit.spec.ts
backend/src/api/store/reset-program/route.ts                        (GET)
backend/src/api/admin/reset-program/route.ts                        (GET – len čítanie)
backend/src/lib/reset-program/config.ts
backend/src/lib/reset-program/structure.ts
backend/src/lib/reset-program/access.ts
backend/src/lib/reset-program/__tests__/config.unit.spec.ts
backend/src/lib/reset-program/__tests__/structure.unit.spec.ts
backend/src/modules/reset-journal/index.ts
backend/src/modules/reset-journal/service.ts
backend/src/modules/reset-journal/policy.ts
backend/src/modules/reset-journal/types.ts
backend/src/modules/reset-journal/models/reset-journal-entry.ts
backend/src/modules/reset-journal/migrations/Migration20261021120000.ts
backend/src/modules/reset-journal/__tests__/policy.unit.spec.ts
backend/src/modules/reset-journal/__tests__/service.unit.spec.ts
backend/src/lib/customer-privacy/export.ts                          (export: reset_journal)
backend/src/modules/customer-privacy/erase.ts                       (výmaz: natvrdo)
backend/integration-tests/http/reset-journal-http-checks.ts
backend/integration-tests/http/reset-journal.spec.ts
backend/integration-tests/http/safeorder-persistence.spec.ts        (zapojenie scenára)
backend/scripts/update-admin-map.mjs                                (nové routy v mape administrácie)
backend/scripts/verify-safeorder-local.py                           (voliteľný --spec pre vlastný scenár)
backend/docs/wp/admin-function-map.json                            (mapa administrácie)
backend/docs/wp/ADMIN-FUNKCE-A-POKRYTI.md                          (agenda access)
backend/docs/wp/reset-zrkadielko.md                                 (tento dokument)
.github/workflows/reset-journal.yml                                (CI: vlastný Postgres + špec)
anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md                             (bod 17 – právny základ)
```
