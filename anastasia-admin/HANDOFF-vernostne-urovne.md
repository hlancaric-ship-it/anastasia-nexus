# Vernostné úrovne – backend je hotový, UI je na vás

**Pre:** admin MiniMax (session `anastasia-admin/*`) · **Od:** Claude Code · **Dátum:** 21. 10. 2026
**Vetva:** `release/predani-faze1` (nepushnuté) · **Dokument balíku:** `backend/docs/wp/loyalty-tiers.md`

Lucia si má sama nastaviť zľavy a prahy vernostných úrovní a ručne priradiť zákazníka
k úrovni. Backend, automatické priradenie podľa útraty aj posielanie percent do NEXUS
Workera sú hotové a overené. V tejto fáze **nemeníte `backend/` ani `nexus/`** – iba
`anastasia-admin/*` podľa špecifikácie nižšie.

---

## 1. Čo backend už vie (nemusíte to riešiť v UI)

- **Politika žije v databáze** (nastavenia obchodu, `store.metadata.loyalty_policy`). Pred
  spustením obchodu je **prázdna** (žiadne úrovne, 0 %) – Lucia si ju nastaví sama.
- **Úroveň zákazníci je jej členstvo v skupine** (Bronze / Silver / Gold / VIP majú
  `metadata.nexus_tier` = ZR1..ZR4). Rovnakú skupinu už číta cenový adapter, takže sa
  zľava v košíku prepojí **automaticky** – nič v UI na to netreba.
- **Ručný zámok** je samostatná skupina „Věrnost – ruční zámok“. Automatické priradenie
  podľa útraty ho nikdy neprepiše. Zákazník ho neprepíše ani sám (store API neumožňuje
  meniť skupiny ani si zapisovať metadáta, ktoré by úroveň ovplyvnili).
- **Ceny počíta server.** Backend pošle Workeru iba kód úrovne (`ZR3`), **nie percentá**.
  Percentá idú do Workera podepsaným webhookom do KV a odtiaľ sa použijú pri výpočte ceny.
  Klient nikdy neposiela vlastné percentá.

---

## 2. API (presne)

Všetky routy sú pod `/admin` → v SPA použite existujúci helper `api(path, {method, body})`
z `app.mjs` (automaticky prikladá `Authorization: Bearer …`).

### 2.1 Politika úrovní

**`GET /admin/nexus/loyalty-policy`**

```json
{
  "tiers": [
    { "code": "ZR1", "name": "Bronze", "discount_percent": 2,  "spend_threshold_eur": 0,    "enabled": true, "rank": 1 },
    { "code": "ZR2", "name": "Silver", "discount_percent": 5,  "spend_threshold_eur": 500,  "enabled": true, "rank": 2 },
    { "code": "ZR3", "name": "Gold",   "discount_percent": 10, "spend_threshold_eur": 2000, "enabled": true, "rank": 3 },
    { "code": "ZR4", "name": "VIP",    "discount_percent": 15, "spend_threshold_eur": null, "enabled": false,"rank": 4 }
  ],
  "updated_at": "2026-10-21T10:00:00.000Z",
  "updated_by": "user_01M…"
}
```

- `tiers` môže byť **prázdny zoznam** – to je platný stav („politika ešte nenastavená“).
- `code` je kód úrovne (`ZR1`–`ZR4`), `name` je názov, ktorý vidí zákazník
  (voľný text, max. 60 znakov).
- `discount_percent`: **číslo 0–50** (celé alebo desatinné). 0 = bez zľavy.
- `spend_threshold_eur`: prah **celkovej zaplatené útraty** v € pre automatické priradenie,
  `null` = úroveň sa nedá získať automaticky (napr. len ručne).
- `enabled`: vypnutá úroveň sa nedá získať automaticky a jej zľava sa nepoužije.
- `rank`: poradie (1 = najnižšie). **Prahy musia v poradí rásť** (napr. 0 → 500 → 2000),
  inak server vráti `400`.
- Kódy musia byť jedinečné.

**`PUT /admin/nexus/loyalty-policy`** – telo:

```json
{ "tiers": [ { "code": "ZR1", "name": "Bronze", "discount_percent": 2, "spend_threshold_eur": 0, "enabled": true } ] }
```

Odpoveď = to isté ako `GET` + **`worker_sync`**:

```json
{ "tiers": [ … ], "updated_at": "…", "updated_by": "…",
  "worker_sync": { "synced": true, "status": 200 } }
```

- `worker_sync.synced === false` → politika je **uložená**, ale Worker ju ešte neprebral
  (`error` je napr. `NEXUS_PRICING_POLICY_NOT_CONFIGURED`, `NEXUS_POLICY_SYNC_UNAVAILABLE`,
  `NEXUS_POLICY_SYNC_503`). Ukážte Lucii upozornenie, politika sa v DB nezruší a dá sa
  uložiť znova (pokiaľ sa znova nepodarí, zľava v košíku ostane na tej env hodnote).
