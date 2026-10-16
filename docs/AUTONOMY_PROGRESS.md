# Postup backendu podle plánu — 16. 10. 2026

Stav celého cíle: PARTIAL vůči NEXUS_AUTONOMY_SPEC.md. Všech devět navazujících backendových balíků má stav VERIFIED a je commitnutých, pushnutých a sloučených do master. Nic se nenasadilo; konfigurace produkčního cronu ani obchodní hodnoty se neměnily. Vlastní admin UI se v těchto balících nestavěl.

## Dokončené balíky

| Pořadí | Balík a PR | Ověřený výsledek | Důkaz |
|---|---|---|---|
| 1 | intent-recovery, #11, 9481535 | Zaseklé běžící operace přejdou do UNKNOWN; starý proces nemůže ukončit novější pokus. Omezený scheduled handler, žádný slepý retry. | [CI 38817700077](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38817700077), [záznam](evidence/intent-recovery-20261016.json) |
| 2 | intent-reconciliation, #12, 72c1725 | Ověření výsledku se trvale uloží jen pro přesný snapshot. Timeout, rozpor a nepodložené neprovedení se nepřemění na falešný úspěch/retry. | [CI 38818676983](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38818676983), [záznam](evidence/intent-reconciliation-20261016.json) |
| 3 | medusa-inbox, #13, 45630ce | Trvalý příjem ověřené události s tenantem a odkazem na záznam před HTTP 200. Souběh, konflikt, historické receipts a neznámé typy mají bezpečné chování. | [CI 38819618651](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38819618651), [záznam](evidence/medusa-inbox-20261016.json) |
| 4 | operations-status, #14, 5672898 | Chráněné API provozních stavů pro správce. Lidské slovenské popisy, tenant izolace, žádné payloady/klíče/raw chyby; neplatné spojení není falešný zdravý přehled. | [CI 38820524945](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38820524945), [záznam](evidence/operations-status-20261016.json) |
| 5 | medusa-delivery, #16, 606e1d5 | Skutečné události Medusy spouští uložený workflow, který podepisuje minimální odkaz a doručuje jej do inboxu. Omezené retry, ověřené potvrzení, replay a chyba k dohledání. | [CI 38825594461](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38825594461), [záznam](evidence/medusa-event-delivery-20261016.json) |
| 6 | booking-inbox, #18, 8112f27 | Spotřebitel order.placed nativně synchronizuje rezervaci a vyžaduje samostatný autoritativní read-back. Trvalý claim, izolace tenantů, obnova UNKNOWN bez slepého zápisu, souběh a pád před potvrzením inboxu. | [CI 38882048007](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38882048007), [záznam](evidence/booking-inbox-20261016.json) |
| 7 | booking-lifecycle, #20, d2163da | Stejný ověřovaný tok zahrnuje payment.captured a order.canceled. Nativní platební vazba, oddělené captures, zpětná kompatibilita a zákaz tichého vynechání aktivní rezervace při ztracených metadatech. | [CI 38884189589](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38884189589), [záznam](evidence/booking-lifecycle-20261016.json) |
| 8 | notification-receipts, #22, 20bce48 | E-mailové potvrzení vyžaduje samostatně načtený nativní SUCCESS se shodnou identitou. Pending/failure se netváří jako úspěšná duplicita a nespouští slepý resend; souběh ověřen přes skutečný unikátní PG klíč. | [CI 38888723601](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38888723601), [záznam](evidence/notification-receipts-20261016.json) |
| 9 | order-email-recovery, #24, e3fac14 | Potvrzení objednávky používá uložený nativní workflow, omezené bezpečné opakování a ověřené receipts. Nejistý výsledek se neopakuje; respektuje se nativní zákaz oznámení včetně anonymizace. | [CI 38891377081](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38891377081), [záznam](evidence/order-email-recovery-20261016.json) |

## Poslední plná regrese

Ověřený HEAD e3fac14, testovací merge 9e4295b. Stromy backend/NEXUS/storefront na master po sloučení odpovídají ověřenému kandidátovi; hashe jsou v posledním důkazu.

- Backend: 672/672 unit testů PASS, TypeScript PASS.
- NEXUS: 1230/1230 unit/integration testů PASS, TypeScript PASS.
- Skutečný workerd/D1: 139/139 PASS, TypeScript PASS.
- Izolovaná Medusa + PostgreSQL: 151 HTTP scénářů PASS.
- Storefront se v těchto balících neměnil. Jeho dřívější ověření zůstává v INTEGRATION_STATUS.md; nové běhy storefrontu se bez změny neopakovaly.

