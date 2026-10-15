# X3 — Storno objednávky zákaznicí

Větev `codex/order-self-cancel`, vlastní worktree, základ integrace8cf9c86 + závislosti X1/X2.
Backend bez UI, žádné nové moduly/závislosti ani klientské výpočty.

## Kontrakt

`POST /store/orders/:id/cancel` vyžaduje přihlášenou zákaznici. Z těla se nepřebírá vlastník,
částka, status ani důvod pro obejití pravidel. Cizí/neexistující objednávka404; anonym401;
no-store; serverový limit10/min/customer (X1 PG rate limiter), limit429 + Retry-After.

Kontroly před každou mutací:

- Jen vlastní pending/requires_action objednávka, nikdy koncept, completed nebo canceled.
- Žádný aktivní fulfillment ani dříve odeslaná/doručená zásilka; nativní cancel znovu validuje fulfillment.
- Žádný digitální nárok z této objednávky, ani později revokovaný/expirující: obsah už byl dostupný.
  Digitální objednávka bez capture/grantu zatím zrušit jde. Jiný nárok na stejný produkt z jiné objednávky
  sám o sobě tuto objednávku neblokuje.
- Aktivní rezervace musí být více než `ORDER_SELF_CANCEL_BOOKING_HOURS` před začátkem;
  výchozí24h, celé0–720. Neplatná konfigurace bezpečně503; přesná hranice se odmítá409.
  Zahrnuje vazbu booking_id v objednávce ještě před asynchronním order.placed připojením rezervace.
- Objednávka s už vystaveným poukazem patří do ručního storna správce (409), i když ještě není čerpaný.
  Vystavený bearer kód už mohl opustit účet; prostá kontrola zůstatku by nevyloučila souběžné čerpání
  mezi kontrolou a refundem karty. Žádná druhá logika void/refund se nepřidává. Vrácení kreditu
  poukazu použitého k úhradě běžné objednávky funguje nadále. Nad100 rezervací/poukazů ruční kontrola.

Dva souběžné požadavky serializuje **PostgreSQL pg_try_advisory_xact_lock**, ne paměť procesu.
Cizí vlastník se odmítne ještě před mutexem, stav se uvnitř znovu načte. Prohrávající požadavek409,
vítěz200, pozdější replay zrušeného stavu409. Životnost mutexu je DB transakce; crash spojení ho uvolní.
Transakce slouží jen jako mutex, ne jako předstíraný rollback externí platby nebo nativního workflow.
Nevytváří druhý finanční workflow. Nativní admin/internal fulfillment cesty tento nový mutex zatím
nepoužívají; nativní workflow vynucuje stav fulfillmentu, ale souběh interní expedice se stornem
nelze označit za nový globálně serializovaný mechanismus celé Medusy.

## Kompenzace a e-mail

Uvnitř povoleného požadavku se volá výhradně `cancelOrderWorkflow({order_id})`. Nativní workflow
ruší autorizace, refunduje capture a vydává order.canceled. Existující gift-voucher/booking/entitlement
subscribery vrací kredit, uvolňují termín a ruší nárok. payment.refunded kompenzace zůstává stávající;
nepíše se druhá logika a žádné částky se neposílají klientem. Úspěšná odpověď `{order:{id,status:"canceled"}}`
neznamená, že se už dokončilo asynchronní doručení mailu/kompenzací. Při selhání nativního workflow503,
bez surové chybové zprávy v odpovědi nebo logu. Zpracování selhaných platebních workflow patří do
existujícího workflow-engine/admin recovery, ne do druhého automatického refundu v této routě.

C-1 má order.canceled subscriber se šablonou **order-canceled-sk**, příjemce načtený z objednávky,
serverová data a stabilní notification key. X3 nevytváří paralelní subscriber ani duplicitní e-mail.
Provozní události `checkout/order_self_canceled` a `order_self_cancel_rejected` obsahují jen technická ID/kód.

## Zapojení a testy

Integrátor přidá `orderSelfCancelMiddlewares` z `./order-self-cancel-middlewares` do main middleware,
až po globálním X2 tombstone guardu. X1/X2 a C-1 musí být integrované. Žádný nový module/config zápis.
Volitelná env `ORDER_SELF_CANCEL_BOOKING_HOURS`; skutečnou politiku schvaluje vlastník.

Ve společném Actions runneru zavolat
`verifyOrderSelfCancel({api,container,options,channel,region,profile,evidence})`.
Helper používá vlastní plain/booking/digital produkty, nemění sdílený testovací produkt.
Kontroluje auth/vlastníka, souběh200/409, odmítnutí expedované objednávky, digitální grant,
vrácení termínu do skutečné nabídky a obnovení poukazového kreditu. Vyžaduje stávající nativní
syntetický fulfillment/payment provider, nikdy dopravce ani reálné peníze.

Lokální `npx tsc --noEmit` PASS, fokus1 sada/11 testů PASS. Middleware a HTTP helper zapojil
Claude v integrační větvi. Plná sada/HTTP jen GitHub Actions, lokálně žádný PG/HTTP.

Integrovaný kód **VERIFIED** na `claude/backend-integration` **4ba87ff**:
[GitHub Actions 38667772955](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38667772955), oba joby `verify` a `medusa-persistence` PASS.
Backend TypeScript + **516/516 unit** (53 sad), celý skutečný Medusa/PostgreSQL HTTP běh PASS,
všech **15/15 scénářů X1–X3** PASS. Dále NEXUS1102/1102 a workerd38/38 PASS.
Tento důkaz ověřuje syntetické kontrakty; není produkčním nasazením ani právním schválením textů.
