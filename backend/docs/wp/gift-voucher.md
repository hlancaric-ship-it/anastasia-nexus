# K8 — dárkový poukaz (14. 10. 2026)

Větev: `feat/gift-voucher`. Změna pouze lokální, bez nasazení a bez produkčních přístupů.

Zadání (Lucky, 14. 10. 2026): dárkový poukaz si kdokoli koupí jako dárek. Vše je nastavitelné v adminu. Výchozí nastavení: hodnoty 50 / 100 / 200 €, platnost 12 měsíců, rozsah „vše“, postupné čerpání ano, doručení obdarovanému e-mailem a kupujícímu PDF.

## Rozhodnutí: Medusa modul (PostgreSQL), ne Worker runtime

Poukaz je nový Medusa modul `backend/src/modules/gift-voucher`. Existující voucher routy ve Workeru (D1 + Durable Object) zůstávají beze změny a K8 je nepoužívá. Důvody:

1. **Jedna transakce s objednávkou.** Čerpání musí být atomické s `completeCartWorkflow` a vratné jeho kompenzací. Worker s D1 by znamenal distribuovanou transakci mezi D1 a PostgreSQL, takže by šlo o dvě nezávislé databáze bez společného rollbacku.
2. **Protokol Workeru je postavený pro Shoptet.** Validace vyžaduje HMAC token a otisk košíku, platí per-IP limit 10 požadavků za minutu na validaci a částky jsou v CZK. Worker nemá endpointy pro vrácení, storno, zneplatnění ani přehled. To vše by se muselo dopsat a navíc synchronizovat se dvěma databázemi.
3. **Měna a model košíku.** Medusa košík je v EUR a kredit poukazu je nativní `cart credit line`. Medusa ho promítne do `cart.total`, zkopíruje do objednávky a při nulovém zbytku sama přeskočí platbu.
4. **Ověřitelnost.** Celý tok jde ověřit stávajícím izolovaným HTTP runnerem (skutečná Medusa a PostgreSQL). workerd se na macOS 12 ověřuje jen ve VM.

Souběh řeší zámek řádku poukazu (`SELECT … FOR UPDATE`), podmíněný UPDATE a CHECK constrainty v PG: zůstatek je v rozmezí 0 až počáteční hodnota a jedno košíkové čerpání je povolené jen jednou (unikátní částečný index).

## Datový model (`Migration20261014120000`)

- `gift_voucher`: částky v centech. Pole:
  - kód (unikátní) a `code_last4`;
  - `initial_amount`, `balance`, `status` (active / depleted / expired / void);
  - `issued_at`, `expires_at`;
  - `issue_key` (unikátní, idempotence vystavení);
  - **snapshot pravidel**: `scope`, `partial_redemption`, `delivery_method`;
  - doručení: obdarovaný, venování ≤ 300 znaků, datum doručení, stav a pokusy;
  - zneplatnění.
- `gift_voucher_transaction`: auditní deník (`issued`, `redeemed`, `forfeited`, `reversed`, `refunded`, `voided`, `expired`). Má unikátní `idempotency_key` a částečný unikátní index (voucher, cart) pro aktivní čerpání.
- `gift_voucher_settings`: jeden řádek `default`. Bez řádku platí výchozí hodnoty. Poškozený řádek prodej vypne.

Vydaný poukaz si drží vlastní snapshot pravidel. Změna nastavení platí jen pro nově vystavené poukazy. Vystavení používá nastavení platné **v okamžiku vystavení** (po zaplacení), ne v okamžiku vložení do košíku.

## Nastavení a admin

Nově `GET /admin/vouchers/:id/transactions` zpřístupňuje trvalou historii pohybů správci, stránkovaně a bez kódů/poznámek/kontaktů. Částky převádí server; dokumentace v `backend-completion.md`.

- `GET/POST /admin/vouchers/settings`:
  - Validuje hodnoty v eurech (1–10 hodnot, max. 2 desetinná místa, bez duplicit), platnost 1–60 měsíců, rozsah `all` / `categories` s ID kategorií, postupné čerpání a způsob doručení (`recipient_email` / `buyer_pdf` / `both`).
  - Po uložení se zosúladí produkt `darkovy-poukaz` (`is_giftcard`, bez slev, digitální profil). Každá hodnota má jednu variantu, `GIFT-VOUCHER-<centy>`, s cenou EUR = nominální hodnota.
  - Odebrané hodnoty se smažou jako varianty, nové se přidají. Vypnutý prodej přepne produkt do stavu draft.
