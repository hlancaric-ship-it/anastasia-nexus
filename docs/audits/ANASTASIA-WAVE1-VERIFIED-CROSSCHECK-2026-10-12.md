# ANASTASIA × NEXUS — křížová kontrola zdrojového kódu a skutečného stavu

**Datum:** 2026-10-12  
**Repozitář:** `hlancaric-ship-it/anastasia-nexus`  
**Aktuální kontrolovaná pracovní revize:** `codex/wave1-security`, commit `5de8682c0894f85cb2371b39f633995ce3a0db33`  
**Starší podklad:** uživatelem dodaný `anastasia-nexus-master.zip`, 491 souborů  
**Dokumentační větev:** `codex/master-zip-audit-20261011`

## 1. Rozsah a meze důkazu

Tato zpráva **není potvrzením dokončeného manuálního řádkového auditu všech 595 souborů** aktuální větve. Je pokračováním statické inventury ZIPu a cílené kontroly implementovaných bezpečnostních a business cest na aktuální větvi. Kompletní souborový seznam staršího ZIPu je v sousedním CSV. Neměnit status na `ACCEPTED` bez skutečně dokončených runtime a databázových testů. Nic odsud není povolením produkčního nasazení.

Ověřeno načtením skutečného zdroje na GitHubu; historické počty importů/testů a lokálních průchodů jsou doklady z deníku, nikoli nově spuštěné testy.

## 2. Kritické zjištění: stav ZIPu a Wave 1 se nesmí zaměňovat

| Oblast | Starý ZIP `master` | `codex/wave1-security` | Důsledek |
|---|---|---|---|
| Medusa backend | pouze původní spike/minimální hook | `nexus-cart`, `nexus-checkout`, validace v completion hooku, entitlement/booking | Nezakládat backend znovu. |
| Medusa webhook | bez autentizace, bez perzistence, `order.placed` pouze log | HMAC s produkčním fail-closed, D1 event receipt a dedupe; `order.placed`/ `customer.created` **stále pouze log** | Webhook nelze označit za funkční integraci účetnictví / downstream synchronizace. |
| P0 SafeOrder | starší tok | service-auth, tenant binding, fail-closed validace, pricing transport guard | Dokončit ověření, ne psát další paralelní SafeOrder. |
| ExecutionIntent | typy, executor, reconciliation, D1 store | struktura je zachována | Komponenty nejsou automaticky dokladem produkčního E2E propojení. |
| OMEGA | legacy orchestrátor/agent + čisté doménové Rule vrstvy | stejné staré reference ve fakturaci | Nemigrovat orchestrátor jako `Rule<>`; účetnictví nevnucovat do e-shopového P0. |

## 3. Kódově ověřené nálezy

### P0 / aktuální blokace CI — přesně lokalizovaná

- GitHub Actions workflow run `38125396491`, poslední dostupný pokus: job `verify` běžel na skutečném runneru; `medusa-persistence` byl přeskočen. Původní blokace scheduleru nepopisuje poslední běh.
- Skutečné výsledky logu: **workerd 35/35 PASS**, NEXUS regresní sada **1080 PASS / 6 FAIL** ze 1086.
- Všech šest FAIL ve `nexus/tests/regression/connectors/omega-executor-sanity.test.ts`: spuštění pomocných souborů z `os.tmpdir()`; v logu `spawn /tmp/omega-executor-test-*/AkciaOmega.bat EACCES`.
- Otevřené **PR #1** (`fix/omega-ci-executable-tmpfs`) mění pouze `.github/workflows/wave1-p0.yml`: `--tmpfs /tmp:rw,nosuid,size=1g` na `--tmpfs /tmp:rw,exec,nosuid,size=1g`. **PR #1 nebyl v této kontrole mergeován ani nově runtime ověřen.**
- Doporučení: prověřit izolaci exec tmpfs vůči threat modelu CI, pustit bezpečnou izolovanou kontrolu na této větvi / PR, pak úplný `verify` a závislý `medusa-persistence`. **Nemačkat pouze zelený indikátor vypnutím OMEGA testů**; úprava testovacího prostředí musí být zdokumentována.

Důkaz: https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38125396491/job/114470258945 ; https://github.com/hlancaric-ship-it/anastasia-nexus/pull/1

### P1 bezpečnostní dluh SEC-03 — Durable Object rate-limit restart

`nexus/workers/api/SecurityCoordinator.ts`: `private readonly rateWindows = new Map<string, number[]>()`, metoda `handleRateLimit` čte i zapisuje **jen tuto paměťovou mapu**; perzistentní DO storage se používá pro nonce, nikoli pro rate-window počítadla. Evikce/restart objektu tedy resetuje rate limiting. Přidat samostatný návrh persistovaných / robustních počítadel a restartový concurrency test; nepředstírat, že současné nonce testy kryjí rate limit.

### P1 webhooks — ACK před trvalým dokončením práce

`nexus/workers/api/routes/medusaWebhook.ts`: po ověření podpisu vloží `medusa_webhook_receipts` s `ON CONFLICT DO NOTHING`. Události `order.placed` a `customer.created` uvnitř `ctx.waitUntil` pouze logují. Případný budoucí neúspěch downstream logiky by při současné struktuře mohl zůstat bez bezpečné retry/reconciliation fronty, zatímco opakované doručení události se odbaví jako `duplicate_skipped`. **Není doloženo, že webhook skutečně spouští účetní/objednávkovou synchronizaci.**

