# Wave 1 — P0 SafeOrder security

Kanonický repozitář: `hlancaric-ship-it/anastasia-nexus`. Baseline `b01d3ed`;
izolovaná větev `codex/wave1-security`. Tato práce nepřepisuje původní auth změny,
neintegruje cizí větve a nic nenasazuje. Stav brány: **BLOCKED**, nikoli ACCEPTED.

## Nálezy a implementace

- Worker přijímal neautorizované SafeOrder požadavky. Nyní vyžaduje existující
  dedicated Medusa Bearer klíč a tenant binding; autentizuje před parsováním.
- Chybné JSON hodnoty se převáděly na nulu/prázdný string, neznámá metoda dostala
  nízké riziko a klient mohl změnit COD limit. Nyní jsou vstupy explicitní, částka
  konečná/nezáporná, měna EUR, metoda ze známých existujících hodnot. Nepovolená
  pole se odmítají. Původní COD limit 120 EUR, bodování a prahy 40/70 zachovány.
- Standardní Medusa completion obešel kontrolu v custom route. SafeOrder běží
  v `completeCartWorkflow.hooks.validate` po validaci ceny a platební částky.
  Používá skutečný locked snapshot poskytnutý Medusou, ne dodatečný dotaz.
  Kontroluje jeho řádky proti NEXUS a celý total včetně dopravy/daní. Každá
  processable payment session musí projít, první benigní session nesmí maskovat COD.
- Adaptér ověřuje tenant/měnu/částku odpovědi, typ a rozsah skóre, string factors,
  jednoznačné ALLOW s nízkým skóre; HTTP, timeout, redirect a chyby JSON blokují.
  Credential se posílá přes TLS (HTTP jen loopback), redirect je zakázán.
- Administrativní Worker issuance endpoint neměl autentizaci. Nyní vyžaduje
  stejnou service identitu a matching tenant před přístupem k voucher storage.
  Ověřená platba a atomické čerpání zůstávají samostatné následující brány.
- P0 handler nevypisuje zákazníkov e-mail ani credential; negativní test ověřuje
  logy Worker entrypointu. Stávající production CORS allowlist odmítá cizí origin.
  Medusa framework 2.19 má globální `/admin` auth; coupon-links má navíc explicitní
  middleware. Skutečná admin session/role acceptance se tímto neprokazuje.

Zvolen nejmenší kompatibilní postup: použít již existující server identity a
Medusa completion hook, žádný vlastní order/auth protokol, žádná nová závislost.
Lokální `pp_system_default` povolen pouze při explicitním Worker test/development
prostředí. Neznámé payment IDs vyžadují review před rozšířením allowlistu.

## Autoritativní lokální podklady

Pro hook a statusy ověřen skutečný instalovaný Medusa 2.19 kód:
`@medusajs/core-flows/dist/cart/workflows/complete-cart.js` (validate před
vytvořením order a autorizací, hook nese `input` a `cart`),
`cart/steps/validate-cart-payments.js` (processable statusy),
`@medusajs/framework/dist/http/router.js` (globální admin auth).
Netvrdíme úspěšnou registraci na běžícím backendu pouze na základě těchto souborů.

## Reprodukce

Z checkoutu s instalovanými uzamčenými závislostmi:

```sh
cd nexus
npm test
npm run build
./node_modules/.bin/tsc -p tests/workers/tsconfig.json --noEmit
npm run test:workers
```

```sh
cd backend
./node_modules/.bin/tsc --noEmit
npm run test:unit
```

Node HTTP test `nexus/tests/integration/SafeOrderHttp.test.ts` otevírá jen
127.0.0.1 na náhodném portu, volá skutečný adaptér přes skutečný fetch na Worker
handler a po testu zavře listener. Používá syntetické identity; DB není používána.
**Nejde o workerd ani Medusa persistence E2E.** Hook unit test registruje callback
na mock workflow a prokazuje jeho fail-closed rozhodování, nikoli DB rollback.

Kvůli úplné typové kontrole byly opraveny také dva existující testovací fixtures:
MediaDelivery explicitně zužuje optional hodnotu mapy a Worker webhook fixture
obsahuje povinný syntetický HMAC binding. Produkční kód médií/webhooku nezměněn.

## Blockery a přesný další postup

1. Na tomto hostu workerd odmítá macOS 12.6 (minimum 13.5). Docker, Podman,
   Colima a Lima nejsou dostupné. Poskytnout schválený izolovaný Linux/CI nebo
   novější Mac a přístup. Nesmí sdílet DB, zákazníková data ani klíče s produkcí.
2. Na kompatibilním hostu spustit `cd nexus && npm run test:workers`; připraven
   nový SafeOrder runtime test. Selhání startupu zde znamená **0 spuštěných testů**.
