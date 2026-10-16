# Řízená obnova potvrzení objednávky

Stav: IMPLEMENTED_UNVERIFIED před plným CI. Větev `codex/order-email-recovery`,
základ `b1b63a7` po PR #23. Bez nasazení, migrace, závislostí a změny konfigurace.

## Problém a zvolená návaznost

Nativní `order.placed` dosud přímo volal `notifyOrderPlaced`, který chybu
potlačí, aby e-mail nezrušil obchodní operaci. Přechodná chyba před uložením
notification tak mohla potvrzení ztratit. Předchozí balík ověřuje pravdivý
receipt, ale sám nevytváří trvalý podnět pro další pokus.

Tentýž subscriber nyní spouští uložený idempotentní Medusa workflow
`order-email-recovery-v1`. Identita je SHA-256 z verze, serverového tenantu
a skutečného orderId. Do workflow vstupují jen reference, nikoliv adresát,
obsah, částka nebo klientský tenant. Každý pokus znovu ověří tenant proti
serverové konfiguraci a používá stávající `notifyOrderPlaced/sendEmail`.
Neexistuje druhý odesílatel ani nová obchodní databáze.

Workflow má nejvýše 3 retry po 5 s (4 pokusy celkem), timeout 90 s a retenci
7 dní, bez kompenzačního odesílání. Používá tentýž již instalovaný nativní
workflow engine jako doručování Medusa událostí. Globální event bus retry
ani produkční Redis konfigurace se nepřepínají.

## Pravidla obnovy

- `sent/duplicate` vyžadují předchozí nezávislé čtení nativního SUCCESS
  v centrální cestě. Vypnutá nepovinná šablona skončí jako úmyslně přeskočená.
- Při SEND_FAILED se samostatně načte nativní notification stejného klíče.
  Není-li záznam, je možný další omezený pokus: instalovaný Medusa 2.19
  nejprve commitne notification s unikátním klíčem, až potom volá provider.
  Pokud již existuje SUCCESS, další pokus umí jen ověřit/potlačit stejný klíč;
  centrální cesta odmítne neshodnou identitu místo nového odeslání.
- Pending/failure, jiný či více záznamů a nedostupné čtení nejsou oprávnění
  k opakování. Workflow přejde do nativního neúspěšného terminálního stavu
  a zapíše redigované `order_email_needs_review`.
- Chybějící objednávka/adresát a neočekávaná chyba vyžadují kontrolu.
  Retry se vyčerpáním nepromění na falešný úspěch.

Předchozí objednávka, platba nebo rezervace se při chybě oznámení neruší.
Handler je nativní background subscriber, nikoliv checkout hook.

## Ověření

Lokálně `npm run test:unit -- --runInBand src/lib/email/__tests__
src/lib/notify/__tests__`: **54/54 PASS**; `npx tsc --noEmit`: PASS.
Plné backend/HTTP/PG běhy pouze GitHub Actions.

Unit testy pokrývají stabilitu identity, izolaci tenantů, neplatné reference,
výsledek success/duplicate/disabled, chybějící obchodní kontext a přesnou
klasifikaci nepřítomného, úspěšného, nejistého a nečitelného checkpointu.
Subscriber testy ověřují minimální input a viditelné selhání startu.

Plné CI přidává scénář ze skutečného HTTP checkoutu do uloženého workflow
a nativního notification/PG včetně replay. Další scénáře používají nativní
workflow a notification se syntetickým log providerem; pouze přesně vybraný
klíč má injektovanou chybu před nativním zápisem či po nativním úspěchu.
Ověřuje se checkpoint workflow před efektem, samostatný read-back, jediný
nativní zápis, 4 pokusy při vyčerpání a zastavení na přetrvávajícím failure.
Nejde o skutečné doručení e-mailu ani test ZeptoMail timeoutu.

## Meze

Pouze potvrzení `order.placed`. Platba, storno, zásilka, refund, welcome,
booking a poukazy nadále používají své stávající podněty a claims. Nejde
o univerzální outbox či zpětný backfill ztracených historických událostí.
Okno před prvním uložením workflow a skutečný restart Redis zůstávají
neověřené; nativní checkpoint test nenahrazuje restart procesů.
SUCCESS znamená nativní potvrzení provideru, nikoliv doručení do schránky.
Audit stále používá stávající best-effort `recordEvent`. Celý NEXUS je PARTIAL.
