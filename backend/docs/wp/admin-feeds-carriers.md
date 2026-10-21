# Balík: produktové feedy a dopravci (admin ANASTASIA)

**Dátum:** 21. 10. 2026 · **Vlastník balíka:** admin (Claude/MiniMax) · **Stav:** IMPLEMENTED_UNVERIFIED

## Čo pribudlo

### 1. Verejné produktové feedy (bod 3 zadania)

| Súbor | Účel |
|---|---|
| `backend/src/lib/feeds/policy.ts` | čistá logika: XML (Heureka SHOP/ITEMS, Google RSS 2.0), entity, ceny s/bez DPH, dostupnosť, adresa webu |
| `backend/src/lib/feeds/catalog.ts` | načítanie produktov z jadra: `calculated_price` s region kontextom, predajný kanál, kategórie, obrázky, sklad |
| `backend/src/api/feeds/heureka.xml/route.ts` | `GET /feeds/heureka.xml` – verejné, bez prihlásenia (`AUTHENTICATE = false`) |
| `backend/src/api/feeds/google.xml/route.ts` | `GET /feeds/google.xml` – verejné, bez prihlásenia |
| `backend/src/api/admin/feeds/route.ts` | `GET /admin/feeds` – URL feedov + počet produktov pre admin |

Pravidlá (overené na reálnych dátach cez `medusa exec`):
- do feedu patria **len zverejnené produkty v predajnom kanáli** (kanál musí byť zapnutý),
- cena je z `calculated_price` s region kontextom = cena, ktorú zákazníčka platí (s DPH),
  `PRICE` (bez DPH) sa dopočíta zo sadzby `FEED_VAT_RATE` (výchozí 20 %),
- URL produktu: `${STOREFRONT_URL}/eshop/produkt/<handle>`; adresa webu sa hľadá v poradí
  `ANASTASIA_SITE_URL` → `STOREFRONT_URL` → `STOREFRONT_ORIGIN` → `COUPON_LINK_STOREFRONT_ORIGIN`,
- fotka: `thumbnail` + `images`; produkt bez fotky sa do feedu nedostane, pokiaľ nie je nastavené
  `FEED_FALLBACK_IMAGE`,
- dostupnosť: bez riadeného skladu „in stock“, inak podľa `inventory_levels.stocked_quantity`.

### 2. Dopravci (bod 4 zadania)

| Súbor | Účel |
|---|---|
| `backend/src/lib/carriers/policy.ts` | zoznam dopravcov (Packeta, SPS, GLS, DPD), šifrovanie kľúča (AES-256-GCM), zápis do metadát obchodu |
| `backend/src/api/admin/carriers/route.ts` | `GET /admin/carriers` (stav), `POST /admin/carriers` (výber dopravcu + kľúč) |

- API kľúč sa **nikdy neposiela späť do prehliadača** – admin vidí len posledné štyri znaky (`••••1234`).
- Kľúč sa ukladá šifrovaný (AES-256-GCM) do `store.metadata.anastasia_carriers`.
  Kľúč na šifrovanie: `CARRIER_SETTINGS_SECRET`, inak `JWT_SECRET` (min. 16 znakov).
- Samotné pripojenie k API dopravcu **nie je zapojené** – stav je vždy „nepripojené“.
  Ktorý dopravca bude používaný, potvrdí majiteľ obchodu.
- Nastavenia sú uložené v metadátach obchodu (tabuľka `store`), preto **netreba nový modul ani migráciu**
  (a `medusa-config.ts` zostáva nedotknutý – pracuje v ňom iný agent).

### 3. Administrácia

`anastasia-admin/app.mjs` → **Nastavenia → Pripojenia**:
- karty produktových feedov s URL a tlačidlom **Kopírovať odkaz** (aj „Otvoriť feed“),
- stav feedu (počet produktov; ak jadro neodpovie, „nedá sa overiť“),
- **Dopravca**: výber Packeta/SPS/GLS/DPD, pole na API kľúč, tlačidlo Uložiť, stav „nepripojené“.

## Nastavenie prostredia

```
STOREFRONT_URL=https://<web>          # adresa webu v URL produktov vo feede
FEED_VAT_RATE=20                       # sadzba DPH pre cenu bez DPH v feede
FEED_FALLBACK_IMAGE=https://<web>/...  # náhradná fotka pre produkty bez obrázka
CARRIER_SETTINGS_SECRET=<tajomstvo>    # min. 16 znakov; inak sa použije JWT_SECRET
```

Testovací server (`ops/test-server/push-env.sh`) dostal `STOREFRONT_URL=$WEB`.

## Overenie

- `cd backend && npx tsc --noEmit` – bez chýb.
- `cd backend && npm run test:unit` – 1163 testov, zelené (nové: 24 testov feedov a dopravcov).
- Reálne dáta: `medusa exec` proti `anastasia_dev_wave1` – 25 produktov, cena 11,00 € s DPH / 9,17 € bez DPH,
  URL, kategória, SKU a obrázky v XML; entity v popise rozkódované, titulok bez „Predvolené“.
- Trasy: `RoutesLoader` z rámca potvrdzuje `GET /feeds/heureka.xml` a `GET /feeds/google.xml`
  (a `optedOutOfAuth` = verejné), `GET/POST /admin/carriers` a `GET /admin/feeds` (chránené).
- Admin: prehliadač (lokálna stavba) – 18 kontrol obrazovky „Nastavenia → Pripojenia“ prešlo.

## Čo zostáva

- **Backend sa musí nasadiť**, aby feedy a `/admin/carriers` existovali v prevádzke (nasadenie admina nestačí).
- Pripojenie k API dopravcu (objednávky, etikety, sledovanie zásielky) – podľa dopravcu, ktorý potvrdí majiteľ.
- Heurika a Google Merchant Center treba schváliť a vložiť odkaz z administrácie.
- `FEED_FALLBACK_IMAGE` sa oplatí nastaviť, inak produkty bez fotky vo feede chýbajú.
