# GAP analýza: administrácia ANASTASIA vs. štandard e-shop adminu (Shoptet / Shopify)

**Dátum:** 21. 10. 2026
**Predmet:** `anastasia-admin/*.mjs` (SPA) + `backend/src/api/admin/*` (vlastné admin API) + naviazané časti `backend/src/modules`, `backend/src/subscribers`, `backend/src/jobs`, `backend/src/lib`
**Metóda:** statická analýza kódu (read-only). Nič nebolo menené. Každý riadok je overený grepom/čítaním; kde je dôkaz, je uvedený súbor:riadok.

**Legenda stavov:** `MÁ` = hotovo a použiteľné · `ČI` = čiastočné (niečo funguje, chýba kus) · `CHÝBA` = chýba úplne
**Legenda priorít:**
- **P0** — bez toho sa nedá legálne a bezpečne predávať, alebo hrozí pokuta/strata peňazí
- **P1** — chýba to, čo každý e-shop admin musí mať; predaj ide, ale prevádzka stráca čas/peňazá
- **P2** — vylepšenie, komfort, konkurenčná výhoda

**Odhad práce:** S = 0,5 dňa · M = 1–2 dni · L = 3–5 dní · XL = 1–2 týždne

---

## 0. Sumár

| Oblast | MÁ | ČI | CHÝBA | Najhoršia priorita |
|---|---|---|---|---|
| Objednávky | 7 | 5 | 12 | **P0** (storno bez dôvodu, ručná objednávka, chýba fakturačná adresa) |
| Faktúry / účtovníctvo | 0 | 0 | 8 | **P0** (modul faktúr vôbec neexistuje) |
| Zákazníci | 2 | 7 | 7 | **P0** (GDPR výmaz bez UI, chýba história objednávok, zoznam orezaný na 100) |
| Produkty | 7 | 4 | 12 | **P0** (viac ako 1 variant, hromadné úpravy, DPH, platnosť akčnej ceny) |
| Kategórie | 2 | 0 | 3 | P2 |
| Kupóny / akcie / poukazy | 3 | 1 | 6 | P1 (dátum platnosti kupónu, kampane ako objekt) |
| Doprava a platby | 1 | 4 | 7 | **P0** (ceny dopravy nie sú spraviteľné z adminu) |
| E-maily | 3 | 2 | 4 | **P0** (chýba e-mail s faktúrou) / P1 (žiadne rozosielanie newslettera) |
| Obsah a legislatíva | 4 | 1 | 6 | **P0** (cookies lišta, VOP/GDPR s placeholdermi, odstúpenie bez UI) |
| Štatistiky | 4 | 1 | 4 | **P0** (chýba uzávierka DPH) / P1 (obdobie, grafy) |
| Admin používatelia a role | 2 | 0 | 5 | **P0** (žiadny RBAC — každý admin má plný prístup) |
| Audit log | 1 | 1 | 3 | **P0** (zmeny objednávok/cen nie sú čitateľné v UI) |
| Zálohy | 1 | 1 | 2 | P1 (zálohy idú cez CI, nie cez admin) |
| Notifikácia o novej objednávke | 2 | 1 | 3 | **P0** (len browser – ak Lucia nemá otvorený prehliadač, nevie) |
| **Spolu** | **39** | **28** | **79** | — |

**Celkovo:** admin je funkčne silný v prevádzke obchodu (objednávky, sklad, konzultácie, chat, poukazy, e-maily, texty) a úplne chýba v **obchodno-finančnej vrstve** (faktúry, účtovníctvo, sadzby DPH) a v **prevádzkových hygienických funkciách** (RBAC, audit, notifikácie, zálohy).

---

## 0b. r7 (21. 10. 2026) – hotové rýchle položky

| # | Položka | Stav |
|---|---|---|
| 1.12b | Fakturačná adresa v `ORDER_FIELDS`, v detaile aj na tlači | hotovo (bolo implementované už v r5) |
| 1.12 | Úprava doručovacej a fakturačnej adresy objednávky (`AdminUpdateOrder`) | hotovo |
| 1.9 | Povinný dôvod pri vrátení peňazí (posiela sa ako `note`) | hotovo |
| 1.4 | Storno s povinným dôvodom + audit (kto a prečo) | hotovo (návrat tovaru na sklad zostáva otvorený – 1.7) |
| 1.10 | Poznámky k objednávke s autorom, časom a auditom | hotovo |

---

