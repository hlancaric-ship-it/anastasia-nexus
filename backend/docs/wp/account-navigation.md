# Globální přihlášení a menu účtu

VERIFIED lokálně 19. 10. 2026. Přihlášení je ve společné hlavičce každé stránky; přihlášené zákaznici odkaz vede do účtu. Neúspěšné načtení chatu už nezastaví inicializaci obou menu, navigace a dalších ovladačů stránky. API chybu uvidí jen chat. Opraveno vykreslování materiálů, které vrací API, bez vymyšlených odkazů na soubory.

Mock adapter pro explicitní ukázkový režim doplněn na současný kontrakt účtu (`ok`, přihlášení, dostupnost rezervací). Skutečný web dál používá HTTP adapter, mock je jen výslovný náhled/test. Browser regrese nastavuje mock pouze ve svém testovacím kontextu; samostatný kontext záměrně přeruší HTTP spojení a ověřuje otevření a zavření obou menu. Staré browser selektory aktualizované na skutečná dvě právní potvrzení, focusovatelný přepínač jazyka, knihovnu vedle Klubu a již existující routu živého detailu produktu.

Ověření: celý `test/browser.mjs` 28/28 skupin PASS; mock, navigace a HTTP-adapter unit testy 42/42 PASS. Dalších 85/85 kontrol skutečného HTTP režimu: pět šířek 320–1920 px × pět hlavních stránek, dostupnost přihlášení, žádné přetékání a obě viditelná menu. Build, syntaxe a diff PASS. CSP beze změny.

Lokální preview `:4173` nyní běží z této vlastní větve. Pro novou čistou lokální DB jsou veřejný publishable key a region při buildu načteny z její konfigurace; neukládají se do zdrojových souborů. Public Store API HTTP 200. Žádné e-maily, produkční nasazení ani merge.
