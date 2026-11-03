# Nezávislý audit admin UI — Codex B, 2026-11-02

Stav: VERIFIED (audit), opravy čekají na Codex A.
Větev: `codex/admin-audit-b`, výchozí commit `afcd291`.
Rozpracované změny větve A nejsou součástí tohoto auditu.

## Provedené ověření

- Lokální server `node anastasia-admin/serve.mjs 4187` a Chrome/Playwright.
- `node /private/tmp/codex-admin-audit-b.mjs`: 34 stavů při 1440 × 936 a 390 × 936; kategorie, zákazníci a přístupy, obsah bez newsletteru, ambasadoři, všech devět záložek nastavení.
- Výchozí syntetická API data převzata z `anastasia-admin/test/browser-reference.mjs`; API požadavky zachyceny a vyřízeny lokálně v prohlížeči. Externí požadavky blokované, žádné reálné backendové změny.
- 34/34 stavů bez JS výjimky a bez viditelné `.err`; 33/34 bez horizontálního přetečení dokumentu. Překlady při 390 px mají dokument široký 465 px.
- `node /private/tmp/codex-admin-audit-scroll.mjs`: 2/2 akcí v tabulkách kategorií/zákazníků dosažitelných po vodorovném posunu. Tyto akce nejsou ztracené.
- Snímky a JSON: `/private/tmp/codex-admin-audit-b/`. Vizuálně prohlédnuto pět snímků: `obsah-4-390`, `kategorie-0-390`, `nastavenia-0-1440`, `nastavenia-4-1440`, `obsah-3-1440`. Zbytek kontrolován přes DOM, nikoli vizuálně.

## Konkrétní nálezy

1. **P1 — Překlady přetékají a akce jsou nečitelné.** Route `#/obsah/4`, `app.mjs` funkce `vTranslationsManager`, `.tbl-wrap > .tbl`, `[data-edit-trans]`. Na mobilu 390 px je pravý okraj tlačítka 445 px a jeho šířka pouze 39 px; „Upraviť preklad“ se zalomí po písmenech. Tabulka není v obvyklém `.ot-wrap` a nemá jeho lokální scrollování. Nejmenší oprava: sjednotit wrapper a styly tabulky s ostatními seznamy, nastavit čitelnou minimální šířku buněk a nezalamovat text akce po jednotlivých písmenech. Poté ověřit nulový overflow dokumentu a dostupnost tlačítka lokálním posunem.

2. **P2 — Názvy kategorií se lámou uprostřed krátkých slov.** Route `#/kategorie`, `.ot.lv-compact .lv-title`, `vCategories`. Snímek 390 px ukazuje „Kozm / etika“ a „Darče / kové / vouch / ery“. Wrapper má 360 px a obsah 697 px; scrollování funguje, takže problém je malá šířka titulkového sloupce. Nejmenší oprava: minimální šířka názvu a zalamování na mezerách, přičemž vodorovné scrollování zůstane uvnitř tabulky.

3. **P2 — Menší formuláře zůstávají přes celou pracovní šířku.** `#/nastavenia/0` (`vAppearance`) a `#/nastavenia/4` (pozvání správce). Karty mají při viewportu 1440 px šířku 1160 px od x=260. To neodpovídá požadavku na úzké vycentrované formuláře. Nejmenší oprava: omezit šířku pouze formulářových karet a vycentrovat je; plošně nezužovat datové tabulky. Vzhled i pozvánka ověřeny snímkem.

## Limity

Neověřeno proti skutečnému backendu ani datům; prázdné fixture seznamy neprokazují správnost naplněných médií, ambasadorů, dopravy a uživatelů. Fonty ze sítě byly blokované, screenshoty používají lokálně dostupné fallbacky. Neproběhl test ukládání, mazání ani celkový audit přístupnosti. Backendový TypeScript a unit suite nespouštěny: audit nemění backend ani produktový kód. Implementační opravy patří Codexu A, poté je nutné opakovat cílené UI kontroly.


## Následná implementace ve větvi B