## 1. Objednávky

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 1.1 | Prehľad objednávok + filtre (Všetky / Na vybavenie / Čaká na platbu / Odoslané / Zrušené / Archív) | **MÁ** | `app.mjs:958-1104`, filtre `:969-976`, stránkovanie `:1041-1044` | — | — |
| 1.2 | Prehľad stavov platby a vybavenia (pills) | **MÁ** | `app.mjs:964-965`, mapovanie `PAY_LABEL` `:1114`, `FUL_LABEL` `:1115` | — | — |
| 1.3 | Vyhľadávanie (číslo / meno / e-mail / produkt) | **MÁ** (klientovo, cez JSON.stringify celej objednávky `:1039`) | `app.mjs:1101-1102` | P2 (do 1 000 objednávok funguje, nad to nie) | S |
| 1.4 | Storno objednávky | **MÁ** (r7) – dôvod je povinný: vlastná trasa `POST /admin/nexus/orders/:id/cancel` zruší objednávku, uloží dôvod, kto a kedy do `order.metadata.anastasia_cancel` a zapíše audit `order.cancel`. Návrat tovaru na sklad po storne stále **CHÝBA** (zostáva v rámci 1.7) | `backend/src/api/admin/nexus/orders/[id]/cancel/route.ts`, `anastasia-admin/app.mjs` (formulár „Dôvod zrušenia“) | — | — |
| 1.5 | Čiastočné vrátenie peňazí | **MÁ** — vstup sumy s `max` = nezrefundovaný zvyšok, validácia 0,01–max, `POST /admin/payments/:id/refund` | `app.mjs:1162`, `:1217-1221` | — | — |
| 1.6 | Plné vrátenie peňazí | **MÁ** — default = zostávajúca suma, `:1162` | `app.mjs:1159-1163` | — | — |
| 1.7 | Vrátenie tovaru na sklad po refundácii | **CHÝBA** — repo-wide grep `restock\|inventory.*refund` = 0 hitov. Vrátený tovar sa nikde nevráti do skladu | — | **P0** | M |
| 1.8 | Dobropis (credit note) | **CHÝBA** — grep `dobropis\|credit_note\|credit note` = 0 hitov v celom repo | — | **P0** | L |
| 1.9 | Dôvod vrátenia / reklamácie | **MÁ** (r7) – v dialógu vrátenia je povinné pole „Dôvod vrátenia“, posiela sa ako `note` (core validátor `AdminCreatePaymentRefund` ho prijíma) | `anastasia-admin/app.mjs` (tabuľka Platby, `data-refreason`) | — | — |
| 1.9b | Kontrola meny pri vrátení | **CHÝBA** — `fmtEur` je natvrdo EUR (`app.mjs:7`), `o.currency_code` sa pri refunde neporovnáva s menou platby | `app.mjs:7`, `:1220` | P1 | S |
| 1.9c | Vrátenie peňazí pri dobierke/prevode | **ČI** — jadro eviduje sumu, reálny prevod musí urobiť človek. UI to priznáva, ale **chýba záznam, kto peniaze poslal a kedy** | `app.mjs:1164`, `backend/src/modules/payment-manual/service.ts:35-41` | P1 | S |
| 1.10 | Poznámky k objednávke | **MÁ** (r7) – poznámky idú cez `POST /admin/nexus/orders/:id/notes`: server uloží text, autora, e-mail autora a čas do `order.metadata.anastasia_notes` a zapíše audit `order.note_created`. V detaile sú viditeľné s autorom a časom | `backend/src/api/admin/nexus/orders/[id]/notes/route.ts`, `anastasia-admin/app.mjs` (sekcia „Poznámky k objednávke“) | — | — |
| 1.11 | Ručná objednávka (telefonická / POS) | **CHÝBA** — grep `manual.*order\|ručn.*objedn` = 0 hitov v admin aj backend. **Dôležité:** Medusa core `POST /admin/orders` vôbec neexistuje (`node_modules/@medusajs/medusa/dist/api/admin/orders/route.js` exportuje len GET) → treba vlastný route/workflow. Core má `draft-orders`, ale SPA ich nepoužíva | — | **P0** | L |
| 1.11b | Zmena stavu objednávky ručne (dokončiť / archivovať) | **CHÝBA** — core trasy `POST /admin/orders/:id/complete` a `/archive` existujú, ale SPA ich nepoužíva. `AdminUpdateOrder` vôbec nepovoľuje meniť `status` | — | P2 | S |
| 1.12 | Úprava adresy na existujúcej objednávke | **MÁ** (r7) – v detaile objednávky je formulár na doručovaciu a fakturačnú adresu; SPA posiela `shipping_address` aj `billing_address` cez `POST /admin/orders/:id` (`AdminUpdateOrder`) | `anastasia-admin/app.mjs` („Adresy objednávky“) | — | — |
| 1.12b | **Fakturačná adresa (billing address)** | **MÁ** – `ORDER_FIELDS` aj `PRINT_FIELDS` obsahujú `*billing_address`, v detaile aj na dodacom liste je zobrazená (s rozlíšením, či sa líši od doručovacej) | `anastasia-admin/app.mjs` (`ORDER_FIELDS`), `anastasia-admin/print.mjs` | — | — |
| 1.13 | Úprava položiek objednávky (počet, produkt) | **CHÝBA** | `app.mjs:1147-1150` (read-only) | P1 | M |
| 1.14 | Export CSV | **ČI** — 11 stĺpcov, UTF-8 BOM, CRLF, korektné escaping. **Len pre označené objednávky na aktuálnej strane; chýba export celej/ filtrovanej množiny, chýba stĺpec DPH a čiastkového vrátenia** | `app.mjs:1083-1100`, `csvCell` `:944`, `downloadText` `:937` | P1 | S |
| 1.15 | Tisk (A6 adresný štítok, A4 dodací list) | **MÁ** — single aj hromadný, aj z filtra „Na vybavenie“ | `app.mjs:996-999`, `:1015-1016`, `:1078-1082`, `printOrders` `:44-59`, `print.mjs` | — | — |
| 1.16 | Balíkovací list / picking list pre viac objednávok | **CHÝBA** (dodací list existuje, ale nie je zoznam položiek na balenie) | `print.mjs` | P2 | M |
| 1.17 | Flow vybavenia → odoslanie + sledovacie číslo | **MÁ** — prepare (`POST /admin/orders/:id/fulfillments`), ship + tracking number/URL, e-mail zákazníkovi | `app.mjs:1151-1158`, `:1206-1215` | — | — |
| 1.18 | Timeline / história udalostí objednávky | **CHÝBA** | — | P1 | M |
| 1.19 | Zmena stavu objednávky adminom (ručne) | **CHÝBA** — stavy sa menia len akciami (capture/refund/cancel/ship), nie všeobecným status editorom | — | P2 | S |
| 1.20 | Hromadné akcie (storno viacerých, export všetkých) | **ČI** — hromadný tlak a CSV export existujú, hromadné storno nie | `app.mjs:1012-1020` | P2 | S |

---

## 2. Faktúry a účtovníctvo

> **Najväčšia medzera celého projektu.** V repozitári **neexistuje žiadny fakturačný modul** — grep `faktur|invoice` v `backend/src` + `anastasia-admin/app.mjs` vracia **jediný hit**: text v názve routy `'nastavenia': [... 'a fakturácia' ...]` (`app.mjs:2731`), ktorý klamivo sľubuje funkciu.

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 2.1 | Číslovanie faktúr (rad, prefix, formát, rok, pokračovanie) | **CHÝBA** | — | **P0** | L |
| 2.2 | Vystavenie PDF faktúry | **CHÝBA** — **dobrá správa: PDF pipeline už v repu existuje** (darčekový poukaz: `backend/src/modules/gift-voucher/pdf.ts` + `delivery.ts:50,87`) → netreba ťahať novú knižnicu, len ju znovu použiť | — | **P0** | L |
| 2.3 | Zálohová faktúra (proforma) | **CHÝBA** | — | P1 | M |
| 2.4 | Dobropis | **CHÝBA** | — | **P0** | M (po 2.1) |
| 2.5 | Odoslanie faktúry e-mailom | **CHÝBA** | — | **P0** | M (po 2.2) |
| 2.6 | Export do účtovníctva (Pohoda XML / Money S3 / iDokklad / Eskont / Poptavej / ISDOC) | **CHÝBA** — záložka „Účtovníctvo“ je **explicitný stub**: *„Prepojenie s účtovníctvom (POHODA alebo Money S3) pripravujeme.“* **NEXUS má len hranicu adaptéra** (`nexus/connectors/accounting/pohoda.ts:7`, `money-s3.ts:7`, `types.ts:2` = `AccountingProvider = 'pohoda' \| 'money-s3'`) — transporty sú zámerne injektované, **živá integrácia, perzistencia konfigurácie ani UI neexistujú** (`nexus/connectors/accounting/README.md:5`). iDokład/Eskont/Poptavej/ISDOC = 0 kódu | `app.mjs:2332`, `nexus/connectors/accounting/README.md:5` | **P0** | XL |
| 2.7 | Prehľad dokladov / rekonciliácia platieb | **CHÝBA** | — | P1 | L |
| 2.8 | Prehľad DPH podľa sazby a obdobia (uzávierka) | **CHÝBA** — sadzby DPH existujú iba v bootstrap scripte (23/19/5 %), nie v prevádzke | `backend/src/scripts/anastasia-bootstrap.ts:56-65` | **P0** | L |

