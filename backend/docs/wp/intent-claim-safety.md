# Bezpečné spuštění trvalé operace

Stav: IMPLEMENTED_UNVERIFIED pro D1 runtime; lokálně 69/69 existujících testů ExecutionIntentStore, IntentExecutor, IntentReconciliation a ExecutionPipeline PASS, oba TypeScript projekty PASS. Úplná regrese a nový D1 test pouze na GitHub Actions, výsledek doplnit po běhu. Bez nasazení.

## Problém a oprava

D1ExecutionIntentStore měl vlastní SQL seznam povolených stavů obsahující UNKNOWN, ačkoliv kanonický stavový automat přechod UNKNOWN → EXECUTING zakazuje. Atomický SQL claim tak obešel ochranu proti slepému opakování nejistého vnějšího zápisu. In-memory store tuto chybu neměl.

SQL seznam je nyní přímo odvozen ze stávajícího stavového automatu. Počet pokusů se zvyšuje pouze při opakování známého FAILED. UNKNOWN zůstává beze změny ve frontě pro ověření skutečného výsledku. Nezavádí se nový stavový model, konektor ani plánovač.

## Důkaz

Nový tests/workers/intentClaim.test.ts používá skutečnou izolovanou D1 v workerd: všech osm stavů, neměnnost odmítnuté operace, paralelní odmítnutí UNKNOWN, ověření neprovedeného zápisu → FAILED → jediný vítězný claim, izolace jiného tenanta. Test nevolá externí konektory. Plný běh wave1-p0.yml musí být zelený před sloučením do master.

## Meze

Toto opravuje úložiště. Chybějící zapojení trvalých operací do runtime, časové limity běžících operací, doručování událostí a úplné obchodní procesy zůstávají navazující práce. FAILED lze opakovat pouze podle doménové policy; tato změna nevytváří automatický retry runner.
