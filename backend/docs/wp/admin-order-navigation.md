# Detail objednávky: navigace a kopírování

Implementováno ve větvi `codex/order-detail-navigation`.

- Šipky procházejí právě filtrovaný a seřazený seznam objednávek včetně hranic stránek. Na okrajích jsou zakázané. Při vstupu mimo seznam jsou zakázané obě.
- Číslo objednávky, e-mail a obě adresy lze kopírovat existujícím clipboard helperem; neúspěch zobrazí zprávu.
- Změna formuláře vyžaduje při přechodu šipkou nebo tlačítkem Späť potvrzení. Tato ochrana je konzervativní; týká se uvedených tlačítek, nikoli globální navigace.
- `ADMIN_URL=http://127.0.0.1:4188 node anastasia-admin/test/browser-list-shell.mjs`: 30/30 PASS, syntetická API. Ověřuje také kopírování, hranici seznamu a zachování poznámky po odmítnutí přechodu.
- CSV/media/photo-crop/QR unit regrese: 4/4 soubory PASS. Syntaxe a build PASS. Backend nezměněn.

Dosud nenasazeno. Zbývající seznamy Konzultace/Zprávy/Ambasadoři/Média, kompletní přestavba detailu podle Shoptetu a automatický překladač nejsou součástí tohoto dílčího kroku.
