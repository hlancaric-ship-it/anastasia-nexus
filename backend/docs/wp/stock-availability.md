# C-3: skladová dostupnost a rezervace při checkoutu

Stav: **IMPLEMENTED_UNVERIFIED** (HTTP scénáře připravené; skutečný běh pouze na GitHub Actions).
Větev `codex/stock-availability`, základ `claude/backend-integration` / `c4aea38`.

## Nejmenší změna

Nový `integration-tests/http/stock-availability-http-checks.ts` ověřuje existující Medusa inventory.
Nepřidává druhý skladový mechanismus ani nemění ceny, poukazy, booking, konfiguraci nebo hlavní runner.
Používá vlastní dva produkty s `manage_inventory=true`, `allow_backorder=false`, explicitní vazby na inventory
a vlastní dvě skladová místa. Jedno je připojené k prodejnímu kanálu, druhé záměrně není; má 100 kusů,
které nesmějí maskovat vyprodání v e-shopu. Sdílený produkt z jiných skupin se neupravuje.

Serverové API již poskytuje dostupné množství přes `GET /store/products` i detail produktu s parametrem
`fields=%2Bvariants.inventory_quantity`. Znak `+` je potřeba URL zakódovat. Dostupnost vychází z prodejního
kanálu publishable klíče, ze zásob a rezervací na serveru. Klient nepočítá zásobu ani ceny.

Autoritativně ověřeno v instalované Meduse 2.19: `wrapVariantsWithInventoryQuantityForSalesChannel`,
`confirmInventoryStep`, `reserveInventoryStep`, inventory `createReservationItems`, `cancelOrderWorkflow`.
Rezervační krok používá zámek na inventory item a následnou kontrolu zásoby při tvorbě rezervace.

## Scénáře a důkazy

- `C3_STOCK_SERVER_AVAILABILITY_AND_LOCATION_ISOLATION`: detail i seznam vrátí 1/0 dostupných kusů,
  nepřipojený sklad se 100 kusy výsledek neovlivní.
- `C3_STOCK_SOLD_OUT_ADD_DENIED`: vyprodanou variantu nelze přidat do košíku; kontroluje se skutečná
  inventory chyba, nikoli libovolné selhání validace.
- `C3_STOCK_STANDARD_LAST_UNIT_RACE` a `C3_STOCK_NEXUS_LAST_UNIT_RACE`: dva samostatné připravené košíky
  soutěží o poslední kus přes každou completion cestu. Přesně jedna objednávka a jedna rezervace,
  druhá odpověď musí být inventory odmítnutí. Rezervace patří skutečné položce vítězné objednávky.
- `C3_STOCK_STANDARD_CANCEL_RELEASES_RESERVATION` a `C3_STOCK_NEXUS_CANCEL_RELEASES_RESERVATION`:
  nativní storno odstraní rezervaci, dostupnost vrátí z 0 na 1, fyzická zásoba zůstane 1.
  Nepřipojený sklad zůstává nezměněný a bez rezervací.

Samotné přidání do košíku zásobu nerezervuje. Před souběžným checkoutem je rezervované množství 0.
Počty objednávek se kontrolují před a po souběhu, aby neprošla osiřelá druhá objednávka po chybě.
Jednotkové testy, které by mockovaly tento nativní mechanismus, by rezervaci ani souběh neprokázaly;
podstatný důkaz je skutečný HTTP/PG běh.

## Zapojení integrátorem

Importovat `verifyStockAvailability` a sériově zavolat s `{ api, container, options, channel, region, profile, evidence }`
ve společném syntetickém HTTP runneru. Stejná podmínka jako pro X1–X3: vynechat při cíleném gift/booking běhu.
Používá existující syntetický shipping profile/option a `pp_system_default`; žádný nový provider ani migrace.
Souhlasy ukládá přes existující `acceptCheckoutConsent`; skutečný guard se nevypíná.

**Rozdíl proti předběžné dohodě 409/422:** instalovaná Medusa pro `NOT_ALLOWED` / nedostatek skladu používá
HTTP **400**. Také stávající `nexus-checkout` ponechává tuto chybu jako 400. Test zachovává veřejný kontrakt
a ověřuje i inventory zprávu. Pokud integrátor záměrně sjednotí stav na 409/422, musí současně upravit
oba API kontrakty a odpovídající aserci; samotný test nesmí zavádět neexistující chování.

## Validace a hranice

- Lokální `./backend/node_modules/.bin/tsc --noEmit -p backend/tsconfig.json`: PASS.
- Lokální PG/HTTP ani plná sada nebyly spuštěny (dohoda s Claudem).
- HTTP/PG: čeká na integraci a GitHub Actions, zatím nejde označit VERIFIED.
- První Actions `38673392852`: dostupnost a odmítnutí vyprodané položky prošly; kontrola počtu objednávek
  narazila na nativní implicitní načtení shipping totals (`Shipping method version is required to load adjustments`).
  Opraveno výslovným `select: ["id"], relations: []` u počítání; obchodní logika se nemění. Nový běh je nutný.
- Žádný deploy, produkční služby, reálné platby/e-maily nebo klientské údaje.
- Nastavení dopravy, dopravce, limity dopravy zdarma a hlavní integraci vlastní Claude; tento balík je nemění.
