# Úpravy vlastního adminu – 19. 10. 2026

IMPLEMENTED / VERIFIED lokálním Chrome. Produkty mají společný editor bez záložek: údaje, ceny, popis, fotografie, kategorie, doprava, kanály a sklad. Výběr kategorií je rozbalovací, více přiřazení zůstává zachováno. Správa kategorií je v hlavním menu, obsahuje vytvoření, úpravu, přesun v hierarchii a potvrzené odstranění. Kategorie s potomky nelze odstranit; produkty se nemažou. Neúspěšný zápis zůstává viditelný a lze jej opravit.

Detail objednávky má užší hlavní kartu a průběžnou nápovědu podle otevřené záložky. Pod 1100 px se nápověda přesune pod obsah. Nadpisy záložek a přepínače jsou tučné. Základní cena nadále jde pouze přes auditované `/admin/shop-prices`, nikoli přes přepis celého cenového setu.

Ověření: 83/83 browser kontrol s původními lokálními objednávkami před vyčištěním, 47/47 na čisté DB včetně vytvoření dočasné rodičovské/podřízené kategorie, zákazu smazání rodiče, odmítnutí potomka jako rodiče, zrušení potvrzení a skutečného odstranění obou testovacích kategorií. Testovací kategorie po testu nezůstávají. Šířky 320, 390, 800, 1280 a 1920 px; předchozí regresní kontrola přetékání 55/55. Skutečný katalog 293/293 read-back; 33/33 browser. Build, syntaxe, mapa adminu a `git diff --check` PASS. Plné backend/PG běhy pouze CI.

Opakovatelný UI smoke: `ADMIN_TEST_PASSWORD=… node anastasia-admin/test/browser-editor.mjs` proti lokálnímu adminu. Heslo není v kódu ani výstupu; pro jiné umístění Playwrightu nastavte `PLAYWRIGHT_MODULE`. Test nepřepisuje produkty, neprovádí platby a nevytváří objednávky.

Lokální mock data byla oddělena bez smazání původní DB: nová `anastasia_catalog_local_20261019` má 30 skutečných produktů a 11 kategorií. Původní `anastasia_launch_e2e` i snapshot zůstávají zálohou. Zachováno přihlášení správce, preference, dostupnost a veřejný klíč webu. Žádné zákaznické/objednávkové testovací záznamy se nepřenášely. Externí e-mailový provider je v procesu nového lokálního backendu vypnutý; zákaznická historie a přístupy jsou samostatný navazující import, nikoli hotový výsledek tohoto UI balíku. Žádná produkce, nasazení ani merge.

Na další pokyn je dostupnost místo vysokých týdenních sloupců kompaktní seznam sedmi denních řádků. Úseky jsou vedle sebe, tlačítko odebrání má 44 px a na mobilu se obsah zalomí. Regrese po změně 55/55 PASS.

Po importu skutečné historie se v objednávkách zobrazují původní čísla, data a stavy. Archivy nemají tlačítka pro novou platbu, refundaci, odeslání ani zrušení; nejsou započtené mezi objednávky čekající na vybavení. Chrome kontrola po importu 88/88 PASS.
