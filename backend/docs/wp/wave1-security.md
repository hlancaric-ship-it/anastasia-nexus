# Wave 1 — P0 SafeOrder security

Kanonický repozitář: `hlancaric-ship-it/anastasia-nexus`. Baseline `b01d3ed`;
izolovaná větev `codex/wave1-security`. Tato práce nepřepisuje původní auth změny,
neintegruje cizí větve a nic nenasazuje. Stav brány: **BLOCKED**, nikoli ACCEPTED.

## Nálezy a implementace

- Worker přijímal neautorizované SafeOrder požadavky. Nyní vyžaduje existující
  dedicated Medusa Bearer klíč a tenant binding; autentizuje před parsováním.
- Chybné JSON hodnoty se převáděly na nulu/prázdný string, neznámá metoda dostala
  nízké riziko a klient mohl změnit COD limit. Nyní jsou vstupy explicitní, částka
  konečná/nezáporná, měna EUR, metoda ze známých existujících hodnot. Nepovolená
  pole se odmítají. Původní COD limit 120 EUR, bodování a prahy 40/70 zachovány.
- Standardní Medusa completion obešel kontrolu v custom route. SafeOrder běží
  v `completeCartWorkflow.hooks.validate` po validaci ceny a platební částky.
  Používá skutečný locked snapshot poskytnutý Medusou, ne dodatečný dotaz.
  Kontroluje jeho řádky proti NEXUS a celý total včetně dopravy/daní. Každá
  processable payment session musí projít, první benigní session nesmí maskovat COD.
- Adaptér ověřuje tenant/měnu/částku odpovědi, typ a rozsah skóre, string factors,
  jednoznačné ALLOW s nízkým skóre; HTTP, timeout, redirect a chyby JSON blokují.
  Credential se posílá přes TLS (HTTP jen loopback), redirect je zakázán.
- Administrativní Worker issuance endpoint neměl autentizaci. Nyní vyžaduje
  stejnou service identitu a matching tenant před přístupem k voucher storage.
  Ověřená platba a atomické čerpání zůstávají samostatné následující brány.
- P0 handler nevypisuje zákaznický e-mail ani credential; negativní test ověřuje
  logy Worker entrypointu. Stávající production CORS allowlist odmítá cizí origin.
  Medusa framework 2.19 má globální `/admin` auth; coupon-links má navíc explicitní
  middleware. Skutečná admin session/role acceptance se tímto neprokazuje.

Zvolen nejmenší kompatibilní postup: použít již existující server identity a
Medusa completion hook, žádný vlastní order/auth protokol, žádná nová závislost.
Lokální `pp_system_default` povolen pouze při explicitním Worker test/development
prostředí. Neznámé payment IDs vyžadují review před rozšířením allowlistu.

## Autoritativní lokální podklady

Pro hook a statusy ověřen skutečný instalovaný Medusa 2.19 kód:
`@medusajs/core-flows/dist/cart/workflows/complete-cart.js` (validate před
vytvořením order a autorizací, hook nese `input` a `cart`),
`cart/steps/validate-cart-payments.js` (processable statusy),
`@medusajs/framework/dist/http/router.js` (globální admin auth).
Netvrdíme úspěšnou registraci na běžícím backendu pouze na základě těchto souborů.

## Reprodukce

Z checkoutu s instalovanými uzamčenými závislostmi:

```sh
cd nexus
npm test
npm run build
./node_modules/.bin/tsc -p tests/workers/tsconfig.json --noEmit
npm run test:workers
```

```sh
cd backend
./node_modules/.bin/tsc --noEmit
npm run test:unit
```

Node HTTP test `nexus/tests/integration/SafeOrderHttp.test.ts` otevírá jen
127.0.0.1 na náhodném portu, volá skutečný adaptér přes skutečný fetch na Worker
handler a po testu zavře listener. Používá syntetické identity; DB není používána.
**Nejde o workerd ani Medusa persistence E2E.** Hook unit test registruje callback
na mock workflow a prokazuje jeho fail-closed rozhodování, nikoli DB rollback.

Kvůli úplné typové kontrole byly opraveny také dva existující testovací fixtures:
MediaDelivery explicitně zužuje optional hodnotu mapy a Worker webhook fixture
obsahuje povinný syntetický HMAC binding. Produkční kód médií/webhooku nezměněn.

## Blockery a přesný další postup

1. Na tomto hostu workerd odmítá macOS 12.6 (minimum 13.5). Docker, Podman,
   Colima a Lima nejsou dostupné. Poskytnout schválený izolovaný Linux/CI nebo
   novější Mac a přístup. Nesmí sdílet DB, zákaznická data ani klíče s produkcí.
2. Na kompatibilním hostu spustit `cd nexus && npm run test:workers`; připraven
   nový SafeOrder runtime test. Selhání startupu zde znamená **0 spuštěných testů**.
3. Syntetický Medusa + Worker + Postgres: oba HTTP completion endpointy musí
   odmítnout invalid/unauthorized/REVIEW/BLOCK/unavailable SafeOrder, v DB ověřit
   nulový přírůstek validních objednávek. Pak ALLOW musí vytvořit objednávku s
   přesnými locked cenami a payment částkou. Zkontrolovat opakování a změny košíku.
4. Teprve s těmito důkazy uzavřít fázi 1 a zahájit K6 auth review/integraci.

Open P0: skutečná runtime/persistence akceptace. Open P1 v dalších branách:
mail delivery/session/tenant ownership, sandbox payment/webhook/entitlement,
voucher concurrency/restart a restore acceptance zde dosud neověřeny.
Žádná produkční readiness, staging/Fable acceptance ani Wave 1 completion není tvrzena.

Skutečné výsledky a historie commitů: [CODEX_PROGRESS.md](../../../CODEX_PROGRESS.md).
Trasování: [REQUIREMENTS_MATRIX.md](../../../docs/REQUIREMENTS_MATRIX.md).