- Validácia prebehne **na serveri** → `400` s hlásením v slovenčine:
  `Zľava úrovne ZR1 musí byť medzi 0 a 50 %.` / `Prahy úrovní musí v poradí rásť (ZR2).` /
  `Duplicitná úroveň ZR1.` / `Úroveň ZR1 neexistuje…`
- Chyby: `401` (nie si prihlásená), `503` (uloženie sa nepodarilo).

### 2.2 Zoznam zákazníkov s úrovňou

**`GET /admin/nexus/loyalty-customers?tier=&q=&limit=&offset=`**

- `tier`: `ZR1`…`ZR4` (filter na úroveň) alebo `none` (bez úrovne); prázdne = všetky.
- `q`: hľadanie v mene a e-maile (serverovo).
- `limit` (max. 200, default 50), `offset`.

```json
{
  "customers": [
    { "id": "cus_…", "email": "…", "first_name": "…", "last_name": "…", "created_at": "…",
      "tier_code": "ZR3", "tier_name": "Gold", "source": "manual", "locked": true }
  ],
  "count": 128, "offset": 0, "limit": 50,
  "tiers": [ { "code": "ZR1", "name": "Bronze" }, { "code": "ZR2", "name": "Silver" } ]
}
```

- `tier_code`/`tier_name` sú `null`, ak zákazník úroveň nemá.
- `source`: `manual` (nastavil ste to vy) alebo `auto` (vypočítané z útraty).
- `locked`: `true` = ručný zámok, automatické priradenie ju neprepiše.
- `tiers` v odpovedi je zoznam existujúcich úrovní (z katalógu) – použite ho na filter.

### 2.3 Zaradenie jedného zákazníka

**`POST /admin/nexus/customers/:id/tier`** – telo:

```json
{ "tier_code": "ZR3" }
```

alebo pre automatické priradenie podľa útraty:

```json
{ "tier_code": "automatic" }
```

Odpoveď:

```json
{ "customer_id": "cus_…", "tier_code": "ZR3", "tier_name": "Gold", "source": "manual", "locked": true }
```

- Ručné zaradenie (`ZR1`–`ZR4`) **vždy** nastaví ručný zámok.
- `automatic` **zruší** ručný zámok a úroveň sa prepočíta podľa útraty pri najbližšej
  zaplatenej objednávke (subscriber `payment.captured`). Ak zákazník nemá dosiahnutý prah,
  úroveň sa odoberie.
- Chyby: `400` (`Neplatná úroveň. Použite napr. ZR1 až ZR4 alebo „automaticky“.`),
  `404` (`Zákazník sa nenašiel.`), `503`.

### 2.4 Hromadné zaradenie

**`POST /admin/nexus/customers/tiers`** – dva tvary:

```json
{ "tier_code": "ZR3", "customer_ids": ["cus_1", "cus_2"] }
```

alebo

```json
{ "assignments": [ { "customer_id": "cus_1", "tier_code": "ZR3" },
                   { "customer_id": "cus_2", "tier_code": "automatic" } ] }
```

Odpoveď: `{ "updated": 2, "results": [ { "customer_id": "cus_1", "tier_code": "ZR3", "tier_name": "Gold", "source": "manual", "locked": true } ] }`

- Max. **200 zákazníkov naraz** (`400`).
- `400` pri neplatnej úrovni alebo prázdnom zozname.

---

## 3. Návrh UI

### 3.1 `Nastavenia → Vernostné úrovne` (nová položka v subnávu)

Nová podstránka v `vNastavenia` (subnav v `app.mjs`), ktorá načíta
`GET /admin/nexus/loyalty-policy` a uloží cez `PUT`.

- **Tabuľka úrovní** (riadok = úroveň):
  - Názov (text input, placeholder `Bronze`).
  - Zľava (number input, `%`, krok 0,5, max 50).
  - Prah útraty (number input v €, prázdne = bez prahu; placeholder `napr. 500`).
  - Zapnuté (checkbox).
  - Zmena názvu/kódu: **kód úrovne (`ZR1`…) sa nemení** – je to kľúč v politike Workera.
    Ak potrebujete iný kód, odstráňte úroveň a vytvorte ju nanovo (a upozornite, že to
    zmení zľavu priamo na serveri).
  - „+ Pridať úroveň“ (kód sa vygeneruje ako `ZR5`, `ZR6`… – backend kód overí).
- **Uložiť zmeny** → `PUT /admin/nexus/loyalty-policy` → hlásenie:
  - OK: `Zľavy a prahy sú uložené. Zľava sa počíta pri nákupe v košíku.`
  - `worker_sync.synced === false`: `Politika je uložená, ale cenový server ju ešte neprebral.
    Skúste to uložiť znova alebo to oznámte podpore.` (tón: neutrálny, nie panika – zľava v košíku
    zatiaľ počíta podľa starého nastavenia).
- **Prázdny stav** (ešte nič nenastavené): `Vernostné úrovne ešte nie sú nastavené.
  Nastavte zľavu a prah, aby zákazníci dostávali zľavu.` + tlačidlo „Uložiť“.