**Legálny kontext:** VOP bod 4.8 zaväzuje predávajúceho dodáť daňový doklad e-mailom najneskôr do 10 dní od prevzatia zásielky (`backend/src/lib/pages/defaults.ts:58`). **Bez fakturačného modulu túto povinnosť nemožno splniť.** Pri B2C predaji fyzického tovaru ide o P0.

---

## 3. Zákazníci

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 3.1 | Zoznam zákazníkov | **ČI** — `limit=100`, **bez stránkovania a bez vyhľadávania**. Nad 100 zákazníkov zostane väčšina neviditeľná. **Bug:** e-mail sa karta vôbec nezobrazí, ak zákazníka nemá meno (`app.mjs:1232`); **telefón sa ani nestahuje** → nemožno hľadať podľa telefónu | `app.mjs:1225-1236` | **P0** | S |
| 3.2 | Detail zákazníka (meno, e-mail, hosť/účet) + úprava mena | **MÁ** | `app.mjs:1237-1262`, save `:1253-1262` | — | — |
| 3.3 | História objednávok zákazníka | **CHÝBA** — v deteile zákazníka nie sú objednávky, žiadny filter zoznamu objednávok podľa `customer_id` | `app.mjs:1237-1250` | **P0** | M |
| 3.4 | História akcií / priznámky ku zákazníkovi | **CHÝBA v UI** — API existuje (`GET/POST/DELETE /admin/customers/:id/notes`, audit `customer.note_created`), **ale admin ho nikde nepoužíva** | `backend/src/api/admin/customers/[id]/notes/route.ts` (orphan) | P1 | S |
| 3.5 | GDPR export (právo na prístup) | **ČI** — self-service pre zákazníka existuje (`GET /store/customers/me/export`), **v adminovi chýba akcia „export údajov zákazníka“** | `backend/src/api/store/customers/me/export/route.ts`, `backend/src/lib/customer-privacy/export.ts` | P1 | S |
| 3.6 | GDPR výmaz (právo na zabudnutie) | **ČI / P0** — backend admin API existuje a je funkčné (`GET /admin/customer-erasures`, `POST /admin/customer-erasures/:id/execute`, s auditom `customer.erasure`), **ale je to „orphan“ route — v SPA nie je naň žiadny odkaz**. Bez UI sa žiadosť o výmaz nedá vybaviť. **Pozor: ide o anonymizáciu, nie o úplné zmazanie** — riadok `customer` zostáva, **všetky objednávky a účtovné záznamy zostávajú zachované** (`orders_preserved`), chat je natvrdo zablokovaný | `backend/src/api/admin/customer-erasures/*` (orphan), `backend/src/modules/customer-privacy/erase.ts:3,11,17,21-23,46` | **P0** | S |
| 3.7 | Súhlas s newsletterom | **ČI** — zoznam súhlasov je read-only, **bez stránkovania (limit 200), bez CSV (API `?format=csv` existuje, UI ho nepoužíva), bez súhlasu v detaile zákazníka, bez odhlásenia zo strany admina** | `app.mjs:1917-1927`, `backend/src/api/admin/newsletter/route.ts` | P1 | S |
| 3.7b | Double opt-in pri newsletteri | **CHÝBA** — `legal/service.ts:30-41` zapíše `status:"subscribed"` **ihneď**, bez potvrdzovacieho e-mailu. Jediný mechanizmus je unsubscribe token | `backend/src/modules/legal/service.ts:30-41` | **P1** | M |
| 3.8 | Odoberanie/prihlásenie newsletteru v admine | **CHÝBA** | — | P1 | S |
| 3.9 | Skupiny zákazníkov (segmenty) | **ČI** — možno priradiť existujúcu skupinu, **nemožno vytvoriť / premenovať / zmazať / definovať kritérium**; žiadny vliv na cenu či marketing | `app.mjs:1241-1259` | P1 | M |
| 3.10 | Top zákazníka / hodnota životného cyklu (LTV) | **CHÝBA** | — | P2 | M |
| 3.10b | Vyhľadávanie v Klube (členky) | **ČI** — hľadá sa **iba podľa ID `cus_…`**, nie podľa mena alebo e-mailu | `app.mjs:2579` | P1 | S |
| 3.11 | Ručné vytvorenie zákazníka, reset hesla, pozvánka | **CHÝBA** | — | P1 | S |
| 3.12 | Blokovanie zákazníka | **ČI** — iba v chate (`POST /admin/chat/customers/:id/block`), nie ako vlastný atribút zákazníka | `backend/src/api/admin/chat/customers/[id]/block/route.ts` | P2 | S |
| 3.13 | Kreditný limit / dlh / záloha | **CHÝBA** | — | P2 | M |
| 3.14 | Vernostné body (Klub) | **MÁ** — vlastný modul `backend/src/modules/membership`, admin `vKlub` | `app.mjs:2589+` | — | — |

---