3. Syntetický Medusa + Worker + Postgres: oba HTTP completion endpointy musí
   odmítnout invalid/unauthorized/REVIEW/BLOCK/unavailable SafeOrder, v DB ověřit
   nulový přírůstek validních objednávek. Pak ALLOW musí vytvořit objednávku s
   přesnými locked cenami a payment částkou. Zkontrolovat opakování a změny košíku.
4. Teprve s těmito důkazy uzavřít fázi 1 a zahájit K6 auth review/integraci.

Open P0: skutečná runtime/persistence akceptace. Open P1 v dalších branách:
mail delivery/session/tenant ownership, sandbox payment/webhook/entitlement,
voucher concurrency/restart a restore acceptance zde dosud neověřeny.
Žádná produkční readiness, staging/Fable acceptance ani Wave 1 completion není tvrzena.

Skutečné výsledky a historie commitů: [CODEX_PROGRESS.md](../../../CODEX_PROGRESS.md).
Trasování: [REQUIREMENTS_MATRIX.md](../../../docs/REQUIREMENTS_MATRIX.md).

## Ověřená persistence — pokračování 2026-10-11

Předchozí blocker Medusa persistence byl vyřešen lokálně. Spuštěn skutečný Medusa
2.19 HTTP server a workflow nad novým soukromým PostgreSQL 16 clusterem; skutečný
Worker handler přes Node HTTP bridge. Žádná existující databáze nebyla použita.

Reprodukce z čistého worktree bez `.env*` kromě šablony, s instalovanými zamčenými
závislostmi a lokálními `initdb`, `pg_ctl`, Node: z kořene spusťte
`python3 backend/scripts/verify-safeorder-local.py`. Launcher nepřebírá service
credentials; ověřuje skutečnou datovou cestu clusteru a používá pouze loopback.
Po běhu zastaví vlastní procesy, důkazy zachová v oznámeném soukromém adresáři.

Výsledek: 12/12 scénářů, Jest 1/1 PASS. Oba completion endpointy: neautorizovaný
Worker, unavailable, malformed JSON, REVIEW a BLOCK nevytvořily žádnou objednávku
ani nedokončily košík. ALLOW u každého vytvořil jednu objednávku EUR, jednotková
cena 50, total 61.5 odpovídající skutečnému serverovému košíku. Klientské přepsání
částky/metody/e-mailu neobešlo locked snapshot. Custom endpoint přesně vrací
503 pro unavailable, 409 REVIEW, 403 BLOCK. Medusa serializací ztrácí prototyp
chyby; route nyní rozpoznává uzavřený seznam přesných chybových kódů. Standardní
Medusa endpoint zamítá tyto požadavky 500 bez objednávky.

[Syntetický důkaz](evidence/safeorder-medusa-persistence.json) obsahuje jen
výsledky a částky. Lokální logy neobsahovaly kontrolované syntetické klíče/e-maily.
Backend unit: 17/17 suites, 157/157 PASS; TypeScript PASS.

P0 runtime blocker stále platí: macOS 12.6 nespouští workerd. Nová task-owned
Linux VM v UTM je připravena, ale start i změnu konfigurace odmítá macOS
AppleEvents (OSStatus -10004; log potvrzuje chybějící oprávnění odesílatele).
Obě VM zůstávají zastavené, původní VM nebyla změněna. Neobcházíme systémová
oprávnění. Vyžaduje kompatibilní izolovaný Linux/CI nebo spuštění pouze VM
`Wave1 Synthetic Runtime` vlastníkem. Potom spustit skutečné
`cd nexus && npm run test:workers`; do té doby brána BLOCKED a Auth nezahájeno.
Opakování/souběh checkoutu patří do navazující K1–K4 akceptace; tento běh je
neprokazuje. Nový test není workerd, staging ani produkční readiness.

## Vzdálené P0 ověření — konfigurace 2026-10-11

Vlastník zakázal další lokální runtime/testy a následně výslovně schválil
publikování pracovní větve do veřejného kanonického GitHub repozitáře a testy
v GitHub Actions. Git slouží pouze k publikaci a evidenci; runtime je vzdálený.
Před publikací ověřeno: pracovní strom čistý, žádné sledované `.env` ani
`data-private` v publikované historii, známé vzory soukromých klíčů/live tokenů
nenalezeny. V cílovém repozitáři nejsou existující deployment workflows.

`.github/workflows/wave1-p0.yml` spouští na GitHub-hosted Ubuntu 24.04 pouze
větev `codex/wave1-security`. Checkout nemá persistované credentials, token má
jen contents:read, job nepoužívá secrets ani produkční prostředí. Actions jsou
připnuté na SHA ověřené proti jejich oficiálním v4 refs. Dependency příprava
použije zamčený npm lock a Node 24.14.0. Samotné testy běží v disposable Node
kontejneru s `--network none`, bez capabilities a se zákazem nových privilegií;
test nemůže volat produkční API ani DB. Zapisovat smí pouze checkout a tmpfs.
Zachovává skutečný source SHA, image digest, log a JSON reporty jako CI artifact.

