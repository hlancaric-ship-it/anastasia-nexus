# C-3 Doprava – mechanismus

- **Způsoby dopravy jsou v DB** (Medusa shipping options), zakládá je `anastasia-bootstrap.ts`:
  kurýr 6,00 € s DPH (fyzické produkty) a „Digitálny produkt (bez dopravy)“ 0 €. Cena, název i další způsoby
  (osobní odběr, Packeta, dobírka) se mění v adminu Medusy, ne v kódu.
- **Doprava zdarma od částky:** `ANASTASIA_FREE_SHIPPING_FROM_EUR` (EUR s DPH, max. 2 desetinná místa, prázdné =
  vypnuto). Bootstrap přidá ke kurýrovi nativní cenu 0 € s pravidlem `item_total >= hranice`. Hranice je včetně.
  Medusa cenu dopravy přepočítá při každé změně košíku (`refreshCartShippingMethodsWorkflow`), takže po snížení
  košíku pod hranici se doprava znovu účtuje. Cena se počítá jen na serveru; klient ji poslat nemůže.
- Bootstrap je idempotentní podle názvu: u už existujícího kurýra hranici nepřidá – tam se nastaví v adminu
  (Nastavenia → Lokality a doprava → cena s podmínkou „Celková suma položiek“).
- `item_total` je v Medusa 2 součet položek **s DPH a po slevách** (po přecenění NEXUS – věrnostní/kupónová sleva),
  bez dopravy. Hranice se tedy porovnává s hrubou cenou zboží, kterou zákaznice skutečně platí. Při cenách zadaných
  bez DPH (SK region daň přičítá) je 50 € bez DPH = 61,50 € v `item_total`.

## Testy

- Unit: `src/scripts/__tests__/anastasia-bootstrap.unit.spec.ts` (parsování hranice, ceny s pravidlem).
- HTTP (Actions, runner nastavuje 100 €; hranice ověřená na hrubé částce: 81,29 € bez DPH je pod hranicí,
  +0,02 € bez DPH nad ní): `integration-tests/http/shipping-settings-http-checks.ts` –
  `C3_SHIPPING_COURIER_PRICE_FROM_DB`, `CLIENT_CANNOT_SET_SHIPPING_PRICE`, `FREE_FROM_THRESHOLD_INCLUSIVE`,
  `BELOW_THRESHOLD_PAYS_AGAIN`.

## Doplní Lucky

Dopravci a ceny, hranice dopravy zdarma, osobní odběr, dobírka (+ SafeOrder pravidla pro dobírku).