## 4. Produkty

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 4.1 | Zoznam produktov, serverové stránkovanie, vyhľadávanie, filter stavu a typu | **MÁ** | `app.mjs:569-639` (vlastný endpoint `/admin/product-catalogue`) | — | — |
| 4.2 | Vytvorenie produktu | **MÁ** — názov, cena, SKU, typ dopravy, stav; validácie; 1 variant | `app.mjs:644-684` | — | — |
| 4.3 | Úprava produktu (názov, stav, popis rich-text, obrázky, kategórie, predajné kanály, doprava, SKU, sklad) | **MÁ** — 6 záložiek, „kompletnosť“ blokuje zverejnenie chýbajúcich údajov | `app.mjs:686-881`, completeness `:733-746` | — | — |
| 4.4 | **Varianty — viac ako jeden** | **CHÝBA / P0** — editor pracuje výhradne s `p.variants?.[0]` (`app.mjs:691, 702`). **Nie je vytvorenie, úprava ani zmazanie variantu**; `variants/inventory-items/batch` slúži len na sklad | `app.mjs:691-702`, `:831`, `:863-869` | **P0** | L |
| 4.5 | Matica kombinácií (veľkosť × farba) | **CHÝBA** | — | P1 | L |
| 4.6 | Duplikácia produktu / zmazanie produktu | **CHÝBA** — žiadne tlačidlo. Všetky `DELETE` v SPA sú len kategórie, chat šablóny, e-mail šablóny, stránky, médiá, pozvánky — **produkt sa nedá ani archivovať, ani odstrániť** | `app.mjs:805-859` (save) | P1 | S |
| 4.7 | Sklad — počty po skladoch | **MÁ** — zapnutie `manage_inventory`, vytvorenie skladovej položky, počty po skladoch, validácia celých čísel | `app.mjs:726-732`, `saveStock` `:861-880` | — | — |
| 4.8 | Upozornenie na nízky sklad | **ČI** — dashboard zobrazí `stock <= 5`, ale **prah je natvrdo v kóde a nedá sa nastaviť**; **žiadne notifikácie (e-mail/Slack), žiadny prehľad „podlimitných“ produktov s filtrom** | `app.mjs:260-262`, `:308-312` | P1 | M |
| 4.9 | Zdôvodnenie skladovej zmeny / skladový pohyb (príjem, výdaj, vrátenie) | **CHÝBA** — počty sa prepíšu bez dôvodu, bez auditnej stopy | `app.mjs:871-879` | P1 | M |
| 4.10 | Hromadné úpravy produktov (cena %, kategória, stav, sklad) | **CHÝBA** — tabuľka produktov nemá checkboxy ani hromadnú akciu | `app.mjs:575-582` | **P0** (pri 100+ produktoch) | L |
| 4.11 | Import produktov z CSV v admine | **CHÝBA** — import existuje len ako backend skript (`backend/src/scripts/import-anastasia-catalog.ts`), nie v UI, bez mapovania stĺpcov a bez chybového reportu | — | P1 | L |
| 4.12 | Export produktov do CSV | **CHÝBA** | — | P1 | S |
| 4.13 | SEO title / description | **CHÝBA** — `meta_title` / `meta_description` sa v UI nikde nenastavujú. **Dôležité:** legacy import ich síce napĺňa do metadát (`backend/src/scripts/import-anastasia-catalog.ts:256-257`), ale **žiadny kód v `nexus/` ani v `backend/src/api/store` ich nečíta** → samotné zapnutie v admine nič nezmení na webe, treba aj spotřebiteľa metafieldu | `app.mjs:690` | P1 | M (admin) + M (storefront) |
| 4.14 | URL (handle / slug) produktu a kategórie | **ČI** — **kategóriu** handle editovať možno (`app.mjs:904`), **produkt nie**: `handle` nie je v poliach načítaných v SPAni (`app.mjs:690`), **hoci API `/admin/product-catalogue` ho vracia** (`backend/src/api/admin/product-catalogue/route.ts:63, 76`) → oprava je S | `app.mjs:690` vs `:904`, `product-catalogue/route.ts:63,76` | P1 | S |
| 4.15 | Presmerovania (redirects) pri zmene URL | **CHÝBA** | — | P1 | M |
| 4.16 | Štítok „Akcia“ | **MÁ** — akčná cena cez samostatný Medusa price list `ANASTASIA výpredaj` (typ `sale`), zápis cez `applyVariantSale` | `app.mjs:540-564`, `:841-846` | — | — |
| 4.17 | **Platnosť akčnej ceny („Platí do“)** | **ČI / P0** — dátum sa **zapisuje** do `metadata.vyprodej.do`, ale **repo-wide grep `vyprodej` v `backend/src` vracia 0 hitov**. Dátum sa **nikde nevyhodnocuje** → akčná cena platí navždy, aj po deadline. UI tak klamie zákazníkovi aj obchodníkovi | zápis `app.mjs:844-846`; čítanie chýba | **P0** | M |
| 4.18 | Štítok „Novinka“ | **CHÝBA** — `is_new` / `is_action` / `is_sale` sa importujú do metadát (`backend/src/scripts/import-anastasia-catalog.ts:249-252`), **ale v admine sa nedajú prepnúť a žiadny kód v `nexus/`/`store` ich nečíta** (0 hitov) | — | P1 | S (admin) + M (storefront) |
| 4.19 | Štítok „Odporúčame“ / zvýraznenie | **CHÝBA** — storefront používa natvrdo zoznam `FEATURED_SLUGS` mimo adminu | `storefront-prototype/src/lib/api/catalog.mjs:19` | P2 | S |
| 4.20 | Sazby DPH na produkte | **CHÝBA** — sadzby sú len v bootstrap scripte; v admine sa nedá zvoliť ani vidieť sadzbu produktu. **Žiadny admin route nevypisuje Medusa tax sadzby** (grep `tax_rate\|taxes` v `backend/src/api/admin` = 0 hitov). Legacy: `metadata.legacy_vat_rate` | `backend/src/scripts/anastasia-bootstrap.ts:56-65` | **P0** | L |
| 4.21 | Viditeľnosť (koncept / zverejnené / predajné kanály) | **ČI** — stav len `published`/`draft` (`app.mjs:709`); **chýba `proposed`/`rejected`/archiv**, ktoré Medusa admin podporuje (`backend/src/admin/lib/shop.ts:81`). Predajné kanály fungujú | `app.mjs:709`, `:725`, `:851` | P1 | S |
| 4.22 | Nahrávanie obrázkov a knižnica chránených súborov | **MÁ** | `app.mjs:719-721`, `:785-802`, `library-editor.mjs` | — | — |
| 4.23 | Hromadné zmeny cien cez cenový zoznam | **MÁ** — s kontrolou pôvodnej sumy a auditom | `app.mjs:837-840`, `backend/src/api/admin/shop-prices/[id]/route.ts` | — | — |

---

## 5. Kategórie

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 5.1 | Zoznam + strom + počet produktov | **MÁ** | `app.mjs:882-891` | — | — |
| 5.2 | Vytvorenie / úprava / zmazanie (ochrana pred podkategóriami) | **MÁ** | `app.mjs:893-928` | — | — |
| 5.3 | Popis, obrázok, SEO, poradie (sort) kategórie | **CHÝBA** | `app.mjs:901-907` | P2 | S |
| 5.4 | Hromadné presunutie produktov medzi kategóriami | **CHÝBA** | — | P2 | M |
| 5.5 | Duplikované produkty (varianta) = samostatná kategória | **CHÝBA** | — | P1 | M |

---

## 6. Kupóny, akcie, poukazy

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 6.1 | Kupón – vytvorenie, percentuálny aj fixný, limit použití, stav | **MÁ** | `app.mjs:1264-1292` | — | — |
| 6.2 | Kupón – úprava (typ, hodnota, limit, stav) s validáciou 0–100 % | **ČI** — **bug:** detail načíta `is_tax_inclusive` (`app.mjs:1297`), ale pri save ho **neposiela** (`:1326-1330`) → uložením kupónu sa príznak „zľava vrátane DPH“ môže zahodiť | `app.mjs:1297`, `:1326-1330` | P1 | S |
| 6.3 | **Dátum platnosti kupónu (od/do)** | **CHÝBA** — `POST /admin/promotions` posiela iba `{ code, type, status, application_method }`. Medusa promotions `starts_at`/`ends_at` sa **nepoužívajú**. Kupón platí navždy, kým ho niekto ručne nevypne | `app.mjs:1289-1290`, `:1326-1330` | **P1** | S |
| 6.4 | Podmienka minimálnej hodnoty nákupu | **CHÝBA** — `buy_rules` sa nepoužívajú | `app.mjs:1289` | P1 | S |
| 6.5 | Kupón na konkrétne produkty/kategórie | **CHÝBA** — `target_type` je natvrdo `'order'` | `app.mjs:1289` | P2 | S |
| 6.6 | Kupón na dopravu zadarmo | **CHÝBA** | — | P2 | S |
| 6.7 | QR kódy na kupóny + import z CSV | **MÁ** | `anastasia-admin/qr.mjs` (import `:90`) | — | — |
| 6.8 | Darčekové poukazy (vydanie, zostatok, storno, prepojenie s objednávkou, spätné vrátenie) | **MÁ** — robustnejší ako samotné kupóny | `app.mjs:1402-1508`, `backend/src/api/admin/vouchers/*` | — | — |
| 6.9 | Akcie ako samostatný objekt (kampane, banner, podmienky, dátum, banner na webe) | **CHÝBA** — existuje len cenový zoznam na variant, bez kampane a bez banneru | `app.mjs:540-564` | P1 | L |
| 6.10 | Prehľad použitia kupónov (kto, kedy, koľko) | **CHÝBA** | — | P2 | M |

