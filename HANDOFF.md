# HANDOFF — ANASTASIA / NEXUS

**Aktualizováno:** 10. 10. 2026
**Auditovaný implementační základ:** `/Users/lucky/anastasia-nexus`, `wave1-base` @ `b01d3ed` (dirty Claude worktree zachován).
**Ověřovací větev:** `/Users/lucky/anastasia-nexus-codex-auth`, `codex/auth-magic-link`, commitována po dokončení testů.
**Roadmapa:** [`ROADMAP_ANASTASIA_NEXUS.md`](ROADMAP_ANASTASIA_NEXUS.md).

## Poslední dokončený úkol

Oprava C2 migrated customer → magic-link vazby: odstraněn chybný předpoklad `has_account=true`, e-mail kandidáti musí být jednoznační; `auth_identity.entity_id` musí odpovídat ověřenému e-mailu; vazba `app_metadata.customer_id` a aktivace `customer.has_account=true` jsou jeden atomický PostgreSQL statement. Opakované potvrzení validuje již existující vazbu, opraví pouze odpovídající zákaznici a DB chyby už nezamaskuje jako úspěšné přihlášení.

Syntetický PostgreSQL test potvrdil, že zákaznická vazba nemění C2 `legacy_order` ani entitlement cizího/stejného customer ID. Duplicitní e-mail nevybere náhodný řádek. Test běžel v rollbackované transakci nad TEMP tabulkami na lokálním unix socketu DB `anastasia_dev_wave1`; nebyla čtena ani měněna trvalá zákaznická data.

## Změněné soubory na `codex/auth-magic-link`

- `backend/src/modules/auth-magic-link/service.ts`
- `backend/src/modules/auth-magic-link/__tests__/service.unit.spec.ts`
- `backend/src/modules/auth-magic-link/__tests__/service.integration.spec.ts`
- Zkopírovaný Claude auth provider balík a subscriber, které byly v původním worktree necommitnuté:
  `backend/src/modules/auth-magic-link/{index.ts,policy.ts,__tests__/policy.unit.spec.ts}` a `backend/src/subscribers/auth-magic-link-requested.ts`.
- `backend/docs/wp/auth-magic-link.md`
- `ROADMAP_ANASTASIA_NEXUS.md`, `HANDOFF.md`, upravené `STATUS.md` a `docs/REQUIREMENTS_MATRIX.md`.

Poznámka: worktree používá dočasný symlink `backend/node_modules` na již nainstalované závislosti ve zdrojovém worktree. Nejde o verzovaný soubor. Neúplný npm install vytvořený při pokusu je odložen mimo checkout do `/tmp/anastasia-auth-node-modules-incomplete`.

## Testy, které skutečně prošly

Z `/Users/lucky/anastasia-nexus-codex-auth/backend`:

- `npm run test:unit -- --runTestsByPath src/modules/auth-magic-link/__tests__/policy.unit.spec.ts src/modules/auth-magic-link/__tests__/service.unit.spec.ts` — **18/18 PASS**.
- `npm run test:integration:modules -- --runTestsByPath src/modules/auth-magic-link/__tests__/service.integration.spec.ts` — **1/1 PASS**, syntetické TEMP tabulky a rollback.
- `npx tsc --noEmit` — **PASS**, exit 0.
- `npm run test:unit` — **156/156 PASS**, 17 sad.

Plný `medusa build`, HTTP auth/browser, skutečné odeslání e-mailu, Stripe, celý checkout e2e, tenant isolation pro více obchodů a produkční stav nebyly ověřeny.

## Rozpracované / známé limity

- Hlavní `/Users/lucky/anastasia-nexus` zůstává nedotčený s původními Claude změnami: `backend/.env.template`, `backend/medusa-config.ts` modified; provider module a subscriber untracked. Tyto soubory nebyly odstraněny ani přepsány. `medusa-config.ts`/`.env*` patří podle AGENTS integrátorovi; auth registraci musí samostatně review/merge.
- Tenant schéma není v backendu. Aktuální C2 linker je bezpečný pro single-store e-mailovou identitu, ale netvrdí více-tenant izolaci.
- Notification provider je `notification-local`, takže magic-link e-mail skutečně nedorazí zákaznici.
- C2 report aktualizuje reconciled skutečný dump dle `docs/REQUIREMENTS_MATRIX.md`, ale tento běh data znovu nečetl.
- Remote rozpor: lokální origin je `hlancaric-ship-it/anastasia-nexus`; `L-Code-Dynamics-Dev/nexus` je jiné repo/historie. Lokálně není `apps/kar`. Nepushovat na nevyjasněný remote.

## Další konkrétní krok

Po auth opravném balíku je nejbližší nezávislý, neprodukční úkol C7 `restore-drill`: doplnit bezpečný lokální backup/restore runbook a syntetický ověřovací postup bez přístupu k produkční DB nebo tajným souborům. C5 admin UI čeká na aktualizované K5/K4 gate; C8 e2e čeká na stabilní K4 checkout. Po dokončení C7 aktualizovat tuto handoff kartu a roadmapu.

## Blokátory / rozhodnutí uživatele

1. Který Git remote je kanonický pro budoucí PR: současný `hlancaric-ship-it/anastasia-nexus` nebo `L-Code-Dynamics-Dev/nexus`?
2. Výběr e-mail provideru a povolené test credentials před ověřením doručení.
3. Tenant model, pokud systém bude sdílet zákaznickou DB napříč více obchody/doménami.
4. Produkční hosting, secrets, domény, Stripe live režim, databáze a Cloudflare/R2 přístupy — vše zůstává blokováno samostatným písemným schválením.
