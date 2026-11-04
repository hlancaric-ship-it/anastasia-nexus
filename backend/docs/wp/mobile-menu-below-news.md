# Mobilní menu pod Novinkami

Stav: VERIFIED, 4. 11. 2026.

- Ouško Menu se umístí 12 px pod skutečný spodní okraj ouška Novinky.
  Poloha reaguje na změnu velikosti písma a otočení telefonu.
- Na nízkém displeji se obě ouška posunou výš, aby je nepřekrývalo
  zvukové ovládání. Bez panelu Novinky zůstává Menu samostatně dostupné.
- Otevřený panel má vlastní svislé rolování a nezmenšuje text pomocí zoomu.
  Novinky během otevření menu nepřekrývají obsah. Zavření a návrat fokusu
  používají stávající ovládání.

Ověření: Chrome 320×568, 390×844, 844×390, 800×1000 a desktop 1440×900;
otevření/zavření, umístění oušek, rozměry panelu, absence vodorovného
přetékání a automatického zmenšení textu. Ověřeno i otočení 390×844 →
844×390. Kontrola proběhla lokálně a na nasazeném webu; API obsah Novinek
byl v browser kontrole syntetický, nedocházelo k zápisům na Medusu.

Navigační testy `node --test storefront-prototype/test/navigation.test.mjs`:
2/2 PASS. Syntaxe obou změněných modulů, kontrola veřejných médií,
`git diff --check` a Wrangler dry-run: PASS.

Nasazené čtyři runtime assety na Worker `anastasia-test-web`, verze
`9dca6f24-c4d5-4a02-b8ba-ab4d4dc05c7f`. Předchozí nasazený `app.mjs`
odpovídal výchozímu commitu. Backend, admin a cenová služba se nenasazovaly.

## Zarovnání nadpisů sloupců

Navazující úprava 4. 11.: Kontakt používal jiné odsazení než ostatní tři sekce
a nadpis Obchod je odkaz s animovaným textem, zatímco ostatní nadpisy jsou
textové elementy. Všechny čtyři mobilní sekce nyní sdílejí odsazení, prostor
pro nadpis a výšku řádku; animovaný obal Obchodu je zarovnaný shora.
Obě dvojice nadpisů tak mají shodnou výšku viditelného textu.

Chrome kontrola šířek 320, 390, 430 a 800 px: shodné souřadnice textu,
horní i spodní okraje nadpisů, bez vodorovného přetékání. Desktop 1440 px
zůstává mimo mobilní pravidla. Navigace 2/2 PASS. Nasazeny pouze dva CSS
assety na `anastasia-test-web`, verze `de8d998f-4e15-42c4-8375-cd791b3469c7`.

## Logo jako návrat na úvod

Znak i název značky v otevřeném menu jsou jeden nativní odkaz na `/`
s popiskem `ANASTASIA OZ — domov` a stávajícím `data-menu-close`.
Původní obal značky zůstává zachovaný, takže umístění přihlášení a jazyků
v mobilním menu není změněno. Vložení odkazu kontroluje existujícího předka
`a`, aby nevytvářelo vnořené nebo duplicitní odkazy.

Chrome: 390 px klik na znak, 390 px klik na celý odkaz a 800 px klik na
odkaz – 3/3 návraty na úvod PASS, menu po navigaci zavřené. Navigace 2/2
PASS, syntaxe `app.mjs` a `git diff --check` PASS. Nasazen jediný asset
`app.mjs` na testovací web, verze `f36edc39-629f-46bf-8a75-3cd88095ee64`.
