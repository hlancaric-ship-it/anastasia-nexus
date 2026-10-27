# Kupóny, akčné ceny a ich poradie (P0 #1 a #5a auditu Fáze 1)

**Balík:** serverová kalkulácia kupónov (percentá aj pevná suma), rozsah kupónu
(celý košík / vybrané produkty), akčná cena z metadát a jasné poradie zľav.
**Dátum:** 21. 10. 2026 · **Vetva:** `release/predani-faze1` (nepushnuté) · **UI:** `anastasia-admin/HANDOFF-kupony-ceny.md`

## Problém, ktorý sa riešil

Košík (`backend/src/api/store/nexus-cart/route.ts`) prijímal **iba percentuálny kupón na
všetky položky** (`target_type: 'items'` a bez `target_rules`). Kupóny z administrácie
(`target_type: 'order'`, aj fixné €) a importované staré kupóny (s `target_rules` na produkty)
sa preto **vôbec neuplatnili** – v každom z nich bola zľava mŕtva. Kupón Montelope
(−20 € fixne, len na RESET 40+ / EP.002) by nefungoval. Druhá polovica P0 bola, že admin
zapisuje `metadata.vyprodej`, ale backend ju nečítal (`grep -r "vyprodej" backend/src` = 0 hitov),
takže akčná cena v kalkulácii nefigurovala.

## Čo je hotové

### 1. Kupóny (serverovo)

Podporované a overené:

| Pravidlo | Tvar |
|---|---|
| Percentuálna zľava | `type: "percentage"`, `value` 0–100 |
| Pevná zľava | `type: "fixed"`, `value` (€), `currency_code: "eur"` |
| Celý košík | `target_type: "order"` (bez `target_rules`) |
| Vybrané produkty | `target_type: "items"` + `target_rules: [{ attribute: "items.product.id", operator: "in", values: [...] }]` |

- **Klient posiela len kód.** Percentá, sumy aj rozsah rieši server.
- **Pevná suma sa rozdeľuje** medzi položky, na ktoré kupón platí, úmerne ich cenám
  (`allocateFixedCoupon`). Jedna položka nedostane viac než svoju cenu, takže **zľava
  nikdy nezníži cenu pod 0**; prebytok zľavy sa nerozdáva iným položkám.
- **Nepodporované pravidlá sa odmietajú celé**: pravidlo pre zákazníka, „kúpi X a dostane Y“
  (`buy_rules`), limit množstva na položku, iný typ kupónu, iný rozsah, iná mena,
  iné pravidlo na produkty než `items.product.id in [...]`. Takýto kupón sa **neuplatní**
  a zákazník dostane `COUPON_INVALID` – žiadna tichá strata zľavy.
- **Limit použití a platnosť od–do** sa rešpektujú (`codeAvailable`: `limit` vs `used`,
  `campaign.starts_at`/`ends_at`). Použitie s limitom sa rezervuje pri dokončení košíka
  pod zámkom riadka promotion; rezervácia sa pri vytvorení objednávky potvrdí a pri
  zlyhaní alebo zrušení uvoľní. Podrobnosti sú v bode 1c.

### 1b. Predchádzajúci zápis po objednávke (historický, nahradený 27. 10. 2026)

Použitie kupónu s limitom sa zapisovalo **dvakrát**: raz `registerUsage` v hooku
dokončenia košíka (Medusa zvýšila `promotion.used`) a raz zápisom
`recordCouponUsage` po vytvorení objednávky. Navyše zápis po objednávke vôbec
neprebiehal – SQL bol neplatný (stĺpec `limit` je v PostgreSQL rezervované slovo,
bolo treba `"limit"`; chybu navyše spolupráca zapisovania prehĺtla), takže sa
použitie kupónu vôbec nikde nepočítalo.

Oprava (`backend/src/lib/pricing/coupon-usage.ts`):

Táto iterácia vyriešila dvojité započítanie a chybný SQL zápis, ale zapisovala až po
objednávke a nechávala súbeh medzi kontrolou a zápisom. Jej aktuálnou náhradou je
rezervačný tok opísaný v bode 1c.

- jediným miestom zápisu je `recordCouponUsage` po vytvorení objednávky; hook
  dokončenia košíka už Medusa `registerUsage` nepoužíva (v `src/workflows/hooks.ts`
  zostala len read-only kontrola vyčerpaného limitu pred objednávkou),
- zápis je **idempotentný podľa ID objednávky**: objednávka si do metadát uloží
  značku `nexus_coupon_usage` a započíta sa iba raz (opakovaný checkout kupón
  nezapočíta druhý raz),
- značka aj zvýšenie počítadla prebehnú v jednom atomickom príkaze (CTE); zvýšenie
  prebehne iba vtedy, keď značku získala práve táto objednávka,
- test: `src/lib/pricing/__tests__/coupon-usage.unit.spec.ts` + e2e scenár
  (`src/scripts/e2e-digital-coupon-loyalty.ts`, krok „použitie kupónu sa započíta
  právě raz“).

