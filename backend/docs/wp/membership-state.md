# Klub: trvalý stav v Meduse

Stav: VERIFIED pro transakční ukládání a deduplikaci dokladů. Závisí na pravidlech z PR #33; není hotové automatické předplatné ani veřejný API kontrakt.

Modul `membership` ukládá členství a globálně unikátní spotřebu objednávky do PostgreSQL. Každá změna běží v nativní transakci s PostgreSQL advisory lockem; zápis stavu a potvrzení platby patří do stejné transakce. Inicializace je deduplikovaná první objednávkou, obnova spotřebuje jen objednávku vázanou na aktuální klíč. Unikátní indexy zůstávají účinné i při soft-delete; tentýž platební doklad nesmí založit druhé členství.

Před enqueue se uloží rozhodnutí a stabilní klíč obnovy. Po výpadku zůstane `renewing/unknown` a další průchod požádá o dohledání již existující nativní operace. `markUnknown` kontroluje klíč, aby opožděný výsledek nepřepsal jiné období. Zastavení obnovy během nejasné platby nezahodí rozpracovanou operaci. Replay prvního nákupu po zastavení znovu nezapne obnovování. Čtení pro zákaznici vyžaduje shodu customer_id; nevystavuje se libovolný cizí záznam.

Čistá pravidla navíc odmítají použití obnovovacího platebního klíče k založení druhého prvního členství. Uložení/read-back používá strukturální porovnání JSON, protože PostgreSQL jsonb mění pořadí klíčů. Žádný zápis se nevydává za reálné stržení peněz nebo udělení přístupu.

## Integrace vlastněná Claudem

Do aplikace musí integrátor přidat `{ resolve: "./src/modules/membership" }` a provést migraci podle obvyklého schvalovaného postupu. Tento balík nemění `medusa-config.ts`, globální middleware ani entitlement modul. CI připojuje modul pouze testovacím hookem. Dokud není připojený nativní checkout adaptér, metody přijímající `Receipt/Terms` jsou výhradně interní; nikdy se nesmějí vystavit jako zákaznický HTTP payload.

Chybí: loader ověřených faktů z Medusy, trvalý checkout/reconciliation adaptér a job, uložená platební metoda a explicitní souhlas, reálné grant/revoke vazby, refund/storno/dunning, vlastní admin a storefront endpoint. Neexistuje zatím background účtování; žádný klíč Stripe se nečte/nepoužívá. Samotný trvalý stav není dokladem dokončeného předplatného.

## Ověření

Cílené pravidlové testy a TypeScript lokálně; skutečné Medusa/PostgreSQL testy pouze v izolované CI. Dvě integrační cesty ověřují souběžnou inicializaci a obnovu, replay, trvalý unknown, cizí zákaznici, globální spotřebu objednávky včetně soft-delete, rollback neplatné změny a zastavení obnovy. Plná regrese jen CI. Nic se neslučuje ani nenasazuje.

Finální [důkaz](evidence/membership-state-ci.json): cílenáCI38967357782 unit33/33,backendtsc,skutečnáMedusa/PG2/2 PASS. PlnáCI38967357651 backend705/705,NEXUS1230/1230,workerd139/139,HTTP151/151 PASS. První pokus odhalil chybnou práci testu s runnerovým dbConnection proxy; opraveno čtením skutečného native Knexu. Runtime produkční kód se při této opravě neměnil.