Spotřebitel rezervací a jeho životní události prošly skutečnými D1 testy a HTTP/PG scénáři včetně opravy vynechaného potvrzení po capture, replay, zákazu oživení zrušené rezervace, nativní vazby payment → order a dvou odlišných capture skupin jedné platby. Nová migrace 0007 je nutná před budoucím nasazením Workeru; nasazení se neprovádělo.

Nový balík e-mailových potvrzení prošel třemi scénáři s pravým notification modulem a PostgreSQL: read-back/replay, zablokování nejistého stavu a souběh se jediným sent výsledkem. Použil se syntetický log provider; není to důkaz doručení do schránky.

Řízená obnova potvrzení objednávky prošla šesti dalšími HTTP/PG scénáři: skutečný zdroj a replay, chyba před zápisem (2 volání / 1 zápis), ztracená odpověď po úspěchu (1 volání / 1 zápis), vyčerpání (4 volání / 0 zápisů), nejistý native failure beze změny a nativní zákaz oznámení (0 záznamů). Workflow checkpoint existoval před efektem.

HTTP scénář admin proxy používá pravou Medusa autentizaci a lokální HTTP zdroj. Nový scénář doručení používá pravou Medusa událost, uložený workflow a PostgreSQL; příjemce je lokální HTTP fixture. Obnova po ztracené odpovědi, 409 bez opakování a 503 s vyčerpáním čtyř pokusů prošly. Vlastní příjem a read model se zvlášť ověřují proti skutečné D1. Nezaměňuje se to za důkaz živého produkčního spojení.

Tento souhrn a příslušné důkazy aktualizují předběžné IMPLEMENTED_UNVERIFIED v backend/docs/wp/operations-status.md, backend/docs/wp/medusa-event-delivery.md a backend/docs/wp/booking-inbox.md a backend/docs/wp/booking-lifecycle.md a backend/docs/wp/notification-receipts.md a backend/docs/wp/order-email-recovery.md. Ostatní balíky mají finální důkaz doplněný v dokumentech intent-recovery.md, stored-intent-reconciliation.md a medusa-webhook-inbox.md. Starší integrační záznam z 15. 10. zůstává historií svého běhu.

## Co následuje podle stejného plánu

1. Navázat dalšími doménami na ověřený tok rezervací pro order.placed, payment.captured a order.canceled. Pravdivé rozlišení uloženého e-mailového úspěchu od nejistoty a řízená obnova potvrzení order.placed jsou ověřené. Další na řadě jsou trvalé podněty a bezpečná obnova ostatních oznámení (platba/storno/zásilka/refund/welcome), potom další domény; bez slepého opakování. Ostatní obchodní efekty a customer.created ještě vlastní spotřebitele nemají. Nezapínat podruhé existující Medusa efekty ani předstírané registry ERP/dopravců.
2. Pro každou operaci určit autoritativní čtení, potvrzení, idempotenci, deadline a bezpečnou reakci na nejistotu. Navázat na již hotové nativní Medusa workflows/subscribery; nevytvářet další obchodní databázi ani univerzální framework.
3. Prověřit a nastavit řízené opakování nativních událostí. Produkční konfigurace již vyžaduje Redis/event bus/workflow engine. Instalovaný @medusajs/event-bus-redis 2.19 používá bez override attempts: 1; globální retry se nezapíná bez důkazu idempotence všech příslušných efektů. Nové doručování má vlastní uložený workflow se 3 retry a nepřepíná globální politiku; okno selhání před prvním checkpointem a restart Redis ještě vyžadují vlastní ověření. Některá zákaznická upozornění chybu potlačují; log odeslání není důkaz doručení.
4. Doplnit bezpečné obslužné akce a audit po napojení konkrétních toků. Provozní přehled je nyní pouze pro čtení; správce nemůže tlačítkem označit neověřenou platbu za úspěšnou.
5. Dokončit zbývající obchodní oblasti a ověřit jejich celé návaznosti podle REQUIREMENTS_MATRIX.md a původního NEXUSu: SafeOrder/dobírková historie, osobní ceny v katalogu, dopravci/štítky, účetnictví, sklad/nákupčí, kampaně a další sjednané oblasti. Základy konektorů ani čistě syntetický test se neoznačují za hotové připojení poskytovatele.

Každý další balík zůstává ve vlastní větvi/worktree, po ověření commit/push a zápis důkazu. Plné HTTP/PG běhy pouze GitHub Actions. Produkční přístupy, pravidla klientky a skutečné testovací klíče se nedoplňují odhadem.