Doporučení: zavést explicitní persistentní stav doručení `RECEIVED → PROCESSING → COMPLETED/FAILED/UNKNOWN` s idempotencí a bezpečnou reconciliací. Využít existující `ExecutionIntentStore` / `IntentExecutor`, nikoli vymýšlet paralelní mechanismus. Před změnou definovat požadavky na zpracování jednotlivých eventů.

### Doménová vrstva fakturace je stále natvrdo OMEGA

`nexus/core/canonical/entities/Invoice.ts` drží `omegaDocumentId`; `nexus/domains/invoice/InvoiceLifecycleRule.ts` vynucuje `omegaDocumentId` při `ISSUED`, `OrderInvoiceOmegaFlow.ts` předává tutéž vazbu. Jde o skutečnou závislost doménového kontraktu na konkrétním produktu, nikoli jen název legacy adresáře.

Doporučení: při plánované P2 migraci rozlišit neutrální `AccountingDocumentReference`, volitelný/žádný ERP a capabilities/confirmationQuality/idempotency/reconciliation jednotlivých adaptérů. **Není to součást aktuální bezpečnostní brány.**

### OMEGA orchestrátor, testy a kontrakt

`nexus/connectors/omega/legacy/agent/OmegaExecutor.ts` spouští explicitně povolený `AkciaOmega.bat` a čte log; test `omega-executor-sanity.test.ts` používá executable mock s `#!/usr/bin/env node`. Toto **není test skutečného Windows účetního agenta**. Legacy orchestrátor je konzument Rules a I/O komponent, není další `Rule<>`; `SyncJob` a `PipelineAuditRecord` jsou datové typy, ne business pravidla.

### Pozitivní existující implementace, které se nesmějí předělat

- `backend/src/workflows/hooks.ts`: `completeCartWorkflow.hooks.validate` pro SafeOrder + serverovou cenovou kontrolu.
- `backend/src/api/store/nexus-cart/route.ts`: přecenění přes NEXUS, aktualizace řádku i payment collection.
- `backend/src/api/store/nexus-checkout/route.ts`: serverové dokončení košíku.
- `backend/src/modules/entitlement/order-sync.ts` a subscriber `payment.captured`: skutečné zpracování paid entitlementů, samostatně ověřit E2E.
- `backend/src/modules/booking/order-sync.ts`: potvrzení rezervace vyžaduje paid order.
- `nexus/connectors/medusa/MedusaConnector.ts` implementuje `Connector`.
- `nexus/core/canonical/outcomes/ExecutionIntent.ts`, `IntentExecutor.ts`, `IntentReconciliation.ts` a `nexus/connectors/d1/D1ExecutionIntentStore.ts` už existují. `nexus/tests/integration/ExecutionPipeline.test.ts` prokazuje testovací řetěz, nikoli produkční Medusa → finance workflow.

## 4. Pořadí pokračování podle skutečných bran

1. **P0 bezpečnostní akceptace:** vyřešit izolované `EACCES` (PR #1 jako kandidát), spustit kompletní workerd+NEXUS CI, navazující Medusa persistence E2E a uložit výsledky. Bez green+evidence zůstává P0 `BLOCKED`.
2. **K6 Auth:** přihlášení migrovaných zákaznic, session/tenant/ownership, přístupy a historie; využít připravenou větev `codex/auth-magic-link` teprve po bezpečnostní bráně.
3. **K7 payment:** Stripe sandbox, podpisy webhooků, replay, amount/currency a navazující entitlement/booking testy.
4. **Voucher/QR/restore:** D1 restart a SEC-03, voucher concurrency, QR sleva a certifikovaná izolovaná obnova; respektovat již zapsané požadavky, žádné produkční testování.
5. **Administrace/storefront a smluvní akceptace Fáze 1:** podle `docs/REQUIREMENTS_MATRIX.md`, nikoli starého `STATUS.md`.
6. **P2 účetnictví:** volitelné ERP, neutrální data a bezpečné potvrzení/reconciliation; nebrzdit P0 novým účetním PR.

## 5. Rozpory dokumentace

- Kořenový `STATUS.md` je snapshot z 9. října a stále požaduje „spustit Medusa“; aktuální checkout+pricing+booking+entitlement už existují.
- `CODEX_PROGRESS.md` na kontrolované revizi končí zprávou o billing-locku; poslední skutečný runner už běžel a selhal na `EACCES`. Před dalším rozhodnutím je potřeba doplnit deník aktuálním, přesně ověřeným výsledkem.
- `nexus/README.md` a části `nexus/docs/MIGRATION_PLAN.md` stále uvádějí nulový počet `implements Connector`, ale v aktuálním kódu existují Medusa/Shoptet implementace. Historizované věty nelze používat jako aktuální inventář.

## 6. Otevřené důkazy, které tato revize nenahrazuje

- Úplná manuální kontrola veškerého obsahu aktuálních 595 souborů.
- Spuštěné testy nové PR #1 a aktuálního backend/persistence jobu.
- Skutečný staging, Stripe sandbox, doručování médií, produkční práva a účetní agent.
- Podpisy všech webhook variant, restart/výpadek/race testy bezpečnostních počítadel a souběžné checkout testy.

**Stav dokumentu:** `PARTIAL` (cílený cross-check potvrzený kódem a logy). **Stav Wave 1 P0:** `BLOCKED`, nikoli `ACCEPTED`. Žádné produkční změny, nasazení, merge ani úprava business logiky touto kontrolou neproběhly.
