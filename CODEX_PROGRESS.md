# ANASTASIA × NEXUS — Wave 1 execution journal

## Baseline — 2026-10-11 (UTC)
- Canonical repository: `hlancaric-ship-it/anastasia-nexus`, original checkout `/Users/lucky/anastasia-nexus`.
- Isolated execution checkout: `/Users/lucky/anastasia-nexus-codex-wave1-security`.
- Branch: `codex/wave1-security`; baseline `wave1-base` = `b01d3ed7b1b47ac2076e5653206e09a43dceb1c5`.
- Phase 0: VERIFIED locally. Phase 1: IN_PROGRESS; acceptance NOT VERIFIED.
- `codex/auth-magic-link` tip `dc32a66`; required commit `d0dfe59048be932412ab524d2bcdb90bd29abe31` exists.
- `codex/restore-drill` tip / required commit `34431e190fe3f0f2b9011f508ecf211f4d00c52a` exists.
- Both branch merge-bases with `wave1-base` are exactly the baseline SHA.
- Distinct repository `L-Code-Dynamics-Dev/nexus`: `/Users/lucky/nexus`, `master` = `bbb2a7d`; none of the three requested commits or baseline branches exists there. No changes made there.
- Original canonical checkout has existing uncommitted auth provider/config/template changes. Preserved; isolated worktree starts clean. No fetch, merge, push, deployment or DB changes performed.

## Completed / verification
Commands actually run: `git status --short --branch`, `git remote -v`, `git branch -avv`, `git log -8 --oneline`, `git worktree list`, `git rev-parse --verify <commit>^{commit}`, `git merge-base wave1-base <branch>` in both repositories.
Results: all required canonical references found; merge-bases match; independent repository distinguished. No application tests yet.
Read: root AGENTS.md, backend handoff, NEXUS-INTEGRATION.md, nexus/CLAUDE.md, ARCHITECTURE_MAP.md, actual Worker and checkout implementations and tests.

## Open blockers / risks
- P0: SafeOrder currently accepts unauthenticated input, no tenant binding, coercive amount/payment parsing, client-selectable COD limit.
- P0: verify all cart completion paths; current SafeOrder call is in custom checkout route only.
- Phase 1 gate blocks Auth and all later phases until demonstrated with executable tests.
- Staging and real mail delivery not yet verified; no production readiness claim.

## Owner decisions
- Approve isolated synthetic restore environment before a destructive restore drill (phase 6).
- Supply/approve ANASTASIA commercial pricing policy, mail and sandbox payment environment when required by their gates.
- No production action authorized. Current execution order authorizes P0 edits including nexus/; supersedes older package ownership allocation, while isolated worktree and no-production safeguards remain.

## Commit protocol
Each work commit gets a separate journal commit containing its actual SHA and checks. The journal commit references itself through its unique commit subject / Git revision expression: embedding its own SHA would change that SHA. Actual documentation SHA is verified with Git and reported, then included as a historical SHA in the next substantive record. Documentation-only commits do not recursively create further documentation commits.

## Related evidence
- [Requirements matrix](docs/REQUIREMENTS_MATRIX.md)
- [Handoff](backend/docs/wp/CODEX-HANDOFF.md)
- [Roadmap](docs/BRIEF-ciloveho-systemu-a-roadmapa.md)
- [Integration boundary](backend/NEXUS-INTEGRATION.md)

## Next action
Audit completion hook and security regression coverage, then bind SafeOrder to existing server credential + configured tenant, reject malformed requests, and verify fail-closed completion before proceeding.

## COMMIT RECORD

Timestamp UTC: 2026-10-11T07:18:03.743933+00:00
Repository: hlancaric-ship-it/anastasia-nexus
Branch: codex/wave1-security
Work Commit SHA: 7af0713a49a862eafd6c490dd4ddbf142ca01277
Journal Commit SHA: resolve `git log -1 --format=%H --grep='^docs(wave1): journal baseline 7af0713$'` (self-reference, see protocol above)
Phase: 0
Task ID: GIT-BASELINE

### Changes
- Recorded canonical repository and verified local baseline; preserved existing changes in both original checkouts.

### Files Changed
- CODEX_PROGRESS.md

### Verification
Commands: Git status/remotes/branches/log/rev-parse/merge-base; `git diff --check`; `git show --stat HEAD`.
Results: required objects exist in canonical repository; both merge-bases equal b01d3ed; initial documentation commit succeeded.
Evidence: local Git history and baseline record above. Application tests: not run.

