# Skutečný katalog a detail digitálních produktů

Stav: IMPLEMENTED; lokální ověření níže. Větev `codex/live-menu` navazuje na skutečný náhled `c6c8d8c`, aby neztratila již připravené galerie a původní autorské texty. Bez změny cenového jádra, plateb, entitlement modulu či závislostí. Bez nasazení a sloučení.

## Změny

- Detail Výuky vedomého vnímania odpovídá schválenému Figma Page 2, uzel `223:4816`: galerie, titul s citací, kompaktní nákupní řádek, původní ikony a botanické pozadí, čtyři tematické karty a pět rozbalovacích částí. Hlavička je podle dalšího pokynu uživatele nižší (64 px desktop, 60 px mobil).
- Všechny digitální produkty sdílejí zarovnané ovládání množství a nákupu. Témata Nič nemusíš a RESET 40+ pocházejí ze skutečného popisu (6 a 16 témat); veřejné Audio 0 není vydáváno za placenou lekci. Úplný původní popis zůstává dostupný i při zkráceném úvodu.
- Oba typy menu mají společný zdroj: Kozmetika, Bylinky a výživa, Programy a služby. Samostatné vstupy pro konzultace, zdravou lékárnu a denní stacionář; odstraněné duplicitní a neexistující nabídky. Výpadek chatu nezablokuje inicializaci menu.
- Konfigurovaný build čte skutečný veřejný katalog Medusy. Zobrazené ceny přebírá výhradně ze serveru; chybu API nenahrazuje mock katalogem. Zachovává celé popisy a původní produktové fotografie. Explicitní offline režim pro stávající testy zůstává oddělený.
- Veřejné rasterové obrázky backendu obsluhuje lokální read-only route `/backend-media/static/…`; CSP zůstává `img-src self`. Pevný upstream, omezení cest, přípon, typu, velikosti a času, žádné přeposílání přihlašovacích údajů. Pro budoucí Cloudflare nasazení je nutné zajistit odpovídající veřejnou mediální cestu; tento balík nic nenasazuje.

## Lokální katalog

Na výslovný pokyn uživatele porovnáno s veřejným aktuálním starým obchodem: 14 produktů, kategorie 5 / 2 / 7. V izolované lokální databázi `anastasia_catalog_local_20261019` publikováno těchto 14 původních produktů, dalších 16 archivních produktů zůstává draft. Původní produkty se nemažou. Známý syntetický testovací produkt není publikovaný.

Přiřazeny tři sjednocené kategorie při zachování původních vazeb kvůli historii a existujícím pravidlům. Ceny, obrázky, popisy, zákazník, objednávky a přístupy se touto operací nepřepisovaly. Dry-run předcházel apply; opakování měnilo 0 záznamů. Soukromá záloha původních stavů a kategorií je pouze v ignorovaném `backend/data-private/menu-catalog/before.json`.

Lokálně běží backend :9100, storefront :4174 a vlastní admin :4178. Externí odesílání e-mailů vypnuté; počet notifikací ověřen 0. Žádná zákazníková data ani přístupy nejsou součástí tohoto dokumentu či commitu.

## Ověření

- `node --test storefront-prototype/test/*.test.mjs`: 37/37 PASS.
- `node storefront-prototype/test/browser-menu.mjs`: 532/532 PASS, pět šířek, oba typy menu, přihlášení, klávesnice, výpadek API a bez přetékání.
- `node storefront-prototype/test/browser-real-catalog.mjs`: skutečné API, všech 14 názvů/cen/fotek/úplných popisů, 6/16 témat, pět šířek detailu, ovládání množství, rozbalování, geometrie schváleného návrhu a omezení mediálního proxy. 174/174 PASS, včetně mobilní kontroly všech 14 produktů.
- Nezávislé read-only porovnání se starým veřejným obchodem: 42/42 PASS (14 názvů, 14 cen, 14 shodných SHA-256 fotografií).
- `git diff --check`: PASS. Přidán samostatný CI workflow pro offline build a prezentační kontrakty. Plné backend/PG regrese pouze v GitHub Actions.

## Hranice ověření

Schválená galerie VVV obsahuje graficky vložené označení ukázky. Není dodán skutečný soubor video/audio ukázky; ověřeno je přepínání náhledů, nikoli přehrání neexistujícího média. Tento balík také nepotvrzuje doručení soukromého placeného obsahu přes R2 ani kompletní migrační připravenost. R2 zůstává samostatná rozpracovaná větev. Produkční nasazení a akceptace klientkou neproběhly.
