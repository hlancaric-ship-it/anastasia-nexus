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
  `campaign.starts_at`/`ends_at`). Navyše sa použitie po vytvorení objednávky započíta
  jedným **atomickým** `UPDATE promotion SET used = used + 1 … WHERE used < limit`
  (`backend/src/lib/pricing/coupon-usage.ts`) – dva súbežné nákupy sa o jedno použitie
  nesporia. Započítanie prebieha až po vytvorení objednávky a nikdy nevyhodí chybu.

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

## Čo treba dorobiť pred produkciou

1. **UI administrácie** – podľa `anastasia-admin/HANDOFF-kupony-ceny.md`:
   `target_type` podľa rozsahu, `currency_code` pri pevnej sume, `target_rules` s ID
   produktov, `is_tax_inclusive: true`, a odosielanie `is_tax_inclusive` pri uložení
   (dnes sa v `app.mjs` stráca).
2. **Seed/import kupónov** – `seed-montelope-coupon.ts` a `import-anastasia-catalog.ts`
   už posielajú podporovaný tvar (`fixed` + `target_rules` na `items.product.id`).
3. Nič iného – backend, Worker a limity sú pripravené.

## Riziká a limity

- **Použitie kupónu sa započítava až po vytvorení objednávky.** Pri páde procesu medzi
  vytvorením objednávky a zápisom sa jedno použitie stratí (kupón sa môže použiť o jeden
  raz viac). Pre jednorazové kupóny je to malé riziko; pre campaign s limitom odporúčame
  sledovať `promotion.used`.
- **Dva súbežné checkouty môžu prekročiť limit o jedno použitie** – zápis je atomický,
  ale kontrola limitu prebehne v košíku, nie v transakcii objednávky.
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
