# Navázání na Claude: Shoptet předloha

Zdroj: existující 163řádkový zápis `~/.claude/jobs/e1f31169/tmp/shoptet-zapis.md`, včetně závěrečné tabulky rozdílů. Pročten celý zápis, nejde o novou živou prohlídku 180 sekcí. Vizuální předloha neurčuje rozhraní API ani obchodní procesy Anastasie.

## Implementované kroky

- Objednávky/Produkty/Zákazníci/sdílené listView: společná karta, hlavička, řazení a patička. Starší opravy kódů, souběhu hledání a rozložení jsou již na testu.
- Detail objednávky: šipky v aktuálním filtrovaném pořadí, kopírování čísla/e-mailu/adres, ochrana rozepsaného formuláře při lokální navigaci. Tisk, faktura, zrušení a další existující workflow zůstávají funkční.
- Konzultace/Zprávy: společná tabulka, stavové záložky a filtr, serverové stránkování po 25. Řazení všech serverových výsledků nepředstíráme tříděním jedné stránky.
- Ambasadoři/Média: společná tabulka, hledání a řazení kompletní kolekce, stránkování po 25. Existující nastavení a akce zachovány.

## Zbývající rozdíly a hranice

- Závěrečný zápis předlohy navrhuje také změnu stavu objednávky přímo v řádku, kompletní detail s historií/doklady/zásilkami, nové podsekce sklad/logistika/značky, jednotný CSV import/export a samostatné statistiky. Tyto funkce nejsou touto opravou implementované. Vyžadují ověření dostupných kontraktů, přístupových práv a stavových přechodů, zejména dopadů na platby a sklad. Stav objednávky nelze bezpečně přidat jako prostý editovatelný select podle screenshotu.
- Navigace nastavení má existující drobečky; úplný čtyřúrovňový strom předlohy není dokončen.
- Automatický překladač EN/RU: v kódu nenalezená zapojená překladová služba. Uživatel dostal otázku na poskytovatele; API klíč patří na server. Ruční jazykové varianty existují. Žádný nový backend překladače nebyl implementován.
- Kompletní shoda všech 180 sekcí ani dokončení celého backlogu se netvrdí.

## Ověření

Syntetické browser testy běží proti lokálnímu adminu, blokují externí provoz a nevyžadují skutečné přihlášení. Výsledky a rozsah jednotlivých změn obsahují `admin-order-navigation.md` a následný zápis zbývajících seznamů. Při předání je třeba uvést konečný stav nasazení a samostatně případné chyby TypeScriptu/backendu.
