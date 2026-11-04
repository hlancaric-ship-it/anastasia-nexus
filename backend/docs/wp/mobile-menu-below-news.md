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