### 1c. Atomická rezervácia limitu pri checkoutu (27. 10. 2026)

`coupon_link` modul uchováva `coupon_usage_reservation`, jednu rezerváciu na košík.
Pri checkout hooku sa promotion určí podľa serverom overeného kódu, jej riadok sa
zamkne (`FOR UPDATE`) a pre limitovaný kupón sa `promotion.used` zvýši v tej istej
transakcii, v ktorej sa uloží rezervácia. Tým vidia rovnaký obsadený slot aj ostatné
Medusa cesty používajúce `registerUsage`; súbežný checkout pri limite 1 neprejde.

- rovnaký košík môže rezerváciu zopakovať bez ďalšieho čerpania; iný kód/promotion na
  tom istom košíku zlyhá fail-closed,
- chyba pred vytvorením objednávky uvoľní rezerváciu; ak objednávka už existuje,
  kompenzácia ju potvrdí namiesto uvoľnenia,
- `order.placed` rezerváciu idempotentne potvrdí; `order.canceled` vráti započítané
  použitie a opakované události počítadlo nemenia,
- neoveriteľná rezervácia vráti z checkoutu HTTP 409; objednávka sa nedokončí.

Implementácia: `src/modules/coupon-link/{service.ts,models/coupon-usage-reservation.ts,migrations/Migration20261027190000.ts}`, `src/workflows/hooks.ts` a `src/subscribers/coupon-usage-order-placed.ts`.

### 2. Akčná (výpredajová) cena

`backend/src/lib/pricing/sale.ts` číta `metadata.vyprodej` (z produktu aj z variantu):

- `metadata.vyprodej` **chýba** → platí cenový zoznam v Meduse (doterajšie správanie),
- `active !== true` → **výpredaj neplatí** (aj keď zostane cenový zoznam),
- `do` je v minulosti → **výpredaj neplatí** (predtým platil donekonečne),
- inak je výpredajová cena `akcna_cena` (ak je platná a menšia než základná cena);
  `akcna_cena` chýba alebo je neplatná → použije sa cena z cenového zoznamu.

Zákazník pri žiadnej variante nezaplatí viac než doteraz (cena sa nikdy nezvýši).

**Je to bezpečné?** Áno – `metadata.vyprodej` je zapisované iba administráciou
(authenticated admin API), jadro ho číta len ako číslo a porovnáva s katalogovou cenou;
nič z klienta do výpočtu ceny nepreniká.

### 3. Poradie zľav (pevné, zdokumentované)

1. základná cena (z kataloga),
2. **výpredajová cena** (akčná cena) **alebo vernostná zľava** – nikdy obe naraz
   (zákazník dostane výhodnejšiu),
3. **kupón** – na výslednú cenu z bodu 2 (teda aj na výpredajovú cenu).

Poradie zodpovedá reťazcu v NEXUS Workeri (`BasePrice → HighestDiscount → DiscountLimit →
CouponDiscount → Rounding`) a zostáva v súlade s tým, čo Worker robil doteraz.

### 4. Worker (NEXUS)

- Nový vstup `couponFixedAmount` = podiel pevnej sumy pre danú položku košíku
  (alokáciu robí Medusa, ktorá pozná celý košík a pravidlá kupónu).
- `CouponDiscountRule` odčíta percentá aj pevnú sumu; **cena nikdy neklesne pod 0**.
- Klient ani browser nikdy neposielajú percentá – do požiadavky ide iba kód úrovne
  a kód kupónu (a serverom vypočítané hodnoty).

## Chyba: obmedzenie na produkty sa nedalo prečítať (opravené 21. 10. 2026)

Kupóny s `target_rules` (napr. Montelope) sa v košíku **stále odmietali** – hlásenie
`COUPON_INVALID`, zľava sa neuplatnila. Príčina bola v načítaní pravidla, nie v politike:

- hodnoty pravidla (`items.product.id in [...]`) ležia v samostatnej tabuľke
  `promotion_rule_value`, takže ich treba načítať cez reláciu
  `application_method.target_rules.values` (bez nej je zoznam prázdny → kupón sa
  odmietne),
- Medusa ich vracia ako objekty `{ value: "prod_…" }`, nie ako reťazce – prekladač
  kupónu ich teraz číta v oboch tvaroch (`src/lib/pricing/coupon.ts`).

Oprava: `src/api/store/nexus-cart/route.ts` (relácie pri čítaní kupónu) a
`src/lib/pricing/coupon.ts` (tvar hodnôt pravidla). Test:
`src/lib/pricing/__tests__/coupon.unit.spec.ts` („prečíta hodnoty pravidla v tvare
Medusa ({ value }) aj ako reťazce“).

## Ako to overiť

### Unit testy (backend)

```
cd backend && npm run test:unit
```

- `src/lib/pricing/__tests__/coupon.unit.spec.ts` – preklad kupónu, odmietnutie
  nepodporovaných pravidiel, delenie pevnej sumy, ochrana pod 0.
