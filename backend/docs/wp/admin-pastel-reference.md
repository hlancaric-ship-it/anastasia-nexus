# Admin — pastelová předloha (22. 10. 2026)

IMPLEMENTED: společný reference.css pro shell, dashboard, agendy, formuláře a podkarty; fotografické dekorace z uživatelem dodané předlohy; přímá navigace na existující podsekce. API a výpočty zůstaly zachované. Práce na vlastní větvi codex/admin-pastel-reference v zadaném release worktree.

Lokální server: node serve.mjs 4182. Klikací izolovaný náhled: node test/browser-reference.mjs --preview (syntetická data, bez zápisů na backend). Backend :9100 není spuštěný. Produkce nebyla nasazena.

VERIFIED: node --check app.mjs; backend npx tsc --noEmit; build s https://api.example.test; 24 kontrol media/QR; editor knihovny 216/216 kontrol na 320/390/800/1440 px. Aktualizováno zastaralé očekávání textu potvrzení v testu knihovny podle existujícího textu implementace. Vizuální běh pokrývá 62 pohledů na 320–1536 px; první běhy bez horizontálního přesahu, opraveny chybějící hodnoty ve fixture voucherů. Výsledky posledního běhu v anastasia-admin/shots/reference/results.json.

BLOCKED pro úplnou regresi: existující nesoulad hashe backend/src/api/admin/product-catalogue/route.ts v admin-function-map.unit.spec.ts. Mapa měla cizí necommitované změny již před prací; nebyla upravena. Živá data vyžadují lokální backend. Přesná vizuální akceptace čeká na uživatele; screenshot obsahuje skutečné logo aplikace, iniciály účtu a testovací produktové miniatury, nikoli identity z referenčního mockupu.
