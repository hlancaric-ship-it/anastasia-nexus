# Storefront: chat a darčekový poukaz

Větev `codex/storefront-chat`, základ `codex/storefront-phase1`. Pouze lokální mock prototyp; backend ani CSP se nemění.

## Implementace

- `/ucet`: historie zpráv, výběr a založení konverzace, odeslání čistého textu, počítadlo do 2000 Unicode znaků. HTML i URL jsou obyčejný text bez linkify. Slovenské hlášky pro nezpůsobilost a blokaci (403), oba limity (429) a uzavřenou konverzaci (409). Neúspěšné odeslání zachová rozepsaný text. Mock ovladač mění pouze ukázkový stav.
- `/darcekovy-poukaz`: hodnoty se načítají přes `getGiftVoucherProduct()` z API adaptéru; UI nemá vlastní seznam částek. Formulář přijímá jméno, e-mail a odkaz příjemci. Mock ověří údaje a vloží variantu do košíku. Osobní údaje neukládá do browser storage a nic neodesílá.
- Košík: uplatnění a odstranění poukazu, neplatný kód a zákaz zaplacení poukazu poukazem. Zobrazení kreditů, zůstatku a částky na úhradu používá výhradně odpověď adaptéru. Mock částky jsou pevné syntetické odpovědi, ne výpočet cen. Změna položek nebo kupónu zneplatní mock kredit.
- Mutace jsou serializované přes `createApi`; formuláře brání dvojímu odeslání. Historie chatu a kredit zůstávají jen v paměti náhledu, po reloadu se resetují. Košík zachová pouze ID variant a množství.

## Kontrakt pro následné napojení

Chat vychází z `backend/docs/wp/chat.md` a rout `backend/src/api/store/chat/**` na `feat/booking-availability`. Normalizované metody mapují `GET status`, seznam/detail konverzací, `POST conversations`, `POST :id/messages` a `POST :id/read`. Rozhodnutí `can_write`, `reason` a odmítnutí při odeslání patří serveru.

Poukaz vychází z `backend/docs/wp/gift-voucher.md` na `feat/gift-voucher`. Hodnoty poskytují varianty publikovaného produktu `darkovy-poukaz` přes standardní Store products API; veřejný endpoint nastavení se nevymýšlí. `addGiftVoucher` po napojení vloží variantu do serverového košíku a zavolá `POST /store/gift-vouchers/recipients` s mapou příjemců podle varianty. Uplatnění/odstranění mapuje `POST /store/gift-vouchers/apply` a `/remove`, poté načte autoritativní košík. Adaptér formátuje serverové částky; UI je pouze zobrazuje. Vystavení a doručení až po zaplacení zůstává backendu.

## Ověření

VERIFIED lokálně (14. 10. 2026):

- `node storefront-prototype/build.mjs`: PASS, 59 statických stránek a 34 původních cílů.
- `node --test storefront-prototype/test/mock.test.mjs`: **14/14 PASS**.
- `STOREFRONT_URL=http://127.0.0.1:4183 node storefront-prototype/test/browser.mjs`: celý běh **26/26 skupin PASS** (původních 24 + chat + poukaz), bez JS chyb a backendových či cizích requestů.
- `node --check` pro změněné JS moduly a `git diff --check`: PASS.
- Mobilní screenshoty chatu a poukazu při 320 px vizuálně zkontrolovány. Důkazy: `storefront-prototype/test-results/results.json`, `chat-mobile.png`, `gift-voucher-mobile.png` (gitignored).

Nové skupiny pokrývají Unicode limit, text bez HTML/odkazů, 403/429/409, novou konverzaci, dynamickou změnu hodnoty v odpovědi API, příjemce, reload košíku, neplatný kód, kredit a jeho odstranění. Regresní sada stále kontroluje CSP `'self'`, všechny statické cesty, mobilní layout a nepřítomnost backendových i cizích requestů. Backend se neměnil; napojení na skutečné API není součástí této mock etapy.
