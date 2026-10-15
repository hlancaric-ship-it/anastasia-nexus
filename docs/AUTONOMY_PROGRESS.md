# Postup backendu podle plánu — 16. 10. 2026

Stav celého cíle: PARTIAL vůči NEXUS_AUTONOMY_SPEC.md. Čtyři navazující backendové balíky jsou VERIFIED, commitnuté, pushnuté a sloučené do master. Nic se nenasadilo; konfigurace produkčního cronu ani obchodní hodnoty se neměnily. Vlastní admin UI se v těchto balících nestavěl.

## Dokončené balíky

| Pořadí | Balík a PR | Ověřený výsledek | Důkaz |
|---|---|---|---|
| 1 | intent-recovery, #11, 9481535 | Zaseklé běžící operace přejdou do UNKNOWN; starý proces nemůže ukončit novější pokus. Omezený scheduled handler, žádný slepý retry. | [CI 38817700077](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38817700077), [záznam](evidence/intent-recovery-20261016.json) |
| 2 | intent-reconciliation, #12, 72c1725 | Ověření výsledku se trvale uloží jen pro přesný snapshot. Timeout, rozpor a nepodložené neprovedení se nepřemění na falešný úspěch/retry. | [CI 38818676983](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38818676983), [záznam](evidence/intent-reconciliation-20261016.json) |
| 3 | medusa-inbox, #13, 45630ce | Trvalý příjem ověřené události s tenantem a odkazem na záznam před HTTP 200. Souběh, konflikt, historické receipts a neznámé typy mají bezpečné chování. | [CI 38819618651](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38819618651), [záznam](evidence/medusa-inbox-20261016.json) |
| 4 | operations-status, #14, 5672898 | Chráněné API provozních stavů pro správce. Lidské slovenské popisy, tenant izolace, žádné payloady/klíče/raw chyby; neplatné spojení není falešný zdravý přehled. | [CI 38820524945](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38820524945), [záznam](evidence/operations-status-20261016.json) |

## Poslední plná regrese

Ověřený HEAD 5672898, testovací merge 0bae66d. Stromy backend/NEXUS/storefront na master po sloučení odpovídají ověřenému kandidátovi; hashe jsou v posledním důkazu.

- Backend: 567/567 unit testů PASS, TypeScript PASS.
- NEXUS: 1230/1230 unit/integration testů PASS, TypeScript PASS.
- Skutečný workerd/D1: 111/111 PASS, TypeScript PASS.
- Izolovaná Medusa + PostgreSQL: 133 HTTP scénářů PASS.
- Storefront se v těchto balících neměnil. Jeho dřívější ověření zůstává v INTEGRATION_STATUS.md; nové běhy storefrontu se bez změny neopakovaly.

HTTP scénář nového admin proxy používá pravou Medusa autentizaci a lokální HTTP zdroj pro ověření protokolu; vlastní zdrojový read model se zvlášť ověřuje proti skutečné D1. Nezaměňuje se to za důkaz živého produkčního spojení.

Tento souhrn aktualizuje předběžné IMPLEMENTED_UNVERIFIED v backend/docs/wp/operations-status.md. Ostatní balíky mají finální důkaz doplněný v dokumentech intent-recovery.md, stored-intent-reconciliation.md a medusa-webhook-inbox.md. Starší integrační záznam z 15. 10. zůstává historií svého běhu.

## Co následuje podle stejného plánu

1. Propojit skutečné události Medusy s konkrétními obchodními operacemi. Inbox není hotový spotřebitel a funkce ověření nemá předstírané registry skutečných ERP/dopravců.
2. Pro každou operaci určit autoritativní čtení, potvrzení, idempotenci, deadline a bezpečnou reakci na nejistotu. Navázat na již hotové nativní Medusa workflows/subscribery; nevytvářet další obchodní databázi ani univerzální framework.
3. Prověřit a nastavit řízené opakování nativních událostí. Produkční konfigurace již vyžaduje Redis/event bus/workflow engine. Instalovaný @medusajs/event-bus-redis 2.19 používá bez override attempts: 1; globální retry se nezapíná bez důkazu idempotence všech příslušných efektů. Některá zákaznická upozornění chybu potlačují; log odeslání není důkaz doručení.
4. Doplnit bezpečné obslužné akce a audit po napojení konkrétních toků. Provozní přehled je nyní pouze pro čtení; správce nemůže tlačítkem označit neověřenou platbu za úspěšnou.
5. Dokončit zbývající obchodní oblasti a ověřit jejich celé návaznosti podle REQUIREMENTS_MATRIX.md a původního NEXUSu: SafeOrder/dobírková historie, osobní ceny v katalogu, dopravci/štítky, účetnictví, sklad/nákupčí, kampaně a další sjednané oblasti. Základy konektorů ani čistě syntetický test se neoznačují za hotové připojení poskytovatele.

Každý další balík zůstává ve vlastní větvi/worktree, po ověření commit/push a zápis důkazu. Plné HTTP/PG běhy pouze GitHub Actions. Produkční přístupy, pravidla klientky a skutečné testovací klíče se nedoplňují odhadem.
