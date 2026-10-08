# ANASTASIA — administračné demo

Statická ukážka administračného rozhrania určená na prezentáciu správy e-shopu. Nejde o produkčný systém ani o napojenie na skutočný obchod.

## Testovacie dáta a ukladanie

- Všetky predvyplnené osoby, objednávky, ceny, produkty, kupóny, členstvá, recenzie, leady, texty a ďalšie záznamy sú vymyslené pre demo.
- Testovacie e-maily používajú rezervovanú doménu `.invalid`. Platby, e-maily, zásielky, prístup k obsahu, provízie ani formuláre sa externe nevykonávajú.
- Záznamy a nastavenia sa ukladajú do spoločnej Cloudflare D1 databázy cez `/api/state`; produktové fotografie sa ukladajú do Cloudflare R2 cez `/api/media`. Zmeny sú spoločné medzi návštevníkmi a zariadeniami.
- Editor produktu používa samostatné záložky Hlavné údaje, Ceník, Sklad, Logistika, Kategórie, Parametre a Pokročilé. Obsahuje názov a krátky/dlhý popis v SK/EN/RU, galériu fotografií, bežnú/akciovú cenu, SKU, EAN, kategóriu, typ produktu, sklad, dostupnosť, DPH, hmotnosť, značku, publikovanie, varianty, štítky a SEO údaje. Fotografie JPG, PNG, WebP a GIF (max. 5 MB každá, najviac 6) sa ukladajú do Cloudflare R2; údaje produktu do D1.
- Katalóg možno filtrovať podľa názvu/kódu, kategórie a stavu. Formulár kontroluje cenu, akciovú cenu a jedinečnosť vyplneného SKU.
- Detail objednávky obsahuje kontakt klientky, fakturačné údaje a stav faktúry, položku a cenový súhrn, platbu, dopravu, sledovanie a poznámku. Faktúru možno otvoriť v tlačovom náhľade označenom DEMO.
- Nastavenia obsahujú adresy odosielateľa a editovateľné šablóny potvrdenia objednávky a odoslania. E-mailový náhľad je lokálny; v deme sa správy neodosielajú.
- Pri úpravách objednávok, členstiev, recenzií a konzultácií možno klientky a produkty vybrať zo zoznamu existujúcich záznamov.
- Percentá zliav úrovní Bronze/Silver/Gold/VIP sa nastavujú vo vernostnom programe a okamžite sa premietajú do profilu klientky.
- Detail objednávky spravuje testovaciu dopravu, adresu, sledovacie číslo a internú poznámku; tieto fiktívne hodnoty sa doplnia aj k už uloženým demo objednávkam.
- D1 databáza: `anastasia-admin-demo-db`. Zálohu možno exportovať alebo importovať ako JSON.
- Dostupné jazyky rozhrania: slovenčina, angličtina a ruština.

## Funkcie

- Navigácia v štýle Shoptet: hlavné sekcie zostávajú vľavo, kliknutím sa pod nimi zobrazia príslušné podsekcie. Produkty a objednávky majú vlastné sekcie. V prehľade objednávok záložky nad zoznamom filtrujú objednávky podľa stavu, podobne ako v Shoptete. Vernostný program patrí ku Klientkam; výber sekcie sa ukladá do D1.

Navigácia a správa záznamov cez formuláre fungujú v kategóriách produktov, produktov a cien, objednávok, klientov, členstiev, médií, obsahu a stránok, projektov, leadov, ambasádorov, vernostného programu, kupónov, dopravy, platieb, programov, newslettera, recenzií, konzultácií a dopytov. Záznamy možno pridávať, upravovať a mazať. Nastavenia, jazyk a vernostné pravidlá sa ukladajú do D1.

Médiá sú len fiktívne karty metadát, nie skutočné súbory. Funkcie, ktoré by v produkcii vyžadovali platobnú bránu, e-mail, kuriéra alebo chránený obsah, sú v tomto deme vizuálne ukážky bez externých účinkov.

## Súbory a nasadenie

- `index.html` obsahuje rozhranie, testovacie záznamy a JavaScript.
- `styles.css` obsahuje dizajnový systém.
- Verejné demo: [anastasia-admin-demo.hlancaric.workers.dev](https://anastasia-admin-demo.hlancaric.workers.dev/)
- Worker je verejná statická ukážka bez prihlásenia. Nezadávať do nej skutočné osobné údaje.
- Nasadenie cez `wrangler deploy` z adresára projektu; predtým aktualizovať `public/index.html` z hlavného `index.html`.
