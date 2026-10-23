# Balík: admin-pastel-reference

**Stav:** IMPLEMENTED_UNVERIFIED  
**Datum:** 23. 10. 2026  
**Větev:** `codex/admin-pastel-reference`

## Úvod

Tento balík řeší nový design knihovny zakoupených programů (Moja knižnica) pro RESET 40+.

### Problém
- Starý přehrávač vypisoval pod sebe dlouhý seznam souborů a přehrávač byl až na konci.
- Přehrávání se pere s tlačítkem hudby na pozadí (ambient).

### Požadavky
1. **Desktop (1440 px):** Dvousloupcový přehrávač – vlevo velký sticky přehrávač s názvem lekce, tlačítka Predchádzajúca/Ďalšia; vpravo navigace programu.
2. **Mobil (390 px):** Přehrávač nahoře (sticky, max 40 % výšky), pod ním akordeon s týdny.
3. **Navigace:** 16 týždňov jako rozbalovací akordeon (Týždeň 1…16), v každém nejdřív videa, pak PDF Samoštúdium, pak denné listy Deň 1–7. Audio "nič nemusíš" se nezobrazuje.
4. **Filtrování:** Vyhledávací pole + filtry (Všetko / Videá / Audio / PDF).
5. **PDF:** Tlačítko Otvoriť PDF otevře podepsaný odkaz v nové záložce.
6. **Stav:** Aktivní položka zvýrazněná, u přehraných zaškrtnutí (localStorage).
7. **Konflikt se zvukem:** Přehrávač knihovny ztlumí a zastaví ambient.
8. **Vzhled:** Fraunces 300 nadpisy, Figtree text, krémová a lesní zelená, zaoblení jako product-card, dotykové zóny min. 44 px.

## Změny

### Frontend (storefront-prototype)

#### Nové soubory
- `public/library-groups.mjs`: Funkce `groupLibraryItems()` pro seskupení materiálů podle týdnů.
- `public/library-new.mjs`: Nový mount skript knihovny s přehrávačem a akordeonem.
- `public/library-new.css`: CSS stylizace nového designu.
- `src/library-page.mjs`: HTML šablona stránky knihovny.
- `test/library-groups.test.mjs`: Unit testy pro seskupování.

#### Úpravy
- `app.mjs`: Import `library-new.mjs`, event listener pro `ana:media-play` (zastaví ambient).
- `build.mjs`: Přidání `library-page.mjs`, úprava cesty pro knihovnu.
- `src/pages.mjs`: `reset(library)` – používá novou šablonu.

### Backend

#### Změny
- `src/scripts/link-protected-library.ts`: Podpora přidání PDF z TSV souboru (při `PROTECTED_LIBRARY_PDF=1`).
- `src/scripts/link-protected-library-pdf.ts`: Nový skript pro import PDF mapy.
- `src/lib/protected-library/upload.ts`: PDF již podporováno (`application/pdf`).

#### TSV mapa
- `backend/data-private/reset40-pdf-map.tsv`: 111 řádků PDF materiálů (týden, typ, stará cesta).

## Seskupení materiálů

```javascript
groupLibraryItems(entitlements)
// Vrací: [{ week: number, title: string, videos: [], pdfs: [], audios: [] }]
```

### Logika
- `reset-40-plus/lekcia-NN.mp4` → Týždeň NN (00 → 1).
- `reset-40-plus/tyzden-NN/samostudium.pdf` → Týždeň NN.
- `reset-40-plus/tyzden-NN/den-D.pdf` → Týždeň NN.
- `nic-nemusis/*.mp3` → Nezobrazuje se v knihovně.

## Testy

```bash
cd /Users/lucky/anastasia-nexus-release
node --test storefront-prototype/test/library-groups.test.mjs
```

**Výsledek:** 7/7 testů OK.

## Build

```bash
node storefront-prototype/build.mjs
```

**Výsledek:** 43 statických stránek, všechny legacy cesty pokryty.

## Použití

### Přidání PDF do registru (dry-run)
```bash
cd /Users/lucky/anastasia-nexus-release/backend
npx medusa exec src/scripts/link-protected-library.ts
```

### Přidání PDF s aplikací
```bash
PROTECTED_LIBRARY_APPLY=1 PROTECTED_LIBRARY_PDF=1 npx medusa exec src/scripts/link-protected-library.ts
```

## Další kroky

1. **OVĚŘENÍ:** Spustit `npx tsc --noEmit` a `npm run test:unit` v `backend/`.
2. **REVIEW:** Kontrola, zda se přehrávač zobrazuje správně na mobilu i desktopu.
3. **PROD:** Po schválení nasadit do produkce.

## Rizika

- **Středový postup:** Při změně `library.mjs` by mohly být narušeny staré stránky, ale `app.mjs` načítá nový skript podmíněně.
- **LocalStorage:** Ukládání pozice a dokončených položek je v `try/catch`, chyby nezobrazují výjimky.

## Poznámky

- Žádné produkční zásahy.
- Všechny změny jsou v `codex/admin-pastel-reference`.
- Commit: `e9ba18e` (před změnami).