---

## 7. Doprava a platby

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 7.1 | Prehľad regiónov, krajín, platobných metód | **ČI** — **len na čítanie** | `app.mjs:2085-2112` | **P0** | M |
| 7.2 | Prehľad spôsobov dopravy + ceny | **ČI** — **len na čítanie**; text: *„Platobné brány a dopravcov … zapája náš tím bezpečne na serveri“* | `app.mjs:2101-2107`, `:2111` | **P0** | L |
| 7.3 | **Zmena ceny dopravy v admine** | **CHÝBA** | — | **P0** | M |
| 7.4 | **Vytvorenie / úprava spôsobu dopravy, zón, pravidiel (váha, hranica, min. cena)** | **CHÝBA** | — | **P0** | L |
| 7.5 | **Úprava platobnej metódy (zapnúť/vypnúť, pridať provider)** | **CHÝBA** | — | **P0** | M |
| 7.6 | Úprava regiónu / krajín / mien | **CHÝBA** (dnes len SK/EUR) | — | P1 | M |
| 7.7 | Výber dopravcu + uloženie API kľúča (šifrované na serveri) | **MÁ** | `app.mjs:2206-2279`, `backend/src/api/admin/carriers/route.ts` | — | — |
| 7.8 | **Napojenie API dopravcu na výpočet ceny a generovanie štítka** | **CHÝBA / P0** — UI to priznáva: *„Pripojenie k API dopravcu ešte nie je zapojené – stav ostáva ‚nepripojené‘“*. Cena dopravy sa dnes nedá vypočítať podľa hmotnosti | `app.mjs:2254` | **P0** | XL |
| 7.9 | Výdajné miesta Packeta (výber bodu na webe) | **CHÝBA** (carrier nie je zapojený) | — | P1 | L |
| 7.10 | Free-shipping hranica nad sumu | **CHÝBA** | — | P1 | M |
| 7.11 | Daňová / DPH kalkulácia pri doprave | **ČI** — len `automatic_taxes` v regióne, sadzby DPH nie sú spraviteľné | `app.mjs:2097-2100` | P1 | M |
| 7.12 | Sklady (CRUD, adresa) | **ČI** — zoznam existuje (`app.mjs:2108-2109`), **vytvorenie/editácia skladu v UI nie** | `app.mjs:2108` | P1 | S |

---

## 8. E-maily

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 8.1 | 16 transakčných šablón, editácia textu, živý náhľad, zapnutie/vypnutie | **MÁ** | `app.mjs:1855-1916`, `backend/src/modules/notification-zeptomail/templates.ts:294-680` | — | — |
| 8.2 | Zoznam e-mailov: potvrdenie objednávky, prijatie platby, odoslanie, vrátenie, zrušenie, odstúpenie, konzultácia, darčekový poukaz, uvítanie, magic link | **MÁ** | `templates.ts:294-680` | — | — |
| 8.3 | E-mail s faktúrou | **CHÝBA** (nie je faktúra) | — | **P0** | M (po 2.2) |
| 8.4 | **Newsletter — rozosielanie** | **CHÝBA** — existuje iba zoznam súhlasov. **Žiadny job, žiadny subscriber, žiadne API na odoslanie** (grep `newsletter` v `jobs/` a `subscribers/` = 0 hitov) | `app.mjs:1917-1927` | **P1** (obchodne fatálne) | L |
| 8.5 | Otestovanie e-mailu („poslať na seba“) | **CHÝBA** | — | P1 | S |
| 8.6 | Prehľad odoslaných e-mailov / bounce / retry | **ČI** — modul `notification-log` existuje, **žiadna admin obrazovka** | `backend/src/modules/notification-log` | P1 | M |
| 8.7 | Bulk / hromadný e-mail (kampane, opustený košík) | **CHÝBA** | — | P1 | L |
| 8.8 | Súhlas s marketingom (double opt-in) | **ČI** — súhlas sa eviduje (`text_version`, `source`, `consented_at`), **double opt-in potvrdenie sa v kóde nevidí** | `backend/src/api/store/newsletter/route.ts`, `backend/src/modules/legal/service.ts:30` | P1 | M |
| 8.9 | Automatický e-mail po odhlásení z newsletteru | **MÁ** | `templates.ts:485` | — | — |

---

## 9. Obsah, stránky a legislatíva SK

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 9.1 | Editor textov stránok (rich text, náhľad, obnovenie pôvodného znenia) | **MÁ** | `app.mjs:1929-2004` | — | — |
| 9.2 | Predvolené znenie: VOP, Kontakt, GDPR, Reklamácie, O Lucii, Pätička, Doprava a platba | **MÁ** | `backend/src/lib/pages/defaults.ts:3-184` | — | — |
| 9.3 | Knihovna médií (nahrávanie, kopírovanie URL, mazanie) | **MÁ** | `app.mjs:2009-2053` | — | — |
| 9.4 | Blog / novinky / FAQ / bloky na domovskú stránku (CMS) | **CHÝBA** | — | P1 | L |
| 9.5 | Editor hlávnej meny | **CHÝBA** | — | P2 | M |
| 9.6 | Preklady (EN/RU) | **CHÝBA** — explicitný stub | `app.mjs:2080` | P2 | XL |
| 9.7 | **Cookies lišta / súhlas s cookies** | **CHÝBA / P0** — repo-wide grep `cookie.?banner\|cookie.?lišta\|cookie.?consent\|prijatie.*cookie` = **0 hitov**. Analytics/pixelov zatiaľ nie sú, takže dnes je riziko menšie, ale pri zapnutí trackingu je to blocker | — | **P0** (pri trackingu) | M |
| 9.8 | **VOP – obsah je chybný, obsahuje cudziu firmu** | **P0** | `backend/src/lib/pages/defaults.ts:4-116` | **P0** | M |
| 9.9 | **GDPR text – placeholdery a neexistencia DPO** | **P0** | `backend/src/lib/pages/defaults.ts:128-144` | **P0** | M |
| 9.10 | Reklamácia – **žiadny formulár na webe** | **CHÝBA** | — | P1 | M |
| 9.11 | **Odstúpenie od zmluvy – backend áno, UI nie** | **P0** | orphan routes | **P0** | M |
| 9.12 | Verzie právnych dokumentov (VOP/GDPR súhlas pri košíku) | **MÁ** | `backend/src/api/store/legal/versions/route.ts`, `backend/src/modules/legal/service.ts:20` | — | — |
| 9.13 | eKasa | **CHÝBA / overiť relevanciu** | — | P1 (overiť) | XL |
| 9.14 | OSS / DPH pre EÚ | **N/A dnes** — len SK región, jedna mena. Ale doprava/účtovníctvo nie je pripravené na EÚ predaj | `app.mjs:2097-2100` | P2 | XL |
| 9.15 | Upozornenie na cookies v samotnom VOP/GDPR texte | **ČI** — GDPR stránka je všeobecná, chýba tabuľka cookies | `defaults.ts:128-144` | P1 | S |

