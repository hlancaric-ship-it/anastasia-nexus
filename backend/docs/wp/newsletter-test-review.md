# Regrese newsletteru: kontrola interpunkce

Stav: VERIFIED.

Původní test po odstranění CSS dál prohledával HTML značky a entity. Středník v `&nbsp;` ve standardní patičce byl chybně považován za viditelnou interpunkci. Reprodukce: 9/10 testů PASS, zbývající test selhal na `visible.includes(";")`.

Test nyní odstraní hlavičku HTML a použije existující export `htmlToText` pro tělo zprávy. Kontroluje také plain-text variantu. Kontrolní render s `Text; text` prokazuje, že skutečná interpunkce v obsahu nezmizí. Render ani žádný business kód se nemění.

Ověření:
- `npm run test:unit -- --runTestsByPath src/modules/newsletter/__tests__/unsubscribe-link.unit.spec.ts`: 10/10 PASS po opravě extrakce.
- `npm run test:unit`: 188/188 suites, 1817/1817 testů PASS, exit 0, 705,714 s. Včetně konečné kontroly skutečného středníku.
- `npx --no-install tsc --noEmit`: PASS, exit 0, bez chyb.
- `git diff --check`: PASS.

Worktree používá ignorovaný symlink `backend/node_modules` na existující `/Users/lucky/anastasia-nexus-release/backend/node_modules`; původní doporučená cesta v hlavním worktree odkazovala na neexistující adresář. Žádná instalace závislostí ani změna package/lock souborů. Žádná produkční API ani přihlašovací údaje.

Nezávislé review hlavním agentem: oprava extrakce i kontrolní render bez blokujícího nálezu. Žádný deployment není pro změnu pouze testu potřeba.
