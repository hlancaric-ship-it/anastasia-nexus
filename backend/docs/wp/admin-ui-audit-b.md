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