- `GET /admin/vouchers` vrací přehled (filtr stavu a objednávky, stránkování). Kód je **vždy maskovaný** (`GV-****-****-****-ABCD`).
- `POST /admin/vouchers/:id/void` zneplatní poukaz. Důvod je povinný, zůstatek se vynuluje a zapíše se transakce.
- `POST /admin/vouchers/refund` vrátí částku na poukaz (viz Vratky).
- Admin stránka `src/admin/routes/vouchers/page.tsx` („Darčekové poukazy“, slovensky) obsahuje formulář nastavení, výběr kategorií a přehled se zneplatněním.

Všechny admin routy mají `authenticate("user")`, kontrolu `actor_type === "user"` a `Cache-Control: no-store`.

## Koupě

1. Zákazník vloží variantu poukazu do košíku. `repriceCart` u poukazu nevolá NEXUS: cena řádku = nominální hodnota a musí odpovídat `calculated_price`, jinak vrátí `GIFT_VOUCHER_PRODUCT_INVALID`.
2. `POST /store/gift-vouchers/recipients` přijímá `{ cart_id, recipients: { [variant_id]: [{ name, email, message?, delivery_date? }] } }`. Server ověří jméno, e-mail, venování ≤ 300 znaků, datum (dnes podle Bratislavy až do konce platnosti) a počet obdarovaných vůči kusům. Výsledek uloží do `cart.metadata.gift_voucher_recipients`.
3. Checkout hook (`prepareGiftVoucherCheckout`) totéž ověří **znovu nad zamčeným snapshotem**: prodej je zapnutý, hodnota je povolená, cena odpovídá a obdarovaní jsou kompletní.
4. Vystavení probíhá **až po zaplacení** (`isOrderPaid`, sdílené s entitlementem). Spouští ho subscribery `order.placed` a `payment.captured`.
   - Kód má 16 znaků z 32znakové abecedy (80 bitů, `crypto.randomBytes`).
   - `issue_key = order:<id>:<variant>:<kus>` drží idempotenci. Advisory lock a unikátní index brání dvojímu vystavení i při souběhu obou událostí. Kolize kódu se zopakuje v savepointu.
   - Nezaplacená objednávka (dobírka, autorizace bez capture) nevystaví nic.
5. Událost `voucher.issued` nese jen `{ id }`, bez kódu a bez e-mailu.

## Doručení (za rozhraním)

`GiftVoucherDeliveryChannel` (`delivery.ts`) má jednu implementaci nad Medusa Notification modulem: šablony `gift-voucher-recipient-sk` a `gift-voucher-buyer-sk` a PDF přílohu, generovanou bez závislostí (`pdf.ts`). Notifikace jsou aktivní **jen při `GIFT_VOUCHER_DELIVERY=notification`**. Lokální provider `notification-local` totiž loguje celé `data`, včetně kódu. Bez tohoto přepínače se loguje jen maskovaný kód.

Pořadí doručení:

- PDF kupujícímu jde hned.
- E-mail obdarovanému odejde v den doručení. Do té doby má stav `scheduled` a pošle ho hodinový job `gift-voucher-maintenance`, který zároveň expiruje prošlé poukazy.
- Doručení si běh nejprve atomicky zabere (`claimDelivery` / `claimBuyerCopy`), takže subscriber a job nepošlou e-mail dvakrát.

## Čerpání

1. `POST /store/gift-vouchers/apply { cart_id, code }`:
   - Server normalizuje kód a ověří stav, platnost a měnu.
   - Spočítá **způsobilou částku**: položky mimo poukazy (poukaz nikdy neplatí jiný poukaz); při rozsahu `categories` jen položky z vybraných kategorií, bez dopravy.
   - Vytvoří jeden credit line `reference = "gift_voucher"` ve výši min(zůstatek, způsobilá částka). Výši nikdy neurčuje klient.
   - Neexistující, zneplatněný i cizoměnový kód vrací stejnou chybu `GIFT_VOUCHER_INVALID`.