### Security
Risks: unauthenticated SafeOrder and completion-path bypass require verification/fix.
Open Blockers: phase 1 acceptance pending.

### Acceptance
PASS (local Git baseline only)

### Next Action
Exact next executable task: read backend/src/workflows/hooks.ts and completion tests; implement SafeOrder service authentication and tenant validation.

## COMMIT RECORD

Timestamp UTC: 2026-10-11T07:27:24.544445+00:00
Repository: hlancaric-ship-it/anastasia-nexus
Branch: codex/wave1-security
Work Commit SHA: ba19a5d1926cbe443431f1fad053235efec5be7c
Journal Commit SHA: resolve `git log -1 --format=%H --grep='^docs(wave1): journal security ba19a5d$'` (actual self-reference; see protocol)
Previous Journal Commit SHA: 895edea69f68d2842d776f3e02d7fc54a3070447
Phase: 1 — P0 SAFEORDER SECURITY
Task ID: P0-SAFEORDER / K2

### Changes
- Implemented service authentication before SafeOrder input parsing; required tenant, EUR, bounded numeric amount and known payment method; rejected policy/price overrides.
- Protected administrative voucher issuance with matching service identity and tenant before storage access.
- Moved SafeOrder to the Medusa completion validation hook for standard and custom completion paths; verified locked lines/quantities, total and all processable payment sessions.
- Bound backend acceptance to response tenant/currency/amount, valid score/factors and low-score ALLOW; TLS/loopback transport only, no credential redirect.
- Added negative unit, real loopback HTTP and prepared workerd tests; updated contracts, traceability and security evidence. Fixed existing media and webhook test fixture type defects.

### Files Changed
- backend/NEXUS-INTEGRATION.md
- backend/docs/wp/wave1-security.md
- backend/src/api/store/nexus-checkout/__tests__/safeorder.unit.spec.ts
- backend/src/api/store/nexus-checkout/route.ts
- backend/src/api/store/nexus-checkout/safeorder.ts
- backend/src/workflows/__tests__/safeorder-completion.unit.spec.ts
- backend/src/workflows/hooks.ts
- docs/REQUIREMENTS_MATRIX.md
- nexus/tests/integration/MedusaNexusE2E.test.ts
- nexus/tests/integration/SafeOrderHttp.test.ts
- nexus/tests/unit/MediaDelivery.test.ts
- nexus/tests/unit/nexusSafeOrderRoute.test.ts
- nexus/tests/workers/medusaWebhook.test.ts
- nexus/tests/workers/safeOrder.test.ts
- nexus/workers/api/medusaServiceAuth.ts
- nexus/workers/api/routes/issuance.ts
- nexus/workers/api/routes/nexusSafeOrder.ts

### Verification
Commands and final results:
- `cd nexus && npm test`: exit 0, 86/86 files, **1086/1086 tests PASS**, including 4 actual loopback backend-to-Worker HTTP scenarios.
- `cd backend && npm run test:unit`: exit 0, 16/16 suites, **152/152 tests PASS**.
- `cd backend && ./node_modules/.bin/tsc --noEmit`: exit 0, PASS.
- `cd nexus && npm run build`: exit 0, PASS.
- `cd nexus && ./node_modules/.bin/tsc -p tests/workers/tsconfig.json --noEmit`: exit 0, PASS after fixing required synthetic binding in existing webhook fixture.
- `cd nexus && npm run test:workers`: exit 1, **BLOCKED**, three pool startup errors, **0 tests executed**. Actual message: Unsupported macOS version 12.6.0; minimum requirement macOS 13.5.0+. No Docker/Podman/Colima/Lima executable available.
- `git diff --cached --check`: PASS before work commit.
Results: implementation and local negative/regression/HTTP checks verified. Cloudflare runtime, Medusa persistence/DB rollback, staging and production behavior NOT VERIFIED.
Evidence: `backend/docs/wp/wave1-security.md`, `backend/NEXUS-INTEGRATION.md`, `docs/REQUIREMENTS_MATRIX.md`, committed executable tests, tool outputs from this run.
Earlier failed checks: test callback initialization/type issues, stale unauthenticated fixtures, misplaced import during edit and existing optional-map fixture typing; diagnosed and corrected. Final relevant full suites and type checks above passed. Runtime startup blocker remains.

