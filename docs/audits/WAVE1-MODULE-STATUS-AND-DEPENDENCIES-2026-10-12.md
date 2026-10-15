# ANASTASIA × NEXUS — aktuální registr modulů a důkazů

**Zdroj:** pracovní větev `codex/wave1-security` na commit `5de8682c0894f85cb2371b39f633995ce3a0db33`; cross-check 2026-10-12.  
**Platnost:** zjištění o této konkrétní revizi, nikoli automatická pravda o pozdějších commitech.  
**Evidence metodika:** `SOURCE` = ověřen konkrétní zdroj; `REPO_TEST` = testy existují, ale nebyly zde spuštěny; `HISTORIC_RUNTIME` = důkaz v journalu; `LATEST_CI` = poslední zaznamenaný běh; `REQUIREMENT` = status z matice, nemusí znamenat aktuální ověření.

**Pozor:** Evidence pokrytí každého souboru je samostatně v [WAVE1-CURRENT-595-FILE-REVIEW-REGISTER.csv](WAVE1-CURRENT-595-FILE-REVIEW-REGISTER.csv). V této fázi jde o **dílčí audit**, nikoli o převzetí celého systému.

## Fáze 1 podle smlouvy (S1-01 až S1-10)

| ID | Oblast | Stav | Skutečně doložený základ | Chybí / konkrétní brána |
| --- | --- | --- | --- | --- |
| S1-01 | Nový storefront | NOT_IMPLEMENTED | `docs/REQUIREMENTS_MATRIX.md` S1-01 | implementovat až po backend/payment/auth gate |
| S1-02 | Katalog, import | VERIFIED (historický lokální důkaz) | `backend/src/scripts/import-anastasia-catalog.ts`, `backend/docs/wp/catalog-import.md`; v matici 30 importovaných produktů | kontrola platnosti proti staging a reálnému katalogu |
| S1-03 | Košík, checkout, Stripe | PARTIAL | `backend/src/api/store/nexus-cart/route.ts`; `backend/src/api/store/nexus-checkout/route.ts`; `backend/src/workflows/hooks.ts`; `backend/medusa-config.ts` | K7 Stripe, webhooks, sandbox a E2E |
| S1-04 | RESET 40+, entitlement | IMPLEMENTED_UNVERIFIED | `backend/src/modules/entitlement/service.ts`, `order-sync.ts`, `subscribers/entitlement-payment-captured.ts` | zákaznická auth a E2E: zaplaceno → grant → přístup, refund → revoke |
| S1-05 | Přenos zákaznic/objednávek, SSO | PARTIAL | `backend/src/scripts/migrate-legacy-customers-orders.ts`; matrix dokládá 17 zákaznic / 10 objednávek / 18 grantů, lokální idempotentní import | K6 magic-link/passwordless dosud nedokončen; nepřenášet hesla, neposílat testovací emaily |
| S1-06 | QR kupón admin | IMPLEMENTED_UNVERIFIED | `backend/src/api/admin/coupon-links/`; `backend/docs/wp/qr-redirects.md` | automatická aplikace kupónu v pricing/checkout E2E |
| S1-07 | 301 staré URL a QR | PARTIAL | `backend/docs/wp/redirects-map.csv` (44 položek v matici) | nasazení a ověření směrování na staging |
| S1-08 | Admin UI na míru | NOT_IMPLEMENTED | `admin-demo/` je demo; Medusa Admin není smluvní custom UI | správa v plném rozsahu podle smlouvy |
| S1-09 | Bezpečnost a rizika | PARTIAL / P0 BLOCKED | `nexus/workers/api/routes/nexusSafeOrder.ts`; Medusa completion hook; `backend/docs/wp/wave1-security.md` | remote CI verify + Medusa 38 persistence scenarios, pak další security review |
| S1-10 | Potvrzovací e-mail | NOT_IMPLEMENTED | `docs/REQUIREMENTS_MATRIX.md` | výběr providera, templates, delivery a retry, žádné nevyžádané odesílání |

## Technické komponenty a vykonávací cesty

