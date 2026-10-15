# nexus-cart-auth: autentizace a ownership pro nexus-cart / nexus-checkout

Bezpečnostní fix nálezů **C1 / C3 / F3**: endpointy `POST /store/nexus-cart` a
`POST /store/nexus-checkout` přijímaly `cart_id` z klienta, přeceňovaly a
dokončovaly objednávky bez autentizace a bez kontroly vlastníka košíku.

## Stav
`IMPLEMENTED_UNVERIFIED` — `npx tsc --noEmit` a `npm run test:unit` zelené.
Runtime chování middleware matcheru a tvar `auth_context` nejsou jednotkovými
testy ověřitelné; vyžadují běžící Medusu (integration/e2e, zatím blokováno dle
CODEX_PROGRESS.md).

**P0 gate:** CODEX_PROGRESS.md (poslední záznam 2026-10-11) drží „Auth" zavřené
do průchodu P0 gate, který je stále `BLOCKED` (CI billing lock). Tento auth fix
byl udělán PŘED gate na explicitní pokyn Luckyho/Josefa („dodělej to"), nikoli
jako otevření gate.

## Provedené změny
- `src/api/store/nexus-cart/middlewares.ts` (nový): `authenticate("customer", ["session","bearer"])`
  na `POST /store/nexus-cart` i `POST /store/nexus-checkout`.
- `src/api/middlewares.ts`: registrace `nexusCartMiddlewares`.
- `src/api/store/nexus-cart/route.ts`:
  - `repriceCart(..., expectedCustomerId?)` — **strict** ownership:
    `cart.customer_id` se musí přesně rovnat; guest košík (`customer_id === null`)
    je odmítnut (`CART_ACCESS_DENIED`). Vynechání parametru kontrolu přeskakuje a
    je JEN pro důvěryhodné interní volající (`src/workflows/hooks.ts`).
  - Handler `POST` používá `AuthenticatedMedusaRequest`, vrací
    `401 UNAUTHORIZED` před zpracováním body, actor předává do `repriceCart`.
- `src/api/store/nexus-checkout/route.ts`: handler `401` před validací body,
  actor jako 5. argument `repriceCart`.
- Testy: `nexus-cart/__tests__/ownership.unit.spec.ts` (nový),
  doplněn `auth_context` do `nexus-checkout/__tests__/route-errors.unit.spec.ts`
  (+ 401 a předání actora) a `nexus-cart/__tests__/nexus-contract.unit.spec.ts`.
- `NEXUS-INTEGRATION.md`: sekce Authentication & cart ownership + status kódy.

## Nový kontrakt
Košík musí být asociován k přihlášené zákaznici
(`POST /store/carts/:id/customer`), jinak `nexus-cart`/`nexus-checkout` vrátí
`401` (nepřihlášeno) nebo `403 CART_ACCESS_DENIED` (cizí/guest košík).

## Testy
- `cd backend && npx tsc --noEmit` → exit 0.
- `cd backend && npm run test:unit` → 24 suites, 225 testů, vše PASS.

## Rizika
- **C1 (brute-force kupónů)** je login-gatingem jen zdražen, ne vyřešen —
  endpoint nemá rate-limit. Netvrdit „opraveno". Rate-limiter nebyl v rozsahu.
- `src/workflows/hooks.ts` volá `repriceCart` bez ownership (záměrně, důvěryhodná
  interní cesta). Běží i pro standardní `/store/carts/:id/complete`, který touto
  změnou ownership kontrolu NEDOSTÁVÁ — mimo rozsah tohoto fixu.
- Strict odmítnutí guest košíku je runtime-neověřené; shoduje se s existujícím
  vzorem `bookings/[id]/cart/route.ts` a s docstringem.

## Potřebná součinnost
- Konzumenti vytvářející **guest košík bez auth** teď dostanou 401/403. Nejsou
  součástí nexus CI workflow (`nexus/.github/workflows/test.yml` spouští jen
  nexus workspace testy), ale při spuštění proti živé Meduse spadnou na 401 a je
  nutné je doplnit o přihlášení + asociaci zákaznice (cesta `customerHeaders` v
  `newCart` už existuje): `scripts/e2e-nexus-checkout.mjs`, výchozí cesta v
  `integration-tests/http/safeorder-persistence.spec.ts` a `booking-http-checks.ts`.
  Záměrně needitováno naslepo — rozhodne vlastník.
- Rozhodnout o rate-limitu pro C1 jako samostatný balík.

## Další krok
Integration/e2e ověření na kompatibilním prostředí: 401 bez auth, 403 na cizí/
guest košík, 200 na vlastní košík; aktualizovat guest konzumenty výše.
