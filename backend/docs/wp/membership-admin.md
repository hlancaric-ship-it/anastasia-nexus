# Správa členství

Stav: IMPLEMENTED; cílené unit testy 24/24, reálný Chrome 26 kontrol (1440 a přesných 390 px) a backend TypeScript PASS. Integrovaný PostgreSQL a plná regrese patří pouze do CI integrační větve. Toto není potvrzení dokončeného celého Klubu.

## Obrazovka `/app/clenstva`

Osobní motiv z `/admin/my-theme` je společný s C5. Záložky Členstvá, Nedokončené nákupy a Členské produkty mají skutečné načítání, stránkování, prázdný a chybový stav. Zobrazuje nativní jméno zákaznice/název produktu, poslední objednávku a odděleně skutečný stav přístupu (aktivní/odebraný/vypršel/čeká/kontrola). Samotný membership.status nikdy neznamená aktivní přístup. Odkazy směřují na existující nativní detail zákaznice, produktu a objednávky.

Stop vyžaduje potvrzení. Zachovává zaplacené období, nevydává refund a nepředstírá zastavení již rozběhnuté platby. Po nejasném zápisu je další zápis blokován až do úspěšného načtení. Žádná automatická platba ani opakovaný checkout z UI.

Produktový editor nastavuje pouze `metadata.membership = {version, period_days}`; cena se spravuje v nativním detailu produktu. 1–3650 celých UTC dnů, žádný slib kalendářních měsíců. Při změně délky musí být nová verze. Již uzavřené immutable smlouvy se nemění. Cenové hodnoty nejsou v tomto UI počítány ani přijímány.

## API

- `GET /admin/memberships?tab=memberships|checkouts|products&offset=0&limit=12&q=...`: pevné projekce bez smluvních snapshotů/platebních metod, nejvýše 50 řádků. U členství/nákupů přesný customer_id, u produktů nativní textové hledání. Přístup se čte přes veřejné entitlement API, nikdy se při načítání neuděluje.
- `POST /admin/memberships/:id/stop {}`: existující module.stop pod jeho transakčním zámkem, audit po změně; idempotentní.
- `POST /admin/memberships/products/:id {expected:null|{version,period_days}, configuration:{version,period_days}}`: striktní schema, vlastní product lock, optimistic předchozí konfigurace, nativní ProductModule.updateProducts + readback. Nativní ProductRepository.deepUpdate slučuje metadata; odesílá se pouze membership klíč, ostatní metadata se nepřepisují starou kopií.

Medusa ApiLoader v 2.19.0 autentizuje celý `/admin` namespace jako user; každá nová route navíc ověřuje adminActor před získáním služby. Hlavička no-store, 400/401/404/409/503 mají srozumitelnou hlášku. Žádná route nemá AUTHENTICATE=false.

Produktový zámek a optimistic kontrola chrání tento editor; nejsou globální atomickou verzí napříč libovolnými nativními editory. Verze nemá globální registr historických označení: renewal integrace musí porovnat také délku immutable Terms, nesmí spoléhat pouze na version+amount. Souhlas/mandát ani platba se tímto editorem nevytváří.

## Ověření

Ve složce backend:

```
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules ./node_modules/.bin/jest --runTestsByPath src/lib/membership/__tests__/admin.unit.spec.ts --runInBand --forceExit --silent
./node_modules/.bin/tsc --noEmit
node scripts/check-membership-admin-browser.mjs
```

Browser harness má pouze syntetické odpovědi fetch, skutečný React/DOM, formuláře, dialogy, klikání, nativní odkazy, readback a zákaz opakování nejisté mutace. Neprohlašuje to za PostgreSQL/Stripe E2E. Mac Chrome potřeboval v testovacím headless režimu vypnout frame-rate limit/vsync kvůli CVDisplayLink; produkční animace se neměnily. Integrační CI má spustit stejný browser skript na Linux Chrome.

Potřebná integrace: membership module musí zapojit vlastník medusa-config až s kompletním tokem. Source inventory aktualizovat o nové admin route a test; globální middleware, config, entitlement source, package/lock a NEXUS se neměnily.

## Platby a obnovy — integrační doplnění

Čtvrtá záložka zobrazuje skutečné MembershipBillingAttempt přes `listAndCountMembershipBillingAttempts`: pouze id, membership_id, stage jako bezpečný lidský popis, order_id, created_at/updated_at. Nikdy snapshot, platební session/metoda, Stripe zákazník nebo secret. `needs_action` vysvětluje požadavek potvrzení zákaznicí, unknown/review neoznačuje jako zaplaceno.

`POST /admin/memberships/billing/:id/reconcile {}` vyžaduje admina, dohledá existující pokus a volá výhradně `reconcileMembershipBilling(scope,id)` z billing balíku (závislost54fa339). Tato funkce pouze čte existující order_cart/capture a aplikuje již ověřený doklad+přístup. Žádný nový košík, platba ani checkout retry. UI předem potvrdí účel akce. `RECONCILIATION_REQUIRED` zůstává otevřeným výsledkem a nesmí se zobrazit jako úspěšně zaplacené; SETTLED je pouze ověřená objednávka/platba, skutečný přístup zůstává samostatně zobrazený u členství. Akce se audituje bez citlivých platebních identifikátorů.

Rozšířené unit:31/31 PASS a tsc PASS. Browser přidal potvrzení reconciliation-only akce (15 kontrol na viewport); konečné prověření celé kombinace a PostgreSQL musí potvrdit integrační CI. macOS headless Chrome může náhodně skončit allocator/CVDisplayLink timeoutem i po úspěšném1440 běhu; diagnosticky lze zvolit jediný viewport `MEMBERSHIP_ADMIN_VIEWPORT=390`, výchozí CI spouští oba.