| Komponenta | Implementace a skutečná závislost | Stav důkazu | Co se nesmí tvrdit / další test |
| --- | --- | --- | --- |
| Cena (Medusa→NEXUS) | `nexus-cart/route.ts` přes `fetch` pricing, update line item + refresh payment collection; `nexusPricing.ts` | SOURCE + REPO_TEST | není doložená end-to-end platba |
| SafeOrder (Worker) | `nexusSafeOrder.ts`: service bearer, tenant binding, whitelist polí, risk policy | SOURCE + LATEST_CI | workerd 35/35 PASS, celá P0 gate není ACCEPTED |
| SafeOrder (Medusa) | `safeorder.ts` výhradně důvěryhodné HTTPS/localhost, abort timeout 5s, `redirect:error`, přísná odpověď; `hooks.ts` `completeCartWorkflow.hooks.validate` | SOURCE + HISTORIC_RUNTIME | historických 12/12 skutečných persisted scénářů nepokrývá nových 38 |
| Medusa dokončení | `nexus-checkout/route.ts` volá `completeCartWorkflow`; stejný validační hook pro standardní cestu | SOURCE + REPO_TEST | potvrdit obě cesty v PostgreSQL CI |
| Entitlement | `entitlement/order-sync.ts` volá `isOrderPaid`, požaduje customer ID, idempotentní grant; event subscribers | SOURCE + REPO_TEST | bez K6 a platebního E2E nemá zákaznice kompletní přístup |
| Bookings | `booking/service.ts` hold; `booking/order-sync.ts` používá `isOrderPaid`; `store/bookings/route.ts` kontroluje autorizovanou zákaznici a serverem nabízený slot | SOURCE + REPO_TEST + HISTORIC_RUNTIME(SQL) | concurrent HTTP hold vs unique index; potvrzení v reálném checkoutu |
| Media | `store/media-access/route.ts` vyžaduje auth; `entitlement/media/access.ts` grant; `workers/api/routes/mediaDelivery.ts` token+HLS+Range | SOURCE + REPO_TEST | private R2/binding, vodoznak v playeru, souběhy, HTTP E2E |
| Medusa webhook | `workers/api/routes/medusaWebhook.ts`: HMAC v production, D1 dedupe, pak `waitUntil` **pouze logy** pro order/customer | SOURCE + REPO_TEST | `PARTIAL`; skutečné downstream efekty, persistentní work state, retry/reconciliation nejsou zde doloženy |
| Worker voucher | `workers/api/routes/voucher.ts`, `issuance.ts`, `SecurityCoordinator.ts`, D1/DO | SOURCE | zkontrolovat concurrency, restart persistence a scénáře |
| SEC-03 rate limiting | `SecurityCoordinator.ts`: `rateWindows` zůstává `Map` uvnitř instance | SOURCE | při DO evikci reset; risk P1, navrhnout robustní persistenci a test |
| Canonical ExecutionIntent | `ExecutionIntent.ts`, `IntentExecutor.ts`, `IntentReconciliation.ts`; D1 store, integrační test | SOURCE + REPO_TEST | nepovažovat interní testovací pipeline za reálný end-to-end provoz konektorů |
| Fakturace | `Invoice.ts`, `InvoiceLifecycleRule.ts`: `ISSUED` vyžaduje `omegaDocumentId` | SOURCE | volitelnost ERP neimplementovaná neutrálně; nenapojovat na P0 |
| OMEGA legacy | `connectors/omega/legacy/agent/OmegaExecutor.ts` a sanity test s fake executable | SOURCE + LATEST_CI FAIL | orchestrátor není Rule; mock test není reálný Windows agent |
| ADMIN demo | `admin-demo/index.html`, `admin-demo/worker.js` | baseline ZIP inventura + Git metadata | demo ≠ hotová smluvní administrace |

## Skutečný runtime gate a závislosti

```
P0 Worker authorization / pricing / SafeOrder code
  -> Worker runtime CI 35/35 PASS
  -> NEXUS regression CI 1080/1086 PASS; 6 FAIL (omega-executor EACCES)
  -> Medusa persistence job SKIPPED
  -> P0 BLOCKED (ne Accepted)
       |
       +---> K6 Auth / migrované zákaznice  [čeká]
       +---> K7 Stripe/payment verification [čeká]
       +---> E2E RESET, refund, QR, frontend, admin [čeká]
```

**Kandidát na opravu CI:** PR [#1](https://github.com/hlancaric-ship-it/anastasia-nexus/pull/1) pouze mění mount Docker `/tmp` na executable tmpfs. Před integrací ověřit bezpečnostní podmínky sandboxu (no network, no privileges, read-only root). Oprava nesmí vypínat testy ani prohlašovat OMEGA za potvrzený produkční konektor.

**Zakázaná záměna:** PR [#2](https://github.com/hlancaric-ship-it/anastasia-nexus/pull/2) s POHODA/Money S3 není hotovým obecným účetním řešením a nemá se slučovat jen proto, aby účetnictví vypadalo dokončené.

## Rizika a konkrétní další pořadí

1. Kvalifikovat PR #1, vzdáleně opravit izolovaný test-runner a získat **všechny** požadované CI výsledky včetně Medusa persistence.
2. Přepsat status P0 pouze podle výsledků; journal a requirements matrix aktualizovat proti skutečným logům.
3. K6: navržený magic-link/SSO bezpečnostní review, test ownership + session, historické objednávky a granty.
4. K7: Stripe sandbox, podpisy, idempotence, částka/měna/capture/refund, následné E2E entitlement a booking.
5. Smluvní fáze 1: QR kupón/301, potvrzovací e-mail, admin, storefront, staging a akceptace.
6. Paralelní bezpečnostní dluh SEC-03 a robustní webhook delivery/reconciliation.
7. Pozdější projekt: ERP capability model, volitelné účetnictví bez povinného OMEGA backendu.

## Stav auditu (striktně)

- **Current branch tree:** 595 git blobs, nezkrácený GitHub tree response.
- **Diff vůči master:** 50 novějších commitů, 121 změn včetně 1 smazaného souboru.
- **Souborový aktuální coverage registr:** 595 záznamů s přesnou Git blob identitou; 43 dříve zdrojově přečtených kritických souborů, zbytek **nepokrytý plným obsahem této kontrolní procedury**.
- **Testy:** tento audit nespouštěl žádný nový runtime test, nepoužívá produkční síť/DB.
- **Protokol:** `PARTIAL`, nikoli `VERIFIED` nebo `ACCEPTED`; výsledky CI v tomto dokumentu jsou poslední nezávisle známé běhy a mohou zestárnout.

Dokument je auditní podklad; bez automatizace runtime a plné obsahové revize všech souborů nepředstavuje kompletní security sign-off.