### Security
Risks: fixed credentials imply trusted backend service, not independent proof of payment or catalog ownership. Issuance still requires later payment/voucher acceptance. Existing commercial policy and real payment integrations are not approved/verified here. No durable SafeOrder decision audit record yet. Standard completion fail-closed behavior must be confirmed in a running Medusa instance.
Open Blockers:
- P0: approved compatible isolated runtime + real Medusa order persistence acceptance unavailable. Owner asked asynchronously for environment and access; no response received at this record.
- P1 / subsequent gates: real test mail delivery, auth/session/customer ownership, sandbox payment/webhook/entitlement, voucher concurrency + SEC-03 persistence, restore/staging/Fable acceptance not verified. Later phases not started through P0 gate.
No production/real DB calls, deployments, restore, branch merges or push performed. Original uncommitted changes preserved.

### Acceptance
BLOCKED — phase 1 acceptance requires actual workerd and persisted-order negative tests; local test success is insufficient. Phase 0 remains VERIFIED. Wave 1 NOT COMPLETE, NOT PRODUCTION READY.

### Next Action
Exact next executable task: on owner-provided compatible isolated Linux/CI/macOS >=13.5 checkout this branch and run `cd nexus && npm run test:workers`; then run both Medusa completion endpoints against synthetic isolated Postgres + Worker, assert unauthorized/malformed/REVIEW/BLOCK/unavailable decisions produce no valid persisted order, and prove ALLOW totals match locked server prices. Record evidence before K6.
Owner input required: identify the approved synthetic runtime host/CI and provide access. Approved environment must not share production keys, customer data or database. Restore environment approval and pricing/mail/payment decisions remain required at their later gates.

## Current run status
Phase 0 VERIFIED; phase 1 implementation/local verification complete but acceptance BLOCKED. Auth, checkout acceptance, payments, vouchers, restore, staging and frontend/admin are gated. Last work commit above; journal linked by its unique Git subject. No recursive journal commits.

## CONTINUATION CHECKPOINT — 2026-10-11T07:44:00.904569+00:00

User requested continuation and then context compaction. Phase 1 remains active;
no later critical gate has been started. Prior BLOCKED report was premature for
Medusa persistence: local synthetic PostgreSQL verification was independently possible.

### Actually executed since the last journal commit
- Added uncommitted `backend/scripts/verify-safeorder-local.py`: sanitized process
  environment, fresh private PostgreSQL cluster, isolated loopback Worker HTTP
  bridge bundled from actual source, real Medusa test runner, process cleanup.
- Added uncommitted `backend/integration-tests/http/safeorder-persistence.spec.ts`:
  actual standard/custom completion APIs with actual Medusa workflows and Postgres.
- `python3 backend/scripts/verify-safeorder-local.py` final run: exit 0,
  Jest 1/1 PASS containing 12 HTTP/persistence scenarios. Both endpoints:
  unauthorized, unavailable, malformed, REVIEW, BLOCK -> no order and cart not
  completed (10 scenarios); ALLOW -> one persisted order each, EUR, unit price 50,
  total 61.5 including taxes, matched server cart (2 scenarios).
- Evidence directory:
  `/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-safeorder-xo6zfw39`;
  `medusa-persistence-evidence.json` is synthetic and contains no keys/customer PII.
  Cluster and Worker stopped; original databases untouched.
- `cd backend && ./node_modules/.bin/tsc --noEmit`: exit 0 after adding test.
- Earlier harness attempts diagnosed/fixed: SWC native cache requires normal HOME/
  USER/LOGNAME (only identity/cache variables preserved, no service credentials);
  Medusa test-utils incorrectly enables SSL for 127.0.0.1, so DB_HOST=localhost +
  IPv4-first resolver used; cluster data directory independently asserted via PG.

### Newly proven issue / exact implementation next step
Actual Medusa workflow serializes SafeOrderError as a generic error carrying its
message. `backend/src/api/store/nexus-checkout/route.ts` only recognizes instanceof,
so all custom negative responses were 400 instead of unavailable=503,
REVIEW=409, BLOCK=403. Fail-closed persistence still passed. Fix by matching the
closed set of SafeOrder error message codes as well as instanceof, add focused
route tests, assert exact custom statuses in the real persistence test, rerun it.
This fix is NOT yet implemented.

