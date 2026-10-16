# Spotřebitel objednávek: synchronizace rezervace a ověření výsledku

Stav: IMPLEMENTED_UNVERIFIED před plným CI. Vlastní větev `codex/booking-inbox`, základ `648e579b71afcdbd1a89ad12fcb3bede6b3f90d0`. Navazuje na ověřené doručování z PR #16. Bez nasazení.

## Konkrétní operace

`order.placed` v trvalém inboxu → `booking / medusa / SYNC_ORDER_BOOKING` → existující Medusa `confirmBookingForOrder` → nové nezávislé čtení objednávky a rezervace → trvalý výsledek. Objednávka, platba i termín zůstávají výhradně v Meduse/PostgreSQL. D1 obsahuje jen odkaz, zamýšlenou operaci a stav jejího provedení. Nezavádí se druhá obchodní databáze ani frontový framework.

- Zaplacená objednávka může potvrdit pouze svůj existující termín; nezaplacená zůstane held. Používá se dosavadní deterministická platební politika Medusy, nikoliv údaj volajícího.
- Ověřuje se vlastník, produkt, košík checkoutu, přiřazení objednávky, stav rezervace a odstranění dočasné expirace. Cizí přiřazení, chybějící záznam, neplatný stav nebo nejednoznačný výsledek nejsou potvrzení.
- Zrušená rezervace se neoživí. Zrušená objednávka ověřuje zrušený termín. Ani dříve potvrzený termín se po ztrátě platebního podkladu automaticky nevrací do holdu.
- Bez booking metadata lze vrátit NO_BOOKING jen po načtení produktů a ověření, že žádný aktuálně rezervaci nevyžaduje. Chybějící produkt či povinná rezervace bez vazby vyžadují kontrolu.
- Po úspěšné nativní synchronizaci se autoritativní stav znovu načte. NEXUS pak provede ještě samostatné HTTP inspect. Samotný HTTP 200 nebo návrat helperu nestačí.

## Rozhraní a oprávnění

Nový úzce vymezený `POST /hooks/nexus/booking-order` má pouze režimy inspect/synchronize, nikoliv libovolný příkaz. Striktní tělo verze 1 obsahuje tenantId, operationId, orderId a mode; cena, paid, callback URL ani další pole nejsou povolené. Odpověď obsahuje pouze identitu operace/objednávky a ověřený stav, žádný zákaznický profil nebo platební částky.

Používá již zavedený HMAC-SHA256 protokol `x-nexus-timestamp`, `x-nexus-signature` přes timestamp.rawBody (±300 sekund), ale vlastní tajemství `NEXUS_BOOKING_SYNC_SECRET` min. 32 znaků. Nelze použít přihlášení zákaznice ani ops ingest secret jako náhradu. Backend váže požadavek na svůj `NEXUS_TENANT_ID`; Origin požadavky odmítá. Surové tělo má limit 8 KiB.

Worker potřebuje explicitní `MEDUSA_BOOKING_SYNC_URL` a `MEDUSA_BOOKING_SYNC_SECRET` odpovídající backendu. Bez URL se spotřebitel nezapne. Adresa je pouze HTTPS nebo testovací HTTP loopback, bez přesměrování, hesla, query či fragmentu. Žádná konfigurace produkce nebo cron rozvrhu se v balíku nemění. Reálné tajemství se do repozitáře nedoplňuje.

## Trvalý životní cyklus a obnova

- Nová aditivní migrace `0007_medusa_booking_consumer.sql` doplňuje vazbu inbox → operation_id a processing_updated_at. Musí se aplikovat před novou verzí Workeru, také kvůli provoznímu read modelu. Žádná obchodní tabulka se nemaže/mění.
- Plán operace je trvalý a má stabilní hash tenanta, události a objednávky. Před voláním Medusy se atomicky nárokuje EXECUTING; souběžný cron může nárokovat jen jeden proces. Existující plán se kontroluje vůči přesné doméně/operaci/cíli a očekávanému stavu.
- Nejvýše dvě události za běh, nejvýše čtyři HTTP požadavky s limitem 3 sekundy včetně těla (nejvýše 4 KiB). Střídání podle posledního zpracování brání jedné nedostupné události trvale blokovat ostatní.
- Úspěch vyžaduje shodného tenanta, orderId, operationId, verzi a ověřený výsledek samostatného inspect. Teprve poté EXECUTED/SYSTEM_CONFIRMED a inbox PROCESSED.
- Timeout, chyba nebo rozpor se uloží jako UNKNOWN. Další průchod už používá pouze inspect, nikdy další synchronize. Neshoda po tomto čtení přejde v inboxu do NEEDS_REVIEW, nikoliv na falešné FAILED umožňující další zápis. Neúspěšné čtení zůstává dohledatelně čekající.
- EXECUTING starší 90 sekund přejde pro tuto konkrétní operaci do UNKNOWN a může se pouze ověřit. Pozdní výsledek starého procesu je oplocený původním attempt a nemůže přepsat již ověřený výsledek.
- Pád po ověřeném EXECUTED, ale před potvrzením inboxu, další běh dokončí bez dalšího HTTP zápisu. Pád před plánem ponechá převzatou událost k novému bezpečnému nárokování.
- Provozní přehled používá poslední čas zpracování a pokus navázané operace. Chyby a potřeba kontroly se logují bez raw provider odpovědí nebo secretů a lze je předat dosavadním ops ingestem.

## Důkazy a meze

Cílené testy backendu kontrolují HMAC, cizí tenant, další pole, nezaplacení, vlastníka/produkt/košík, zrušení a selhání read-backu. Skutečný workerd/D1 v CI ověřuje souběh osmi spotřebitelů, stav před zápisem, ztracenou odpověď, vypršení běhu, opožděné dokončení, pád před potvrzením inboxu, omezení dávky a izolaci tenantů.

HTTP/PG scénáře používají skutečný route a modul rezervací: unsigned/cizí podpis/tenant/paid odmítnuté; nezaplacená rezervace zůstane held; po skutečném capture se simuluje vynechané potvrzení a nativně opraví; opakování nezaloží nový termín; zrušená se neoživí. Příjemce ve workerd testech je kontraktový fixture a Worker v HTTP testech se neoznačuje za živě propojenou Cloudflare D1. Produkční ani Redis restart E2E tím není prokázán. Plné běhy jen GitHub Actions.

Operace pokrývá pouze konzistenci rezervace při order.placed. Původní Medusa subscribery nadále obsluhují platby, nároky a e-maily; tato oprava neposílá další e-mail. Samostatná spolehlivost zákaznických oznámení, payment.captured událostí, customer.created spotřebitele, další obchodní domény a obslužné akce nad nejistotou zůstávají dalšími body plánu. Žádná cena, capture, refund, poukaz nebo přístup se tímto endpointem nenastavuje.

Rollback: vypnout explicitní URL spotřebitele, vrátit kód; aditivní sloupce ponechat. Rozpracované operace a inbox nemažou historii. Přijetí události a existující Medusa business subscribery zůstávají nezávislé.
