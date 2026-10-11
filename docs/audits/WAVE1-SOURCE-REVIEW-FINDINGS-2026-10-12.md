# Wave 1 — kontrola změněných souborů oproti master

**Verze zdrojů:** `codex/wave1-security` `5de8682c0894f85cb2371b39f633995ce3a0db33`  
**Audit registry:** [595 current files](WAVE1-CURRENT-595-FILE-REVIEW-REGISTER.csv)  
**Rozsah:** všech 120 aktuálně existujících changed/added Git blobů oproti `master`, společně s 17 dalšími soubory identifikovanými jako kritické. **Cílené čtení celého obsahového payloadu přes `GitHub.fetch_file` se seznamem funkcí / pravidel / relevantních větví; nikoli ruční line-by-line bezpečnostní code review.** Dalších 458 nezměněných souborů má jen dřívější automatizovanou statickou inventuru z `master` ZIPu. `backend/src/migration-scripts/initial-data-seed.ts` je proti `master` odstraněn, není mezi 595 aktuálními soubory.

## Nezaměňovat názvy testů za rozsah důkazu

- `nexus/tests/integration/MedusaNexusE2E.test.ts` explicitně pojmenovává suite **„NEXUS pricing API boundary (unit-level; not a Medusa E2E test)”**. Ověřuje handler a kontrakty, **nevytváří skutečnou objednávku Medusa**. Žádné označení `Medusa E2E VERIFIED` na základě tohoto testu.
- `nexus/tests/integration/SafeOrderHttp.test.ts` testuje lokální loopback HTTP kontrakt skutečného adapteru, nikoli DB persistenci objednávek Medusa.
- `backend/integration-tests/http/safeorder-persistence.spec.ts` skutečně využívá `medusaIntegrationTestRunner` a test přes HTTP s Postgres; nový rozšířený test byl na posledním CI závislém jobu **SKIPPED**, takže `IMPLEMENTED_UNVERIFIED`.
- `backend/src/workflows/__tests__/safeorder-completion.unit.spec.ts` testuje mock `completeCartWorkflow.hooks.validate`, ne DB rollback.

## Konkrétní implementační závislosti a testované invarianty

### Rezervace
- `backend/src/api/store/booking-slots/route.ts`: omezený rozsah dnů, načítá product metadata a aktivní bookingy.
- `backend/src/api/store/bookings/route.ts`: kontrola customer auth, product booking metadata, revalidace serverem nabízeného termínu před hold.
- `backend/src/modules/booking/models/booking.ts` a `migrations/Migration20261009130000.ts`: parcialní unikátní index `(product_id, starts_at)` pro aktivní `held/confirmed` rezervace. To chrání identickou start hodnotu; nelze **jen z existence indexu** odvodit vynucení neprolínajících se různě začínajících intervalů. Generátor slotů overlap počítá, ale souběžný HTTP test chybí.
- `backend/src/modules/booking/__tests__/service.unit.spec.ts` simuluje unikátní porušení, `slots.unit.spec.ts` testuje DST a překryvy v generátoru.
- `backend/src/subscribers/booking-order-placed.ts` a `booking-payment-captured.ts` navazují na skutečný `isOrderPaid`; testovat pořadí událostí a chybějící booking ID.

### Entitlements / chráněný obsah
- `backend/src/modules/entitlement/models/entitlement.ts` a migrace: unikátní `dedupe_key`, explicitní `active/revoked` stavy.
- `backend/src/modules/entitlement/order-sync.ts`: pay gate `isOrderPaid`, negrantuje guest order bez `customer_id`; event subscribers pro created/captured/refund/canceled.
- `backend/src/api/store/entitlements/route.ts` a `store/media-access/route.ts`: odvozují customer ID z `auth_context`, nikoli z libovolného ID klienta.
- `backend/src/modules/entitlement/media/token.ts`: HMAC token, limit 900 s. `nexus/workers/api/routes/mediaDelivery.ts`: privátní R2 doručovací logika, Range, HLS. Dosud nemáme nasazovací/bucket a player watermark E2E důkaz.

### QR / Redirects
- `backend/src/api/admin/coupon-links/route.ts`: kontroluje admin actor `user`, validuje produkt a kupón; odpověď výslovně `activation_status: PENDING_PRICING_INTEGRATION`.
- `backend/src/api/store/coupon-links/route.ts`: používá `publishable_key_context.sales_channel_ids`, záznam produktu a validaci kupónu.
- `backend/src/api/admin/coupon-links/__tests__/redirects.unit.spec.ts`: vykonává JS snippet vyextrahovaný z dokumentu `qr-redirects.md`, což testuje návrh, **nikoli skutečně nasazená Cloudflare Redirect Rules**.
- `backend/docs/wp/redirects-map.csv`: 44 řádků položek bez záhlaví v této revizi; žádné prokázané nasazení.

