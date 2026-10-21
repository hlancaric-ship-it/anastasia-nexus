# K9 — rezervace přes HTTP a checkout

Větev `codex/booking-verification`, základ `44dbf33`. Pouze syntetické lokální prostředí, bez nasazení.

## Nálezy a implementace

- Checkout neověřoval rezervaci a komentář v order subscriberu sliboval neexistující propojení. Nový přihlášený endpoint `POST /store/bookings/:id/cart` s `{ cart_id }` ověří vlastníka, košík a produkt, zapíše autorizované ID košíku do rezervace a `booking_id` do metadat košíku. Samotné klientské `cart.metadata.booking_id` nestačí; ani shoda e-mailu/customer_id není autorizace.
- Společný validate hook po SafeOrder ALLOW kontroluje rezervaci u obou completion cest. Podporuje jeden rezervovaný produkt v množství 1 na košík. Vyžaduje správného vlastníka, produkt, autorizovaný košík a neprošlý hold. Databázový row lock chrání přiřazení rezervace ke checkoutu. Kompenzace vrací původní expiraci při selhání platby nebo registrace kupónu.
- Nezaplacená dokončená objednávka drží termín bez původního 15minutového timeoutu, skutečný capture jej potvrdí. Subscriber ověří i skutečný Medusa order-cart link. Storno objednávky termín uvolní; opožděná událost jej nesmí obnovit. Přímé zrušení rezervace v checkoutu vrací 409, ruší se nejdřív objednávka.
- Původní unikátní index chránil jen shodný začátek. Vytváření holdu nyní používá transakční PostgreSQL advisory lock podle produktu a kontrolu překryvu celého intervalu včetně serverem nastavené pauzy. Expirace předchozích holdů běží v téže transakci. Databázový index zůstává zachován.
- Bez nové migrace či závislostí. Beze změn pricing konfigurace, tierů, entitlement implementace a `admin-demo`.

## API návaznost pro storefront

1. Přihlášená zákazník vybere slot a vytvoří hold přes `POST /store/bookings`.
2. Košík se přiřadí účtu standardní Medusa routou `POST /store/carts/:id/customer` (Bearer/session). Samotná hlavička při vytvoření veřejného košíku toto přiřazení nezaručuje.
3. `POST /store/bookings/:id/cart` s `{ cart_id }` propojí vlastní hold a košík. Přesun na jiný košík je dovolen jen před zahájením checkoutu, předchozí košík tím ztratí oprávnění rezervaci koupit.
4. Následuje serverový přepočet, platební session a standardní nebo NEXUS completion. Bez rezervace nelze dokončit košík s produktem obsahujícím `metadata.booking`.

## Ověření

Stav: **VERIFIED lokálně**. Konečná regrese dokončena, bez nasazení.

- `python3 backend/scripts/verify-safeorder-local.py`: **PASS, 51 scénářů (11 K9), 187,879 s**. Včetně původních SafeOrder a QR souběhů, překryvu samotné pauzy, kompenzace platební chyby a capture/storno. Trvalý výpis K9: [evidence/booking-checkout.json](evidence/booking-checkout.json). Celý lokální důkaz: `/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-safeorder-9qda_ocz/medusa-persistence-evidence.json`.
- `cd backend && npx tsc --noEmit`: **PASS**.
- `cd backend && npm run test:unit`: **23/23 souborů, 218/218 testů PASS**, 87,021 s. QR test prošel beze změny limitu. Log: `/tmp/booking-unit-regression.log`.
- `git diff --check`: **PASS**.

- Cílené unit testy: 42/42 PASS před posledním rozšířením.
- `python3 backend/scripts/verify-safeorder-local.py --booking-only`: PASS, 10 zaznamenaných scénářů, 97,636 s. Důkaz: `/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-safeorder-1bfi_180/medusa-persistence-evidence.json`.
- První kompletní unit běh: 216/217, známý timeout QR PNG při souběhu s integrací; neopravována implementace QR ani navyšován její timeout. Finální běhy byly spuštěny postupně a prošly.
- Dva průběžné integrační běhy byly ukončeny během dalších změn, nejsou počítané jako PASS. První cílený běh odhalil chybějící standardní přiřazení zákazník ke košíku v test fixture; druhý obecnou HTTP chybu místo pojmenovaného odmítnutí prošlého holdu. Obojí opraveno a cílený běh zopakován úspěšně.

Runner `python3 backend/scripts/verify-safeorder-local.py --booking-only` používá stejný bezpečnostně omezený, nově vytvořený PostgreSQL cluster jako celý runner. HTTP routy, Medusa workflows, booking service, platba `pp_system_default` a subscribers běží skutečně. Autentizované zákazník mají syntetické JWT fixtures; toto není test přihlašovacího procesu. Bariéra pouze synchronizuje vstupy do skutečné služby. Při testu kompenzace je úmyslně vyvolána jedna chyba autorizace platby. NEXUS handler běží přes Node bridge, nikoli workerd.

## Zbývá v širším plánu

Reálná testovací Stripe platba, zákazníkové/admin notifikace, frontend rezervací a admin kalendář, integrovaná K4/C8 sada. Objednávky čekající na platbu se musí provozně rušit přes order lifecycle; tento balík nezavádí nový časový limit pro nezaplacené objednávky. Obnova workflow po pádu procesu a produkční Redis nejsou tímto lokálním během ověřené. Lokální hlavní checkout s rozpracovanými změnami zůstal nedotčený.
