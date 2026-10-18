# Staré kupóny: bezpečnost katalogového importu

Stav tohoto balíku: IMPLEMENTED_UNVERIFIED pro nativní persistenci; cílené unit testy 19/19 PASS a backend TypeScript PASS. Celá finanční migrace zůstává PARTIAL. Navazuje na PR #44, nic neaktivuje ani nenasazuje.

## Opravený přenos

Parser při přítomnosti definic `ecQuote` i `ecProduct2Quote` počítá použití stejně jako původní `CouponRepository.WasUsed`: počet řádků s `nonProductId` odpovídajícím kupónu, jejichž objednávka má nenulové `dateFinished`. Rozpracované košíky použití nespotřebují. Z těchto tabulek ponechá jen klíče, příznak dokončení a vazbu kupónu; do katalogu zapisuje pouze agregované `completed_uses`, nikoli objednávky nebo osobní údaje. Chyby parsování těchto tabulek neobsahují hodnoty řádků. Duplicitní objednávky, osiřelé vazby nebo chybějící sloupce import historie zastaví.

Chybějící tabulka znamená neznámou historii, nikdy nulu. Starší `catalog.json` bez historie už nelze použít k založení kupónů: je nutný nový export ze stejného úplného SQL snapshotu. Přítomnost definic tabulek sama nedokazuje úplnost ručně ořezaného dumpu; migrační operátor musí použít úplný export a před přechodem vyřešit i novější objednávky. Automatické živé dočítání ze starého obchodu tento balík nepřidává.

Nové promoce zůstávají `draft`. Při vytvoření dostanou historické `used` a původní jednorázový limit; již vyčerpaný kód se tím neobnoví. Instalovaný nativní modul předává pole `used` do modelu při vytvoření; CI test ověřuje skutečný workflow, nový service read i SQL hodnotu. Existující promoce import nadále přeskočí: nevynuluje ani nepřičte jejich současné čerpání. Oprava dříve importovaných záznamů vyžaduje samostatné porovnání snapshotu a následného provozu; tímto importerem se neprovádí.

Pevná sleva je v nativním návrhu rozdělena `across`, nikoli `each`, aby se nenásobila počtem kusů. Kombinace procent a pevné částky se nesmí změnit pouze na procenta. Import ji odmítne, stejně jako dosud nepřenášené minimum/maximum hodnoty košíku a neplatná čísla. Původní katalogový JSON uchovává všechny původní hodnoty.

## Co tento balík neřeší

Aktuální NEXUS adaptér stále nepřijímá pevné slevy ani kupóny omezené na produkty. Nativní `across` není důkazem podpory této slevy v NEXUSu. Před jejich aktivací je nutný přesný serverový kontrakt pro slevu na celý košík, procento plus pevnou částku, omezení na košík složený výhradně z povolených produktů, původní oříznutí slevy na centy a místní kalendářní platnost včetně posledního dne. Nesmí vzniknout druhý nezávislý výpočet vedle NEXUSu ani obejití SafeOrder/payment kontrol.

Zdroj obchodních pravidel: `dufeksoft.ecommerce-lib/Models/Ecommerce/PriceDiscountModel.cs`, `Models/Ecommerce/QuoteModel.cs`, `Repositories/CouponRepository.cs` v místním archivním zdroji. Žádné soukromé kupóny ani zákaznická data nejsou součástí commitu.

## Ověření

- Cílené testy: `TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules ./node_modules/.bin/jest --runTestsByPath src/scripts/__tests__/legacy-coupon-import.unit.spec.ts src/scripts/__tests__/catalog-import.unit.spec.ts --runInBand --forceExit` — 19/19 PASS.
- `backend/node_modules/.bin/tsc --noEmit` z `backend` — PASS.
- Nativní Medusa/PostgreSQL test je v existujícím izolovaném QR workflow; plné regrese pouze GitHub Actions. Výsledek bude doplněn po skutečném běhu.
