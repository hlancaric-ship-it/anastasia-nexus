# C1: Import katalogu ANASTASIA

## Rozsah

Balík obsahuje dva lokální skripty:

- `src/scripts/parse-legacy-db.ts` načte SQL Server dump a exportuje jen katalogové tabulky do JSON.
- `src/scripts/import-anastasia-catalog.ts` načte JSON a idempotentně doplní katalog do Medusa v2.

Parser neexportuje zákazník, účty, objednávky ani jejich osobní údaje. Do importéru se předává jen připravený soubor katalogu. Nejsou přidány žádné závislosti.

## Postup

Spouštěj z `backend/`. Zdrojový dump a výstupní data zůstávají mimo Git; `data-private/` je v `.gitignore`.

```sh
npx ts-node src/scripts/parse-legacy-db.ts /cesta/DB.sql
npx medusa exec ./src/scripts/import-anastasia-catalog.ts dry-run
npx medusa exec ./src/scripts/import-anastasia-catalog.ts
```

Parser standardně zapisuje `data-private/legacy/catalog.json`, `redirects-301.json` a `parse-report.json`. Podporuje UTF-8, UTF-8 s BOM, UTF-16LE a UTF-16BE a více tuple v jednom `INSERT ... VALUES`. Před ostrým lokálním importem zkontroluj varování a položky `decisions_needed` v reportu. Importér načítá stejnou cestu, kterou lze změnit argumentem `file=<cesta>`.

`dry-run` pouze načte a ověří vstup, zkontroluje potřebné bootstrap entity a vypíše plán. Nezapisuje do Medusy. Bez přepínačů se vytváří jen chybějící záznamy; existující produkty, jejich ceny a sklad se nepřepisují. Volitelné aktualizace:

| Volba | Účinek na existující záznamy |
|---|---|
| `update` | Popisná pole produktu, metadata, kategorie, kolekce a obrázky; také značky a kategorie |
| `update-prices` | EUR cenu varianty, pokud má produkt odpovídající SKU |
| `update-stock` | Množství na existující skladové úrovni |
| `update-status` | Publikovaný/skrytý stav podle zdroje |
| `coupons` | Vytvoří kupóny jako neaktivní promoce ve stavu draft |

Volby lze nastavit i přes `ANASTASIA_IMPORT_<VOLBA>`. Obrázky se připojují jako URL pouze při zadání `media-base-url=<http(s) URL>`; skript soubory nestahuje ani nenahrává.

## Mapování a ochranná pravidla

- Značky se ukládají jako Medusa product collections, kategorie zachovávají hierarchii, pořadí, metadata a původní URL.
- Každý produkt má jednu výchozí variantu se starým SKU. Handle a stará cesta se zachovávají; kolize SKU nebo handle se nesmějí automaticky přepisovat.
- Ceny se přebírají z aktuálně platné cenové řádky `price_1_WithVat` v EUR (hlavní jednotky, včetně DPH). Importér nevypočítává slevy; finální cenu určuje serverový NEXUS pricing flow. Chybějící cena znamená produkt ve stavu draft.
- Fyzické produkty dostanou skladovou správu podle zásoby a dostupnosti. Digitální produkty a služby se importují bez skladové správy. Neeviduje se tím přístup k obsahu ani doručení služby.
- Digitální produkty dostanou metadata s cestou do starého obsahu a osnovou nalezenou ve stromu Umbraco. Odemčení obsahu po zaplacení řeší samostatný entitlement balík.
- Kupóny zůstávají draft, protože současný NEXUS adapter pro řádky košíku vypíná Medusa promotions a schválené pravidlo pro kupóny není zdokumentováno.
- Importér ověřuje existující SKU a legacy ID. Pokud SKU patří jiné entitě nebo je v Meduse duplicitní, import danou položku odmítne místo vytvoření či změny nesprávného produktu.

## Předpoklady a otevřené body

- Předpoklad: před importem byl spuštěn `src/migration-scripts/anastasia-bootstrap.ts`; musí existovat sales channel `ANASTASIA e-shop`, výchozí a digitální shipping profil a při fyzických produktech sklad `Sklad ANASTASIA`.
- Ceny jsou uložené jako tax-inclusive ceny a region musí odpovídat bootstrap konfiguraci. Sazby DPH a historické sazby musí před obchodním použitím potvrdit účetní.
- Přesná klasifikace servisních SKU a jejich fulfillment profil vyžaduje obchodní potvrzení. Import je při současném mapování směruje na digitální profil a sklad nespravuje.
- Produkty bez ceny se založí jako draft; report je potřeba projít a doplnit zdrojovou cenu nebo rozhodnout o vyřazení.
- Obrazová URL neznamená, že byl obrázek zkopírován nebo že zůstane dostupný po vypnutí starého webu.
- Import katalogu nebyl spuštěn proti žádné databázi v rámci tohoto balíku. Produkční služby a databáze se nepoužívají.

## Ověření

Unit testy používají pouze syntetické anonymní SQL. Pokrývají vícetuple `VALUES`, escapované řetězce, NULL, UTF-16LE, katalogové mapování, zachování handle, cenu, sklad a ochranu před nechtěným přepsáním existujících dat. Po změně spusť v `backend/`:

```sh
npx tsc --noEmit
npm run test:unit
```

Výsledky běhů jsou uvedeny v předávacím reportu.
