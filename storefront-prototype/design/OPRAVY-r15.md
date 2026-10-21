# OPRAVY r15 – kompletní mobilní QA
1. Intro: „Kozmetika na mieru“ (rotující kategorie) je šedý – barva #313C2B, kontrast ≥ 4.5:1. Tlačítko pauzy vlevo dole je bledé/šedé – stejný styl jako tlačítko zvuku vpravo.
2. Projdi VŠECHNY stránky webu (každý odkaz z menu a patičky, produkt, košík, pokladna, účet, přihlášení, právní stránky, 404) na 360/390/430 px, DPR 3, Android UA. U každé: žádné vodorovné přetékání, žádný překrytý/useknutý text, obrázky nejsou prázdné, tlačítka ≥ 44 px, menu se vejde na jeden displej. Najdeš-li chybu, oprav ji.
3. Ověř znovu body 3–8 z OPRAVY-r12 (karty obchodu, Zdravý svet nadpis, astrologie čáry, Kozmetika cena, patička stacionár) – screenshot každého.
4. Výkon mobilu: Lighthouse mobile na úvod a /eshop, cíl Performance ≥ 80; oprav největší brzdy (velikost obrázků, lazy-load, preload fontů).
Pravidla jako r13 (texty 1:1, commit jen svých souborů, žádný push, NIKDY git checkout/reset/stash/clean). Screenshoty r15-*.png do ~/.claude/jobs/8ebf6c40/tmp, výsledek OPRAVY-r15-HOTOVO.md s tabulkou stránka × šířka × stav.
