# Kupóny a akčné ceny – čo má admin posielať a ako to počíta jadro

**Pre:** admin MiniMax (session `anastasia-admin/*`) · **Od:** Claude Code · **Dátum:** 21. 10. 2026
**Vetva:** `release/predani-faze1` (nepushnuté) · **Dokument balíku:** `backend/docs/wp/coupons-pricing.md`

Jadro (Medusa + NEXUS Worker) už počíta kupóny aj akčné ceny **celé na serveri**. Klient
posiela iba **kód kupónu** – nikdy percentá, nikdy sumy, nikdy zoznam produktov, nikdy cenu.
Tento papier hovorí, čo má admin posielať a ako sa zľavy skladajú.

---

## 1. Čo jadro podporuje (a čo nie)

| Pravidlo kupónu | Podporované | Ako sa posiela |
|---|---|---|
| Percentuálna zľava | ✅ | `application_method.type = "percentage"`, `value` = 0–100 |
| Pevná zľava (€) | ✅ | `application_method.type = "fixed"`, `value` = suma v €, `currency_code = "eur"` |
| Na celý košík | ✅ | `application_method.target_type = "order"` (bez `target_rules`) |
| Len na vybrané produkty | ✅ | `application_method.target_type = "items"` + `target_rules` |
| Pravidlo pre konkrétneho zákazníka | ❌ | odmietne sa (kupón sa neuplatní) |
| „Kúpi X a dostane Y“ | ❌ | odmietne sa (kupón sa neuplatní) |
| Limit množstva na položku | ❌ | odmietne sa (kupón sa neuplatní) |

**Nepodporované pravidlo sa nikdy neignoruje ticho.** Kupón sa v takom prípade vôbec
neuplatní a zákazník dostane hlásenie „Kupón sa nepodarilo uplatniť“ – žiadna tichá strata
zľavy, žiadne „kupón fungoval napoly“.

---

## 2. Ako má admin posielať kupón

`POST /admin/promotions` (telo ako dnes, s jednou zmenou):

```json
{
  "code": "MONTELOPE",
  "type": "standard",
  "status": "active",
  "is_automatic": false,
  "is_tax_inclusive": true,
  "limit": null,
  "application_method": {
    "type": "fixed",
    "value": 20,
    "currency_code": "eur",
    "target_type": "items",
    "allocation": "across",
    "target_rules": [
      { "attribute": "items.product.id", "operator": "in", "values": ["prod_…"] }
    ]
  },
  "campaign": {
    "name": "Kupón Montelope",
    "campaign_identifier": "admin-coupon-montelope",
    "starts_at": "2026-09-17T00:00:00.000Z",
    "ends_at": "2026-12-31T23:59:59.999Z"
  }
}
```

### Pravidlá po jednotlivých polách

- **`type`** – `"percentage"` (hodnota v %, 0–100) alebo `"fixed"` (suma v €).
  Pre `"fixed"` vždy **`currency_code: "eur"`** (naše ceny sú v eurách).
- **`value`** – číslo. Percentá max. 100, pevná suma libovolňá kladná (limituje ju
  dostupná cena v košíku).
- **`target_type`** – `"order"` = zľava na celý košík; `"items"` = zľava na položky
  (bez `target_rules` je to prakticky ten istý výsledok).
  **Odporúčanie:** pre „Na celý košík“ posielajte `"order"`, pre „Len vybrané produkty“
  `"items"` + `target_rules`.
- **`target_rules`** – vždy presne jedno pravidlo:
  `{ "attribute": "items.product.id", "operator": "in", "values": ["<id produktu>", …] }`.
  `values` = ID produktov (nie SKU, nie ID variantov). Prázdny zoznam = pravidlo sa
  neposiela (kupón platí na všetko).
- **`allocation`** – `"each"` pri percentách, `"across"` pri pevnej sume. Jadro tento
  údaj rešpektuje ako odporúčanie; **výpočet rozdelenia pevnej sumy robí server**
  (úmerne cenám položiek, maximálne do ceny položky).
- **`is_tax_inclusive`** – **`true`**. Naše ceny sú s DPH (region je tax inclusive),
  takže aj pevná zľava v € sa odpočíta z ceny s DPH (zákazník vidí −20 €).
- **`campaign`** – platnosť od–do (`starts_at` / `ends_at`). Bez kampane platí kupón
  bez obmedzenia dátumom. Kampaň je zároveň miestom, kde sa rešpektuje aj limit použití.
