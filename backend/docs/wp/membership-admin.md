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
