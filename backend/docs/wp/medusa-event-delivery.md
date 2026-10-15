# Medusa → NEXUS: trvalé doručení skutečných událostí

Stav: IMPLEMENTED_UNVERIFIED před plným CI. Větev `codex/medusa-delivery`, základ `6ac1a1a6facfb716a940067ba5b2fd6fd0efafb3`. Bez nasazení. Navazuje na inbox z PR #13 a pořadí v `docs/AUTONOMY_PROGRESS.md`.

## Problém a nejmenší změna

Worker uměl trvale přijmout podepsanou událost, ale Medusa ji neposílala. Nový nativní subscriber odebírá skutečné `order.placed` a `customer.created` a spouští uložený Medusa workflow. Nepřibývá obchodní databáze ani další frontový framework. Události mapují vytvoření objednávky a zákaznického účtu; jejich přijetí neznamená zaplacení nebo dokončení obchodních efektů.

## Kontrakt, bezpečnost, opakování

- Explicitní serverová konfigurace: `NEXUS_MEDUSA_WEBHOOK_URL`, vyhrazený `NEXUS_MEDUSA_WEBHOOK_SECRET` odpovídající Worker `MEDUSA_WEBHOOK_SECRET`, a existující `NEXUS_TENANT_ID` odpovídající Worker tenantovi. Není potřeba nová závislost ani migrace. Bez URL je propojení vypnuté, nikoliv úspěšně doručené. URL s chybějící/neplatnou konfigurací vyvolá chybu a záznam pro kontrolu.
- Cíl pouze HTTPS nebo HTTP loopback pro izolované testy. Žádné přesměrování, uživatelské údaje v URL, query nebo fragment. Tenant a adresa se nikdy neberou z události. Po změně tenanta čekající workflow odmítne doručovat pod novou identitou.
- Verze 1: HMAC-SHA256 přes `timestamp.rawBody`, hlavičky `x-medusa-signature` a `x-medusa-delivery`. Odesílá se pouze typ události a ID záznamu. Cena, osobní údaje, obsah objednávky, přihlašovací a platební stav se nekopírují.
- Stabilní identita SHA-256 z verze, tenanta, typu a cílového ID. Platí jen pro tyto dvě jednorázové události vytvoření, nikoliv například všechny budoucí refundace stejné platby. Stejný klíč je transactionId workflow a klíč inboxu. Přetrvá replay i restart; inbox deduplikuje také po skončení sedmidenní retence workflow.
- Nativní `store: true` uloží checkpoint před HTTP zápisem. Ukládá jen minimální vstup a potvrzení, nikoliv secret/URL/původní událost. V produkci již konfigurace vyžaduje Redis/event bus/workflow engine. Produkční konfigurace se tímto balíkem nemění.
- HTTP pokus má limit 5 sekund včetně těla; potvrzení nejvýše 4 KiB. Validuje se `received`, tenant, typ a přesné ID. Worker vrací navíc serverově určené `tenantId`; dosavadní pole zůstávají kompatibilní.
- Výpadek, timeout, neplatné potvrzení, 408/429/5xx: nejvýše 3 opakování po 5 sekundách (4 pokusy celkem). Opakování po nejistém přijetí je bezpečné díky deduplikaci inboxu; neopakuje finanční operaci. Celý workflow má timeout 90 sekund.
- Ostatní neúspěšné HTTP stavy včetně 401/403/409 skončí bez retry. Po trvalé chybě/vyčerpání pokusů zůstane neúspěšné nativní workflow a redigovaný `nexus_event_needs_review` v provozních událostech. Žádné raw fetch chyby nebo odpovědi ve workflow/logu. `nexus_event_received` říká pouze převzetí do inboxu.
- Globální počet pokusů event busu se nezvyšuje: ostatní subscribery by mohly opakovat neověřené efekty. Chyba úložiště před prvním uložením workflow se vyhodí a zaznamená; automatická obnova tohoto okna závisí na samostatně řešené politice nativního event busu. Tento balík ji nepředstírá.

## Ověření

Lokální cílené testy: transport 29/29, subscriber 5/5; backend TypeScript PASS. Příjem a tenant v potvrzení se ověřují také ve skutečném workerd/D1 v CI. Plný HTTP/PG runner se lokálně nespouští.

Nový scénář izolované Medusy/PostgreSQL používá skutečný `createCustomersWorkflow` → nativní událost → nový subscriber → trvalý workflow → podepsaný HTTP požadavek. Server příjemce je explicitně lokální kontraktový fixture; nezaměňuje se za D1. Ověřuje checkpoint v PostgreSQL před přijetím požadavku, replay dokončeného workflow bez nového HTTP, ztracenou odpověď po přijetí se stejným klíčem, 409 bez retry a vyčerpání 503 po čtyřech pokusech s provozním záznamem. Redis restart není tímto testem ověřen.

## Meze a další krok

Inbox stále není spotřebitel konkrétních obchodních operací. Platby, nároky a rezervace nadále vlastní stávající Medusa moduly/subscribery. Nesmí se spustit podruhé z inboxu bez explicitního kontraktu, idempotence a autoritativního read-backu. Další balík musí napojit konkrétní operaci a její ověření; samotné doručení není autonomie celého systému.

Rollback: vypnout explicitní URL a vrátit subscriber/workflow/transport; zachovat již uložené workflow a inbox pro dohledání. Rozpracovaná doručení bez konfigurace skončí pro kontrolu, nevygenerují falešné potvrzení. Žádná obchodní data ani migrace se nemažou.