- **`limit`** – maximálny počet použití. Po vytvorení objednávky ho jadro započíta
  atomicky; po vyčerpaní sa kupón v košíku už neuplatní.

### Ako vybrať produkty do `target_rules`

`GET /admin/products?limit=200&fields=id,title,handle` → zvoľte produkty →
`values` = ich `id` (presne to, čo vráti `/admin/products`).

---

## 3. Akčná (výpredajová) cena

Administrácia zapisuje `metadata.vyprodej` na produkte (aj variante):

```json
{ "active": true, "akcna_cena": 100, "do": "2026-12-31" }
```

- `active: true` → výpredajová cena platí; `false` → **neplatí vôbec** (aj keď zostane
  cenový zoznam v Meduse).
- `akcna_cena` → cena v € s DPH, na ktorú sa zníži cena (musí byť menšia než základná cena).
- `do` → platí do konca daného dňa; po tomto dátume výpredajová cena **neplatí**.
- Ak `metadata.vyprodej` chýba, rozhoduje cenový zoznam v Meduse (doterajšie správanie).

Bez zmeny v UI funguje aj dnešný zápis (`active`, `akcna_cena`, `do`) – jadro ho
teraz **číta**. Doporučené doplniť: pole „Cena akcie“ (číslo v €) a „Platí do“ (dátum)
priamo vo formulári výpredaja, aby sa `akcna_cena` nemusela duplikovať ručne.

---

## 4. Ako sa zľavy skladajú (poradie je pevné)

1. **Základná cena** – cena z kataloga (bez zľav).
2. **Výpredajová cena** (akčná cena z `metadata.vyprodej`) **alebo vernostná zľava** –
   **nikdy obe naraz**. Zákazník dostane tú výhodnejšiu (max).
3. **Kupón** – použije sa na cenu z bodu 2 (teda aj na výpredajovú cenu).

Príklady (ceny v €):

| Košík | Kupón | Výsledok |
|---|---|---|
| RESET 40+ 168 € | Montelope −20 € (len EP.002) | **148 €** |
| RESET 40+ 168 € + pleťová voda 50 € | Montelope −20 € (len EP.002) | **148 € + 50 €** (voda bez zľavy) |
| RESET 40+ 168 € | 10 % kupón na celý košík | **151,20 €** |
| RESET 40+ 168 € (akcia 100 €) | 10 % kupón | **90 €** |
| RESET 40+ 100 € (akcia 100 €) | Montelope −20 € (len EP.002) | **80 €** (zľava sa nikdy nezníži pod 0) |
| RESET 40+ 168 €, zákazník Zlatá úroveň 10 % | Montelope −20 € | vernostná zľava sa s výpredajom nekombinuje; kupón sa počíta z výslednej ceny |

**Pevná zľava sa nikdy nezníži cenu pod 0** – ak je zľava väčšia než cena položky,
položka má cenu 0 € a zvyšok zľavy sa nerozdáva iným položkám.

---

## 5. Čo admin NEPOŠLE

- Cenu, percentá, sumy ani zoznam produktov **nikdy** – klient posiela iba kód kupónu.
  Kontrola je na serveri a klientom sa odmietne.
- `target_type: "shipping_methods"` a `type: "buyget"` – jadro ich odmietne.

---

## 6. Texty pre Luciu

| Kde | Text |
|---|---|
| Pole typu zľavy | Percentá (%) · Pevná suma (€) |
| Pole rozsahu | Na celý košík · Len vybrané produkty |
| Pole hodnoty (fixná) | Koľko € zľava (napr. 20) |
| Pole hodnoty (%) | Koľko % zľava (napr. 10) |
| Označenie DPH | Zľava vrátane DPH |
| Chyba | Kupón sa nepodarilo uplatniť. Skontrolujte kód a platnosť kupónu. |
| Upozornenie | Zľava sa počíta pri nákupe v košíku. |

---

## 7. Overenie

- Backend: `cd backend && npm run test:unit`
  (`src/lib/pricing/__tests__/*`, `src/api/store/nexus-cart/__tests__/coupon-pricing.unit.spec.ts`).
- NEXUS Worker: `cd nexus && npm test` (`tests/unit/couponFixedAmount.test.ts`).
- Po vašej práci: `cd anastasia-admin && node test/browser-*.mjs`.

**Stav backendu:** `VERIFIED` na lokálnej DB a unit testami (vrátane scenára Montelope).
