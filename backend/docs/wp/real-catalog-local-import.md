# Skutečný katalog v lokálním adminu — 19. 10. 2026

Stav: VERIFIED pro lokální import a níže uvedenou kontrolu rozložení. Žádná produkční migrace nebo nasazení. Backend na :9100 používá lokální PostgreSQL `anastasia_launch_e2e`; admin na :4178.

## Data

Použit existující importér `src/scripts/import-anastasia-catalog.ts` a soukromý katalog z původního SQL exportu. Před zápisem vznikl lokální `pg_dump -Fc` snapshot. Náhled importu skončil bez chyb.

- Importováno 30 produktů s původními názvy, SKU, popisy, EUR cenami včetně DPH, vazbami na kategorie a prodejní kanál.
- 25 produktů zůstalo published, 5 draft podle původní viditelnosti. Import sám nezveřejňuje skryté produkty.
- Vytvořeno 11 kategorií, 3 kolekce značek a 22 skladových záznamů pro fyzické produkty.
- Staženo všech 30 původních produktových obrázků přes veřejné HTTPS; lokálně jsou v ignorovaném `backend/static/legacy-catalog/`. Admin je načítá z lokálního backendu.
- Katalog, mediální podklady a snapshot jsou pouze v ignorovaném `backend/data-private/catalog-import-20261019/`. Žádná zákazníková data ani skutečné kupóny nejsou v commitu. Existující objednávky, zákazník a jejich platby se neimportovaly ani neodstraňovaly.

Ověření: 293/293 kontrol přes nezávislé SQL čtení, autentizované Admin API a HTTP obrázků: názvy, handle, popisy, přesné ceny, URL obrázků, stavy, kategorie, kanál a fyzický sklad. V Admin API nalezeno všech 30 produktů. Opakovaný import bez přepisovacích voleb vytvořil 0 entit: 30 produktů, 11 kategorií, 3 kolekce a 22 skladových záznamů přeskočeno.

Skutečný Chrome nad běžícím adminem: 33/33 kontrol — dohledání všech 30 produktů a kontrola názvu, ceny a načteného obrázku detailu. Screenshoty a strojové výsledky jsou soukromé; ověřovací výstupy mimo sledovaný backend jsou v `backend/data-private/catalog-operation/` vlastního pracovního stromu.

Tento import katalogu není dokončením migrace kupónů, digitálních oprávnění ani nastavení jednotlivých rezervačních služeb.

## Rozložení adminu

Časové úseky dostupnosti používaly neomezenou řádku flex a automatickou šířku nativních časových polí. V úzké denní kartě přetékal ovladač pro odebrání. Řádka se nyní podle prostoru zalomí, pole zachovají čitelnou minimální šířku a tlačítko má plochu nejméně 44 × 44 px. Dlouhý text v kartě se může zalomit. Grid karet a dvousloupcové formuláře respektují dostupnou šířku bez maskování přetečení.

Seznam produktů řadí nejnovější položky první přes nativní parametr `order=-created_at`; skutečně importované produkty jsou tak před staršími testovacími záznamy. Cenové výpočty se nemění. Rychlé akce „Nastaviť poukazy“ a „Vytvoriť kupón“ byly na přímý pokyn přesunuty pod nápovědu v pravém sloupci přehledu; ověřeno ve skutečném Chrome na 390, 1280 a 1920 px (3/3).

Skutečný Chrome: 55/55 případů bez přetečení dokumentu, karet nebo viditelných formulářových polí. Šířky 320, 390, 800, 1280 a 1920 px; deset hlavních obrazovek a dostupnost pro následující týden s časovými poli pro všech sedm dnů a existujícími rezervacemi. Během kontroly se časové úseky neukládaly. Nejde o tvrzení o všech možných detailech a stavech aplikace.

Další kontroly: `node --check anastasia-admin/app.mjs`, produkční statický build s ukázkovými HTTPS originy, kontrola mapy funkcí a `git diff --check` PASS. Finanční, platební a rezervační jádro zůstává beze změny. Plné backendové/PG regresní běhy se lokálně nespouštěly.

Aktivní lokální admin nyní běží z vlastního pracovního stromu `anastasia-nexus-codex-real-catalog`; původní Claudeho zdroje nejsou přepsané. Pracovní strom je ponechán, dokud z něj běží uživatelův náhled. Přebytečný dočasný server :4188 byl zastaven.
