# K6 auth: bezpečné propojení C2 zákaznice magic linkem

**Datum:** 10. 10. 2026
**Základ:** `wave1-base` `b01d3ed`; změny jsou na `codex/auth-magic-link`, commitována po dokončení testů.
**Stav balíku:** oprava propojení `VERIFIED` testy; zapojení provideru do Medusy a doručování e-mailu `PARTIAL`.

## Rozhodnutí a hranice

- C2 záměrně importuje zákaznici s `has_account=false` a nepřenáší heslo. Ověřený magic link na normalizovanou adresu je okamžik aktivace účtu.
- Propojení hledá aktivní Medusa customer s přesně shodným normalizovaným e-mailem. Nevybírá první z více shod: duplicitní e-mail nechá bez vazby.
- Jeden SQL statement zamkne nejvýše dva kandidáty, vyžaduje právě jednoho, podmíněně naváže `auth_identity` pouze se stejným `entity_id` a současně nastaví `customer.has_account=true`. DB chyby se nepolykají.
- Již uložená vazba se znovu ověří podle `customer_id` i e-mailu; při shodě se případný stale `has_account=false` opraví. Cizí nebo neplatná vazba se odmítne.
- Backend v této revizi nemá `tenant_id` na Customer/AuthIdentity. Aktuální model je jeden Medusa obchod; test ověřuje vlastnictví identity a e-mailu, nikoli izolaci více tenantů. Sdílená databáze více obchodů zůstává blokovaná do návrhu tenant modelu.

## Soubory

- `src/modules/auth-magic-link/service.ts` — jednorázový hashovaný token, dohledání zákaznice, atomická vazba/aktivace.
- `src/modules/auth-magic-link/policy.ts` — normalizace e-mailu, token, stav a timing-safe kontrola.
- `src/modules/auth-magic-link/__tests__/service.unit.spec.ts` — C2 flag false, unikátní kandidát, duplicity, existující vazba, nesoulad identity a propagace DB chyby.
- `src/modules/auth-magic-link/__tests__/policy.unit.spec.ts` — čistá pravidla tokenu.
- `src/modules/auth-magic-link/__tests__/service.integration.spec.ts` — PostgreSQL přes lokální Unix socket; pouze transakční TEMP tabulky se syntetickým C2 profilem, objednávkou a entitlementem; rollback po testu.
- `src/subscribers/auth-magic-link-requested.ts` — handler eventu pro notifikaci.

## Ověření

Na `codex/auth-magic-link` proběhlo:

```sh
npm run test:unit -- --runTestsByPath src/modules/auth-magic-link/__tests__/policy.unit.spec.ts src/modules/auth-magic-link/__tests__/service.unit.spec.ts
npm run test:integration:modules -- --runTestsByPath src/modules/auth-magic-link/__tests__/service.integration.spec.ts
npx tsc --noEmit
npm run test:unit
```

Výsledek: cílené unit **18/18 PASS**, PostgreSQL integrační scénář **1/1 PASS**, TypeScript exit 0, kompletní unit sada **156/156 PASS, 17 sad**. Integrační test ověřil aktivaci C2 zákaznice, zachování historického order a entitlement ID, obnovu stale account flagu a odmítnutí vazby při duplicitním e-mailu. Test nepoužil zákaznická data; DB zápisy byly pouze do dočasných tabulek v rollbackované transakci.

## Neověřeno / návaznosti

- Hlavní worktree `/Users/lucky/anastasia-nexus` má dosud necommitnuté Claude změny v `backend/medusa-config.ts`, `.env.template`, auth modulu a subscriberu. Tento worktree zachoval beze změny. Projektová pravidla zakazují v balíku auth měnit `medusa-config.ts` a `.env*`; registraci modulu je nutné po review sloučit zvlášť.
- Test neposílá e-mail ani neověřuje HTTP auth/session/refresh/cookie celý řetězec. Výchozí notification provider je `notification-local`; produkční e-mailový provider chybí.
- C2 importovaný dataset měl 17 zákaznic, 10 objednávek a 18 entitlementů podle aktualizované matice. Test používá jeden syntetický účet; nereadoval ani neměnil importované záznamy.
- Vyžadované dodatečné scénáře před akceptací K6: současné magic linky/souběh, expirovaný a opakovaný token přes Medusa auth HTTP endpoint, průchod autorizovaného customer session k jeho objednávkám a entitlements, odmítnutí cizího customer ID.

## Další krok

Review a merge této větve s Claude registrací z původního worktree, poté Medusa HTTP integrační test a pouze se syntetickými daty ověřit relaci → `/store/customers/me` → historické objednávky/entitlements. Neodesílat produkční e-mail a nenasazovat bez samostatného schválení.