---

## 10. Štatistiky a reporting

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 10.1 | Tržby: dnes / tento týždeň / tento mesiac | **ČI** — počítané **iba z posledných 200 objednávok** (s upozornením v UI). Nie je to presná štatistika | `app.mjs:241`, `:247-249`, `:298` | **P1** | M |
| 10.2 | Najpredávanejšie produkty (top 5) | **MÁ** (z tých 200 objednávok) | `app.mjs:250-258`, `:303-307` | — | — |
| 10.3 | Nízky sklad (top 5) | **MÁ** (prah ≤ 5 natvrdo) | `app.mjs:260-262`, `:308-312` | — | — |
| 10.4 | Počet objednávok na vybavenie, nové správy, dnešné konzultácie | **MÁ** | `app.mjs:268-274` | — | — |
| 10.5 | Grafy / obdobie / porovnanie s minulým obdobím | **CHÝBA** | — | P1 | L |
| 10.6 | Priemerná hodnota objednávky, konverzia, miera vrátení, podiel kanálov | **CHÝBA** | — | P1 | M |
| 10.7 | Prehľad tržieb podľa DPH / uzávierka obdobia | **CHÝBA** | — | **P0** | L |
| 10.8 | Export štatistiky | **CHÝBA** | — | P2 | S |
| 10.9 | Prehľad pripravenosti obchodu (blokery predaja) | **MÁ** — 9 kontrol, `blocker`/`warning` | `backend/src/lib/admin-readiness/readiness.ts:10-19`, `app.mjs:398-400` | — | — |

---

## 11. Používatelia adminu a role

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 11.1 | Zoznam administrátorov | **MÁ** | `app.mjs:2115-2125` | — | — |
| 11.2 | Pozvanie nového admina (jednorazový odkaz, platnosť, obnovenie, zrušenie) | **MÁ** | `app.mjs:2126-2151`, `renderInviteAccept` `:2153-2179` | — | — |
| 11.3 | **Role / oprávnenia (RBAC)** | **CHÝBA / P0** — kód to priznáva: *„Roly (RBAC) zatiaľ nie sú zapnuté: každý správca má plný prístup.“* Každý admin vidí tržby, ceny, export CSV, môže vrátiť peniaze, zmeniť ceny a spravovať poukazy | `app.mjs:2113`, `:2125` | **P0** | XL |
| 11.4 | Odstavenie / zablokovanie admina | **CHÝBA** | `app.mjs:2122-2125` | **P0** | S |
| 11.5 | 2FA pre adminov | **CHÝBA** | — | P1 | M |
| 11.6 | Zmena vlastného hesla / reset hesla admina | **CHÝBA** | — | P1 | S |
| 11.7 | Prehľad aktívnych sessions | **CHÝBA** | — | P2 | M |

---

## 12. Audit log

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 12.1 | Modul trvalého auditu + admin obrazovka „História zmien“ | **MÁ** | `backend/src/modules/ops-audit`, `app.mjs:2290-2324`, `backend/src/api/admin/ops/audit/route.ts` | — | — |
| 12.2 | **Rozsah auditu** | **ČI / P0** — v UI je popsaných len 6 akcií (téma, dopravca, stránka, médiá). **Zmena ceny, zverejnenie produktu, refund, storno objednávky, zmena zákazníka, zmena kupónu NIE SÚ v `AUDIT_LABEL`** – teda sa zapíšu do modulu, ale v obrazovke sa zobrazia ako surový `action` id, nečitateľne. Kontroluje to, či admin stornoval objednávku alebo vrátil peniaze, je dnes nemožné | `app.mjs:2282-2289` | **P0** | M |
| 12.3 | Filter auditu (podľa entity/akcie/aktéra) v UI | **CHÝBA** — API filter existuje (`entity_type`, `entity_id`, `actor_id`, `action`), UI ho nepoužíva | `backend/src/api/admin/ops/audit/route.ts:20-30` | P1 | S |
| 12.4 | Prehľad prevádzkových udalostí (`/admin/ops/events`) | **CHÝBA v UI** — orphan route | `backend/src/api/admin/ops/events/route.ts` | P1 | M |
| 12.5 | Prehľad NEXUS prepojenia (`/admin/ops/nexus`) | **CHÝBA v UI** — orphan route | `backend/src/api/admin/ops/nexus/route.ts` | P2 | S |

---

## 13. Zálohy a obnova

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 13.1 | Záloha DB (cloud / lokálna) | **MÁ, ale mimo admina** — CI skripty a GitHub workflow, nie obrazovka v admine | `backend/src/scripts/backup-cloud.mjs`, `backup-local.mjs`, `restore-local.mjs`, `restore-cloud.mjs` | — | — |
| 13.2 | Obnova DB s bezpečnostnou poistkou (len prázdna DB) | **MÁ** — s `--confirm-empty-local-restore` guardom | `backend/src/scripts/restore-local.mjs:22-37` | — | — |
| 13.3 | Prehľad stavu záloh v admine (posledná, veľkosť, overenie obnovy) | **CHÝBA** | — | P1 | M |
| 13.4 | Export dát (objednávky, zákazníka) na vlastný server / migrácia | **CHÝBA** | — | P1 | L |
| 13.5 | Záloha nahratých médií a chránených súborov | **ČI** — existuje `protected-media/` a R2, ale nie je overené, že je v zálohe spolu s DB | `protected-media/` | P1 | M |

---

## 14. Notifikácia o novej objednávke

