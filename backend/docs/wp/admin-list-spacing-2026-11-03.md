# Admin: mezery v objednávkách a kontrola seznamů

Stav: VERIFIED na testovacím adminu, 3. 11. 2026.

Příčina: tabulka měla šířku 100 %, ale všechny sloupce kromě zákazníka pevnou šířku. Při viewportu 1920 px zákazník zabíral 664 px. Sedm datových sloupců nyní sdílí volné místo rovnoměrně (200 px při 1920 px). Checkbox, obrázek a akce zachovávají pevné šířky. Minimum tabulky 1160 px zachovává čitelnost, na užším desktopu se posouvá pouze tabulka. Relativní pozice jejího obalu ukotvuje skryté přístupné popisky a brání přetékání dokumentu.

Ověření:
- `ADMIN_URL=http://127.0.0.1:4187 node anastasia-admin/test/browser-list-shell.mjs`: 25/25 PASS proti izolovanému nasazovanému zdroji; syntetická API, žádné skutečné zápisy. Kupóny, číselné řazení, kódy, stránkování, zákazníci, výběr úrovní, hledání v řízeném souběhu; viewporty 1280/1440/1920/2560.
- `node --test anastasia-admin/test/{csv-export,media-upload-accept,photo-crop,qr-otp}.mjs`: 4/4 soubory PASS (45 vnitřních kontrol).
- Nezávislé review kódu a screenshotů: bez blokujícího nálezu; reviewer testy samostatně nespouštěl.
- Build PASS; nasazena pouze změna reference.css oproti předchozí testovací verzi. Version ID `34235eea-9ca2-47aa-97f3-bb02f028c753`.

Nasazení vzniklo z izolované kopie commitu a7c8ebb + této CSS opravy. Ostatní rozpracované změny ve sdíleném worktree nejsou součástí nasazení. Backendové testy/tsc nebyly spouštěny: změna se týká pouze statického adminu. Claude přestal být dostupný kvůli zakázanému přístupu organizace; dokončení a výsledky jsou předány do jeho session a souboru `tmp/codex-claude-status.md`.