2. `POST /store/gift-vouchers/remove` kredit odebere.
3. Každý přepočet košíku (`repriceCart` s ukládáním) kredit znovu srovná. Když se změní, nexus-checkout vrátí 409 `PRICE_CHANGED_PAYMENT_REINITIALIZATION_REQUIRED`. Poukaz, který mezitím přestal platit, se z košíku odebere.
4. `completeCartWorkflow.hooks.validate` probíhá ve stejném vzoru jako C3 kupón:
   - Košík celý uhrazený poukazem (`total = 0` a existuje gift_voucher credit line) přeskočí kontrolu platební relace a SafeOrder. Medusa sama nevyžaduje platbu.
   - `prepareGiftVoucherCheckout` nad snapshotem ověří: nejvýš jeden poukaz, 0 < kredit ≤ způsobilá částka (podle rozsahu ve snapshotu poukazu).
   - Po rezervaci a registraci kupónu proběhne `redeem` v DB transakci: zámek řádku, `assertUsable`, `computeRedemption`, podmíněný UPDATE (`balance >= částka`, `status = active`, `expires_at > now`) a zápis transakce.
   - Jednorázový poukaz (`partial_redemption = false`) musí čerpat maximum a zbytek se zapíše jako `forfeited`.
   - Selže-li cokoli v hooku, hook sám vrátí kupón, rezervaci i čerpání (Medusa kompenzaci hooku při jeho výjimce nevolá). Selže-li pozdější krok workflow, kompenzace zavolá `reverseRedemption`. Ta je idempotentní a vrací i propadlý zbytek.
5. Subscriber `order.placed` přiřadí čerpání k objednávce (`order_id`).

## Vratky

- **Storno objednávky** (`order.canceled`): celá částka zaplacená poukazem, včetně propadlého zbytku jednorázového poukazu, se vrátí na poukaz. Idempotenci drží `cancel:<order>`. Nečerpané poukazy koupené touto objednávkou se zneplatní. Načatý koupený poukaz se nezneplatní, jen se zaloguje varování (maskovaný kód) k ručnímu řešení.
- **Částečná vratka**: ručně přes `POST /admin/vouchers/refund { order_id, amount, idempotency_key }`. Strop je čerpaná částka minus už vrácené. Opakovaný klíč nic nezdvojí. Platí pro poukaz zaplacenou část objednávky. Kartou zaplacená část se vrací standardně přes Medusa/Stripe.
- **Nepokryto automaticky:** Medusa returns/claims (`return.received`) ani plný refund kartou za *koupený* poukaz (`payment.refunded`) poukaz automaticky nezneplatní. Řeší se ručně zneplatněním v adminu. Viz Zbývá.

## Ověření

- Unit testy (`npm run test:unit`):
  - `src/modules/gift-voucher/__tests__/policy.unit.spec.ts`: nastavení, kódy, maskování, peníze, expirace, obdarovaní, rozsah, částečné/jednorázové čerpání, serializovaný souběh.
  - `issuance-delivery.unit.spec.ts`: vystavení jen po zaplacení, idempotence opakované i souběžné události, odmítnutí nesouhlasné ceny, storno, doručení (vypnuto/maskováno, both, naplánováno, claim, selhání), PDF, plán variant.
  - `src/workflows/__tests__/gift-voucher-checkout.unit.spec.ts`: ověření nad snapshotem, rozsah kategorií, poukaz neplatí poukaz, hook: plné pokrytí bez platby, rollback kupónu a rezervace při selhání čerpání, kompenzace, replay; mapování chyb na HTTP.
