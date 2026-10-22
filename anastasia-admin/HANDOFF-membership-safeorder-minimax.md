# HANDOFF – ověřit opravu klubu + safeorder C3 (MiniMax, 21. 10.)

1. **Klub (commit 37198dc)**: `lib/membership/access.ts` neposílal `tenant_id` do `entitlement.grant()` → obnova členství padala. Opraveno na `tenant_id:'default'`.
   - Spusť `integration-tests/http/membership-state.spec.ts` a `membership-checkout-e2e.spec.ts` přesně tak, jak to dělají jejich CI workflowy v `.github/workflows/` (vlastní env: CI=true, DB_USERNAME=membership_synthetic, DB_TEMP_NAME=anastasia_membership_ci, lokální Postgres). Musí projít.
   - Doplň unit test, který zachytí grant bez tenant_id v `access.ts`.
   - Najdi všechny další volání služeb, které tenant_id vyžadují (entitlement, booking, …) a neposílají ho. `entitlement-isolation-http-checks.ts` oprav taky.
2. **safeorder-persistence.spec.ts scénář C3** padá už na 6398912. Najdi příčinu a oprav (pokud je chyba v testu, oprav test a napiš proč).
3. Všechny unit testy musí projít.

Pravidla: **commit hned po každé opravě**, jen vlastní soubory, žádný push, nikdy git checkout/reset/stash/clean. Report: `anastasia-admin/MEMBERSHIP-SAFEORDER-HOTOVO.md`.
