# Ambasádori – návrh datového modelu (Fáza 2)

**Stav (21. 10. 2026):** návrh + prázdné UI v administrácii. **Nič sa na webe nezapína, žiadne provízie sa nevyplácajú.**
**Architektura:** všechny funnely (Reset 40+, Zdravý svet, AI ANASTASIA, konzultácie, darčekové poukazy) majú **jednu administráciu a jedno jádro** (Medusa + NEXUS). Ambasádoři nie sú samostatný systém – sú účastníci (ambassadors) v tom istom jadre.

## 1. Prúd tovaru a peňazí

```
odporúčanie (ambassador link)
   → atribúcia objednávky (order.metadata.ambassador / referral_code)
   → kupón (promotion s kódom ambasádora) – voliteľné, ak ambasADOR pracuje s vlastným kódom
   → výška provízie (objednávka × % ) uložená ako nevyrovnaný záznam
   → schválenie (Fáza 2: ručné, Fáza 3: automatické po uplynutí vrátenného obdobia)
   → výplata (payout) – bankový prevod / dokladanie v účtovníctve
```

Zásady:
- **Atribúcia sa rozhodne raz, pri vytvorení košíka** (v okamžiku, keď je známy referral kód). Nesmie sa prepočítavať neskôr – objednávka musí mať jednu jasnú atribúciu.
- **Provízia sa počíta z hrubej sumy objednávky** (bez DPH, podľa položiek) a zníži sa o vrátené položky.
- **Atribúcia patrí objednávke, nie používateľovi** – ten istý zákazník môže byť privedený viackrát, vždy sa rozhodne podľa atribúcie konkrétnej objednávky.
- Bez atribúcie nevzniká provízia. Nepriznaná provízia sa nevytvára automaticky – iba cez schválenie.

## 2. Kde dáta žijú (všetko v Meduse)

| Dáta | Kde | Ako |
|---|---|---|
| Ambassador (osoba) | `customer` + metadata | `customer.metadata.ambassador = { code, status, commission_percent, joined_at, note }`; profil (meno, e-mail, link) sa číta z `customer` |
| Referral kód | `customer.metadata.ambassador.code` | Unikátny kód (napr. `LU-1234`) – zároveň aj kód kupónu, ak ambasADOR pracuje s kuponmi |
| Odkaz na odporúčanie | `customer.metadata.ambassador.link` | `https://<web>/?ref=LU-1234` (alebo QR kód) |
| Atribúcia objednávky | `order.metadata.ambassador` | `{ ambassador_customer_id, code, commission_percent, source: 'link' | 'coupon' | 'manual', captured_at }` |
| Provízny záznam | nový model `ambassador_commission` (tabuľka) | `{ id, ambassador_customer_id, order_id, amount_minor, percent, status: pending|approved|paid|void, created_at, approved_at, paid_at, payout_id }` |
| Výplata | nový model `ambassador_payout` (tabuľka) | `{ id, ambassador_customer_id, amount_minor, period_from, period_to, method, reference, paid_at }` |
| Nastavenie provízie | `store.metadata.anastasia_ambassadors` | `{ enabled, default_percent, cookie_days, cookie_attribution: 'last_click' | 'first_click' }` |

**Prečo nie nový modul:** atribúcia objednávky musí ísť cez existujúci košík/objednávkový tok (checkout hook), aby sa dala overiť serverovo. Tabuľky `ambassador_commission` a `ambassador_payout` sú stavové záznamy – vzniknú vtedy, keď backend Fázy 2 pôjde do stavby (vlastný modul = vlastná tabuľka; `medusa-config.ts` musí upraviť agent, ktorý nemá inú prácu).

## 3. Pravidlá atribúcie (návrh na schválenie)

1. referral z URL (`?ref=`) sa uloží do košíka (`cart.metadata.ambassador`) a prevezme do objednávky.
2. Kupón ambasádora (`?coupon=LU-1234`) má prednosť pred referralom z URL – je to explicitnejšie.
3. Referral platí `cookie_days` dní (default 30) a atribuuje sa späť na poslednú kliknutú stránku (`last_click`) – pri `first_click` by sa atribúcia nikdy neprestala.
4. Ak zákazník už má v košíku atribúciu a klikne nový odkaz, atribúcia sa prepíše (a pôvodný link sa zapíše do `order.metadata.ambassador.previous`).
5. Objednávka bez atribúcie → provízia nevzniká.
6. Zrušená objednávka → provízny záznam sa zneplatní (`void`).
7. Vrátenie tovaru → provízia sa zníži o vrátenú sumu (ako pri darčekových poukazoch).

## 4. Čo treba v backende (Fáza 2 – zoznam úloh)

| Úloha | Kde | Poznámka |
|---|---|---|
| `GET/POST /admin/ambassadors` | nové admin trasy | zoznam + detail + vytvorenie/pozvanie |
| `GET /admin/ambassadors/settings` | nové admin trasy | `{ enabled, default_percent, cookie_days, cookie_attribution }` |
| `GET /admin/ambassadors/commissions` | nové admin trasy | provízne záznamy s filtrom (stav, obdobie, ambasADOR) |
| Atribúcia v košíku | existujúci `nexus-cart` (checkout hook) | **nepatrí do tohto balíka** – checkout je vlastný kanál agenta |
| Zápis do `order.metadata.ambassador` | existujúci objednávkový tok | rovnako ako vyššie |
| Výpočet provízie | `ambassador_commission` | po zaplatení objednávky, idempotentne podľa `order_id` |
| Výplata | `ambassador_payout` + export do účtovníctva | ručná výplata, Fáza 2 |

## 5. Čo je hotové teraz (21. 10. 2026)

- **Admin:** sekcia **Ambasádori** s označením *„Fáza 2 – pripravujeme“* – prehľad (meno, e-mail, kód/odkaz, provize %, obrat, stav), detail ambasadora, karta s nastavením provízie (zreadená, s vysvetlením). UI pracuje nad prázdnymi dátami: `/admin/ambassadors` ešte neexistuje, administrácia zobrazí prázdny zoznam a poznámku.
- **Storefront:** nič. Žiadny odkaz, žiadny kupón, žiadna atribúcia – to je zámer Fázy 2.
- **Výplaty:** žiadne. Provízie sa nikde nepočítajú a nevyplácajú.

## 6. Otázky na majiteľa obchodu (pred spustením Fázy 2)

1. Percento provízie (predpoklad 10 %) a či sa mení podľa objemu.
2. Cyklus výplaty (mesačne / kvartálne) a spôsob výplaty (prevod / dokladanie).
3. Či ambasádori pracujú s vlastnými kupónmi (zľava pre zákazníka) alebo len s odkazom.
4. Kto oblasť schvaľuje – pri Fáze 2 ručne v administrácii.
