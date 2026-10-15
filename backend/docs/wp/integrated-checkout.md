# K4/C8 — integrovaný digitální nákup

Větev `codex/integrated-checkout`, základ `719cdd4` (včetně K9). Stav: **lokální HTTP lifecycle VERIFIED, celé K4/C8 PARTIAL**. Bez produkčních zásahů.

## Rozsah

Existující izolovaný HTTP runner nově ověřuje návaznost skutečného checkoutu, payment workflow, entitlement subscriberů, zákaznické knihovny a vydávání podepsaných odkazů. Používá čerstvou syntetickou PostgreSQL databázi a oba completion endpointy; nemění implementaci entitlement ani NEXUS.

Přidaných 14 technických kontrol pokrývá autentizaci knihovny/médií, zákaznici bez nákupu, nezaplacenou objednávku, automatické udělení po capture, vlastní knihovnu, pokus změnit customer_id, cizí médium, registr médií produktu, podpis a expiraci odkazu, souběžný replay udělení, částečný refund, plný refund a druhý nákup se stornem. Tyto kontroly **nejsou prohlášením splnění všech 14 akceptačních scénářů direktivy**. Navazují na T1-1/T1-2 a A-02/A-07 z `docs/REQUIREMENTS_MATRIX.md`.

## Hranice důkazu

- Produktem je syntetický digitální produkt; nejde o ověření produkčního katalogu nebo skutečných lekcí RESET 40+.
- Platební provider je `pp_system_default`; žádná Stripe síťová platba ani Apple/Google Pay.
- Identitu poskytují lokální JWT fixtures nad skutečnými syntetickými zákaznicemi. Přihlašování ani migrace nejsou tímto testem ověřené.
- Capture, plný refund a storno čekají na skutečné subscribers a stav DB. Částečný refund navíc přímo ověřuje existující rozhodovací funkci nad reálnou objednávkou. Replay volá skutečnou synchronizaci oprávnění dvakrát souběžně.
- Média: testuje se HTTP autorizace a vydání/ověření tokenu. URL na `media.example.test` se nestahuje; skutečné R2/Worker doručování, okamžité zneplatnění již vydaného tokenu a přehrávač nejsou ověřené. NEXUS běží přes Node bridge, nikoli workerd.
- Zbývají skutečná Stripe platba, e-mail provider/notifikace, R2, kompletní akceptační sada a produkční konfigurace. Celé K4/C8 proto nelze označit za hotové.

## Ověření

- `python3 backend/scripts/verify-safeorder-local.py`: **PASS, 65 scénářů**, z toho 14 nových kontrol digitálního nákupu; 261,404 s.
- `cd backend && npx tsc --noEmit`: **PASS**.
- `cd backend && npm run test:unit`: **23/23 souborů, 218/218 testů PASS**, 86,988 s.
- `git diff --check`: **PASS**.

Trvalý výpis: [evidence/digital-checkout.json](evidence/digital-checkout.json). Kompletní syntetický důkaz: `/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-safeorder-dxfi12ci/medusa-persistence-evidence.json`. Lokální logy: `/tmp/integrated-http.log`, `/tmp/integrated-tsc.log`, `/tmp/integrated-unit.log`.

`cd backend && MEDUSA_TELEMETRY_DISABLED=true npm run build`: **PASS**, backend 33,28 s, administrace 93,09 s. Log: `/tmp/integrated-build.log`.
