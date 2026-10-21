# Digitálne produkty v administrácii: nahrávanie, priradenie a filtrovanie

**Balík:** naväzujúci na `library-admin.md` (premenovanie a poradie už pripojených súborov).
**Dátum:** 21. 10. 2026 · **Vetva:** `release/predani-faze1`

## Čo je hotové

Lucia si teraz v administrácii založí digitálny produkt, nahrá mu súbory a všetko sa samo
prepojí: súbor sa uloží do súkromného úložiška, pripojí sa k produktu, zákazníčka s prístupom
ho uvidí v Knižnici a prehrá ho cez podepsaný krátkodobý odkaz.

### Backend (nové a zmenené routy)

| Rauta | Účel |
|---|---|
| `POST /admin/products/:id/protected-media/upload-url` | Vráti presigned `PUT` URL na **jeden konkrétny kľúč** v súkromnom bucketu. Kľúč, príponu a limit určuje server; klient posiela iba meno súboru a jeho veľkosť. |
| `POST /admin/products/:id/protected-media/attach` | Overí `HEAD` objektu v úložisku, skontroluje limit a pripojí kľúč do `metadata.protected_media` pod zámkom, s kontrolou čítania a auditem. |
| `DELETE /admin/products/:id/protected-media/:key` | **Len odpojí** súbor od produktu. Objekt v úložisku zostáva ležať. |
| `GET /admin/products/:id/protected-media` | Existujúci register súborov (nezmenený). |
| `GET /admin/product-catalogue` | Nový zoznam produktov pre administráciu s **serverovým filtrom Fyzické / Digitálne**. |

Nové súbory v jadre:

- `backend/src/lib/protected-library/upload.ts` – pravidlá (povolené typy, limity, tvar a väzba kľúča),
- `backend/src/lib/protected-library/storage.ts` – prístup k R2 (S3 API) a presigned URL,
- `backend/src/lib/protected-library/product.ts` – načítanie produktu a registra,
- `backend/src/lib/digital-products/categories.ts` – návrh skupín digitálnych produktov,
- `backend/src/scripts/e2e-digital-library.ts` – overenie celého toku na lokálnej DB.

### Pravidlá, ktoré sa nedajú obísť

- **Povolené typy sú len `mp4`, `mp3`, `m4a` a `pdf`.** ZIP a EPUB sú zámerne vynechané:
  platený obsah sa nesmie sťahovať ani rozbaliť. Limit je **2 GB** pre video a **200 MB** pre ostatné.
- **Bucket, účet aj kľúče sú výhradne z konfigurácie servera** (`PROTECTED_R2_*`); v kóde nie je
  natvrdo žiadny názov bucketu ani účtu, pretože úložiisko sa presúva na účet klientky.
  Do prehliadača odchádza iba presigned URL na jediný kľúč.
- **Kľúč sa viaže na vlastný produkt**: tvar `<handle-produktu>/<slug-názvu>-<random6>.<ext>`,
  bez ďalšej úrovne. Cudzí kľúč sa k produktu nepripojí ani neodpojí.
- **Zákazníčka nedostane priamu adresu R2.** Prehrávanie ide cez existujúci doručovací worker
  (`/v1/<kľúč>?t=<token>`) s vodoznakom; prehliadač má `controlsList="nodownload"` a žiadne
  tlačidlo na stiahnutie. Dokument (PDF) sa otvára v náhlade prehliadača.
- **Odpojenie nezmaže objekt** v úložisku – to je samostatná, schválená operácia.

### Administrácia (`anastasia-admin/`)

- Záložka **Zakúpený obsah**: pretiahnutie súboru alebo výber zo zariadenia, **priebeh nahrávania**
  (XHR `upload.onprogress`), automatický názov zo súboru, náhled druhu obsahu (video / nahrávka /
  dokument), odoberanie a zoradenie. Texty sú slovenské a zamerané na Luciu.
- Pri odoberaní súboru sa kontroluje, či produkt už kúpila zákazníčka; vtedy si potvrdenie
  výslovne pýta a povedie, koľko zákazníčiek prístup stratí.
- **Nový digitálny produkt** sa po založení otvorí priamo na záložke Zakúpený obsah s výzvou
  nahrať súbory.
- **Zverejnenie digitálneho produktu bez súborov je zablokované** (zákazníčka by zaplatila
  a nedostala by nič). Ak sa register nedá načítať, zablokovanie sa neaplikuje.
- Zoznam produktov má filter **Fyzické / Digitálne** a stĺpec Typ.

### E-shop (storefront)

- Katalóg rozlišuje digitálne produkty podľa **dopravného profilu** (`digital`), nie podľa
  kategórie – rovnaké pravidlo používa pokladňa aj udelenie prístupu.
- Filter **Fyzické / Digitálne** a zoskupenie digitálnych produktov do skupín
  (ACADEMY kurzy, Audio a meditácie, E-knihy a dokumenty, Konzultácie).
- **Digitálny produkt môže kúpiť len prihlásená zákazníčka.** Ak je v košíku digitálny produkt
  a zákazníčka nie je prihlásená, pokladňa ju vyzve, aby sa prihlásila alebo si založila účet.
  Server to overuje aj bez UI: `POST /store/nexus-checkout` vráti bez zákazníckej session `401`.

### Návrh kategórií digitálnych produktov

Vychádza z existujúcich kategórií katalógu; **žiadna kategória sa nemazí ani nezakladá**.
Skupiny sú zatiaľ iba zoskupenie v UI a návrh pre vlastníka obchodu:

| Skupina | Existujúca kategória | Nové (navrhované) |
|---|---|---|
| ACADEMY kurzy | `AI ANASTASIA ACADEMY` | – |
| Audio a meditácie | – | `Audio a meditácie` |
| E-knihy a dokumenty | – | `E-knihy a dokumenty` |
| Konzultácie | `Konzultácie` | – |

Digitálny produkt určuje dopravný profil, kategória je len označenie v katalógu.

## Ako to overiť

### Jednotkové testy (jadro)

```
cd backend && npm run test:unit
```

- `src/lib/protected-library/__tests__/upload.unit.spec.ts` – povolené typy, limity, tvar kľúča,
  väzba kľúča na produkt, validačné schémy.
- `src/lib/protected-library/__tests__/storage.unit.spec.ts` – konfigurácia len z prostredia,
  v kóde nie je natvrdo bucket ani účet.
- `src/api/admin/products/[id]/protected-media/__tests__/library-upload.unit.spec.ts` –
  autentizácia, validačné chyby, pripojenie, odmietnutie cudzieho kľúča a neexistujúceho objektu,
  limit, odpojenie, replay, tiché zlyhanie pri čítaní.
- `src/api/admin/product-catalogue/__tests__/route.unit.spec.ts` – filter Fyzické / Digitálne,
  stránkovanie, hľadanie.
- `src/lib/digital-products/__tests__/categories.unit.spec.ts` – skupiny kategórií.
- `src/api/store/nexus-checkout/__tests__/digital-guest-checkout.unit.spec.ts` – host nedostane
  prístup k digitálnemu produktu.

### Prehliadač (izolovaná DOM fixture, bez Medusa a R2)

```
cd anastasia-admin && node test/browser-library-editor.mjs
```

Overí nahrávanie cez výber aj pretiahnutie, priebeh, automatický názov, druh obsahu, odmietnutie
nepovoleného typu, odoberanie s potvrdením pre zakúpený produkt a zachovanie pôvodného
chovania (stránkovanie, fokus, escapovanie, pravdivý prázdny a chybový stav).

### E2E na lokálnej DB

```
cd backend
DATABASE_URL=postgres://localhost/anastasia_dev_wave1 npx medusa exec ./src/scripts/e2e-digital-library.ts
```

Skript založí testovací digitálny produkt, nahrá malý MP3 cez presigned URL do náhradného S3
(lokálny server v skripte – žiadny R2 účet sa nechýba), pripojí súbor, udeľí zákazníčke prístup,
overí register v Knižnici, podepsaný odkaz s vodoznakom, odmietnutie cudzieho kľúča a **to, že
pôvodných 17 kľúčov Reset 40+ ani ich poradie sa nezmenia**. Na konci testovací produkt
deaktivuje a zákazníčku s prístupom odstráni.

## Čo treba dorobiť pred produkciou

1. **Premenné prostredia** (na serveri, nie v kóde):
   `PROTECTED_R2_ENDPOINT`, `PROTECTED_R2_BUCKET`, `PROTECTED_R2_ACCESS_KEY_ID`,
   `PROTECTED_R2_SECRET_ACCESS_KEY`, `PROTECTED_R2_REGION` (voliteľné, default `auto`).
   Bez nich endpointy nahrávania odpovedajú `503` a nič sa nepokazí.
   `.env.template` podľa pravidiel balíku nemením – doplní ho integrátor.
2. **CORS pravidlo na buckete**: `PUT` z originu administrácie (a `HEAD`), aby prehliadač
   mohol poslať súbor priamo do R2.
3. **Závislosti**: kód používa `@aws-sdk/client-s3` a `@aws-sdk/s3-request-presigner`.
   Dnes sú v repu dostupné cez `@medusajs/file-s3` (transitívne), ale majú byť uvedené
   priamo v `backend/package.json` – ten balík nemení, doplní ho integrátor.
4. **Bucket na účte klientky**: presun R2 a prepísanie `PROTECTED_R2_*`; kód ani odpovede
   klientovi neobsahujú názov účtu ani bucketu.

## Riziká a limity

- **Prehliadač nahráva priamo do R2** – súbory neprechádzajú cez jadro. Pri 2 GB videa je to
  zamýšľané (žiadne načítanie do pamäte servera), ale vyžaduje CORS a dostatočnú šírku spoju.
- **Presigned URL platí 30 minút** a je viazaný na jeden kľúč; po jeho uplynutí treba súbor
  nahrať znova (nahrávanie sa dá opakovať, kľúč dostane iný).
- **Odpojenie nemaže objekt v úložisku** – v buckete môžu zostať súbory, ktoré už produkt
  nepoužíva. Údržba bucketu je samostatná úloha.
- **`GET /admin/product-catalogue` je nový zoznam** a nahrádza `/admin/products` v zozname
  produktov v administrácii (kvôli serverovému filtru podľa dopravného profilu). Natívne
  `/admin/products` zostáva dostupné.
- Digitálne produkty v e-shope sú stále tie isté produkty s tými istými cenami; zmenený je
  iba spôsob ich zoskupenia a filtrovania.
- Overenie prehrávania prehliadačom (prehrávač, vodoznak, `nodownload`) sa nemenilo – bol
  overený existujúci tok; nový je len spôsob doplnenia obsahu.

## Čo sa NEMENÍ

- Pôvodný register Reset 40+ (17 súborov) a Nič nemusíš (7 súborov) – kľúče aj poradie
  zostávajú rovnaké; overené na lokálnej DB.
- Doručovací worker, podpisovanie odkazov, vodoznak, entitlement a pravidlá prístupu.
- Checkout, platby, ceny, sklad a doručenie – balík sa ich nedotýka.
