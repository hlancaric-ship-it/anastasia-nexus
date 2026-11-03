# Sjednocení zbývajících seznamů administrace

Stav: VERIFIED lokálně se syntetickými API, 3. 11. 2026.

- Konzultace a Zprávy používají společný vzhled `st-card`, tabulku, stavové záložky, rozbalovací filtr a číslovaný pager. Zůstává serverové filtrování a stránkování; nová velikost stránky je 25. UI nepředstírá řazení celé kolekce, které příslušná API nepodporují.
- Prázdné hromadné menu je odstraněné. Export kalendáře, nový chat, detail rezervace a detail konverzace zachovávají své původní akce.
- Ambasadoři zachovávají KPI, formulář nového partnera a nastavení programu. Nad seznamem vráceným existujícím endpointem přibývá hledání, stavový filtr, numerické/textové řazení a klientský pager po 25. Stávající backendový limit zdrojových zákazníků a objednávek není tímto UI změněn.
- Relativní umístění scrollportu tabulky ukotvuje přístupné skryté popisky, aby nevznikalo přetékání dokumentu.

Ověření: `ADMIN_URL=http://127.0.0.1:4188 node anastasia-admin/test/browser-remaining-lists.mjs` — 55 kontrol PASS, pouze syntetická data, bez skutečných přihlašovacích údajů a zápisů. Pokrývá serverové offsety/stavy, hledání celé načtené kolekce ambasadorů, numerické řazení, reset/empty stav, zachování formuláře, klávesové otevření rezervace, export `.ics` a šířky 1280/1440. Screenshoty vznikají v `os.tmpdir()`.

Syntaxe `node --check anastasia-admin/app.mjs` a `git diff --check`: PASS. Backend se nemění; jeho tsc/unit suite nebyla kvůli této změně spouštěna. Změny připraveny k review hlavního agenta; tento agent nic nenasazoval ani necommitoval.