- `src/lib/pricing/__tests__/sale.unit.spec.ts` – aktívna/vypnutá/vypršaná akčná cena.
- `src/lib/pricing/__tests__/coupon-usage.unit.spec.ts` – atomický zápis použitia, limit.
- `src/api/store/nexus-cart/__tests__/coupon-pricing.unit.spec.ts` – kompletný tok:
  **Montelope (−20 € len na EP.002, ostatné položky bez zľavy)**, kupón z administrácie
  (percentá na celý košík), pevná suma bez obmedzenia, zľava pod 0, akčná cena,
  vypnutá akčná cena, nepodporovaný kupón, **podvrhnutá cena z klienta sa nepoužije**.

### NEXUS Worker

```
cd nexus && npm test
```

`tests/unit/couponFixedAmount.test.ts` – pevná suma, ochrana pod 0, kombinácia
s percentom, zachovanie pôvodnej sémantiky percent.

### Lokálny e2e scenár: nákup digitálneho produktu s kupónom Montelope a vernostnou úrovňou

```
cd backend
DATABASE_URL=postgres://localhost/anastasia_dev_wave1 \
LEGAL_TERMS_VERSION=2026-10-01 LEGAL_PRIVACY_VERSION=2026-10-01 \
MEDIA_TOKEN_SECRET=... \
npx medusa exec ./src/scripts/e2e-digital-coupon-loyalty.ts stub
```

- Scenár prejde celý nákup: politika úrovní v DB → košík s digitálnymi produktmi
  (EP.002 + EP.001) → kupón Montelope → cena → objednávka → zachytenie platby →
  udelenie prístupu → podpísaný krátkodobý odkaz na obsah.
  Overí, že zľava kupónu platí **len na EP.002** (168 € − 10 % úroveň ZR3 − 20 €
  = 131,20 €) a druhý produkt kupón nedostane (38 € − 10 % = 34,20 €).
- Argument `stub` spustí lokálnu náhradu NEXUS služieb (pricing + SafeOrder) –
  Worker na macOS 12 nespustí (workerd vyžaduje 13.5+). Bez argumentu sa použije
  skutočný Worker z `NEXUS_PRICING_URL` (a platba Stripe TEST cez
  `E2E_PAYMENT_PROVIDER_ID=pp_stripe_stripe`).
- Politika úrovní si scenár na dobu behu nastaví a **obnoví pôvodnú** – obchod
  sa nemení. Výsledok: `backend/ci-evidence/e2e-digital-coupon-loyalty.json`.

## Čo treba dorobiť pred produkciou

1. **UI administrácie** – podľa `anastasia-admin/HANDOFF-kupony-ceny.md`:
   `target_type` podľa rozsahu, `currency_code` pri pevnej sume, `target_rules` s ID
   produktov, `is_tax_inclusive: true`, a odosielanie `is_tax_inclusive` pri uložení
   (dnes sa v `app.mjs` stráca).
2. **Seed/import kupónov** – `seed-montelope-coupon.ts` a `import-anastasia-catalog.ts`
   už posielajú podporovaný tvar (`fixed` + `target_rules` na `items.product.id`).
3. Nič iného – backend, Worker a limity sú pripravené.

## Riziká a limity

- **Tvrdý pád procesu po zápise rezervácie, ale pred kompenzáciou**, môže ponechať
  rezerváciu v stave `reserved` a dočasne obsadiť limit. Rezervácie sa automaticky
  neexpirujú, pretože počas pomalého checkoutu by expirácia mohla uvoľniť platný nákup;
  zaseknuté záznamy vyžadujú manuálne overenie voči `order_cart` pred uvoľnením.
- **Rozpočet kampane sa nezapisuje.** Medusa `registerUsage` vie kumulovať aj
  rozpočet kampane (`promotion_campaign_budget`); tento obchod rozpočty nemá.
  Ak sa pridajú, rezervácia musí atomicky zohľadniť aj kampaňový rozpočet bez dvojitého
  započítania v Medusa `registerUsage`.
- **Pevná zľava sa počíta z ceny pred zľavou** (base price). Ak výpredajová cena alebo
  vernostná zľava zníži cenu pod podiel pevnej sumy, zákazník dostane menej zľavy, než
  kupón nominálne hovorí (cena však nikdy nejde pod 0).
- **Kupón s `target_type: "order"` a `target_rules`** sa aplikuje len na uvedené produkty
  (bezpečnejšie: zákazník nedostane viac zľavy, než administrácia zamýšľala).
- **Staré kupóny z importu** majú tvar `fixed`/`percentage` + `target_rules` na produkty –
  po tejto zmene sa uplatnia. Kupóny s inými pravidlami (ak nejaké sú) zostanú
  neuplatnené a zákazník dostane hlásenie, nie tichú stratu zľavy.

## Čo sa NEMENÍ

- Ceny, DPH, sklad, doprava, checkout a platby – mení sa len výpočet zľavy.
- Doručovací worker, entitlement a prístup k chráneným médiám.
- Kód modulu `entitlement` a `nexus` (privatív sa volá, nemení sa).
