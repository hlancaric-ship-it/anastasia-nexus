# Média: sjednocený seznam

Původní grid obrázků nahrazuje společná karta/tabulka se záhlavím, hledáním, řazením názvu/velikosti/data a patičkou po 25 položkách. `GET /admin/media` vrací celý seznam (backend limit 500), proto hledání a řazení funguje napříč stránkami. Nahrávání zachovává existující formáty, limit 12 MB i serverová rozhraní; kopírování a potvrzené mazání používají delegaci, takže zůstávají funkční po překreslení tabulky.

Ověření lokálně proti syntetickému API:
- `ADMIN_URL=http://127.0.0.1:4188 node anastasia-admin/test/browser-list-shell.mjs`: 39/39 PASS včetně dřívějších seznamů a navigace objednávek. Nové kontroly pokrývají druhou stránku, hledání celé kolekce, číselné řazení, kopírování po překreslení, odmítnuté/potvrzené mazání a filechooser + registraci uploadu.
- Vizuální kontrola screenshotu knihovny při 1440 px. Náhledové URL jsou syntetické a záměrně blokované, snímek tedy neověřuje skutečné doručování obrázků.
- CSV/media-upload/photo-crop/QR regrese: 4/4 soubory PASS. Syntaxe, diff whitespace a build PASS.
- Dvě nezávislá review kódu bez blokujících nálezů; revieweři testy sami nespouštěli. Připomínky k ověření mazání/uploadu zapracovány do regresí.

Veškeré zápisy v testu jsou mockované; žádná skutečná média se nemění.