### workerd Linux recovery in progress
Discovered UTM.app (earlier CLI-only search missed it). Created a NEW synthetic VM,
not a clone of an existing disk. Official Ubuntu 24.04 minimal image and Node
24.14.0 Linux binary downloaded and SHA256 verified against official manifests.
Only tracked nexus source/package-lock copied (no env/private state/node_modules).
VM name `Wave1 Synthetic Runtime`, UUID `69A32E31-68C7-4223-9FA8-673FCA72E0E8`.
Private preparation path is recorded in `/tmp/wave1-workerd-vm-path`:
`/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-workerd-vm-2dqpflm_`.
Imported task-owned VM package:
`/Users/lucky/Library/Containers/com.utmapp.UTM/Data/Documents/Wave1 Synthetic Runtime.utm`.
Existing user VM remains stopped and unchanged. Initial Shared networking startup
failed with OSStatus -10004. Issued documented UTM configuration update to
emulated networking and directory-share mode none, then attempted start. Startup
result / guest agent readiness still needs inspection. No workerd tests passed yet.
Cloud-init seed requests qemu-guest-agent and iptables, installs bundled Node/source,
runs npm ci in /opt/wave1/nexus; markers /opt/wave1/dependencies-ready and
/opt/wave1/cloud-init-finished. Guest control via utmctl exec/file; no SSH keys used.
Before test execution restrict guest outbound networking with iptables and verify
only local test bindings; this is NOT staging/Fable isolation acceptance.
Official references used: https://docs.getutm.app/scripting/reference/ and
https://cloud-images.ubuntu.com/minimal/releases/noble/release/ .

### Git protocol and continuation
Current branch codex/wave1-security; last work ba19a5d1926cbe443431f1fad053235efec5be7c;
last journal 68d92af94cdb96e9c45bec81c477e233dfb53f49. New harness/test/checkpoint
are UNCOMMITTED; no subsequent commit has occurred. After the next successful
work commit, append a full COMMIT RECORD and create the required separate journal
commit, then verify both SHAs. No push, production deployment or destructive
restore is authorized. Do not open Auth until actual P0 runtime gate passes.

## COMMIT RECORD

Timestamp UTC: 2026-10-11T07:54:09.505343+00:00
Repository: hlancaric-ship-it/anastasia-nexus; /Users/lucky/anastasia-nexus-codex-wave1-security
Branch: codex/wave1-security
Work Commit SHA: 81e4ddcdcf5ce0cedc67e6be4e3c841db7eb111a
Journal Commit SHA: resolve `git log -1 --format=%H --fixed-strings --grep="docs(wave1): journal persistence 81e4ddc"`; self-reference by unique subject avoids a self-hash cycle.
Previous Journal Commit SHA: 68d92af94cdb96e9c45bec81c477e233dfb53f49
Phase: 1 — P0 SafeOrder security
Task ID: A-04 / A-10 / A-11 / S1-09

### Changes
- Recognize exact SafeOrder codes after actual Medusa error serialization; return 503/409/403 and sanitized warnings.
- Add repeatable private synthetic PostgreSQL + actual Medusa HTTP/persistence launcher and 12-scenario matrix.
- Preserve synthetic machine-readable evidence; update security report and tracing matrix.

### Files Changed
- backend/docs/wp/evidence/safeorder-medusa-persistence.json
- backend/docs/wp/wave1-security.md
- backend/integration-tests/http/safeorder-persistence.spec.ts
- backend/scripts/verify-safeorder-local.py
- backend/src/api/store/nexus-checkout/__tests__/route-errors.unit.spec.ts
- backend/src/api/store/nexus-checkout/route.ts
- docs/REQUIREMENTS_MATRIX.md

### Verification
Commands:
- `cd backend && npm run test:unit`
- `cd backend && ./node_modules/.bin/tsc --noEmit`
- `python3 backend/scripts/verify-safeorder-local.py`
- `git diff --check`; Python ast.parse of launcher; JSON evidence validation.
Results:
- Unit: 17/17 suites, 157/157 tests PASS, exit 0.
- TypeScript: PASS, exit 0.
- Real Medusa/PostgreSQL: Jest 1/1 PASS, 12/12 scenarios. 10 rejections: order delta 0, completed_at NULL. 2 ALLOW: order delta 1 each, EUR/unit50/total61.5 = server cart.
- Custom negative statuses: unauthorized/unavailable/malformed=503, REVIEW=409, BLOCK=403. Standard Medusa statuses=500, fail-closed.
- Private cluster and Worker stopped successfully; original databases untouched.
- Controlled synthetic email/key markers absent in both runtime logs (0 matches).
- Diff/Python/JSON checks PASS.
Evidence:
- `backend/docs/wp/evidence/safeorder-medusa-persistence.json`
- `/var/folders/l5/pzrmlcfd0wqchdb6_m1qmnnm0000gn/T/wave1-safeorder-swswr7_v/{medusa-test.log,worker.log,postgres.log}`
- Prior full Nexus suite: 1086/1086 PASS; Nexus unchanged in this work commit, not rerun.

