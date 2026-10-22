# Skutečná historie ve vyčištěném lokálním prostředí

19. 10. 2026. VERIFIED pro import dat; přenos a otevření chráněného obsahu je PARTIAL.

Na výslovný pokyn Luckyho se skutečná data přenášejí pouze do izolované lokální `anastasia_catalog_local_20261019`. Původní DB ani záloha nejsou smazány. Importér nově dovoluje vedle původní `anastasia_dev_wave1` právě tuto druhou jmenovanou DB; vzdálené hosty, libovolné jiné DB, URL přesměrování a produkční režim nadále odmítá. Transakční kontrola skutečné DB musí odpovídat ověřenému URL, advisory lock zůstává zachován.

`--skip-password-drafts` přeskočí i tvorbu návrhů heslových kampaní a tokenů; výchozí chování starého importéru zůstává. Import neposílá e-maily. Při lokální operaci je externí e-mailový provider v procesu backendu i importu explicitně vypnutý; žádné newslettery, resetovací odkazy, pozvánky ani platby se nevolají. Webhook pro NEXUS v importním procesu je vypnutý. CLI inicializuje bez subscriber entry points.

Čerstvý export původního `DB.sql`: 28 zákaznických řádků odpovídá 17 sjednoceným zákaznicím, 12 adres, 10 dokončených objednávek, 31 řádků objednávek, celkem 372,00 EUR a 18 explicitních přístupů. 48 rozpracovaných košíků se nepředstírá jako hotové objednávky. Dry-run, apply i opakovaný apply provedeny. Read-back v obou apply shodný se zdrojem, druhý běh nepřidal zákaznice, adresy, objednávky ani přístupy. Nezávislý SQL count: 17 zákaznic / 10 objednávek / 18 aktivních oprávnění s existujícím vlastníkem a produktem; 0 notifikací. Žádná PII, vstupní JSON, tokeny ani data nejsou v Gitu.

38/38 syntetických unit testů importéru PASS; TypeScript a plné backend/PG regrese se hlásí odděleně dle výsledků CI. Nativní import je datová operace, není souběžný PG test runner.

Aktuální `medusa exec` nepředává přepínače za `--` do `ExecArgs.args`; lokální operace proto používá soukromý wrapper volající stejný veřejný adapter s explicitními argumenty. Adapter, jeho DB guard, dry-run, lock i reconciliation se neobcházejí. Privátní wrapper je mimo Git, nesmí se přidávat do distribuované aplikace.

## Zbývající ověření přístupů

Zákaznice jsou importované bez starých hesel; existující magic-link provider po ověření e-mailu propojuje již existující Customer, nevytváří nový duplicitní účet. Na skutečné adresy se v této operaci nic neposílalo.

18 oprávnění není důkaz otevření lekce. Aktuální webová knihovna má zástupné týdny a tlačítko „Obsah lekcie sa pripravuje.“; původní tři chráněné sekce (`vyuka-vedomeho-vnimania`, `nic-nemusis`, `reset-40-plus`) zatím nejsou převedené do nové chráněné distribuce. Je nutné převést obsah a ověřit oprávnění pro každý konkrétní produkt včetně odmítnutí cizího/neplatného přístupu. Tento bod se nesmí označit za hotový na základě samotného countu oprávnění. Programátorův úplný ZIP v Documents dosud není dostupný jako lokální soubor; ověřovat znovu po jeho skutečném stažení.

Žádné nasazení, merge ani produkční změny.
