# NEXUS — rekonstruovaná technická architektura (stav kódu vs. cíl)

**Repozitář:** `hlancaric-ship-it/anastasia-nexus`, větev `wave1-base`, HEAD `4397842` (merge PR #8).
**Povaha dokumentu:** analýza skutečného kódu. Neimplementuje nic a nenahrazuje `docs/NEXUS_AUTONOMY_SPEC.md` (cílový stav, invarianty a akceptační brány) ani `docs/REQUIREMENTS_MATRIX.md` (jediný zdroj stavu požadavků). Cílový stav zde jen odkazuji, nekopíruji.
**Stavová slovník:** `NOT_IMPLEMENTED / PARTIAL / BLOCKED / IMPLEMENTED_UNVERIFIED / VERIFIED / ACCEPTED / FUTURE_SCOPE`. V tomto dokumentu navíc rozlišuji **[K]** = ověřeno čtením kódu, **[T]** = ověřeno během testu v mém sandboxu, **[D]** = tvrzení pouze z dokumentace, **[?]** = nelze z repa ověřit.

---

## 0. Metoda a důkazy, které jsem skutečně spustil

Povinné soubory načteny: `CLAUDE.md`, `AGENTS.md`, `docs/NEXUS_AUTONOMY_SPEC.md`, `docs/REQUIREMENTS_MATRIX.md`, `nexus/CLAUDE.md`, `nexus/docs/ARCHITECTURE_MAP.md`, `backend/NEXUS-INTEGRATION.md`, `backend/docs/wp/CODEX-HANDOFF.md`. Dále `STATUS.md`, `backend/docs/DEPLOY.md`, `PRODUCTION_RUNBOOK.md`, `protected-media.md`, `wave1-security.md` a celý relevantní zdroj v `nexus/workers`, `nexus/core` (hlavní části), `nexus/connectors/d1`, `nexus/migrations`, `backend/src` (modules, api, workflows, subscribers, medusa-config).

Nečetl jsem do hloubky (jen struktura/hlavičky): `backend/src/scripts/{parse-legacy-db,import-anastasia-catalog,migrate-legacy-customers-orders,anastasia-bootstrap}.ts`, `nexus/domains/*` mimo `pricing` a `voucher`, `nexus/connectors/*/legacy/**`, `admin-demo/`, `docs/*` marketingové dokumenty. Žádné `.env`, secrets ani produkční služby nebyly dotčeny.

| Příkaz (z čistého klonu, Linux sandbox, Node 22) | Výsledek |
|---|---|
| `cd nexus && npx tsc --noEmit` | čisté |
| `cd nexus && npx vitest run` | **87 souborů / 1096 testů PASS** |
| `cd nexus && npm run test:workers` (workerd) | **4 soubory / 38 testů PASS** (schema D1, voucher concurrency, medusaWebhook, safeOrder) |
| `cd backend && npx tsc --noEmit` | čisté |
| `cd backend && npm run test:unit` | **22 suites / 203 testů PASS** |
| `python3 backend/scripts/verify-safeorder-local.py` (izolovaný PG 16, jako neprivilegovaný uživatel) | **1/1 Jest PASS** (jeden test obsahující 38 scénářů); Worker běžel přes Node bridge s bundlovaným handlerem, **ne** ve workerd; D1 byla stub, který při přístupu vyhodí chybu |

Důsledek: čísla v `REQUIREMENTS_MATRIX.md` (86/1086, 190 backend) jsou starší než HEAD, ale tvrzení „VERIFIED živě" u SafeOrder/Worker/persistence jsem na tomto commitu **nezávisle reprodukoval** (v rozsahu uvedeném výše). Nespouštěl jsem: Stripe test mode, skutečné R2, Medusa Cloud, e-mail, Cloudflare deploy, `test:integration:http` mimo ten jeden skript.

**Důležité:** žádný automatický CI neběží. Jediný workflow je `nexus/.github/workflows/test.yml`, který GitHub nespouští (musí ležet v kořenovém `.github/workflows/`; kořen žádný nemá). Všechna „zelená" čísla jsou z manuálních běhů.

---

## 1. Přehled komponent a vlastnictví dat

```
Browser/Storefront (NOT_IMPLEMENTED)
        │ Store API (publishable key)
        ▼
 Medusa v2 (Node, PostgreSQL)  ──server-to-server Bearer──►  NEXUS Worker (Cloudflare)
  • catalog/cart/order/payment                                • /api/nexus/pricing   (stateless)
  • modules: entitlement, booking, auth-magic-link            • /api/nexus/safeorder (stateless)
  • routes: nexus-cart, nexus-checkout, media-access, ...     • /api/vouchers/*  (D1 + DO)
  • hook: completeCartWorkflow.validate                       • /api/media/v1/*  (R2, neběží na reálném R2)
  • Stripe provider (Medusa built-in)                         • /api/webhooks/{medusa,shoptet}
        │ signed media URL                                    • /api/ai/query, /api/klub/subscribe
        └──────────────────────────────────────────────────►  D1 `DB`, DO `SecurityCoordinator`
```

| Entita | Skutečný vlastník v kódu | Cíl dle spec §6 | Shoda |
|---|---|---|---|
| Produkt/cart/order | Medusa/PostgreSQL | totéž | ano |
| Cenové rozhodnutí | NEXUS Worker (stateless výpočet), výsledek zapsán do `cart.line_item.unit_price` + `metadata` | rozhodnutí + snapshot s verzí politiky | **částečně** (viz §5) |
| Stav platby | Medusa payment module + Stripe provider | provider evidence + Medusa | ano, ale neověřeno (§8) |
| Entitlement | modul `entitlement` (PostgreSQL) | totéž | ano |
| Rezervace | modul `booking` (PostgreSQL) | totéž + DB ochrana | **částečně** |
| Média | R2 (binding **není v `wrangler.jsonc`**) | soukromý R2 | cíl, neprovozováno |
| Kreditní poukazy | D1 `vouchers`, `voucher_transactions` | – (spec je nezmiňuje) | funkční, ale Shoptet/okfish původ |
| Webhook příjmy | D1 `medusa_webhook_receipts` | durable inbox | **jen dedupe, ne inbox** |
| Operace napříč systémy (registry) | **neexistuje** (knihovna `ExecutionIntent` + D1 tabulka existují, nepoužívá je žádná route) | NEXUS operation registry | **chybí** |
| Identita zákazníka | Medusa auth (emailpass + vlastní provider `magic-link`) | jedna autorita | ano pro jednu doménu |

---

## 2. NEXUS Core a hranice odpovědnosti

**Implementováno [K]:** `nexus/` je knihovna + jeden Worker. Core (`nexus/core/*`) je čistý TypeScript bez I/O: `state-machine/StateMachine.ts` (multi-axis, fail-closed přechody), `idempotency/IdempotencyStore.ts` (claim/complete/fail, **jen in-memory**), `audit/AuditRecord.ts` (immutable datová struktura, **bez persistence**), `reconciliation/GenericReconciliation.ts`, `snapshot/Snapshot.ts`, `error-isolation/ErrorIsolation.ts`, `tenant/types.ts` (`TenantContext`, `assertTenantContext` odmítá placeholdery, `assertTenantOwnership`), `canonical/**` (entity, `Rule`, `Decision`, `ExecutionIntent` + store + executor + reconciliation). Domény (`nexus/domains/*`) jsou deterministická pravidla. Konektory (`nexus/connectors/*`) jsou I/O vrstva; `connectors/Connector.ts` je kontrakt „adapter nikdy nepočítá".

**Skutečná hranice:** Worker používá z Core jen `core/tenant/types.ts`, `core/canonical/entities/base.ts` a pravidla z `domains/pricing` a `domains/voucher`. **Nepoužívá** `ExecutionIntentStore`, `IntentExecutor`, `IdempotencyStore`, `GenericReconciliation`, `AuditRecord`, `Snapshot` ani `ErrorIsolation` (ověřeno `grep` importů v `workers/`). `domains/safeorder/*` a `connectors/safeorder/legacy/*` se také nevolají; SafeOrder bodování je napsáno inline v `routes/nexusSafeOrder.ts`.

**Medusa je obchodní jádro** a Worker je pro ni dvě stateless rozhodovací funkce (cena, riziko) + voucher/webhook/AI pomocné endpointy. NEXUS tedy dnes **není** orchestrátor; je to pricing/risk služba s knihovnou, která orchestraci připravuje.

| | |
|---|---|
| **Soubory** | `nexus/core/**`, `nexus/workers/api/index.ts`, `nexus/connectors/Connector.ts` |
| **Cílový stav** | Spec §2–3: operation registry, workflow runner, inbox/outbox, retry/recovery, reconciliation jobs, operator controls |
| **Chybí** | Napojení Core knihovny na jakýkoli runtime tok; perzistence `IdempotencyStore` a `AuditRecord`; operátorské rozhraní |
| **Závislosti** | D1 migrace 0003 (tabulka `execution_intents`) – zda je aplikována na prostředích **[?]** (STATUS.md uvádí 0001–0004) |
| **Testy** | `tests/unit/{StateMachine,IdempotencyStore,ExecutionIntentStore,IntentExecutor,IntentReconciliation,GenericReconciliation,AuditRecord,Snapshot,ErrorIsolation}.test.ts`, `tests/integration/ExecutionPipeline.test.ts` (Node, in-memory) – **unit důkaz, ne integrace s D1/Worker** |
| **Stav** | knihovna `IMPLEMENTED_UNVERIFIED` v rámci runtime; autonomie `NOT_IMPLEMENTED` |

---

## 3. Orchestration Engine a životní cyklus operací

**Skutečný lifecycle** existuje ve třech nesourodých podobách:

1. **Checkout (Medusa workflow, synchronní):** `POST /store/nexus-checkout` → `repriceCart` → (pokud se cena změnila → 409) → `completeCartWorkflow` s `validate` hookem (`backend/src/workflows/hooks.ts`): kontrola částek snapshotu, `repriceCart(..., false)` znovu, SafeOrder pro každou zpracovatelnou platební session, registrace použití kupónu (s kompenzací `revertUsage`). Pořadí je silné a testované; trvalý záznam „operace" ale vzniká jen jako výsledná objednávka. **[K][T]**
2. **ExecutionIntent (knihovna):** `PLANNED → APPROVED → EXECUTING → EXECUTED/FAILED/UNKNOWN/SUPERSEDED/ABANDONED`, atomický claim `UPDATE … WHERE state IN (…)` + `meta.changes === 1`, `UNKNOWN` vyžaduje reconciliaci a nesmí se slepě retryovat; `SENT ≠ CONFIRMED` (`lifecycle/Execution.ts`). **[K]**
3. **Subscribery Medusy** (entitlement, booking): idempotentní reakce na `order.placed`, `payment.captured`, `order.canceled`, `payment.refunded`; při chybě `throw` pro retry event busu. **[K]**

**Rozdíl proti spec §2:**

| Spec krok / stav | Realita |
|---|---|
| operation ID, correlation ID, schema version | **chybí.** Medusa→Worker volání nenese žádný correlation/request ID (jen `content-type`, `authorization`). Worker generuje vlastní `requestId`, který ven nejde. |
| stavy `RECEIVED…SUCCEEDED, RETRY_WAIT, COMPENSATING, NEEDS_REVIEW` | neexistují; `ExecutionIntent` má jinou množinu (`UNKNOWN`≈`NEEDS_REVIEW`, chybí `RETRY_WAIT`, `COMPENSATING`, deadline) |
| deadline / heartbeat / lease | **chybí.** Intent v `EXECUTING` po pádu procesu zůstane navždy, nic ho neuvolní |
| retry s backoff + jitter | **chybí** (`MAX_REDEMPTION_ATTEMPTS = 3` u voucheru je jediný bounded retry, bez backoffu) |
| compensation | jen: voucher `compensateRedemption`, kupón `revertUsage` |
| escalate / operator controls | **chybí** (log s `alert: true` bez směrování) |
| scheduler | `wrangler.jsonc` nemá `triggers.crons`; `backend/src/jobs/` obsahuje jen README |

| | |
|---|---|
| **Soubory** | `backend/src/workflows/hooks.ts`, `backend/src/api/store/nexus-checkout/route.ts`, `nexus/core/canonical/outcomes/*`, `nexus/core/canonical/lifecycle/Execution.ts` |
| **Cílový stav** | Spec §2 (12 kroků), §3 body 2, 3, 7, 8, 10; Gate C |
| **Chybí** | registry + runner + recovery + reconciliace jako běžící komponenta; test pádu mezi kroky |
| **Závislosti** | Redis workflow engine u Medusy (jinak in-memory), D1 0003, scheduler (cron/DO alarm) |
| **Testy** | `safeorder-completion.unit.spec.ts` (mock workflow), `safeorder-persistence.spec.ts` (skutečná Medusa + PG, **[T]** PASS) – dokazují fail-closed checkoutu, **nedokazují** restart/recovery |
| **Stav** | checkout orchestrace `PARTIAL` (silně ověřený úsek); obecný orchestrátor `NOT_IMPLEMENTED` |

---

## 4. Event-driven komunikace a doručování událostí

**Skutečné toky:**

| Událost | Producent | Konzument | Doručení | Idempotence |
|---|---|---|---|---|
| `order.placed`, `payment.captured`, `order.canceled`, `payment.refunded` | Medusa event bus | `entitlement-*`, `booking-*` subscribery | event bus (Redis, pokud je `REDIS_URL`; jinak in-memory, bez trvalosti) | `dedupe_key` unique index (entitlement); stav-based `confirm`/`cancel` (booking) |
| `auth-magic-link.requested` | provider `magic-link` | `auth-magic-link-requested.ts` → NOTIFICATION | event bus; chyba se **polyká** (jen log) | žádná |
| `order.placed`, `customer.created` → `/api/webhooks/medusa` | **nikdo** – v `backend/` ani v konfiguraci není odesílatel (`grep` bez nálezu) | Worker (jen loguje) | D1 receipt `INSERT … ON CONFLICT DO NOTHING RETURNING` | event_id |
| Shoptet `order:create/update` | okfish Worker (forward) | `shoptetWebhook.ts` → voucher issuance | HMAC-SHA1 + forward token; `ctx.waitUntil` | `(tenantId, sourceOrderId)` |

**Mapování na kanonické události spec §5:**

| Spec událost | Skutečnost |
|---|---|
| `order.created` | v kódu `order.placed` (Medusa název), žádný kanonický wrapper |
| `payment.captured`, `payment.refunded`, `order.cancelled` | konzumovány (`order.canceled`); bez verzovaného schématu |
| `payment.session.created`, `payment.failed` | bez konzumenta |
| `entitlement.granted/revoked`, `booking.held/confirmed/cancelled`, `media.access.issued` | **neemitují se**; jen logy (`media-access` audit je `logger.info`) |
| `operation.failed`, `operation.needs_review` | neexistují |

**Klíčové mezery:**
- **Receipt před zpracováním.** `medusaWebhook.ts` zapíše receipt a teprve potom spouští handler v `ctx.waitUntil`. Selže-li handler, receipt zůstane → událost je považována za zpracovanou a **ztracena** (porušuje spec §3 bod 6 „nepotvrzuj kritickou událost před durable receipt a zpracováním/outbox"). Dnes handlery jen logují, takže škoda nevzniká; je to ale past pro první skutečný handler (dokumentováno i v `NEXUS-INTEGRATION.md`).
- Žádný outbox na straně Medusy: události po commitu transakce nejsou garantovány bez Redis event busu a retry.
- Dedupe klíč webhooku je jen `event_id` (spec: provider event ID + tenant/source).

| | |
|---|---|
| **Soubory** | `nexus/workers/api/routes/medusaWebhook.ts`, `nexus/migrations/0005_medusa_webhook_receipts.sql`, `backend/src/subscribers/*`, `backend/medusa-config.ts` (event-bus-redis) |
| **Cílový stav** | Spec §3 bod 6, §5 |
| **Chybí** | outbox/inbox se stavem zpracování, odesílatel webhooku, kanonický katalog událostí se schématy, emise `entitlement.*`/`booking.*` |
| **Závislosti** | Redis v produkci; migrace 0005 aplikovaná v D1 **[?]** |
| **Testy** | `tests/workers/medusaWebhook.test.ts` (workerd + D1, **[T]** PASS: duplikát přes požadavky), `tests/unit/medusaWebhookRoute.test.ts`; subscribery bez integračního testu proti PG |
| **Stav** | `PARTIAL` |

---

## 5. Durable state machine, persistence a recovery

**Implementováno:**
- D1 (`DB`) – migrace 0001 (vouchers, voucher_transactions s CHECKy a unique indexy), 0002 (audit), 0003 (execution_intents), 0004 (burned/unclaimed), 0005 (webhook receipts). Peníze jako INTEGER minor units. **[K]**
- Durable Object `SecurityCoordinator` (SQLite-backed, migrace `v1`): nonce test-and-set s TTL + alarm cleanup, rate limit sliding window. Nonce persistuje, **rate limit je jen v paměti** (restart/eviction ho nuluje – vědomé rozhodnutí v komentáři). **[K]**
- PostgreSQL (Medusa): tabulky `entitlement`, `booking` (ruční migrace `Migration2026100912xxxx`).
- Lokální záloha/obnova: `backup-local.mjs`, `restore-local.mjs`, `db-recovery.cjs` – odmítají cokoli kromě `anastasia_dev_wave1` na loopbacku. **[K]**

**Recovery:** dokázáno je pouze (a) D1 optimistický zámek a rollback chování batch (`schema.test.ts` blok 7–8, **[T]**), (b) souběh voucheru a replay (`voucherConcurrency.test.ts`, **[T]**), (c) lokální dump→restore počty (matrix A-16, **[D]**, nespouštěl jsem). Nedokázáno: pád mezi kroky, stale lease, timeout po vzdáleném úspěchu, retry exhaustion → `NEEDS_REVIEW` (spec Gate C).

**Konkrétní zjištění D1 (důležité pro každý budoucí kód):** `D1.batch()` se rollbackuje jen při SQL chybě, ne při `meta.changes === 0`; `routes/voucher.ts::consumeCredit` proto dělá UPDATE → kontrola `changes === 1` → INSERT → kompenzace. Tento vzor je správně dokumentován a testován.

| | |
|---|---|
| **Soubory** | `nexus/migrations/*.sql`, `nexus/workers/api/SecurityCoordinator.ts`, `nexus/connectors/d1/D1ExecutionIntentStore.ts`, `nexus/connectors/d1/D1CreditVoucherStore.ts` (Worker ho **nepoužívá**, route píše SQL přímo), `backend/src/scripts/{backup-local,restore-local}.mjs` |
| **Cílový stav** | Spec §3 bod 2, 7; §10 Gate C, D |
| **Chybí** | produkční zálohy, restore drill na stagingu, D1 export/Time Travel postup, DO storage obnova, recovery testy |
| **Testy** | viz výše; `schema.test.ts` 19, `voucherConcurrency.test.ts` 3 (workerd) |
| **Stav** | voucher persistence `VERIFIED` (workerd, lokálně); obecná durable operace `NOT_IMPLEMENTED`; DR `PARTIAL` (jen lokální) |

---

## 6. Pricing Engine a SafeOrder

### 6.1 Pricing

**Implementováno [K][T]:** `POST /api/nexus/pricing` (`routes/nexusPricing.ts`): Bearer (`MEDUSA_PRICING_API_KEY`, porovnání v konstantním čase), tenant z **vazby klíče** (`MEDUSA_PRICING_TENANT_ID`), tenant z těla jen kontrolován (jiný → 403), validace `basePrice/salePrice/productMaxDiscount/couponDiscountPercent` (konečná čísla, rozsahy, `salePrice ≤ basePrice`), politika povinně z `MEDUSA_PRICING_POLICY_JSON` (všechny 4 mapy, hodnoty 0–1; chybí → 503, žádný fallback). Řetěz pravidel v `domains/pricing/createNexusPricingCalculator.ts`: `BasePrice → BrandSale → HighestDiscount → DiscountLimit → CouponDiscount → Rounding`, Decimal aritmetika, golden/parity testy proti okfish. Backend (`nexus-cart/route.ts::repriceCart`) čte vše z Medusy (cena, měna EUR, skupiny zákazníka → tier z `metadata.nexus_tier` (`customer-tier.ts`), `product.metadata`), ověřuje odpověď (tenant, finite, `appliedRules: string[]`), zapisuje `unit_price`, `is_discountable:false`, metadata a obnovuje payment collection; `redirect:"error"`, timeout 5 s, TLS guard.

**Zjištění:**
1. **Snapshot neobsahuje verzi politiky ani hash** – do `line_item.metadata` jde `nexus_tenant_id`, `nexus_pricing_rules` (názvy), `nexus_coupon_code`. Rule `ruleVersion: '1'` se do odpovědi nedostává. Spec §4 „persist the exact price snapshot and policy/version" je splněno jen zčásti.
2. Worker je stateless – **žádný záznam cenového rozhodnutí/auditu** v NEXUSu.
3. Neznámý `customerTier` vyhodí v kalkulátoru obyčejný `Error` → Worker 500 → backend 503 (správně by bylo 400/422).
4. `DEFAULT_ANASTASIA_PRICING_CONFIG` v `StaticPricingConfigurationProvider.ts` je ve skutečnosti rybářská politika (DELPHIN/MIVARDI/MIKADO) pod názvem ANASTASIA; route ji přebíjí povinnou politikou, ale konstanta je nebezpečný mylný název. `NEXUS-INTEGRATION.md` potvrzuje, že schválená obchodní politika ANASTASIA v repu není.
5. Kupóny: jen procentuální; `fixed` není podporován. Aktivace slevy z QR (C3) je `PENDING_PRICING_INTEGRATION` v odpovědích admin/store route.
6. Nulová cena je povolena (`>= 0`); objednávka s `total <= 0` se v `isOrderPaid` považuje za zaplacenou → **100% sleva/zdarma vede k automatickému entitlementu** (vědomé? není zdokumentováno).
7. Jen EUR.
8. `/store/nexus-cart` a `/store/nexus-checkout` nemají rate limit; autorizace je jen znalost `cart_id` + publishable key (Medusa konvence). Každé volání dělá N HTTP volání na Worker.

### 6.2 SafeOrder

**Implementováno [K][T]:** `POST /api/nexus/safeorder` – autentizace před parsováním, tenant binding, striktní allowlist polí (`tenantId, currency, orderSum, paymentMethod, customerEmail`), `currency === 'eur'`, `orderSum` finite 0..MAX, metody z fixního seznamu (neznámá → 400), `pp_system_default` jen při `ENVIRONMENT ∈ {development,test}`. Skóre: základ 10; COD +20 (+35 nad 120 €); online −10; dočasná e-mailová doména +45 (substring match); objednávka >300 € +25; `≥70 BLOCK`, `≥40 REVIEW`. Backend `assertSafeOrderAllows` je fail-closed: cokoli mimo `ALLOW && score < 40` s ověřením tenant/currency/orderSum/typů zastaví checkout. Běží v `completeCartWorkflow.hooks.validate` nad **locked snapshotem** a pro **každou** zpracovatelnou payment session → ověřeno proti obchvatu přes standardní Medusa completion (**[T]** `safeorder-persistence.spec.ts`, 38 scénářů, nulový přírůstek objednávek při BLOCK/REVIEW/unavailable/malformed/redirect).

**Zjištění:**
1. SafeOrder nemá **durable záznam rozhodnutí** (dokumentováno). ALLOW nikdy neuděluje entitlement (správně – entitlement čte platbu, ne SafeOrder).
2. Pravidla jsou inline, ne ve `domains/safeorder/*` (paritní testy `tests/regression/safeorder/*` testují legacy knihovnu, **ne** to, co skutečně běží ve Workeru).
3. Skórování používá jen částku, metodu a e-mail; bez historie, bez rate/velocity signálů. Je to jednoduchý deterministický scorer, ne „SafeOrder 3.0" pipeline z legacy.
4. Hook `validate` **mutuje** (volá `promotions.registerUsage`, s `amount: 1`), zatímco `NEXUS-INTEGRATION.md` ho popisuje jako „read-only". Kompenzace přes `revertUsage` je napsaná, ale bez testu proti PG (v persistence testu se objevila chyba „Promotion usage exceeds the limit", pravděpodobně očekávaný scénář – nevyšetřoval jsem).

| | |
|---|---|
| **Soubory** | `nexus/workers/api/routes/{nexusPricing,nexusSafeOrder}.ts`, `nexus/workers/api/medusaServiceAuth.ts`, `nexus/domains/pricing/*`, `backend/src/api/store/{nexus-cart,nexus-checkout}/*`, `backend/src/workflows/hooks.ts` |
| **Cílový stav** | Spec §4 „Price and checkout" |
| **Chybí** | verze politiky v snapshotu, audit rozhodnutí, property/boundary testy (NaN, Infinity, extrémní slevy – část pokryta ručními testy), E2E se Stripe test mode, schválená politika ANASTASIA, rate limit |
| **Testy** | Node: `nexusPricingRoute.test.ts`, `nexusSafeOrderRoute.test.ts`, `SafeOrderHttp.test.ts`, `MedusaNexusE2E.test.ts`, `PricingEndToEnd.test.ts`, golden-pricing parity; backend: `pricing-transport`, `coupon`, `customer-tier`, `safeorder`, `route-errors`, `safeorder-completion` unit; workerd: `safeOrder.test.ts`; integrace: `safeorder-persistence.spec.ts` **[T]** |
| **Stav** | pricing `IMPLEMENTED_UNVERIFIED` až `VERIFIED` pro persistenci částek (matrix); SafeOrder fail-closed `VERIFIED` (lokálně) |

---

## 7. Identita, autorizace a tenant isolation

**Identita [K]:** Medusa auth s providery `emailpass` a vlastním `magic-link` (`backend/src/modules/auth-magic-link`). Token: 32 B náhodných, ukládá se jen SHA-256, porovnání `timingSafeEqual`, TTL 15 min, `LINK_SENT` vždy stejná odpověď, propojení migrované zákaznice jedním SQL (`FOR UPDATE`, `HAVING count(*)=1`). Store routes `entitlements`, `media-access`, `bookings*` mají `authenticate("customer", ["session","bearer"])` a ID zákaznice berou z `auth_context`, ne z těla. Admin routes spoléhají na globální `/admin` auth Medusy; `coupon-links` má navíc explicitní middleware.

**Zjištění vůči spec §4:**
1. **Magic-link: neplatný token spotřebuje platný.** `confirmLink` volá `getState` (v testovacím mocku i v komentáři implementace „smaže po přečtení") **před** validací. Útočník, který zná e-mail oběti, pošle chybný token a smaže jí čekající platný odkaz. Chování reálného `getState` v Medusa 2.19 jsem v tomto běhu neověřoval proti `node_modules` **[?]**, ale mock to modeluje a unit test to nehlídá.
2. **Vyžádání odkazu přepisuje state** téhož e-mailu → útočník může opakovaně zneplatňovat odkazy (DoS), a bez rate limitu na žádost i e-mail bombing. Žádný rate limit na úrovni kódu (spec: „across processes and instances").
3. **State je v auth modulu/cache**; bez `REDIS_URL` je to in-memory per proces → nefunguje při více instancích (produkce jen varuje).
4. **E-mail se fakticky neodesílá:** `notification-local` jen loguje; subscriber chybu pohltí. Matrix S1-10 `NOT_IMPLEMENTED`.
5. Po ověření tokenu se pro neznámý e-mail vytvoří `AuthIdentity` bez Customer (actor bez `actor_id`) – chování registrace není zdokumentováno.
6. Matrix A-01 uvádí `VERIFIED` (živě, 15 unit testů). Body 1–3 nejsou v těch testech pokryty; doporučuji status upřesnit na „VERIFIED pro happy path a jednorázovost po úspěšném použití, adversarial gate neprošla".

**Tenant isolation:**
- **Worker pricing/safeorder/issuance:** tenant = vazba service klíče (jeden klíč = jeden tenant na deployment). Dobré, **[T]** testováno cross-tenant → 403.
- **Voucher `/validate` a `/redeem`: tenant bere z query/těla, bez service autentizace.** Ochrana stojí na entropii kódu (~6,6×10¹¹), rate limitu a HMAC tokenu. Token (`voucherId, amountMinor, cartFingerprint, timestamp, nonce`) **není vázaný na tenant**; `orderId` v `/redeem` není ověřen proti Medusa objednávce/platbě (přiznáno v `NEXUS-INTEGRATION.md`: „does not verify real payment receipts"). Spec: „Never trust client-provided tenant".
- **Backend moduly entitlement/booking nemají sloupec `tenant_id`** (`grep tenant` v `backend/src/modules` = 0 shod). Izolace je pouze `customer_id` + fakt, že běží jeden tenant `anastasia`. Pro `anastasia.academy`/`aianastasia.com` na společném jádru (spec §1) tedy neexistuje datový model pro tenant/doménu.
- **Core:** `assertTenantContext`/`assertTenantOwnership` + `tests/tenant-isolation/assertTenantOwnership.test.ts` (3 testy) – jen helper-level.
- **IDOR:** `store/bookings/:id/cancel` kontroluje vlastnictví (404 při cizí); `store/entitlements` filtruje podle `auth_context`. **Chybí** test změnou ID proti běžící instanci (matrix A-02 to sám uvádí).
- **`/store/coupon-links`** nemá autentizaci (jen publishable key + sales channel) a je read-only preflight – přijatelné; vrací `product_id/variant_id`.

| | |
|---|---|
| **Soubory** | `backend/src/modules/auth-magic-link/*`, `backend/src/api/store/*/middlewares.ts`, `backend/src/api/middlewares.ts`, `nexus/workers/api/medusaServiceAuth.ts`, `nexus/core/tenant/types.ts` |
| **Cílový stav** | Spec §4 „Identity and tenant isolation"; SSO napříč doménami (spec §1; matrix S2-01) |
| **Chybí** | rate limit magic-link, atomická jednorázovost odolná vůči neplatnému pokusu, tenant model v modulech, tenant-bound voucher token + service auth, IDOR integrační testy, SSO |
| **Testy** | `service.unit.spec.ts` (147 řádků), `policy.unit.spec.ts`; `assertTenantOwnership.test.ts`; `nexusSafeOrderRoute.test.ts` (cross-tenant) |
| **Stav** | auth `PARTIAL` (matrix: VERIFIED, viz výhrada); tenant isolation `PARTIAL` |

---

## 8. Medusa integrace a obchodní procesy

**Implementováno [K][T]:** Medusa 2.19.0, vlastní moduly `entitlement`, `booking`, `auth-magic-link` (registrované v `medusa-config.ts`), read-only linky entitlement→customer/product, custom Store routes `nexus-cart`, `nexus-checkout`, `media-access`, `entitlements`, `bookings`, `booking-slots`, `coupon-links`, admin routes (`entitlements`, `bookings`, `coupon-links`), bootstrap script (region SK, skupiny Bronze/Silver/Gold/VIP, digitální shipping profil, publishable key), importní/migrační scripty (katalog 30 produktů, 17 zákaznic, 18 entitlementů – **[D]** matrix), generátor QR kupónů (`qrcode` jako runtime `require`, dependence **není v `package.json`** → `localQrRenderer` v produkčním buildu spadne, route vrátí 503).

**Obchodní procesy:**
- *Digitální produkt:* cart → `nexus-cart` → platba → `completeCartWorkflow` → `order.placed`/`payment.captured` → `grantEntitlementsForOrder` (nutná zaplacená objednávka, zákazník, `isEntitlementProduct` = shipping profil `digital` nebo `metadata.digital`) → `/store/media-access`.
- *Konzultace (booking):* `booking-slots` → `POST /store/bookings` (hold) → **očekává** objednávku s `metadata.booking_id` → `confirm` po zaplacení. **Krok „zápis `booking_id` do order metadata" v kódu neexistuje** (komentář tvrdí „zapsáno při checkoutu, viz nexus-checkout"; `grep booking_id` najde jen čtení v `order-sync.ts`). Celý řetěz hold → potvrzení proto end-to-end nefunguje.
- *Fixní medusa-config chování:* produkce zakazuje slabé secrety/HTTP CORS/test Stripe; **chybějící Redis a S3 jen varují** (spec §4: „no silent in-memory fallback … fail fast").

**Zjištění k bookingu (spec §4 Booking):**
1. Unique index je `(product_id, starts_at)` pro `held/confirmed`. Chrání před **identickým začátkem**, ne před **překryvem** (60 min trvání, krok 30 min → 10:00 a 10:30 se překrývají). Překryv hlídá jen aplikační `busy` kontrola s race mezi čtením a insertem. Spec požaduje DB-enforced ochranu; řešení: exclusion constraint na `tstzrange(starts_at, ends_at + buffer)` (`btree_gist`).
2. `expireStaleHolds` **nikdo nevolá** (žádný job/subscriber). Prošlý hold nadále drží řádek ve stavu `held`: `listActiveInRange` ho skryje (slot se zdá volný), ale insert narazí na unique index → `SlotTakenError` navždy.
3. `confirm` neověřuje `booking.customer_id === order.customer_id` ani produkt (spec: „confirmation tied to correct customer/product/order/payment").
4. `busy` okno se skládá z UTC dne řetězce `starts_at`, sloty se generují v lokálním dni `Europe/Bratislava` → hraniční sloty kolem půlnoci/DST; testy slotů pokrývají DST samotné, ne tuto kombinaci.
5. Matrix A-08 to sám shrnuje jako `IMPLEMENTED_UNVERIFIED` s „možným race" – souhlasí.

| | |
|---|---|
| **Soubory** | `backend/medusa-config.ts`, `backend/src/modules/**`, `backend/src/api/**`, `backend/src/subscribers/**`, `backend/src/workflows/hooks.ts`, `backend/src/scripts/*`, `backend/NEXUS-INTEGRATION.md` |
| **Cílový stav** | Spec §1, §4 Booking, §6 |
| **Chybí** | zápis `booking_id`, expirační job, DB exclusion constraint, `qrcode` v dependencies, fail-fast produkční Redis/S3, e-mail provider, storefront |
| **Testy** | `booking/__tests__/{service,slots,policy,order-sync}` (mocky), SQL ověření unique indexu **[D]**, `entitlement/__tests__/{policy,order-sync}`; **chybí** souběžný HTTP test a integrační test subscriberů proti PG |
| **Stav** | entitlement `IMPLEMENTED_UNVERIFIED` (e2e s platbou neověřeno); booking `IMPLEMENTED_UNVERIFIED` s výše uvedenými strukturálními mezerami |

---

## 9. Payment workflows, webhooky a entitlements

**Platby [K][D]:** Stripe přes **vestavěný Medusa provider** `pp_stripe_stripe` (aktivní jen pokud je `STRIPE_API_KEY`; produkce vyžaduje `sk_live_`/`rk_live_` + `whsec_`, mimo produkci live klíč odmítnut). Webhook Stripe přijímá Medusa na `/hooks/payment/stripe_stripe`; **v repu není žádný vlastní kód ani test**, který by ověřoval podpis, replay, idempotenci, částku/měnu ani stavy (matrix A-05 `NOT_IMPLEMENTED (ověření)` – souhlasím; „nedělat vlastní webhook" je správné rozhodnutí). Lokálně se používá `pp_system_default` (bez reálného poplatku).

**Entitlement – pravidla ve `policy.ts`/`order-sync.ts` [K]:**
- grant jen když `isOrderPaid` (status ≠ canceled; `total ≤ 0` ⇒ zaplaceno; `captured_amount ≥ total − 0.005`; nebo všechny payments mají `captured_at`), existuje `customer_id` (host → neudělí, warn) a produkt je digitální;
- idempotence: `dedupe_key = order:<id>:<product>` + částečný unique index `WHERE deleted_at IS NULL`; souběh `order.placed` × `payment.captured` řeší zachycení unique violation a načtení vítěze; revokovaný záznam se neoživuje;
- revoke: `order.canceled` → vše; `payment.refunded` → jen při plném refundu (`refunded ≥ captured`); částečný refund přístup ponechá; admin grant/revoke přes `/admin/entitlements*` (grant s `source=admin`, `granted_by` z `auth_context`);
- volitelná expirace `metadata.entitlement_days`.

**Zjištění:**
1. Politika „zrušení/refund/reversal" je implementovaná, ale **není zdokumentovaná jako schválené rozhodnutí** (spec: „implement only the approved rule").
2. `total ≤ 0` ⇒ zaplaceno (viz §6.1 bod 6).
3. Spoléhá na event bus retry (`throw` v subscriberu); bez Redis (lokálně/produkce bez `REDIS_URL`) retry/trvalost není garantována; chybí reconciliace objednávek ↔ entitlementů (spec §3 bod 8).
4. Nejistý stav platby: kód se k němu chová konzervativně (neudělí), ale nic ho později nerozřeší.
5. Medusa PG test provedený v `safeorder-persistence.spec.ts` ověřuje SafeOrder/ceny, **ne** entitlement po platbě.

| | |
|---|---|
| **Soubory** | `backend/medusa-config.ts` (Stripe), `backend/src/modules/entitlement/{policy,order-sync,service,models/entitlement}.ts`, `backend/src/subscribers/entitlement-*.ts`, `backend/src/api/{store,admin}/entitlements/**` |
| **Cílový stav** | Spec §4 „Payments, webhooks and entitlements"; Gate B |
| **Chybí** | Stripe test-mode E2E (cart → session → podepsaný webhook → paid order → entitlement → replay), reconciliace, schválená refund politika, test souběhu na PG |
| **Testy** | `entitlement/__tests__/{policy,order-sync}.unit.spec.ts` (11 testů dle matrix), mocky; **žádný integrační** |
| **Stav** | `IMPLEMENTED_UNVERIFIED`; Stripe webhook `NOT_IMPLEMENTED` (ověření) |

---

## 10. Cloudflare Workers, Durable Objects, D1, R2 a KV

| Prvek | Skutečné použití | Konfigurace v `wrangler.jsonc` |
|---|---|---|
| **Worker** `nexus-api` (+ `nexus-api-production`) | jediný entry `workers/api/index.ts`, ruční `switch` router, fail-closed `assertRequiredBindings` (DB, HMAC_SECRET), strukturované logy, `requestId` | `observability` zapnuto, `compatibility_date 2026-09-06` |
| **D1** `DB` | vouchers, transactions, audit, execution_intents, webhook receipts | dev `nexus-voucher-dev`, prod `nexus-voucher` – **fyzicky oddělené**, bindingy zopakovány v `env.production` (správně) |
| **Durable Object** `SecurityCoordinator` | nonce reservation + rate limit; **jediná globální instance** (`idFromName('global')`) | binding `VOUCHER_SECURITY`, `new_sqlite_classes` migrace `v1` |
| **R2** | `MEDIA_BUCKET` čte `mediaDelivery.ts` | **binding v `wrangler.jsonc` chybí** → route vrací 503 `MISSING_BINDING`; na reálném R2 nikdy neběžel |
| **KV** | **nepoužito nikde** | žádný `kv_namespaces` (v souladu se spec: KV není autorita) |
| **Workers AI** | volitelný fallback v `aiGateway.ts` přes `env.AI` | binding neexistuje |
| **Cron / Queues** | nepoužito | `triggers` chybí |
| **Var `ENVIRONMENT`** | řídí CORS (`resolveAllowedOrigin`), produkční vynucení webhook secretu, povolení `pp_system_default` | **není deklarována** ani top-level, ani v `env.production` |

**Zjištění (závažná):** bezpečnostní větvení „production vs. non-production" visí na proměnné `ENVIRONMENT`, kterou konfigurace nenastavuje. Pokud ji deploy nenastaví ručně (`NEXUS-INTEGRATION.md` zmiňuje jen `MEDUSA_PRICING_TENANT_ID`/`POLICY_JSON` jako vars a dva secrety), pak produkční Worker: (a) použije CORS `*` při prázdném `ALLOWED_ORIGINS`, (b) **přijme nepodepsaný Medusa webhook, pokud chybí `MEDUSA_WEBHOOK_SECRET`** (kontrola `=== 'production'` neplatí), (c) neodmítne `pp_system_default` jen díky tomu, že není v `['development','test']` – to je správně fail-closed, takže zde je riziko jen (a)+(b). Doporučení: invertovat logiku (fail-closed, pokud `ENVIRONMENT` není explicitně `development|test`) a deklarovat var v `env.production`.

Další: DO je single-threaded bod pro celý Worker; spec to přijímá pro nonce, ale rate limit by se měl dělit (komentář v kódu to už navrhuje). Secrets (`HMAC_SECRET`, `MEDUSA_PRICING_API_KEY`, `MEDUSA_WEBHOOK_SECRET`, `MEDIA_TOKEN_SECRET`, `WEBHOOK_SECRET`, `SHOPTET_*`, `NEXUS_FORWARD_TOKEN`, `STRIPE_SECRET_KEY`, `AI_API_KEY`) jsou jen v typu `Env`; `MEDIA_TOKEN_SECRET` a `STRIPE_SECRET_KEY` nejsou v žádném dokumentu seznamu nasazení Workeru ucelené. Worker `nexus-api.hlancaric.workers.dev` podle `STATUS.md` existuje; nesahal jsem na něj ani nevolal **[?]**.

| | |
|---|---|
| **Soubory** | `nexus/wrangler.jsonc`, `nexus/workers/api/{index,types,http,SecurityCoordinator}.ts`, `nexus/vitest.workers.config.ts` |
| **Cílový stav** | Spec §1 (každý prvek jen pro dokumentovaný účel), §4 „Runtime and secrets" |
| **Chybí** | R2 binding + bucket, `ENVIRONMENT`, cron/alarm pro recovery, dělení rate limitu, seznam secretů per prostředí, staging Worker |
| **Testy** | `tests/workers/*` (workerd, **[T]** 38/38) – D1 a DO ano; R2 **ne** |
| **Stav** | D1/DO `VERIFIED` (workerd lokálně); R2 `IMPLEMENTED_UNVERIFIED` |

---

## 11. AI Gateway, rozhodovací a bezpečnostní vrstva

**Skutečnost [K]:** „AI Gateway" je **jedna vlastní route** `POST /api/ai/query` (`routes/aiGateway.ts`), **ne** produkt Cloudflare AI Gateway. Persony `pharmacist` a `wellness` (system prompt SK), vstup 1–1000 znaků, `max_tokens 512`, volá přímo Gemini 2.0 Flash (`AI_API_KEY` v **query stringu URL**) nebo Workers AI Llama 3 8B. Odpověď je jen text; AI **nemá nástroje ani přístup k platbám, DB, shellu, cenám či entitlementům** → spec §8 hranice AI se tím splňuje strukturálně.

**Zjištění:**
1. Žádná autentizace, žádný tenant, žádný audit/log obsahu ani nákladů.
2. `gdprConsent` je klientem tvrzený boolean (spec: souhlas a oprávnění určuje server).
3. Rate limit přes `caches.default` (Cache API) – **per datacentrum**, best-effort, race (read-modify-write); komentář uvádí DO, ale nepoužívá se. Odpověď po limitu 429 je jen pokud cache existuje.
4. `STATUS.md` uvádí „GDPR gate, anonymizáciou a tokenovými stropmi"; **anonymizace v kódu není** – dotazy (potenciálně zdravotní údaje, GDPR čl. 9) odcházejí třetí straně. To je právní/privacy riziko, ne jen technické. Smluvní rámec je AI asistent Fáze 2.
5. Import `from '../types'` bez `.js` (zbytek kódu používá `.js`) – funguje v tsc/vitest; nevím, zda v produkčním bundleru wrangleru shodně **[?]**.
6. **Rozhodovací vrstva** = deterministické: pricing pravidla, SafeOrder scorer, voucher rule. Neexistuje „policy gate" pro AI-navržené akce, protože se žádné AI akce neprovádějí. Typed command / allowlist konektorů z spec §8 není třeba, dokud AI zůstane read-only.

`/api/klub/subscribe` (Klub ANASTASIA) je mimo smluvní rozsah (matrix: FUTURE_SCOPE): neautentizovaný, bez tenant vazby, `PLAN_PRICE_IDS` jsou zástupné stringy (`price_anastasia_basic_monthly`), vytváří Stripe subscriptions **přímo mimo Medusa** (druhý zdroj pravdy o platbách – v rozporu se spec §1), bez idempotency key, e-mail se interpoluje do search query. V produkci by neměl být exponován.

| | |
|---|---|
| **Soubory** | `nexus/workers/api/routes/{aiGateway,klubSubscribe}.ts` |
| **Cílový stav** | Spec §8; matrix S2-04 (AI asistent Fáze 2) |
| **Chybí** | auth + tenant, server-side consent, redakce PII, audit, spolehlivý rate limit (DO), rozhodnutí o poskytovateli a DPA, vyřazení/odpojení `klub/subscribe` |
| **Testy** | `aiGatewayRoute.test.ts` (2), `klubSubscribeRoute.test.ts` (2) – minimální |
| **Stav** | AI `IMPLEMENTED_UNVERIFIED`/prototyp; Klub `FUTURE_SCOPE` s aktivním endpointem |

---

## 12. Adaptéry a integrační kontrakty

| Adaptér / kontrakt | Soubory | Skutečnost |
|---|---|---|
| **Medusa ↔ NEXUS pricing** | `backend/src/api/store/nexus-cart/route.ts` ↔ `nexus/workers/api/routes/nexusPricing.ts` | Bearer, tenant vazba klíče, JSON; kontrakt popsán v `NEXUS-INTEGRATION.md`; **[T]** ověřeno přes bridge (chyba `appliedRules` objekty vs. stringy byla nalezena a opravena 12. 10.) |
| **Medusa ↔ NEXUS SafeOrder** | `nexus-checkout/safeorder.ts` ↔ `nexusSafeOrder.ts` | viz §6.2; URL odvozená z pricing URL |
| **Medusa → NEXUS webhook** | – ↔ `medusaWebhook.ts` | **odesílatel neexistuje** |
| **`MedusaConnector`** (`nexus/connectors/medusa`) | 64 řádků | překlad DTO s **tvrdými defaulty** (`currency 'EUR'`, `tenantId 'anastasia'` při chybějících metadatech) – porušuje fail-closed spec (neznámý tenant má selhat); **nepoužívá ho žádná route**, jen test |
| **Shoptet** | `connectors/shoptet/{ShoptetApiClient,ShoptetPriceConnector,ReadOnlyGuard}.ts`, `routes/shoptetWebhook.ts` | legacy okfish; `ReadOnlyGuard` blokuje zápisy; HMAC-SHA1 + forward token; mimo ANASTASIA |
| **Omega, AIE/procurement, supplier-csv, SafeOrder/pricing legacy** | `connectors/*/legacy/**`, `domains/*` | migrované/portované knihovny; `NOT_MIGRATED.md` u omega/procurement/safeorder; mimo kritickou cestu ANASTASIA |
| **Connector contract** | `connectors/Connector.ts`, `IntentExecutor.ts`, `ExecutionIntent.ts` | dobrý návrh (UNKNOWN vs. FAILED, `supportsIdempotency`); chybí `verify` a `compensate` metody v kontraktu, deadline |
| **Stripe** | Medusa provider | viz §9 |
| **E-mail** | `notification-local` | placeholder |
| **Media Medusa ↔ Worker** | `media/token.ts` ↔ `mediaDelivery.ts` | HMAC-SHA256, shodný formát; viz §14. **URL kontrakt je křehký:** backend skládá `${MEDIA_DELIVERY_BASE_URL}/v1/<encodeURIComponent(key)>?t=…`, Worker očekává prefix `/api/media/v1/` → `MEDIA_DELIVERY_BASE_URL` musí končit `/api/media`; nikde nezdokumentováno |

**Dokumentační drift [K]:** `protected-media.md` tvrdí „doručovací Worker NOT_IMPLEMENTED", ačkoli `mediaDelivery.ts` existuje; `NEXUS-INTEGRATION.md` označuje hook jako read-only; `STATUS.md` uvádí 1 035 testů / 82 souborů (nyní 1 096 / 87) a „Klub & Stripe Billing ✅"; `REQUIREMENTS_MATRIX.md` v hlavičce cituje commit `1a2ddae`. Kromě toho zadání/handoff uvádí repo `L-Code-Dynamics-Dev/nexus`, zatímco skutečné je `hlancaric-ship-it/anastasia-nexus` (rozpor eviduje i matrix; řeší Lucky).

**Testy:** `MedusaConnector.test.ts` (1), `Phase6DomainSkeleton.test.ts`, `tests/integration/MedusaNexusE2E.test.ts` (Node, mock Worker), `nexus-contract.unit.spec.ts` (kontrakt backend strany). **Stav:** pricing/SafeOrder kontrakt `VERIFIED` (lokálně); ostatní `PARTIAL`.

---

## 13. Audit, observability, monitoring a incident recovery

**Implementováno [K]:** Worker – JSON logy (`level, event, ts, requestId, …`), redakce voucher kódů/tokenů (`redactVoucherCode`, `redactToken`), `alert: true` na incidentních událostech (chybějící binding, DO selhání, HOLD, voucher conflict, rate limit), test že SafeOrder neloguje e-mail ani credential; D1 `voucher_audit` (0002) včetně HOLD záznamů; Medusa – `logger.*` v routes/subscriberech; `backend/instrumentation.ts` existuje (neanalyzoval jsem obsah **[?]**); media audit je řádek v logu.

**Chybí vůči spec §3 bod 9–10 a Gate D:**
- žádná persistentní operation timeline ani audit pro cenu, SafeOrder, entitlement grant/revoke, media access (jen logy);
- žádné metriky, tracing, korelace Medusa↔Worker;
- `alert: true` není napojeno na žádné alerty (Workers Logs filtr/notifikace nikde nenakonfigurovány);
- žádný monitoring dostupnosti; produkční backup monitoring `BLOCKED`/nepřipraven (`PRODUCTION_RUNBOOK.md`);
- operátorské akce (retry, cancel, resolve quarantine) neexistují; admin routes mají jen grant/revoke entitlementu, správu bookingů, QR;
- redakční testy pro backend logy chybí.

**Incident recovery, co je skutečně k dispozici:** lokální `backup-local.mjs`/`restore-local.mjs` s ochranami a `PRODUCTION_RUNBOOK.md` (restore drill neproveden – dokument sám uvádí „není důkazem produkční připravenosti"). Provozní rozhodnutí z matrix (Medusa Cloud Develop, zálohy GitHub Actions weekday → R2, jen dokumentováno, neimplementováno) jsou **[D]**; zároveň matrix upozorňuje, že smlouva mluví o „denních" zálohách a neznámé chování po vyčerpání 600 compute hodin je nevyřešené riziko.

| | |
|---|---|
| **Soubory** | `nexus/workers/api/http.ts`, `nexus/migrations/0002_voucher_audit.sql`, `backend/instrumentation.ts`, `backend/docs/wp/PRODUCTION_RUNBOOK.md` |
| **Cílový stav** | Spec §3 body 9–10, §7 „Redaction tests", Gate C/D |
| **Chybí** | viz výše |
| **Testy** | redakce SafeOrder logu (workerd `safeOrder.test.ts`); jinak žádné |
| **Stav** | `PARTIAL` (logování), monitoring/alerty `NOT_IMPLEMENTED`, DR `PARTIAL` |

---

## 14. Bezpečnostní hranice a ochrana duševního vlastnictví

**Hranice, které kód skutečně vynucuje [K][T]:** service-to-service Bearer + tenant binding (Worker), fail-closed SafeOrder/pricing adaptéry, TLS-only credential (HTTP jen loopback), `redirect:"error"`, deadline 5 s, tělesný allowlist polí, konstantní čas porovnání, CORS allowlist v produkci (pokud je `ENVIRONMENT` nastaveno – viz §10), Medusa production config guard (secrets ≥32 znaků, HTTPS CORS, live Stripe), `ReadOnlyGuard` pro Shoptet, lokální DR skripty odmítající nelokální DB, `.gitignore` pro `backend/data-private`.

**Chráněná média (A-07):**
- Backend vydá token jen po `findActiveAccess` + shodě klíče s `product.metadata.protected_media`; TTL 30–900 s (default 600), nonce, HMAC-SHA256, ve Workeru `crypto.subtle.verify` (konstantní čas), expirace, `Cache-Control: private, no-store`, `nosniff`, jednotná odpověď 403 pro neplatný token/cizí objekt/neexistující soubor, parser `Range` včetně `416`, přepis HLS playlistu tokenem. **[K]** + 9 unit testů **[T]** (součást 1096).
- **Odchylky od spec §4 Media:**
  1. `isKeyAllowed` povolí **jakýkoli** objekt ve složce HLS playlistu (`requestedKey.startsWith(dir)`). Spec: „Never authorize a sibling file merely because it shares a directory" – požaduje explicitně vyjmenované HLS assety. Test dokonce tuto vlastnost potvrzuje („segment ze stejné složky projde"). Při špatné struktuře bucketu (více produktů v jedné složce) hrozí únik sousedních souborů.
  2. Token nenese tenant, metodu ani Range semantiku.
  3. **Revokace:** Worker nezná stav entitlementu; vydaný odkaz platí do 900 s po zrušení. Maximální okno expozice je odvoditelné z kódu, ale není zdokumentované jako akceptované rozhodnutí.
  4. Limit souběžných přehrávání neexistuje (jen `nonce` v logu).
  5. `R2` binding nenakonfigurován, bucket neexistuje, žádný test na reálném/emulovaném R2 (workerd miniflare R2 test chybí).
  6. Backend `deliveryBaseUrl`/`secret` se čtou z `process.env` při requestu (503 při nedostatku) – fail-fast při startu chybí.
- Hranice ochrany (nezabrání nahrávání obrazovky/DRM) je ve `protected-media.md` poctivě uvedena.

**Ochrana duševního vlastnictví [K]:**
- Repo je **soukromé** (předpoklad, neověřeno **[?]**); obsahuje legacy kód třetích systémů (okfish pricing engine, SafeOrder 3.0, Omega, AIE) pod `nexus/connectors/*/legacy`. Pricing politika, brandové limity a SafeOrder prahy jsou obchodní IP – v repu jsou v plaintextu (`StaticPricingConfigurationProvider.ts`, `nexusSafeOrder.ts`: COD limit, prahy).
- Politika tenanta pro ANASTASIA se podle návrhu předává přes secret/var (`MEDUSA_PRICING_POLICY_JSON`), což je správně; avšak SafeOrder prahy jsou natvrdo v kódu.
- Obchodní data zákaznic z legacy DB patří do gitignored `backend/data-private/` (PII). Ověřil jsem, že `.gitignore` existuje (obsah neanalyzoval). `git ls-files` nezahrnuje `data-private` (v první fázi výpisu jsem je vyloučil filtrem – **není to explicitní důkaz**, doporučuji `git ls-files backend/data-private` jako kontrolu).
- Registr pravidel pro „zákaznický" brand-limit je mapa v env (tajná), ale **odpovědi Workeru vracejí `appliedRules` názvy** (`BRAND_SALE`, `LOYALTY…`) → zákaznice může z metadat řádku odvodit strukturu slev. Přijatelné/nepřijatelné je obchodní rozhodnutí.
- Neexistuje licenční/atribuční dokument pro legacy části **[?]**.

**Další bezpečnostní nálezy:** viz §6–§11 (webhook unsigned při nenastaveném `ENVIRONMENT`, voucher bez service auth, AI bez auth/PII, klub bez auth, magic-link rate limit, HLS sourozenci).

| | |
|---|---|
| **Soubory** | `nexus/workers/api/routes/mediaDelivery.ts`, `backend/src/modules/entitlement/media/*`, `backend/src/api/store/media-access/route.ts`, `backend/medusa-config.ts`, `backend/.gitignore`/`.gitignore` |
| **Cílový stav** | Spec §4 Media, Runtime and secrets; §7 |
| **Chybí** | enumerované HLS assety, tenant/method v tokenu, limit souběžnosti, rozhodnutí o revokaci, R2 test, IP/licenční evidence, secret scanning v CI (neexistuje CI) |
| **Testy** | `MediaDelivery.test.ts` (9), `media.unit.spec.ts` (backend), workerd SafeOrder security |
| **Stav** | `PARTIAL` |

---

## 15. Datové modely, API a event kontrakty

**PostgreSQL (Medusa moduly):**
- `entitlement(id ent_*, customer_id, product_id, variant_id?, order_id?, status active|revoked, source order|admin|migration, granted_at, expires_at?, revoked_at?, revoke_reason?, granted_by?, dedupe_key, metadata jsonb, timestamps, deleted_at)`; unique `dedupe_key WHERE deleted_at IS NULL`; indexy `(customer_id,status)`, `order_id`, `product_id`. **Bez tenant_id.**
- `booking(id bkg_*, customer_id, product_id, order_id?, status held|confirmed|canceled|completed, starts_at, ends_at, held_until?, canceled_at?, cancel_reason?, notes?, metadata, …)`; částečný unique `(product_id, starts_at) WHERE status IN ('held','confirmed')`. **Bez tenant_id.** Stav `completed` nemá přechod.
- Migrace jsou ruční SQL (`create table if not exists`) – pro rollback pouze `down` s `drop table cascade` (destruktivní; AGENTS/CLAUDE zakazují destruktivní migrace bez dry-run/rollback plánu).

**D1:** `vouchers(id, tenant_id, initial/current_balance_minor, currency, created_at, expires_at, status, version, …)` s CHECK `current ≥ 0`, `current ≤ initial`; `voucher_transactions` s unique `(voucher_id, order_id)` pro čerpání, unique `(tenant, source_order)` pro emisi; `voucher_audit`; `execution_intents` (viz §5); `medusa_webhook_receipts(event_id PK, event_type, received_at)`.

**HTTP API – Worker:**

| Endpoint | Auth | Tenant z | Stav |
|---|---|---|---|
| `POST /api/nexus/pricing` | Bearer service key | vazba klíče | VERIFIED lokálně |
| `POST /api/nexus/safeorder` | Bearer service key | vazba klíče | VERIFIED lokálně |
| `GET /api/vouchers/validate` | žádná (rate limit IP+tenant) | **query** | workerd testováno |
| `POST /api/vouchers/redeem` | HMAC token + nonce | **tělo** | workerd souběh/replay |
| `POST /api/vouchers/issue` | Bearer service key | vazba klíče + tělo | VERIFIED |
| `GET/HEAD /api/media/v1/*` | HMAC token | – (token netenant) | unit |
| `POST /api/webhooks/medusa` | HMAC `X-Medusa-Signature` (t,v1; 300 s) | – | workerd dedupe; podpis nevynucen mimo prod |
| `POST /api/webhooks/shoptet` | HMAC-SHA1 + forward token | – | legacy |
| `POST /api/ai/query` | žádná | – | prototyp |
| `POST /api/klub/subscribe` | žádná | – | mimo rozsah |

**HTTP API – Medusa custom:** `POST /store/nexus-cart {cart_id, couponCode?}`, `POST /store/nexus-checkout {cart_id}` (kódy 400/403/404/409/503), `POST /store/media-access {product_id, media_key}`, `GET /store/entitlements`, `GET|POST /store/bookings`, `POST /store/bookings/:id/cancel`, `GET /store/booking-slots`, `POST /store/coupon-links`; `GET|POST /admin/entitlements`, `POST /admin/entitlements/:id/revoke`, `GET /admin/bookings`, `POST /admin/bookings/:id/cancel`, `POST /admin/coupon-links`. Chybové tvary se liší (`{ok:false,error}` v nexus-* vs. `{type,message}` v modulech) – není sjednocený error envelope. Žádné OpenAPI/JSON Schema pro event ani HTTP kontrakty; kontrakty existují jen v prose (`NEXUS-INTEGRATION.md`) a v typech.

**Event kontrakty:** viz §4 – neverzované, bez schémat. `nexus/core/canonical/CANONICAL-MODEL-CONTRACT.md` definuje kanonický model, ale ten je v adresářích `identities/`, `invariants/`, `lifecycle/`(část), `projections/`, `relationships/`, `source-of-truth/`, `validation/`, `versioning/` prázdný (`.gitkeep`).

---

## 16. Horizontální škálování, souběh a konzistence

| Oblast | Chování | Důkaz |
|---|---|---|
| Worker | bezstavový, škáluje se isolates; **žádný in-memory stav nesmí nést autoritu** (dodržováno u voucheru) | kód |
| Voucher čerpání | optimistický zámek `version`, `changes===1`, kompenzace; nonce v DO | **[T]** workerd: souběžné čerpání → právě jedno uspěje, replay zamítnut |
| DO `SecurityCoordinator` | jedna globální instance = propustnostní strop + SPOF pro `/redeem` a `/validate`; rate limit se ztrácí při eviction | kód, komentáře vědomé |
| D1 | jeden primární zápis; konzistence per-dotaz silná, mezi dotazy bez transakce (batch jen při SQL chybě) | **[T]** |
| Medusa instance | **vyžaduje Redis** (event bus, cache, workflow engine, locking); bez něj jen jedna instance; produkce jen varuje | `medusa-config.ts`, `DEPLOY.md` |
| Entitlement grant | idempotentní díky unique indexu; souběh `order.placed`×`payment.captured` ošetřen | unit (mock); **PG test souběhu chybí** |
| Booking | identický začátek DB-chráněn; **překryv ne** (race) | **[D]** SQL test; HTTP souběh netestován |
| Magic-link | stav v cache modulu (per proces bez Redis) | viz §7 |
| Cart repricing | read-modify-write bez zámku; hook ho znovu ověřuje na locked snapshotu → bezpečné, ale může generovat 409 při souběhu | persistence test |
| Spotřeba Workeru | N pricing volání na řádek košíku, bez batch endpointu a bez cache | kód |

**Konzistence vs. spec §6:** silná konzistence před platbou/přístupem je splněna pro cenu/částku (locked snapshot, Postgres), pro entitlement (Postgres) i voucher (D1 CHECK/unique). KV se nepoužívá jako autorita. Eventuální konzistence je akceptovatelná pro analytiku, ale mezi Medusa událostí a entitlementem není definována horní mez zpoždění ani reconciliace.

---

## 17. CI/CD, testování, migrace a disaster recovery

**CI/CD:** žádný aktivní CI. Dříve vytvořený `.github/workflows/wave1-p0.yml` byl odstraněn po incidentu (matrix §6a); poučení: žádný workflow bez schválení. `nexus/.github/workflows/test.yml` je dormantní (špatné umístění). Deploy je ruční (`wrangler`, instrukce v dokumentech); `DEPLOY.md` popisuje klasický Node host pro Medusu (`npm ci`, `medusa build`, `db:migrate`, bootstrap, `medusa user`, `medusa start`), rozhodnutí hostingu: Medusa Cloud Develop. Rollback postup pro aplikaci není popsán; D1 migrace nemají `down`.

**Testovací pyramida (skutečné počty na HEAD):**

| Vrstva | Co | Počet | Důkaz |
|---|---|---|---|
| Unit Node (NEXUS) | core, domains, connectors, routes (mock `Env`), regression/golden parity | 87 souborů/1096 | [T] PASS |
| Unit Node (backend) | policy, slots, token, adapters, scripts, hook s mock workflow | 22/203 | [T] PASS |
| workerd | D1 schema, voucher souběh, webhook dedupe, SafeOrder security | 4/38 | [T] PASS |
| Integration Medusa+PG | SafeOrder persistence (2 completion cesty, 38 scénářů) | 1 test | [T] PASS |
| E2E skript | `scripts/e2e-nexus-checkout.mjs` (`test:e2e:local`, `pp_system_default`) | – | nespuštěno (vyžaduje běžící stack), [D] |
| Stripe test mode, R2, e-mail sandbox, Cloudflare staging | – | 0 | **chybí** |
| Adversarial/IDOR/recovery/redakce | většinou chybí (viz §7, §13) | – | chybí |

`npm run test:integration:http` a `test:integration:modules` existují v `package.json`, ale jediný integrační spec lze spustit jen přes `verify-safeorder-local.py` (odmítne jiné prostředí).

**Migrace dat:** `parse-legacy-db.ts` (MS SQL dump → JSON v `data-private/legacy`), `import-anastasia-catalog.ts`, `migrate-legacy-customers-orders.ts` – dle matrix idempotentní s dry-runem, `reconciled: true`, hesla se nepřenášejí (`has_account=false`, draft tokenů, `send:false`), 17 zákaznic, 10 objednávek, 18 entitlementů, druhý běh bez změny **[D]**; unit testy `customer-migration` (323 řádků), `catalog-import` (119) **[T]**. Spec Gate D požaduje reconciled částky + restore drill + rollback – restore drill chybí pro staging/produkci. Reálná zákaznická data se v tomto běhu nečetla.

**Disaster recovery:** viz §5/§13. Matrix A-16 `VERIFIED (lokálně)`, A-17 `PARTIAL`. Neexistuje: záloha D1 (Time Travel/export), záloha DO storage, R2 versioning/replikace, retence, šifrování off-site, měřené RPO/RTO, produkční restore drill.

---

## 18. Souhrnná tabulka stavu komponent (16 oblastí)

| # | Komponenta | Skutečně v kódu | Hlavní mezera | Stav |
|---|---|---|---|---|
| 1 | NEXUS Core | knihovna bez runtime napojení | napojení, perzistence auditu/idempotence | IMPLEMENTED_UNVERIFIED (knihovna) |
| 2 | Orchestration / lifecycle | checkout hook + Medusa workflow | registry, runner, lease, retry, operator | PARTIAL / NOT_IMPLEMENTED |
| 3 | Event-driven | Medusa subscribery, D1 receipts | outbox, odesílatel webhooku, schémata | PARTIAL |
| 4 | Durable state/recovery | D1, DO, PG moduly | recovery testy, obecné operace | PARTIAL |
| 5 | Pricing + SafeOrder | server-side, tenant-bound, fail-closed | snapshot verze, audit, politika ANASTASIA | VERIFIED lokálně (část) |
| 6 | Identity/authz/tenant | Medusa auth, magic-link | rate limit, jednorázovost vs. neplatný pokus, tenant v modulech | PARTIAL |
| 7 | Medusa + obchodní procesy | moduly, routes, bootstrap | booking řetěz, `qrcode`, fail-fast, e-mail | PARTIAL |
| 8 | Platby/webhooky/entitlements | Medusa Stripe, entitlement logika | Stripe E2E, replay, reconciliace | IMPLEMENTED_UNVERIFIED |
| 9 | Cloudflare (Workers/DO/D1/R2/KV) | Worker, D1, DO | R2 binding, `ENVIRONMENT`, cron | PARTIAL |
| 10 | AI vrstva | jedna prototypová route | auth, PII, audit | prototyp |
| 11 | Adaptéry/kontrakty | Medusa↔Worker pricing/SafeOrder | webhook odesílatel, URL kontrakt média | PARTIAL |
| 12 | Audit/observability/DR | strukturované logy | alerty, timeline, metriky | PARTIAL / NOT_IMPLEMENTED |
| 13 | Bezpečnost/IP | service auth, fail-closed adaptéry | HLS sourozenci, `ENVIRONMENT`, voucher auth | PARTIAL |
| 14 | Datové modely/API/eventy | viz §15 | schémata, OpenAPI, tenant | PARTIAL |
| 15 | Škálování/souběh | D1/DO testované | DO SPOF, booking překryv | PARTIAL |
| 16 | CI/CD, testy, migrace, DR | manuální testy, lokální DR | žádný CI, restore drill, rollback | PARTIAL |

---

## 19. Prioritizovaná mezera vs. spec (bez časových odhadů)

**P0 – před jakýmkoli nasazením (porušují trust boundaries):**
1. Worker: deklarovat `ENVIRONMENT` v `env.production` a obrátit logiku na fail-closed (webhook secret, CORS). Soubory: `wrangler.jsonc`, `medusaWebhook.ts`, `http.ts`. Test: workerd test „production bez secretu → 503".
2. Voucher `/validate`+`/redeem`: service auth/tenant z identity, token vázaný na tenant, ověření objednávky/platby proti Medusa před čerpáním. Test: cross-tenant + replay.
3. Magic-link: neplatný pokus nesmí smazat platný state; rate limit napříč instancemi; Redis povinný v produkci. Test: adversarial sada ze spec §7.
4. Media: enumerace HLS assetů (nebo token s explicitním seznamem), tenant v tokenu, limit souběžnosti, rozhodnutí o okně revokace; R2 binding + workerd R2 test.
5. Produkční fail-fast: `REDIS_URL`, `S3_*`, `MEDIA_TOKEN_SECRET`, `NEXUS_*`, `MAGIC_LINK_BASE_URL` při startu (`medusa-config.ts` – vlastník: K4/integrátor, nutný souhlas).
6. Odpojit/chránit `/api/klub/subscribe` a `/api/ai/query` (auth nebo vypnout) ve všech neizolovaných prostředích.

**P1 – Wave 2 (durable lifecycle):**
7. Operation registry nad existující `execution_intents` (D1) + stavy ze spec (`RETRY_WAIT`, `NEEDS_REVIEW`, lease/deadline) + DO alarm/cron recovery; napojit nejdřív na jedno místo: Medusa webhook (receipt → inbox se stavem → handler → verify).
8. Odesílatel `order.placed`/`payment.*` z Medusy do Workeru (subscriber s retry) **nebo** formálně smazat webhook route.
9. Correlation ID: `x-request-id` z Medusy do Workeru a do logů.
10. Booking: zápis `booking_id` při checkoutu, expirační job, exclusion constraint, ověření vlastníka při confirm; souběžný HTTP test na PG.
11. Reconciliace objednávka↔platba↔entitlement (idempotentní, bez slepé mutace).
12. Snapshot ceny s verzí/hashem politiky, perzistentní audit cenového a SafeOrder rozhodnutí.

**P2 – Wave 3 (integrační akceptace):** Stripe test-mode E2E (cart → session → podepsaný webhook → paid order → entitlement → replay), entitlement po platbě v PG, restore drill na stagingu, aktivní CI schválený vlastníkem (kořenový `.github/workflows`, připnuté SHA, bez secretů), OpenAPI/JSON Schema pro HTTP a event kontrakty, schválená politika refund/revokace, schválená cenová politika ANASTASIA.

**Dokumentace k opravě:** `protected-media.md` (Worker existuje), `NEXUS-INTEGRATION.md` (hook není read-only), `STATUS.md` (počty testů, Klub), hlavička `REQUIREMENTS_MATRIX.md` (commit), doplnit `MEDIA_DELIVERY_BASE_URL` kontrakt, `qrcode` do dependencies (návrh pro integrátora).

---

## 20. Otevřené otázky (skutečná rozhodnutí vlastníka)

1. Je `ENVIRONMENT` v nasazeném Workeru nastavena na `production`? (Nemohu ověřit bez přístupu; doporučená bezpečná varianta: opravit v kódu fail-closed, nezávisle na tom.)
2. Je D1 migrace 0003/0005 aplikována na dev i produkční databázi?
3. Má zůstat `total ≤ 0 ⇒ zaplaceno` (automatický entitlement při 100% slevě)?
4. Jak dlouhé okno expozice po revokaci média je akceptovatelné (dnes až 900 s)?
5. Má se AI route před Fází 2 vypnout (zdravotní dotazy třetí straně bez anonymizace)?
6. Rozpor názvu repozitáře `L-Code-Dynamics-Dev/nexus` × `hlancaric-ship-it/anastasia-nexus`.

---

*Tento dokument je výstup analýzy; nemění `REQUIREMENTS_MATRIX.md` ani žádný kód. Navrhované umístění v repu: `docs/NEXUS_ARCHITECTURE_AS_IS.md` na nové větvi z `wave1-base` (nepushováno, čeká na potvrzení).*