- **Vysvetlenie pre Luciu** (malý text pod tabuľkou):
  `Zľava sa počíta na serveri pri nákupe. Úroveň sa priradí automaticky podľa celkovej
  útraty zákazníci. Ak jej úroveň nastavíte ručne, automatické priradenie ju už nepremení.`

### 3.2 Detail zákazníci → výber úrovne

V `vCustomerDetail` (detail zákazníci) pridajte **sekciu „Vernostná úroveň“**:

- Načítajte `GET /admin/nexus/loyalty-customers?tier=…`? Nie – jednoduchšie: v detailu
  zákazníci načítajte `GET /admin/nexus/loyalty-customers?q=<email>&limit=1` a nájdite
  zákazníka podľa `id`, alebo si pridajte do detailu **voliteľný endpoint**: použite
  existujúce `GET /admin/customers/:id` + `GET /admin/customer-groups` a dopočítajte úroveň
  podľa `metadata.nexus_tier` skupín. **Odporúčané:** použite `GET /admin/nexus/loyalty-customers`
  s `q=<email>&limit=5` a vyberte zákazníka podľa `id`.
- UI: select `Vernostná úroveň` s možnosťami `Bez úrovne` + úrovne z `tiers`
  (napr. `Bronze (ZR1)`) + `Automaticky podľa útraty`.
- Tlačidlo **Uložiť** → `POST /admin/nexus/customers/:id/tier` s `{ "tier_code": "ZR3" }`
  alebo `{ "tier_code": "automatic" }`.
- Ak je `locked: true`, zobrazte štítok `ručné` a poznámku:
  `Nastavené ručne – automatické priradenie podľa útraty to nepremení.`
- Ak je `source: "auto"`, štítok `automaticky`.

### 3.3 Zoznam zákazníkov → stĺpec a filter

- **Stĺpec „Úroveň“** v tabuľke zákazníkov: hodnota `Gold` (alebo `—`), prípadne štítok
  `ručné`, ak je `locked`.
- **Filter úrovne** nad tabuľkou: `Všetky` / `Bronze` / `Silver` / `Gold` / `VIP` /
  `Bez úrovne`. Implementujte ho cez `GET /admin/nexus/loyalty-customers?tier=ZR3`
  (serverový filter + stránkovanie), nie cez klienta.
- **Hromadné priradenie** (voliteľné, ale odporúčané): checkboxy v riadkoch + akcia
  „Priradiť úroveň“ → `POST /admin/nexus/customers/tiers` s `customer_ids`.

---

## 4. Texty pre Luciu (slovenčina, bez žargónu)

| Kde | Text |
|---|---|
| Názov sekcie | Vernostné úrovne |
| Prázdny stav | Vernostné úrovne ešte nie sú nastavené. |
| Tlačidlo | Uložiť zmeny |
| Výber úrovne (detail) | Vernostná úroveň |
| Možnosť selectu | Bez úrovne · Automaticky podľa útraty |
| Štítok ručnej úrovne | ručné |
| Potvrdenie zmeny | Úroveň je uložená. |
| Chyba | Zľava musí byť medzi 0 a 50 %. |
| Chyba | Prah útraty musí mať 0 alebo viac. |
| Chyba (server) | Nastavenie sa nepodarilo uložiť. Skúste to znova. |
| Info o automatike | Úroveň sa priradí automaticky podľa celkovej útraty zákazníka. Ručne nastavenú úroveň už automatika nepremení. |

---

## 5. Čo ste musia vedieť

1. **Neukladajte percentá do žiadneho klientského výpočtu.** UI iba pošle číslo na server;
   zľavu v košíku počíta NEXUS Worker.
2. **Pred spustením obchodu môže zostať politika prázdna** – zľava je potom 0 % a
   automatické priradenie nič nemení.
3. **Ručné priradenie je chránené.** Ak zákazník raz nastavíte úroveň ručne, automatika ju
   už nepremení, kým ju nevrátite na „Automaticky“.
4. **Úrovne sú v katalógu už teraz** (Bronze/Silver/Gold/VIP). Ak v Nastaveniach vytvoríte
   úroveň s novým kódom (ZR5…), backend ju odmietne s `400` – kód musí byť `ZR1`–`ZR4`.
5. **Údaje o zákazníkách neukladajte do prehliadača** (localStorage) – načítajte ich
   z API, ako je zvykom v tejto aplikácii.

## 6. Overenie

- Backend: `cd backend && npm run test:unit` (testy `src/lib/loyalty/__tests__/*`,
  `src/api/admin/nexus/__tests__/*`).
- NEXUS Worker: `cd nexus && npm test` (test `tests/unit/pricingPolicy.test.ts`).
- Po vašej práci: `cd anastasia-admin && node test/browser-*.mjs` (ak pribudne nový fixture).

**Stav backendu:** `IMPLEMENTED_UNVERIFIED` (overené na lokálnej DB a unit testami;
produkčný KV binding Workera má zatiaľ placeholder ID – doplní ho integrátor).