| # | Položka | Stav | Kde v kóde | Priorita | Odhad |
|---|---|---|---|---|---|
| 14.1 | Upozornenie v prehliadači (Notification API, polling 120 s) | **MÁ** | `app.mjs:322-366` | — | — |
| 14.2 | Badge „Na vybavenie“ v navigácii + dashboard | **MÁ** | `app.mjs:97`, `:268` | — | — |
| 14.3 | **E-mail / push / SMS obchodníkovi o novej objednávke** | **CHÝBA / P0** — existuje iba `chat-admin-digest` pre chat. **Ak Lucia nemá otvorený prehliadač, o novej objednávke sa nedozvie.** Neexistuje žiadny admin-user notifikačný kanál (grep `admin.*email\|notif.*objedn` = 0 hitov v `subscribers/`) | `backend/src/jobs/chat-admin-digest.ts` (len chat) | **P0** | M |
| 14.4 | Upozornenie na nízky sklad (e-mail/Slack) | **CHÝBA** | — | P1 | M |
| 14.5 | Upozornenie na žiadosť o odstúpenie / výmaz údajov / novú reklamáciu | **CHÝBA** | — | **P0** | M |
| 14.6 | Upozornenie na chybnú platbu (napr. `refund_manual_review`) | **ČI** — event sa zapíše do `ops_events`, **žiadna notifikácia ani UI** | `backend/src/subscribers/compensation-payment-refunded.ts:17` | P1 | M |

---

## 15. TOP 10 priorít P0/P1 (definitívne poradie)

| # | Čo | Prečo | Odhad | Kde presne |
|---|---|---|---|---|
| **1** | **Fakturačný most: číselné rady + PDF + e-mail + dobropis + výpočet DPH + fakturačná adresa na objednávke** | Bez mostu „objednávka → faktúra“ nesplníte VOP 4.8 a nemáte uzávierku. UI už sľubuje „fakturáciu“, realita je stub. | XL + POL | `app.mjs:2332`, `:1107`, `defaults.ts:58` |
| **2** | **Notifikácia obchodníkovi o novej objednávke (e-mail/push)** | Dnes len browser polling 120 s. Obchod môže stáť deň bez povedomia. | M | `app.mjs:344-366` |
| **3** | **RBAC + odstavenie admina** | Každý admin vie exportovať tržby, vracať peniaze, meniť ceny, spravovať poukazy. Jeden kompromitovaný účet = celý obchod. | XL | `app.mjs:2113`, `:2125` |
| **4** | **UI pre odstúpenie od zmluvy a výmaz údajov** | Backend hotový, UI chýba → 14-dňové právo a právo na zabudnutie sa nedá vybaviť. | M | orphan routes |
| **5** | **Varianty (viac ako 1) + hromadné úpravy produktov + CSV import/export** | Editor je viazaný na `variants[0]`; pri >1 variante sa nedá zmeniť cena/SKU/sklad druhého. Katalóg bez hromadných úprav = ručná práca. | L | `app.mjs:691`, `:575-582` |
| **6** | **Enforcement platnosti akčnej ceny** | Dátum sa zapisuje, ale nijaký kód ho nečíta → akčná cena platí navždy. Obchodník verí UI, zákazníka dostane inú cenu. | M | `app.mjs:714`, `:844` |
| **7** | **Doprava a platby spraviteľné z admina + napojenie dopravcu** | Ceny dopravy sa nedajú zmeniť bez developera; API dopravcu je „nepripojené“; hmotnostná sadzba neexistuje. | L / XL | `app.mjs:2085-2112`, `:2254` |
| **8** | **Právne texty (VOP + GDPR) + cookies lišta + reklamičný formulár** | VOP stále obsahuje Pilulka.sk a prázdne `..............`; GDPR hovorí „nemenoval zodpovednú osobu“; cookies lišta v repu nie je; VOP slúľubuje formulár pre reklamácie, ktorý na webe nie je. | M | `defaults.ts:4-116`, `:128-144` |
| **9** | **História objednávok zákazníka + stránkovanie/vyhľadávanie zákazníkov + poznámky ku zákazníkovi** | Detail zákazníka = 2 záložky (meno + skupiny). Zoznam orezaný na 100 bez stránkovania; e-mail sa schová pri zákazníkovi bez mena; telefón sa nestahuje. | M | `app.mjs:1225-1263` |
| **10** | **Newsletter: rozosielanie + double opt-in + súhlas v detaile zákazníka + CSV + testovací e-mail + prehľad odoslaných** | Existuje len zoznam súhlasov; rozosielanie v repu **neexistuje vôbec**; súhlas sa zapisuje ako „subscribed“ bez potvrdenia. | L | `app.mjs:1917-1927`, `legal/service.ts:30-41` |

**Rýchle víťazstvá (S–M, bez rizika, hneď):**
`4` (orphan routes → UI) · `6` (cenový engine číta `vyprodej.do`) · `9` (stránkovanie + vyhľadávanie zákazníkov + oprava skrytého e-mailu) · `1.9` (poslať `note` pri refunde — core to prijíma) · `1.12b` (pridať `*billing_address` do `ORDER_FIELDS`) · `6.2` (posielať `is_tax_inclusive`) · `6.3` (kupóny: `starts_at`/`ends_at` — Medusa to podporuje) · `4.14` (zobraziť `handle` — API ho už vracia) · `3.7` (CSV súhlasov — API už funguje) · `3.7b` (double opt-in v `legal/service.ts`) · `12.2` (doplniť `AUDIT_LABEL` pre objednávky/refundy/ceny) · `1.11b` (`/complete`, `/archive` trasy) · `4.21` (stav `proposed`/`rejected`) · `8.5` (testovací e-mail) · `10.1` (tržby z celej DB namiesto 200 riadkov) · `7.12` (vytvorenie skladu v UI) · `4.22` (produktový CSV export)

---

## Príloha A — „Orphan“ admin API: backend existuje, SPA ho nepoužíva

Overené skriptom: každá `route.ts` v `backend/src/api/admin` bola porovnaná s reťazcami volaných v `anastasia-admin/app.mjs` a `*.mjs`.

| Endpoint | Čo by umožnil | Stav v UI |
|---|---|---|
| `GET/POST /admin/withdrawals`, `POST /admin/withdrawals/:id` | Zoznam + zmena stavu žiadostí o odstúpenie od zmluvy | **CHÝBA** |
| `GET /admin/customer-erasures`, `POST /admin/customer-erasures/:id/execute` | Výbavovanie žiadostí o výmaz osobných údajov | **CHÝBA** |
| `GET/POST/DELETE /admin/customers/:id/notes` | Poznámky ku zákazníkovi (audit `customer.note_created`) | **CHÝBA** |
| `GET /admin/ops/events` | Prevádzkové udalosti (chyby platieb, refund manual review) | **CHÝBA** |
| `GET /admin/ops/nexus` | Prehľad prepojenia na NEXUS cenový engine | **CHÝBA** |
| `GET /admin/newsletter?format=csv` | CSV export súhlasov | **API funguje, UI ho nepoužíva** |

*(Kód `coupon-links` a `products/:id/protected-media` je používaný cez `qr.mjs` a `library-editor.mjs` — tie nie sú siroty.)*

## Príloha B — Konkrétne dôkazy o právnych textoch (P0)