Na přímý pokyn Luckyho převzal opravy Codex B. Překlady používají vlastní tabulkovou třídu uvnitř lokálně posuvného `.ot-wrap`; tím se vyhnou mobilní transformaci `.ot` na blokové karty. Tabulka má minimální šířku 680 px a nezalamované akce. Kategorie mají cílenou minimální šířku názvu 160 px. Vzhled a pozvánka správce mají samostatnou třídu `compact-form`, maximálně 800 px a automatické boční okraje. Datové seznamy zůstávají široké.

Ověření: `node --check anastasia-admin/app.mjs`, `git diff --check`, `node /private/tmp/codex-admin-fix-check.mjs` — 28/28 PASS při 320, 390 a 1440 px: žádné přetékání dokumentu, skutečné tabulkové řádky na mobilu, čitelná akce, filtrování, otevření editoru překladů, šířka názvu kategorie a vycentrování obou formulářů. Vizuálně překontrolován opravený mobilní seznam překladů a kategorií. Skripty a screenshoty jsou dočasné lokální artefakty. Backend a produkce beze změn; výše uvedené limity syntetických dat platí dál.

Opakovaný plný průchod `node /private/tmp/codex-admin-audit-b.mjs`: 34/34 stavů bez přetečení dokumentu a viditelné chyby, 0 JS výjimek. Akce mimo počáteční výřez zůstávají uvnitř lokálně posuvných tabulek; cílený test ověřil otevření překladového editoru kliknutím na takovou akci.


## Oprava dashboardu podle screenshotu Luckyho

Příčina: desktopový `.dash` měl implicitní grid řádek odvozený z obsahu. Vnitřní `.dash-main` tak měřil 639,5 px i při přidělené výšce rodiče jen 467,5–567,5 px a překrýval bannery. Doplněn `grid-template-rows:minmax(0,1fr)` pro existující desktopový režim; notifikace dostaly omezení minimální výšky a vlastní scroll. Tlačítko `.dash-table .dots-btn` nyní respektuje šířku své buňky; původní pevná šířka 32 px způsobovala přetečení tabulky až o 19 px.

`node /private/tmp/codex-dashboard-check.mjs`: 19/19 PASS na 1896×860 (rozměr obsahu screenshotu), 1440×812, 1280×760, 1024×768 a 390×844. Kontroly: bannery nepřekrývají hlavní ani boční obsah, tabulka nemá vodorovné přetečení, poslední objednávka je dosažitelná, desktop nemá přetečení výšky dokumentu, žádné JS výjimky. Menší desktop používá lokální vertikální scroll seznamů. `git diff --check` PASS. Snímky `/private/tmp/codex-admin-audit-b/dashboard-*.png`; vizuálně prohlédnut opravený 1896px desktop. Lokální syntetická data, externí síť blokovaná, nenasazeno.


## Kompaktní rozložení podle screenshotů 11:24–11:32

- Produkt: kategorie a prodej/doručení jsou samostatné plné řádky, takže nižší panel nenechává prázdnou půlku před variantami. Mobilní hero i sekce mají jeden sloupec; editor popisu má minimální výšku 180 px.
- Kategorie a zákazníci: pevné proporce hlavičkových sloupců, čitelný prostor pro jméno i dlouhý e-mail, lokální vodorovný posun na mobilu. Testováno na dlouhých syntetických identitách.
- Poukazy: agenda max. 1040 px uprostřed, jednotlivé karty max. 320 px; refundace ve dvou vyvážených sloupcích, na mobilu jeden sloupec. Backendová refundace beze změny.
- Média: karta max. 1200 px a pravidelná mřížka s minimální šířkou položky 240 px, stejné rozestupy akcí.
- Texty: editor max. 1120 px; externí živý náhled je volitelný rozbalovací panel s odkazem na samostatné okno. Vlastní textový náhled a editace zůstávají. Neprohlašujeme opravu příčiny šedého vzdáleného iframe: jeho obsah není součástí lokálního testu.
- Typografie: administrátorské nadpisy sjednoceny na Figtree; importované zabezpečení používá stejné nadpisy 17 px a centrovanou agendu max. 1040 px. Ověření 2FA/role se v tomto kroku neměnilo.