### Security
Risks:
- Node bridge runs real Worker handler but is not workerd. No runtime acceptance claimed.
- Framework standard errors currently return 500; order persistence fail-closed verified.
- Checkout replay/concurrency, real auth email, payment/voucher/restore/staging acceptance remain later gates.
Open Blockers:
- P0: workerd requires macOS >=13.5, host 12.6. Task-owned UTM Linux VM startup/configuration denied by AppleEvents OSStatus -10004 (log identifies sender entitlement denial). Both VMs stopped; existing VM unchanged; stopped own hung CLI processes.
- P1: subsequent auth/payment/voucher/restore acceptance not yet started/verified. No frontend or production changes.

### Acceptance
BLOCKED — actual Medusa persistence VERIFIED; actual workerd runtime remains unverified.

### Next Action
Exact next executable task: On a compatible isolated Linux host, install locked Nexus dependencies and execute `cd nexus && npm run test:workers`, retaining real output. Alternatively owner starts only task VM `Wave1 Synthetic Runtime` UUID 69A32E31-68C7-4223-9FA8-673FCA72E0E8; verify guest agent/dependencies, restrict outbound networking, then run the same command. Do not open Auth before the P0 gate passes.
Required owner input: provide compatible isolated Linux/CI access or start the prepared task-owned VM; no production credentials or deployments required.

## COMMIT RECORD

Timestamp UTC: 2026-10-11 08:22:40 UTC
Repository: hlancaric-ship-it/anastasia-nexus
Branch: codex/wave1-security
Work Commit SHA: c9d0e144fdcf5c594735dc0b19288ba3eceb5cad
Journal Commit SHA: resolve unique subject `docs(wave1): journal isolated CI c9d0e14` with `git log -1 --format=%H --fixed-strings --grep=...` (self-reference avoids self-hash cycle).
Previous Journal Commit SHA: 5111a927d7052ba009cfa9b22d6309a22bb8d742
Phase: 1 — P0 SafeOrder
Task ID: T1-7 / S1-09

### Changes
- Owner explicitly approved public working-branch publication and isolated GitHub Actions after prohibiting further local runtime/test execution.
- Added pinned Ubuntu/Node CI; actual test container has no network, credentials, capabilities, or production bindings.
- Expanded actual workerd negatives for wrong key, missing identity configuration, invalid amounts/currency/provider/client prices/email.

### Files Changed
- .github/workflows/wave1-p0.yml
- nexus/tests/workers/safeOrder.test.ts
- backend/docs/wp/wave1-security.md

### Verification
Commands:
- Git status/tree/history and sensitive path/live-key pattern review; remote GitHub tree/workflow and exact action v4 ref inspection.
- `git diff --check`
Results:
- Static review PASS. No existing target workflows, tracked secret environment/private data paths, or recognized live-key/private-key patterns found in reviewed source.
- New runtime tests NOT YET EXECUTED; no local test, backend, database or VM launched for this work.
- Prior backend 157/157, real Medusa persistence 12/12, TypeScript PASS remain the last executed results.
Evidence:
- Workflow file; official actions/{checkout,setup-node,upload-artifact} v4 refs inspected through GitHub connector.
- Real CI evidence pending source-SHA log, workerd JSON, Nexus JSON and runtime digest artifact.

### Security
Risks:
- npm dependency preparation requires registry network on disposable runner; actual tests execute with Docker network none.
- CI configuration is IMPLEMENTED_UNVERIFIED until a real run finishes; no staging/production readiness claim.
Open Blockers:
- P0: actual workerd verification pending publication/run. Auth gate remains closed.
- P1: subsequent auth/payment/voucher/restore/acceptance gates unverified.

### Acceptance
BLOCKED — awaiting actual remote workerd run.

### Next Action
Exact next executable task: publish only `codex/wave1-security` without force, verify GitHub commit SHAs, inspect Wave 1 P0 workflow run and retain actual test results; fix any failures before opening Auth.
Owner decisions: publication and remote CI approved by `jo`; local runtime/test execution remains prohibited. No production deployment approved.