### Import / konfigurace
- `backend/src/scripts/anastasia-bootstrap.ts`: EUR, region, shipping, payment provider preference Stripe, non-prod fallback `pp_system_default` (ne reálná platba).
- `backend/src/scripts/import-anastasia-catalog.ts`: validation, plán/import + dry-run a explicitní update režimy.
- `backend/src/scripts/migrate-legacy-customers-orders.ts`: validace schématu, idempotentní zákaznické a order ref mapování, vytváří pouze neodeslané návrhy resetu/přístupu; **K6 autentizaci neimplementuje**.
- `backend/src/scripts/__tests__/customer-migration.unit.spec.ts`: testuje default dry-run, local DB only, zákaz hesel, soukromé soubory s mode 0600, idempotenci; **existence testu není nové spuštění**.
- `backend/medusa-config.ts` a `backend/.env.template`: produkční kontrola silných secrets, CORS, PostgreSQL; Stripe se registruje podmíněně; e-mailový provider stále otevřený.

### Worker / CI / webhooks
- `nexus/workers/api/medusaServiceAuth.ts`: statická službová identita je navázaná na tenant (ověření authorization headeru s bytewise diff).
- `nexus/workers/api/routes/medusaWebhook.ts`: HMAC timestamp ověření, D1 `medusa_webhook_receipts` idempotence; `order.placed` a `customer.created` pouze log. Dedupe receipt se zapíše před budoucím asynchronním zpracováním; návrh durable processing workflow chybí.
- `nexus/workers/api/SecurityCoordinator.ts`: rate-limit `rateWindows` je `Map`, restart/eviction risk zůstává.
- `.github/workflows/wave1-p0.yml`: Docker `--network none`, `--cap-drop ALL`, `--security-opt no-new-privileges`, read-only root, tmpfs; poslední CI neprošlo kvůli `EACCES` u spuštění mock OMEGA binárek z `/tmp`. PR #1 mění jen tmpfs na exec; před potvrzením potřebuje reálný CI rerun.
- **Přímý rozpor aktuálních dokumentů:** `backend/docs/wp/protected-media.md` říká `Worker NOT_IMPLEMENTED`, ale `nexus/workers/api/routes/mediaDelivery.ts` existuje a má unit testy. Interpretovat jako **IMPLEMENTED_UNVERIFIED / deployment missing**, nikoli Worker source absent.
- `backend/docs/wp/customer-migration.md` nahoře historicky říká `real import through Medusa CLI not performed`, zatímco `docs/REQUIREMENTS_MATRIX.md` zaznamenává pozdější lokální skutečný import. Datovat výroky, nepřebírat starý stav.

## Klasifikace a další brány

| Gate | Stav | Důkaz potřebný k povýšení |
|---|---|---|
| P0 auth/pricing/SafeOrder Worker | PARTIAL | v posledním CI workerd 35/35 PASS, plná regresní suite 6 fail (OMEGA EACCES); odstranit infra blocker |
| P0 Medusa persisted checkout | BLOCKED | nový rozšířený DB E2E po zeleném verify jobu |
| K6 identity + migrated account access | NOT_IMPLEMENTED | autentizační flow, token/session, tenant/ownership E2E |
| K7 payment capture + refund | PARTIAL | Stripe sandbox signed webhook + persistence + replay |
| QR auto-discount | PARTIAL | discount actually persisted server-side in checkout |
| Redirect deployment | IMPLEMENTED_UNVERIFIED | staging 301 tests pro všechna URL |
| Protected media | PARTIAL | R2/private HLS signed URL E2E |
| Optional ERP accounting | PARTIAL / FUTURE_SCOPE | neutral issuer reference + optional connectors, explicit business requirements |

**Použití registru:** auditované zdroje `TARGETED_SOURCE_READ` představují obsahové cílené načtení souboru, nikoli potvrzení behaviorální správnosti. Pro bezpečnostní sign-off je nutná hlubší manuální revize a runtime. Aktuální změněné zdroje byly kontrolovány, ale zbylých 458 nezměněných aktuálních souborů nebylo individuálně porovnáno s archivem na úrovni blob hash. Status celé revize **PARTIAL**.