Ověření: `node /private/tmp/codex-compact-ui-check.mjs` — 48/48 PASS na 1896/1280/390 px (7 obrazovek, včetně editoru obsahu, naplněných médií, poukazů a dlouhých jmen). `node /private/tmp/codex-compact-preview-check.mjs` — 6/6 PASS: panel startuje zavřený, lze otevřít/zavřít a nabízí samostatný odkaz; vzdálený obsah iframe neověřen. `node --check` pro app.mjs, content.mjs, security.mjs a `git diff --check` PASS. Vizuálně kontrolovány snímky zákazníků, poukazů a celého produktu; důkazy `/private/tmp/codex-compact-ui/`. Data jsou syntetická a nebyly volány produkční služby.

Newsletter a jeho schválený vzhled jsou samostatný otevřený požadavek: dva starší obrazové návrhy nalezeny v `Desktop/Zastupce/Downloads/images/`; čeká se na identifikaci správné reference. Tento commit newsletter nemění. Účetnictví a kupóny byly předány koordinátorovi A; tento commit je neimplementuje.


## Integrace a načtení newsletterového konceptu

Do vlastní větve B sloučen master `797e2b1` (objednávky/kupóny/QR od A), merge `32e6ddc`. Zachovány oba rozsahy. Opakované cílené UI kontroly společného výsledku: 48/48 PASS.

Newsletter při prvním načtení nyní otevře nejnovější uložený koncept podle updated_at/created_at; nový prázdný dopis vzniká explicitním tlačítkem Nová kampaň. S uloženou grafikou, logem ani obsahem se v této opravě nemanipuluje. `node /private/tmp/codex-newsletter-draft-check.mjs`: 6/6 PASS pro výběr nejnovějšího konceptu z více záznamů, zachování textu, explicitní nový koncept, otevření starší kampaně klávesnicí a nepřítomnost JS výjimek. První pokus kontroloval HTML textarea i u kampaně, kterou existující parser otevírá jako formulář; ověřovací selektor byl opraven podle skutečného režimu. Toto není dokončení požadavku na správný design newsletteru.


## Objednávky — urgentní oprava a nasazení 2026-11-02

Na přímý pokyn Luckyho „hned to poslete na worker“ opraveny checkboxy objednávek. Původní pravidlo kartového layoutu `position:absolute;right:16px` přetrvávalo i při tabulkovém zobrazení. Cílený override vrací buňce výběru statickou pozici a tabulkové chování, odstraňuje kartový pseudo-popisek v hlavičce a skládá akce do lokálně zalamovaného flex řádku. Commit `daf96a6`, výchozí společný základ obsahuje master `3f4db30`.

`node /private/tmp/orders-checkbox-check.mjs`: 16/16 PASS na 1896/1440/390 px; checkbox uvnitř první buňky, správná hlavička, žádný overflow dokumentu, označení/odznačení celé stránky, bez JS výjimek. Vizuálně zkontrolován desktopový snímek. `git diff --check` PASS.

Nasazen pouze worker `anastasia-test-admin`, žádný backend ani produkce. Finální build používá koordinátorem potvrzené API i media `https://anastasia-api.medusajs.app`; web `https://anastasia-test.l-code-dynamics.com`. Příkaz `wrangler deploy --config ops/test-predani/admin.wrangler.jsonc`, finální verze `4b132c5e-c912-4394-865d-7b4f9bd17c51`. První upload proběhl před obdržením upřesnění aktuálního API, proto byl build zopakován s potvrzenou konfigurací a znovu nasazen.

Skutečný otevřený Chrome tab objednávek obnoven a přes DOM ověřeno: API `https://anastasia-api.medusajs.app`, 6 řádků, všechny checkboxy v první buňce, pseudo-popisek `none`. Žádná zákaznická data nebyla vypisována. `bash ops/test-predani/deploy.sh --smoke`: `SMOKE_OK`.
