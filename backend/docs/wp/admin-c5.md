# C5: vlastní správa obchodu

Stav: VERIFIED pro níže popsané základní demonstrační cesty šesti agend. Nejde o kompletní admin ani kompletní rozsah všech agend.

## Rozsah

Nová stránka `/sprava-obchodu` má přehled se šesti klikacími kartami a záložky Produkty, Ceny, Kategórie, Kupóny, Objednávky, Zákazníčky. Seznamy mají hledání, stránkování po 12, načítání, prázdný stav, chybu a opakované čtení. Dialog ponechává ovládání přístupné i při malé výšce, obsah lze rolovat při zoomu/mobilu. Osobní motiv je načten z `/admin/my-theme`; všechna nová pole používají stejné tokeny včetně autofillu a nočního režimu.

Produkty: vytvořit koncept s jednou variantou, bezpečnou cenou, kategoriemi, výslovným prodejním kanálem/profilem dopravy a sledováním skladu; text, stav a kategorie upravovat bez přepisu variant/metadata. Žádné automatické booking nastavení. Zveřejnění neobchází serverové skladové/checkout kontroly.

Kategorie: vytvoření/úprava názvu, popisu, viditelnosti a rodiče přes Medusa API. Kupóny: pouze standardní nepodmíněné procentuální kupóny na položky, 0 < sleva <= 100 %, limit a aktivace. Složité kupóny jsou pouze vysvětlené, jejich pravidla se nemění. Zákaznice: vytvoření/úprava běžného profilu; nejde o nastavení hesla nebo zápis přístupových práv. Objednávka: skutečný detail s položkami, serverovou částkou a stavy; změna kontaktního e-mailu/interní poznámky zachovává ostatní metadata, nikdy nemění platbu.

## Bezpečnost cen a zápisů

`POST /admin/shop-prices/:id` vyžaduje admina a přesné tělo `{price_id, amount, expected_amount}`. Částky konečné, nezáporné, max. 999999999.99 a dvě desetinná místa. Pod nativním lockem cenové sady znovu načte ceny i skutečnou vazbu na price_list a pravidla. Povoluje pouze jednu nepodmíněnou základní EUR cenu, odmítá více měn, quantity/rule ceny a zastaralou částku. Nativní updatePriceSets nahrazuje základní ceny; price-list řádky jsou z něj vyloučené. Proto endpoint nesmí slepě zkopírovat ceny z browser response. Po změně read-back a audit. NEXUS/checkout zůstává jediná autorita pro konečné/osobní ceny.

Před běžnou editací je záznam znovu načten; tato kontrola zjistí dřívější změny, není atomickým verzovacím lockem proti všem nativním editorům. Stejně tak lock cenové sady koordinuje tento endpoint, nikoli libovolné jiné přímé zápisy. Audit používá existující best-effort mechanismus. Po nejasné síťové odpovědi/5xx se zápis automaticky neopakuje; formulář ponechá hodnoty a vyžádá nové čtení. Vytváření přes native API nemá přidaný idempotency key; po nejistém výsledku je nutná kontrola seznamu.

## Ověření a limity

Lokálně fokus unit 43/43 PASS, backend/admin TypeScript PASS. Testy ověřují skutečná schémata nainstalované Medusy 2.19.0, ne vymyšlený kontrakt. Samostatný Linux browser fixture kontroluje skutečnou React obrazovku s umělým HTTP transportem při přesných 1440/390 px. CI-only admin-c5.spec má oddělenou syntetickou PostgreSQL a skutečnou Medusu, provádí vytvoření/úpravy a kontroluje zachování osobního ceníku. Plná regrese jen na CI, žádné lokální PG/HTTP běhy, žádný merge/deploy.

Mimo tento balík: vizuální CMS a správa všech webů, komplet sklad/fulfillment, refundace, osobní tier ceníky a jejich zobrazení stará/nová cena/%, klientské přístupy, galerie/variantový editor a rozšířené funkce [mapy agend](ADMIN-FUNKCE-A-POKRYTI.md). Nic z toho není označené hotové pouze existencí těchto základních formulářů. Další pořadí dle Claude: audit čtyř větví, Klub přes jedno jádro, překlady.

## Finální CI důkaz

[Důkaz](evidence/admin-c5-ci.json), [cílená CI](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38964116296): unit43/43, browser38/38 při přesných1440/390px, skutečná Medusa/PostgreSQL1/1, oba TypeScript checky PASS. [Plná regrese](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38964116531): backend739/739, NEXUS1230/1230, workerd139/139, HTTP151/151 PASS. Snímky obou velikostí vizuálně zkontrolované. Rozsah neznamená kompletní hotový admin.