- HTTP scénáře `integration-tests/http/gift-voucher-http-checks.ts` běží ve stávajícím izolovaném runneru (`scripts/verify-safeorder-local.py`, nový přepínač `--gift-voucher-only`) se skutečnou Medusou 2.19, PostgreSQL a Node Worker bridge:
  - `K8_ADMIN_SETTINGS_PRODUCT_SYNC`: 401 bez přihlášení, 400 při duplicitě, změna hodnot přidá i odebere variantu.
  - `K8_PURCHASE_ISSUE_AFTER_PAYMENT_IDEMPOTENT`:
    - Bez obdarovaného je checkout odmítnut 400 a objednávka nevznikne.
    - Neplatný e-mail a venování > 300 znaků vracejí 400.
    - Poukaz nejde zaplatit poukazem.
    - Bez capture nevznikne žádný poukaz; po capture vzniknou 2.
    - 3 opakovaná / souběžná vystavení nevytvoří další poukaz.
  - `K8_FULL_COVER_NO_PAYMENT`: objednávka bez platby, zůstatek snížen.
  - `K8_PARTIAL_COVER_PAID_REST`: kredit + platba zbytku přes nexus-checkout.
  - `K8_CONCURRENT_SINGLE_BALANCE`: dva košíky, jeden poukaz, bariéra v `redeem` (standard + NEXUS cesta). Výsledek `[200, 400]`, právě 1 objednávka, 1 aktivní čerpání, zůstatek 0, neúspěšný košík nedokončen.
  - `K8_INVALID_EXPIRED_VOID_UNKNOWN`, `K8_VOIDED_BEFORE_CHECKOUT` (409, žádná objednávka).
  - `K8_ADMIN_REFUND_TO_VOUCHER`: vrácení, replay, překročení stropu 409.
  - `K8_SINGLE_USE_FORFEIT_AND_CANCEL_RESTORE`: propadnutí zbytku a obnovení po stornu.
  - `K8_ADMIN_LIST_MASKED`: přehled nikdy neobsahuje celý kód.
  - Log testu neobsahuje celé kódy ani e-maily obdarovaných.

Stav: **VERIFIED lokálně** (syntetická data, bez nasazení). Výsledky běhů jsou v sekci Výsledky níže.

### Oprava izolace HTTP testů (14. 10. 2026)

K8 vytváří vlastní produkt `synthetic-k8-goods` bez rezervace (50 EUR, stejný prodejní kanál a shipping profil). Nesdílí produkt s booking scénáři ani nepřepisuje jejich metadata. Kód poukazu a Python runner zůstaly beze změny.

Ověřeno po opravě: plný `python3 backend/scripts/verify-safeorder-local.py` (bez přepínačů, lokální Medusa + nový syntetický PostgreSQL) PASS; `npm run test:unit` v `backend/` 305/305 PASS; `npx tsc --noEmit` PASS. Důkaz plného běhu: `/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-safeorder-fxz47cf2/medusa-persistence-evidence.json`.

## Rizika a otevřené body

- **DPH:** poukaz je dnes produkt s cenou v EUR. Zda jde o jednoúčelový, nebo víceúčelový poukaz (moment zdanění), musí potvrdit účetní, protože rozsah `all` přes různé sazby DPH je typicky víceúčelový.
- **Kód v DB v otevřené podobě** (stejně jako D1 ve Workeru), aby šel znovu poslat. Odolnost proti hádání dává 80 bitů entropie. Na `/store/gift-vouchers/apply` je PostgreSQL limit 20 pokusů za 60 sekund na síťového klienta (sdílený mezi instancemi), 429 + Retry-After; výpadek jeho úložiště → 503. Podrobnosti a migrační pořadí v `backend-completion.md`.
- **Doručení at-most-once:** claim se zapíše před odesláním. Pád procesu mezi claimem a odesláním znamená neodeslaný e-mail bez opakování. Selhání odeslání se opakuje (max. 5 pokusů).
- **Čerpání a workflow nejsou v jedné DB transakci:** stejně jako C3 kupón. Pád procesu po `redeem` a před kompenzací může nechat čerpání bez objednávky. Je auditovatelné v `gift_voucher_transaction` (redeemed bez `order_id`) a vratné `reverseRedemption`.
- Rozsah kategorií porovnává přesná ID (bez podkategorií). Doprava se počítá jen při rozsahu `all`.
- Datum doručení obdarovanému se ověřuje vůči platnosti podle nastavení při vložení do košíku. Vystavení použije nastavení v okamžiku zaplacení.
- Produkční e-mail provider zatím není rozhodnutý. Bez `GIFT_VOUCHER_DELIVERY=notification` se nic neposílá.

## Zbývá

- Storefront má prototyp výběru hodnoty, formuláře obdarovaného a pole pro kód v košíku nad mockem; připojení na skutečné backend API zůstává samostatnou integrační prací.
- Automatické zneplatnění koupeného poukazu při plném refundu kartou (`payment.refunded`) a napojení Medusa returns na vratku na poukaz.
- E-mailové šablony u vybraného providera a rozhodnutí účetní k DPH.