Workerd test rozšířen o špatný klíč, chybějící service config a sedm neplatných
payloadů. Spouští se skutečné `npm run test:workers`, Nexus regression a obě
typové kontroly. Tato konfigurace má zatím stav IMPLEMENTED_UNVERIFIED;
výsledek bude evidován až podle skutečného CI běhu. Není to staging/Fable
akceptace. Lokální VM/backend/DB/testy se dál nespouštějí.

### Skutečný výsledek prvního CI běhu

Publikována pouze nová větev `codex/wave1-security`, bez force, HEAD
`ad09d156ba6dd02a6d96bd59eae39f3d2fb2ba77`. GitHub potvrdil pracovní
`c9d0e14` i navazující deníkový commit v historii.
[Run 38124610864](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38124610864)
selhal před přidělením runneru: runner_id=0, steps=[], žádné artifacts.
Anotace jobu 114426271806 přesně uvádí:
`The job was not started because your account is locked due to a billing issue.`

[Důkaz](evidence/safeorder-ci-startup.json) zachovává skutečné IDs/SHA a důvod.
Výsledek je **0 spuštěných testů**, nikoli selhání bezpečnostního testu.
Automatické opakování před změnou tohoto stavu nepomůže. Vlastník musí
odblokovat Actions na GitHub účtu nebo dodat jiný schválený izolovaný vzdálený
Linux/CI. Billing nebyl měněn, produkce nedotčena. Fáze 1 zůstává BLOCKED.

## Pokračování P0 — transport a širší vzdálená verifikace

Review skutečného pricing adaptéru prokázalo rozdíl proti SafeOrder: chyběl TLS
guard, zákaz redirectu a deadline. Pricing nyní odmítá URL credentials a HTTP
mimo loopback před odesláním service klíče, používá redirect:error a timeout 5s.
Malformed JSON převádí na pevný error code bez vrácení části response body;
vyžaduje přesné ok:true, matching tenant a string pole appliedRules. Výpočet
cen ani obchodní pravidla se nemění. Připraveno 14 focused unit testů.

Actual workerd suite nyní plánuje 15 SafeOrder testů včetně REVIEW/BLOCK,
autentizace před parsováním, admin authorization s nezměněným skutečným D1,
production CORS/test provider a kontroly logů bez syntetických klíčů/e-mailu.
Medusa HTTP matrix rozšířena z ověřených 12 na 38 plánovaných scenario records:
vadné pricing odpovědi, odmítnutí redirect targetu, replay zamítnutí a souběžný
BLOCK. Pricing-change test neoznačuje následnou legitimní payment reinitializaci
za replay útok; celý checkout zůstává pozdější samostatnou branou.

CI přidává závislý medusa-persistence job po úspěšném workerd/Nexus jobu:
Node24 + PostgreSQL16 image, syntetický neprivilegovaný OS uživatel odpovídající
runner UID, network:none a soukromý tmpfs cluster. Build context je jen adresář
scripts, nikoli celý checkout/node_modules. Launcher exportuje pouze explicitní
JSON/test/Worker logy do ci-evidence; žádný PG datový adresář do artifactu nejde.
Backend unit, TypeScript a persistence se vykonávají vzdáleně. Nové scénáře jsou
zatím IMPLEMENTED_UNVERIFIED; staré 12/12 nejsou důkazem nových 38.

Vlastník oznámil uhrazení GitHub billing a požádal o Actions. Publikace aktuální
revize spustí nový běh; odstranění billing locku prokáže až skutečně přidělený
runner a test output. Lokální runtime zůstává zakázán.

### Actions po oznámené platbě — ověřený výsledek

Publikováno HEAD `02e97655121eab2bb4d06b09d50ae707589515c5` bez force.
[Run 38125396491](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38125396491)
attempt1: verify114428587451 failure před startem, medusa114428594924 skipped.
Po krátké prodlevě vyžádán rerun failed jobs; connector měl Actions write 403,
existující autorizovaný GitHub CLI přijal tentýž vzdálený rerun. Attempt2:
verify114429013822 runner_id=0, steps=[], failure; medusa114429020948 skipped.
Oba verify joby mají přesnou billing-lock anotaci stejně jako první běh.
**0 kroků/testů skutečně vykonáno, žádné artifacts.**

[Důkaz po platbě](evidence/safeorder-ci-after-payment.json) rozlišuje tvrzení
vlastníka o platbě od skutečného scheduler výsledku. Nový pricing kód a nové
testy jsou IMPLEMENTED_UNVERIFIED. Staré PASS výsledky se na ně nepřenášejí.
[Oficiální GitHub postup](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account)
uvádí automatické odblokování po úspěšném zpracování platby, které může trvat
až 24h; žádnou konkrétní dobu pro tento účet nelze z těchto dat tvrdit.
Nic dalšího nebylo účtováno ani měněno v billing/subscription nastavení.
Jakmile se stav účtu změní, rerun38125396491 ověří oba P0 joby v jejich pořadí.
