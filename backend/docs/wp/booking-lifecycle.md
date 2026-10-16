# Rezervace po zachycení platby a zrušení objednávky

Stav: IMPLEMENTED_UNVERIFIED před plným CI. Vlastní větev `codex/booking-lifecycle`, základ `12468eb` (PR #19). Bez nasazení, změny konfigurace produkce nebo nové závislosti/migrace. Vyžaduje dřívější migraci 0007.

## Problém a návaznost

Ověřený spotřebitel z PR #18 zpracoval order.placed. Pokud byla objednávka při vytvoření nezaplacená, správně ověřil held; vynechaný pozdější payment.captured subscriber by ale žádný nový trvalý podnět do NEXUSu neposlal. Podobně chybělo doručení zrušení. Nyní stejné nativní doručování a řízený spotřebitel zahrnují `payment.captured` a `order.canceled`.

## Identita události

- Vytvoření objednávky/účtu a terminální zrušení mají stabilní identitu tenant + typ + cílové ID. Dosavadní identita již uložených order.placed/customer.created se nemění.
- Jedna platba může mít více částečných captures. Jejich ID nesmí být odvozené pouze z paymentId. U captured události obsahuje klíč také `event.metadata.eventGroupId` nativního Medusa workflow; stejná událost při retry zůstane stejná, další capture workflow dostane jiné ID.
- Ověřeno proti instalovanému Medusa 2.19 zdroji: capturePaymentWorkflow emituje PaymentEvents.CAPTURED přes emitEventStep, který přenáší context.eventGroupId; event bus drží tuto skupinu při release/retry. Přímý nekompatibilní emitter bez skupiny se odmítne a zapíše k dohledání. Negeneruje se náhodná identita ani nepoužívá nákupní částka dodaná událostí.
- Do D1 se stále posílá jen typ a původní ID: payment.captured odkazuje na platbu, order.canceled na objednávku. Metadata skupiny slouží pouze k hashi klíče; platební údaje/částka se nekopírují.

## Provedení a ověření

Zůstává jediný `SYNC_ORDER_BOOKING` a nativní Medusa modul. Vytvoření/zrušení objednávky používá kompatibilní kontrakt verze 1 se serverově podepsaným orderId. Captured payment používá úzce vymezenou verzi 2 stejného hooku: `{version:2, tenantId, operationId, eventType:'payment.captured', targetId:paymentId, mode}`.

Backend sám načte platbu a link order_payment_collection pomocí existujícího `resolveOrderIdByPayment`. Volající nesmí ve verzi 2 vybrat objednávku ani dodat paid/cenu. Bez vazby na objednávku vrací 409, nikoliv potvrzení. Odpověď obsahuje skutečný orderId a původní eventType/targetId; Worker ověří identitu zdroje i operace před uznáním read-backu.

Částečné zachycení nemusí stačit na potvrzení termínu: stávající nativní platební politika rozhoduje podle celé objednávky. Pozdější capture má nový trvalý podnět. Zrušení může být uznané pouze při aktuálním výsledku CANCELED nebo NO_BOOKING; stále aktivní rezervace/objednávka není dokončené storno.

Ztracené booking_id metadata se nepovažuje za NO_BOOKING, pokud stále existuje aktivní rezervace dané objednávky; vyžaduje kontrolu místo tichého vynechání.

Dříve uložené order.placed intenty zachovávají původní payload a idempotency klíč. Nové životní události ukládají typ a ID původního zdroje. Zůstává původní claim před zápisem, limit dávky/deadline, samostatný inspect, UNKNOWN bez slepého retry a obnova po pádu. Starší NEEDS_REVIEW události se pouhým přidáním podpory samy neaktivují.

## Ověření

Lokálně: 70/70 cílených backend testů před plným CI; typové kontroly backend/NEXUS/workerd. Nové negativní testy zahrnují chybějící korelaci capture, dva různé captures jedné platby, caller-selected order, neexistující platební vazbu, falešné potvrzení storna a cizí source target v odpovědi.

Workerd/D1 ověřuje příjem a zpracování obou životních událostí, kontrakt verze 2 a odmítnutí neplatného read-backu. HTTP/PG scénář po skutečném capture opraví held přes skutečný platební link a stejný modul rezervace; zamítne chybějící link a objednávku vybranou volajícím. Doručovací scénář používá skutečné nativní skupiny event busu pro dva syntetické captures jedné platby a skutečné uložené workflow; příjemce zůstává explicitně lokálním HTTP fixture. To se neoznačuje za poskytovatelem provedené dva captures ani za produkční cross-platform E2E.

## Meze a další práce

Zpracování se týká pouze konzistence rezervací. Nedělá capture, storno platby, refund, přístupová práva, poukaz ani další e-mail. Nativní subscribery těchto oblastí se nepřepisují. Zůstávají nespolehlivá oznámení, obnova před prvním workflow checkpointem, Redis restart, customer.created a ostatní obchodní domény. Produkční tajemství, URL a cron jsou stále mimo tento balík. Rollback vrací kód a může vypnout URL spotřebitele; uložené lifecycle intenty a historie se nemažou.