**`backend/src/lib/pages/defaults.ts` – predvolené VOP:**
- `:9` Predávajúci je LUCRAT spol. s.r.o. — ale `:94` uvádza „Bonus klub **Pilulka**“ a „**Pilulka.sk, a.s.**, IČO 47235225 … materskou spoločnosťou predávajúceho“
- `:90` kontakt `info@pilulka.sk` (predávajúci má `zdravysvetanastasiaoz@gmail.com`, `defaults.ts:20`)
- `:110` Inšpektorát pre Košický kraj — adresa prázdna
- `:67` § 6.1 „§ 8 ods. 1 zákona č. **1 02** / 2014 Z.z.“ (preklep)
- `:114` „platné a účinné dňom 23. 5. 2018“

**`backend/src/lib/pages/defaults.ts` – predvolené GDPR:**
- `:134` „**Predávajúci nemenoval zodpovednú osobu pre ochranu osobných údajov.**“ — čl. 37 GDPR: ak je spracovanie pravidelné a rozsiahle, DPO je povinný
- `:134` adresa a e-mail prevádzkovateľa: `adresa pre dodanie: ...............`, `adresa elektronickej pošty ........... mm`
- `:136` právny základ = výhradne súhlas, kým `:93` (VOP 9.2) tvrdí, že ide o plnenie zmluvy — rozpory
- Chýba prehľad cookies a § o doručovaní údajov do tretích krajín (napr. Stripe) — `:142` tvrdí, že sa neposiela do tretej krajiny, ale platby prebiehajú cez Stripe (USA)

## Príloha C — Krížové odkazy, dôkazy a riziká

### C.1 Tímová dokumentácia potvrdzuje rovnaký stav (nesúlad s UI)
- `backend/docs/wp/ADMIN-FUNKCE-A-POKRYTI.md:84` — *„invoices — **Faktúry a dobropisy** | NEXT … Chýba obchodná fakturačná služba s pravidlami, perzistencí, PDF a číselným radením; **confirmation e-mail nie je faktúra**“*
- `backend/docs/wp/ADMIN-FUNKCE-A-POKRYTI.md:85` — *„accounting — Účtovný systém | NEXT … POHODA/Money S3 majú injektované transporty a kontrakty … Chýba overené tenantové pripojenie“*
- `backend/docs/wp/ADMIN-UX-SAMOOBSLUHA.md:76` — *„Faktury | nie order confirmation vydávaný za faktúru | Integráciu a číslovanie určí s účetnou“*
- `nexus/docs/ARCHITECTURE_MAP.md:39` — *„Billing/fakturace domain (ISDOC, číselné řady, VS, dobropisy) — **0 kódu nikde v portfoliu**“*
- `nexus/core/canonical/entities/Invoice.ts:9-19` — NEXUS má len kontrakt, workflow je *„EXPLICITNE MIMO SCOPE“*

> **Záver:** rozpor nie je v mojej analýze — je aj v dokumentácii tímu. **UI je zavádzajúce**: routa sa volá „fakturácia“ (`app.mjs:2731`), kým funkcia je stub. Odporúčam v `ROUTES` opraviť popis na „Nastavenia — vzhľad, doprava, platby, používatelia" a pridať do záložky Účtovníctvo varovanie, že ide o plánovanú funkciu.

### C.2 Riziko dezinformácie: demo s falošnou faktúrou
`admin-demo/index.html:1021, 1093, 1123-1127` obsahuje **falošné fakturačné políčka** (`invoiceNumber`, `invoiceDate`, `invoiceStatus`, IČO/DIČ) a tlačidlo *„Náhľad faktúry · TEST“*. Je to statický prototyp, nie funkcia. Hrozí, že pri prezentácii klientovi bude vyznieť, ako by faktúra existovala. **Odporúčam z demo odstrániť alebo výrazne označiť.**

### C.3 Dve paralelné administrácie (riziko rozporu)
- `anastasia-admin/app.mjs` — hlavná SPA (2851 riadkov), to je to, čo používa Lucia.
- `backend/src/admin/routes/sprava-obchodu/Shop.tsx` + `backend/src/admin/lib/shop.ts` — menší admin plugin vnútri Medusa backendu. Má vlastný formulár zákazníka (`shop.ts:96-98`) a jednoduchý produktový formulár, **ale nemá** varianty, sklad, SEO, DPH, import/export ani GDPR a **nie je prepojený zo SPA**. `shop.ts:185` navyše tvrdí, že „ceny s osobitnými pravidlami tento editor nemení“.
- `nexus/` je prototyp, nie runtime — jeho entity `Invoice`, `CustomerGroup` atď. **nesmú sa používať ako dôkaz existujúcej funkcie.**

### C.4 Čo už v repu je a dá sa znovu použiť (znižuje odhady práce)
| Kus kódu | Cesta | Na čo sa hodí |
|---|---|---|
| PDF generátor | `backend/src/modules/gift-voucher/pdf.ts`, `delivery.ts:50,87` | PDF faktúra |
| Notifikačná pipeline | `backend/src/lib/notify/order.ts:19-27`, `modules/notification-zeptomail` | E-mail s faktúrou, upozornenie adminovi |
| Šablóny e-mailov s náhľadom a slotmi | `modules/notification-zeptomail/templates.ts:294-680`, `app.mjs:1855-1916` | Nová šablóna „faktúra-issued-sk" bez nového UI |
| Audit modul | `backend/src/modules/ops-audit` + `lib/observability/audit.ts` | Audit zmien objednávok/cen |
| PDF/CSV tlač | `anastasia-admin/print.mjs`, `app.mjs:937-944` | Tlač faktúry, export |
| Adresy v zákazníckych/objednávkových dátach | `backend/src/modules/customer-privacy/erase.ts` | Logika nullovania pri výmaze |
| Právne verzie dokumentov | `backend/src/modules/legal/*` | Súhlas s VOP pri košíku |

### C.5 Overenie, ktoré musí predchádzať práci (nejde o kód, ale o právny fakt)
1. **eKasa** — grep v repu = 0 hitov. Relevantnosť pre predaj liekov v lekárni treba potvrdiť s účtovníčkou/daňovým poradcom; ak áno, je to **P0/XL** (samostatný front, nie súčasť e-shopu).
2. **VOP pre lieky** — text VOP má špecifické výnimky pre lieky (obmedzenie 10 balení na osobu/deň, bezplatná doprava pri odstúpení, § 22 zákona o liekoch). **Prepísanie VOP musí zachovať tieto výnimky** — generická šablóna by ich stratila.
3. **Zodpovedná osoba pre GDPR** — ak je spracovanie pravidelné a rozsiahle, čl. 37 GDPR DPO vyžaduje; súčasný text tvrdí, že nebola menovaná.
4. **Stripe a prenos do tretej krajiny** — GDPR text `:142` tvrdí, že sa údaje neposielajú do tretej krajiny, ale platby idú cez Stripe (USA). Treba sformulovať správne.

---
