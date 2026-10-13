# C3 — atomické použití QR kupónu (13. 10. 2026)

Větev: `codex/coupon-usage`. Změna pouze lokální, bez nasazení.

## Implementace

`completeCartWorkflow.hooks.validate` po úspěšném ověření cen, plateb a ALLOW všech zpracovatelných payment sessions přečte `snapshot.metadata.nexus_coupon`. Přes `container.resolve<IPromotionModuleService>(Modules.PROMOTION)` zavolá `registerUsage([{ code, amount: 1 }], registrationContext)`. Jediná computed action znamená jedno použití; API nemá parametr `quantity`. Zamykání a transakci provádí Medusa 2.19.0, žádná vlastní logika zámků nepřibyla. Chyba se nepolyká: přeruší workflow před vytvořením objednávky. Kupón se nečerpá pro REVIEW/BLOCK, bez kupónu ani znovu pro dokončený snapshot.

Po úspěšné registraci se uloží kompenzační data v `StepResponse`. Při pozdějším selhání workflow hook zavolá `revertUsage`, stejně jako standardní Medusa register-usage step. Selhání samotné registrace nemá data pro vracení cizího použití. Kontext používá standardní klíče `customer_id` / `customer_email`.

## Ověření

- Unit testy hooku: ALLOW, REVIEW/BLOCK, odmítnutí druhým payment providerem, propagace původní chyby, kompenzace a přeskočení bez kupónu / dokončeného snapshotu.
- Rozšířen existující izolovaný HTTP test SafeOrder: pro standardní i NEXUS checkout vytvoří dva různé košíky se stejným 10% kupónem s `limit: 1`. Bariéra synchronizuje vstup do skutečné `registerUsage`; samotná služba, PostgreSQL i checkout běží bez mockování. Ověřuje jeden úspěch, druhou HTTP chybu limitu, přesně jednu uloženou objednávku, `used = 1`, nedokončený neúspěšný košík a jednotkovou cenu 45 EUR místo 50 EUR.
- Limit rozšířeného HTTP testu zvýšen z 300 na 600 sekund, limit jeho izolovaného runneru z 600 na 900 sekund. První běh doběhl k registraci kupónu, ale ukončil ho původní 300sekundový limit; nepovažuje se za PASS.
- Opraven existující TS2352 v kupónovém unit testu: přetypování mocku přes `unknown`, bez změny runtime chování.

Stav: **VERIFIED lokálně**, bez nasazení. Ověřené výsledky:

- `cd backend && npm test` — nelze spustit, chybí skript `test` (manifest nezměněn).
- `cd backend && npm run test:unit` — finální běh **22/22 souborů, 203/203 testů PASS**. První běh 202/203 kvůli 30sekundovému timeoutu QR PNG; samostatný opakovaný QR test 36/36 a následná celá sada prošly bez změny QR kódu nebo jeho limitu.
- `cd backend && npx tsc --noEmit` — **PASS** po opravě typu mocku.
- `python3 backend/scripts/verify-safeorder-local.py` — **PASS**, 1/1 integrační test, **40 zaznamenaných scénářů**, 233,801 s. Standardní souběh: HTTP `[400, 200]`; NEXUS souběh: `[200, 400]`. Oba: jedna nová objednávka, `used = 1`, jednotková cena 45 EUR. Databáze a Worker bridge byly po testu zastaveny.
- `git diff --check` — **PASS**.

Důkaz finálního HTTP běhu: `/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-safeorder-zmh_5csi/medusa-persistence-evidence.json`. Log celé finální unit sady: `/tmp/coupon-unit-final.log`. Log TypeScriptu: `/tmp/coupon-tsc-final.log`. Tyto lokální dočasné soubory nejsou součástí commitu.

## Rozsah

Beze změny `nexus/`, tierů, `admin-demo/`, package manifestů a lockfile. `npm test` v backendu skončilo `Missing script: test`; existující sadu tvoří `test:unit` a izolovaný HTTP runner. Všechny soubory vybírané `test:integration:modules` jsou již zahrnuty v unit sadě. Stripe produkční platba ani edge nasazení redirectů se tímto neověřují.
