# Převzetí práce po Opusovi — 28. 10. 2026

Pracovní větev: `claude/security-audit-2026-10`. Lucky přímo zadal převzetí.
Backend/Cloud main se nepushuje; frontend a admin jen na testovací subdomény.

## Implementace

- Dokončené Novinky, desktopové vlajky, sjednocený účet v menu. Intro test používá vlastní preview a zavírá celý browser; rozlišuje se běžné odhlášení a logout-all.
- Z účtu odstraněna duplicitní záložka RESET 40+; původní hash vede do knihovny. Zrkadielko zůstává jako rozbalovací deník po ověření přístupu, bez druhé kopie přehrávače.
- Levý panel: světlé jméno, aktivní světlá položka, kontrast všech šesti motivů; jméno ze serverového profilu, při uložení ze serverové odpovědi. Chyba objednávek, rezervací nebo katalogu neschová úspěšně načtené jméno.
- Odstraněna požadovaná věta v nápovědě chatu.
- Oprava regrese nasazení: R2/NEXUS originy jsou v explicitním veřejném manifestu, výchozí deploy je zachovává. Smoke kontroluje CSP a preflight odmítne nasazení bez gitignored hero videa a zvuku.

## Ověření

- `node --test storefront-prototype/test/*.test.mjs`: 185/185 PASS.
- `node storefront-prototype/test/browser-account-panel.mjs`: 1440 a 390 px, šest motivů, správné jméno po uložení, jedna knihovna, bez vodorovného přetečení. API syntetické, externí požadavky blokované.
- `node storefront-prototype/test/browser-novinky.mjs`: desktop/mobil, prázdné API, živé API, vypnutý panel, výpadek API, vlajky a účet v menu PASS.
- `node anastasia-admin/test/browser-newsletter.mjs`: desktop/mobil, typografie, skutečná serverová šablona bez overflow, hláška 12 px pod tlačítkem PASS. Odesílání nahrazeno mockem; Lucky samostatně potvrdil funkční odesílání.
- Backend: všech 186 sad / 1790 testů spuštěno po dávkách kvůli paměti stroje; 1789 PASS, jeden QR timeout při zatížení. Samostatné zopakování celé QR sady 39/39 PASS. `npx tsc --noEmit` a mapa API (55/150/259) PASS.
- Linux CI běh 40665487030: booking inbox 31/31 PASS; celý worker suite 156/159, tři FAIL (`aiGateway`, `medusaWebhook`, `pricingPolicy`). Neoznačeno jako dokončené; navazující persistence job neproběhl.
- Živý admin: syntetická pozvánka a registrace fungují, assistant na šesti chráněných zápisech dostává 403. Logout-all zneplatní dvě bearer relace, refresh se odmítne a nové přihlášení funguje. Původní účet vlastníka se neměnil.

## Zbývá

Společné nasazení balíku účtu a opravy médií je hotové: web `000d9050`, admin `1c1bc472`, smoke PASS, hero/audio 200, všech 14 obrázků e-shopu i R2 obrázek v čerstvém adminu načtené. Nasazený účet prošel stejným browser testem 1440/390 px se syntetickým API. Zákaznický magic-link/logout-all, reálné testovací nákupy a kupónový E2E zůstávají UNVERIFIED. Přehled skutečně vytvořených testovacích dat je v hlavním handoffu, bez hesel a tokenů.
