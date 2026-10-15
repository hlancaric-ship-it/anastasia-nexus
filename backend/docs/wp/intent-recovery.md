# Obnova trvalých operací po pádu

Stav před balíkem: PARTIAL. Stav implementace: VERIFIED v izolovaném workerd/D1 a plné regresi, CI 38817700077; PR #11 sloučen do master. Důkaz: docs/evidence/intent-recovery-20261016.json. Navazuje na docs/INTEGRATION_STATUS.md a docs/NEXUS_AUTONOMY_SPEC.md §2–3; vlastní větev codex/intent-recovery z ověřeného master e465b43. Žádné nasazení.

## Nejmenší navazující plán

1. Zachovat existující ExecutionIntent a jeho stavový automat; nepřidávat druhé obchodní jádro.
2. Obnovit zaseklé EXECUTING do UNKNOWN, nikoliv automaticky opakovat vnější zápis.
3. Ochránit novější pokus proti opožděnému výsledku starého procesu, včetně závodu mezi čtením a SQL zápisem.
4. Připojit omezený průchod obnovy k plánovanému Worker handleru a stávajícím provozním logům.
5. Ověřit kontrakt na referenčním store i skutečné D1, plnou regresi pouze na GitHub Actions.

## Implementace

- `ExecutionIntentStore.recoverExpiredExecutions(context, {expiredBefore, recoveredAt, limit})`: vstupní UTC časy a limit 1–100, stabilní pořadí. Pouze operace daného tenanta ve stavu EXECUTING s časem posledního claimu nejpozději na hranici. Přechod do UNKNOWN s UNCONFIRMED a bezpečným kódem EXECUTION_DEADLINE_EXCEEDED; původní attempt zůstává.
- D1 používá podmíněný UPDATE na tenant, stav, attempt a čas claimu. Dokončení nebo nový pokus mezi čtením a zápisem se nepřepíše. Opakovaný či souběžný recovery průchod tutéž operaci neobnoví dvakrát.
- Výsledek běžící operace musí v `recordOutcome` obsahovat `expectedAttempt` převzatý z jejího claimu. Chybějící, starý či již obnovený claim je odmítnut. SQL dokončení kontroluje i attempt, ne pouze opakující se stav EXECUTING.
- Claim vrací přesný atomicky nárokovaný snapshot. Nemůže následným čtením omylem převzít novější pokus jiného procesu.
- `workers/api/index.ts` má handler `scheduled`; `intent-recovery.ts` provede jedinou dávku nejvýše 100 operací. Tenant pochází výhradně ze serverového MEDUSA_PRICING_TENANT_ID. Deadline se explicitně nastavuje serverovou hodnotou NEXUS_EXECUTION_TIMEOUT_MS (1000 až 86400000 ms); není-li nastavena, obnova se nespouští. Neplatná aktivní konfigurace selže před DB změnou. Čas určuje scheduledTime události.
- Každá obnovená operace má varování execution.recovered_unknown s ID, bez payloadu/osobních údajů. Přeposílání do ops_event používá existující podepsaný ingest, pokud je nakonfigurován. Chyba obnovy má redigovaný log a selže událost.

## Akceptace a testy

Lokálně: 83/83 cílených Node testů, TypeScript pro NEXUS i Workers musí projít. Sdílený recovery kontrakt se spouští nad in-memory a skutečnou D1: přesná hranice, aktivní/pending operace, izolace tenanta, pořadí a limit, souběh, opakování, neplatné vstupy, pozdní výsledek, ověřený neprovedený zápis → nový pokus. D1 testy navíc vynutí závod uvnitř skutečného SQL dokončení i návratu claimu. Scheduled testy volají skutečný Worker handler nad izolovanou D1 a kontrolují logování bez payloadu.

Plný workerd/NEXUS/backend/HTTP PostgreSQL běh pouze workflow wave1-p0.yml. Výsledek a přesný commit doplnit do finálního záznamu po CI; tento dokument předběžně neoznačuje runtime za ověřený.

## Meze a další krok

Tento balík nedělá žádný vnější obchodní zápis, neposílá platby ani dokumenty a nezavádí automatický retry nejistých výsledků. UNKNOWN zůstává pro ověření proti autoritativnímu cíli. Překročený deadline nezaručuje, že vzdálený systém zastavil již odeslaný zápis; policy ověření musí tuto nejistotu respektovat.

Konfigurace cronu ani produkční deadline se tímto nemění: zapnutí je součástí schváleného nasazení s pravidly konkrétních operací. Následuje konkrétní runtime tok s uložením záměru, ověřením výsledku a bezpečným zpracováním fronty nejistot; generický retry framework se nevytváří. Pro velký objem bude třeba index a policy podle druhu operace; teď je průchod úmyslně omezený a určený konfigurovanému Medusa tenantovi.

## Výsledek CI 16. 10. 2026

Běh 38817700077: NEXUS 1202/1202, workerd/D1 80/80, backend 544/544, HTTP/PostgreSQL 132 scénářů PASS. Typové kontroly PASS. Ověřený HEAD 9481535, testovací merge 2f6a76b. Produkční aktivace ani celá obchodní autonomie se tím netvrdí.
