# NEXUS AUTONOMY SPECIFICATION
## ANASTASIA ecosystem — target architecture, invariants and acceptance gates

**Status:** binding engineering target; not a claim of current implementation.
**Scope:** `hlancaric-ship-it/anastasia-nexus`.
**Language:** documentation in Czech; code/contracts may remain English.
**Principle:** implement incrementally, preserve contractual phase boundaries, and prove behavior before acceptance. Do not deploy or touch production.

---

## 1. Product definition

NEXUS is the central coordination and intelligence layer for the ANASTASIA ecosystem. It is not merely a set of endpoints, a collection of scripts, an AI chatbot, or a second commerce backend.

The target ecosystem contains one logical business system across the current e-shop and future domains such as `anastasia.academy` and `aianastasia.com`. Those domains are customer-facing funnels/frontends, not independent owners of customer, order, price, entitlement, or identity logic.

The backend must remain modular. A shared ecosystem does **not** mean tightly coupling every module or forcing all data into one physical database. Every entity has one authoritative owner and explicit APIs/events. Services may use separate stores where required by their runtime and consistency model.

### Target responsibilities

- **Medusa.js v2 + PostgreSQL:** commerce catalog, variants, cart, order, payment collections/sessions and standard commerce workflows.
- **NEXUS Core / orchestration:** durable cross-module operation state, event coordination, policy-controlled execution, retries, reconciliation, compensation, audit correlation and escalation.
- **NEXUS Pricing Engine:** authoritative server-side price/rule decision; deterministic, tenant-bound and explainable.
- **SafeOrder:** risk decision for checkout; fail closed for unavailable, malformed, mismatched or unknown decisions. A risk ALLOW is not proof of payment.
- **Identity/auth:** established Medusa/customer authentication integration, passwordless sign-in and future SSO; do not invent a second incompatible identity store.
- **Entitlement:** grants/revokes access based on verified business events and the authoritative order/payment state.
- **Protected media:** private R2 and short-lived, narrowly scoped signed access; never public paid media.
- **Booking:** durable slot holds, confirmation, cancellation and expiry with database-level concurrency guarantees.
- **Cloudflare Workers / D1 / Durable Objects / R2 / KV:** use each only for an explicitly documented purpose. D1 is suitable for edge-local durable coordination/receipts when chosen; KV is not a transactional source of truth. Durable Objects are for coordination requiring single-object serialization, not a substitute for commerce PostgreSQL.
- **Frontends:** final stage after backend/domain acceptance; React/Astro SSR or the already selected repository approach, with bespoke premium design and no business-critical price/auth/payment logic in the browser.

Do not move commerce orders into a parallel custom database. Do not duplicate the pricing engine or create a second source of truth for payments or entitlements.

## 2. Definition of autonomy

An autonomous NEXUS operation follows this controlled lifecycle:

1. **Receive:** accept a validated command or authenticated event.
2. **Normalize:** assign operation ID, tenant, idempotency key, schema version, actor/source, correlation ID and timestamp.
3. **Authorize:** verify identity, tenant, scope and policy. Reject unknown or ambiguous context.
4. **Load state:** read authoritative records from their owner; do not infer success from stale caches or client input.
5. **Plan:** resolve dependencies and allowed actions deterministically. AI may propose a plan, but cannot bypass policy or call unrestricted tools.
6. **Persist intent:** record the operation and durable intent before irreversible side effects (transactional outbox/inbox or equivalent).
7. **Execute:** invoke typed, allowlisted connectors with deadlines, bounded retries and idempotency.
8. **Verify:** query the destination/authoritative owner and assert postconditions. HTTP 2xx alone is not success.
9. **Finalize:** persist terminal state and an audit record.
10. **Recover:** retry only transient/idempotent work; use compensation for known reversible effects; quarantine uncertain/non-idempotent outcomes.
11. **Escalate:** stop safely and expose a redacted actionable exception when automatic recovery is unsafe.
12. **Reconcile:** periodically compare local operation state with authoritative systems and repair only through approved, idempotent actions.

An operation must never remain indefinitely “running” without a deadline, heartbeat/lease, recovery rule or visible alert.

### Required operation states

Use a documented state machine, at minimum:

`RECEIVED → VALIDATED → PLANNED → RUNNING → VERIFYING → SUCCEEDED`

Failure branches: `RETRY_WAIT`, `COMPENSATING`, `FAILED`, `NEEDS_REVIEW`, `CANCELLED`.

State transitions must be validated and persisted. Terminal states cannot be silently reopened. Replays must not duplicate payment, order, email, booking or entitlement effects.

## 3. Minimum Core components

Implement only the components justified by existing repository structure. Reuse current code when its contract meets these requirements.

1. **Command/event ingress:** schema validation, auth, tenant binding, idempotency and correlation IDs.
2. **Durable operation registry:** operation ID, type, schema version, tenant, input digest (not secrets/PII), state, attempts, deadlines, next run, error category, created/updated timestamps and trace/correlation IDs.
3. **Workflow runner:** typed steps, dependencies, timeouts, checkpoints and persisted transitions. It must be restart-safe.
4. **Policy/authorization gate:** deny-by-default, tenant-bound and separate from AI-generated suggestions.
5. **Connector contract:** consistent success/error types, timeout, retryability, idempotency support, verification and compensation capability.
6. **Inbox/outbox or equivalent:** durable event receipt and dispatch; deduplicate by provider event ID plus tenant/source. Do not acknowledge a critical event before durable receipt.
7. **Retry and recovery engine:** bounded exponential backoff with jitter, retry budget, dead-letter/quarantine, lease expiry and operator-visible recovery.
8. **Reconciliation jobs:** compare Medusa order/payment, NEXUS operation and entitlement state; do not blindly mutate on ambiguity.
9. **Audit/observability:** structured redacted logs, operation timeline, metrics and alerts.
10. **Operator controls:** inspect status, safely retry eligible operations, cancel before irreversible work, and resolve quarantined operations with audit. Admin actions require authentication and authorization.

If these components already exist, map each to exact files and tests instead of building duplicates. Avoid creating a generic workflow framework before documenting the gaps in current Medusa workflows and Worker runtime.

## 4. Non-negotiable business invariants

### Identity and tenant isolation
- Every request and operation has a verified tenant and actor/service identity.
- Never trust client-provided tenant, user/customer ID, entitlement, price or payment state.
- A customer can only read/change their own records unless an explicitly authorized admin scope allows it.
- Magic links are high-entropy, short-lived, one-time and atomically consumed. Invalid tokens must not consume unrelated valid tokens. Rate limits must work across processes and instances.

### Price and checkout
- Prices are computed on the server using trusted catalog/customer/policy inputs.
- Reject NaN, Infinity, negative prices, invalid currency, invalid quantities, excessive discounts and malformed pricing responses.
- Persist the exact price snapshot and policy/version used for checkout.
- Medusa cart, payment session, order, captured payment and refund amounts/currencies must reconcile.
- A changed price invalidates or refreshes the payment session and requires explicit reconfirmation.
- SafeOrder ALLOW is only a risk decision; it never means “paid.”
- Never create or complete a payment from an AI suggestion or client redirect.

### Payments, webhooks and entitlements
- Verify provider signatures using the provider's actual format and replay window.
- Process provider events idempotently with durable receipts and bounded retries.
- Validate event, tenant, order, amount and currency against authoritative records.
- Entitlement is granted only after authoritative payment-captured/paid confirmation, according to the product's contract.
- Duplicate events must not duplicate grants, emails, bookings or charges.
- Refund/cancel/reversal policies must define whether access is revoked, retained or reviewed; implement only the approved rule.
- If payment state is uncertain, do not grant access and do not claim failure until reconciliation resolves it.

### Media
- R2 bucket must be private; no public object URLs for paid content.
- Signed tokens must be bound to tenant, customer/entitlement, product, exact media object or explicitly enumerated HLS assets, expiry, allowed method and relevant range semantics.
- Never authorize a sibling file merely because it shares a directory with an allowed playlist.
- Reject path traversal, malformed encodings, foreign keys, expired tokens, invalid signatures and excessive/invalid ranges.
- Define how entitlement revocation affects already issued links and set the maximum acceptable exposure window.
- Enforce concurrency limits if required by product policy. Redact tokens from logs.
- Test HLS playlists, nested/relative segment paths, byte ranges, sibling objects, revoked access and expired links.

### Booking
- A slot has a single authoritative owner and database-enforced conflict protection.
- Holds expire; confirmation is tied to the correct customer/product/order/payment policy.
- Parallel HTTP requests must not double-book a slot.
- Event replay must not create multiple bookings. Cancellation must release the slot according to policy.
- Persist timezone and UTC instants unambiguously; test DST transitions.

### Runtime and secrets
- Production startup must fail fast when required services/configuration are absent; no silent in-memory fallback for durable queues/workflows/locking.
- Required object storage must be explicitly configured; local ephemeral disk is not a production media store.
- Secrets are stored in deployment secret managers, not code, docs, logs, fixtures or client bundles.
- Separate test/staging/production credentials and tenants.
- Database migrations are backward-compatible where possible and have a rollback/recovery plan.
- Backups are only accepted after restore drills prove they work.

## 5. Event-driven contracts

Define and version domain events with stable schemas, tenant and correlation metadata. Minimum candidate events to verify against existing code:

- `order.created`
- `payment.session.created`
- `payment.captured`
- `payment.failed`
- `payment.refunded`
- `order.cancelled`
- `entitlement.granted`
- `entitlement.revoked`
- `booking.held`
- `booking.confirmed`
- `booking.cancelled`
- `media.access.issued`
- `operation.failed`
- `operation.needs_review`

These are target contracts, not permission to introduce duplicate event systems. Map existing Medusa/provider event names to the canonical contract. Each event must have an owner, schema/version, idempotency key, delivery semantics, retry policy and consumer. Use a durable inbox/outbox or equivalent where loss or duplication can cause money/access errors.

## 6. Canonical ownership and consistency

Document a data ownership table and never let two modules independently author the same truth:

- Product/catalog/cart/order: Medusa/PostgreSQL.
- Authoritative price decision: NEXUS Pricing Engine; checkout/order records retain verified snapshot.
- Payment truth: provider evidence plus Medusa payment state reconciled by verified webhook/workflow.
- Entitlement truth: entitlement module, derived only from verified commerce events.
- Booking slot truth: booking module and database constraints.
- Edge event receipts/short-lived coordination: explicitly chosen D1/DO records with defined retention and recovery.
- Media bytes: private R2; metadata/entitlement remains in authoritative modules.
- Cross-system operation status: NEXUS operation registry.
- Customer identity: one agreed identity authority and supported SSO strategy, not per-domain duplicate accounts.

Specify consistency requirements per operation: strongly consistent before checkout/payment/access grant; eventual consistency allowed for analytics/search/content propagation where harmless. Never use KV as the authority for a payment, order, entitlement or unique booking.

## 7. Security evidence and tests

Every critical invariant needs a positive test and a negative/adversarial test. Test at the boundary that enforces it, not only a helper function.

Minimum suites:
- Pricing property/boundary tests: negative, NaN/Infinity, extreme discounts, rounding, currency and tenant mismatch.
- Checkout E2E: cart → authoritative repricing → payment session → provider test webhook → persisted paid order → entitlement.
- Webhook replay/concurrency tests using PostgreSQL and real handler code.
- Auth one-time-token, race, expiry, rate limit and account-linking tests.
- Authorization/IDOR tests for profiles, orders, bookings, entitlements and media.
- Media worker tests in actual Worker runtime plus private R2 integration.
- Booking concurrent HTTP test against PostgreSQL.
- Recovery tests: crash between steps, duplicate event, timeout after remote success, stale lease, retry exhaustion and manual reconciliation.
- Runtime configuration tests: production config without Redis/storage/secrets fails closed.
- Migration dry-run, repeat run, source/target count and amount reconciliation, rollback drill.
- Redaction tests for logs and error payloads.

Audit/evidence tests that reproduce a vulnerability must be clearly labelled as reproduction tests. A passing reproduction test is not a passing security gate. Add a regression assertion showing the fixed behavior and prove it fails against the vulnerable baseline where practical.

## 8. Autonomy and AI boundaries

AI can classify an issue, summarize logs, propose a workflow, draft a migration mapping or recommend recovery. AI cannot:
- decide that payment is captured;
- authoritatively calculate/override checkout prices;
- grant or revoke entitlement without deterministic authorization and verified event;
- change tenant or identity;
- execute arbitrary shell/SQL or unrestricted network calls in production;
- disable security gates or self-approve its own risky action.

Every AI-suggested action must be converted to a typed command, checked by deterministic policy, executed with least privilege and verified. Irreversible actions require explicit human approval. For uncertain states, stop and escalate rather than guess.

## 9. Implementation order

Follow dependencies, not visual appeal:

### Wave 0 — truth and baseline
- Pin base commit/branch and inventory the repository.
- Reconcile `AGENTS.md`, handoff, requirements matrix, architecture map and real code.
- Produce a file-level gap matrix: requirement → owner → source-of-truth → code → test → status → risk.
- Distinguish master, wave1-base, fix branches and audit/evidence branches. Never blindly merge audit reproduction tests.

### Wave 1 — P0 trust boundaries
- Media object authorization.
- Price invariants and full checkout amount reconciliation.
- SafeOrder fail-closed behavior and bypass resistance.
- Webhook signature, durable idempotency and payment/entitlement separation.
- Production fail-fast for required Redis/storage/secrets.
- Magic-link atomic one-time use, abuse limits and identity isolation.

### Wave 2 — durable lifecycle and recovery
- Operation registry/state machine, idempotent steps and correlation.
- Inbox/outbox or equivalent durable event delivery.
- Bounded retries, lease expiry, quarantine, reconciliation and compensation.
- Recovery tests for crashes and ambiguous remote success.
- Booking concurrency and entitlement lifecycle.

### Wave 3 — integration and migration acceptance
- PostgreSQL-backed integration tests and actual Worker runtime tests.
- Stripe test mode, verified test webhooks and e-mail sandbox.
- Data migration reconciliation, dry-run, rerun and restore drill.
- Complete contract-to-test traceability; resolve phase/scope conflicts explicitly.

### Wave 4 — storefront and cross-domain experience
- Only after backend/domain acceptance: premium custom storefront, responsive and accessible UX, SEO/redirects, human-translated language content, shared identity/customer library and future domains.
- Frontend must consume trusted APIs; it must not duplicate critical rules.

Do not implement every wave in one giant PR. Break work into small, owned, reviewable packages. Do not stop at documentation when implementation is safely possible in the assigned package.

## 10. Required acceptance gates

### Gate A — money/security
No open P0. Pricing, tenant, auth, webhook, entitlement and media adversarial suites pass against the candidate commit.

### Gate B — commerce lifecycle
A reproducible local E2E with isolated PostgreSQL, actual Worker runtime and Stripe test mode verifies cart, price snapshot, payment session, signed webhook, paid order, entitlement and duplicate-event replay. The local fake payment provider is not sufficient.

### Gate C — restart/recovery
Crash/restart tests prove durable operations recover without duplicate charge/grant/booking. Retry exhaustion becomes visible `NEEDS_REVIEW`/quarantine.

### Gate D — migration/operations
Repeatable migration, reconciled counts and amounts, successful restore drill, monitoring/alerting and documented rollback.

### Gate E — storefront
Contract-to-test matrix is complete and all required Wave 1 user journeys pass before frontend acceptance. Contractual Wave 2 items remain explicitly scoped; preparing foundations does not silently expand the paid phase.

### Gate F — production approval
Production deploy, real DNS/credentials, real payments and customer communications require explicit written human approval. Agent must not perform them.

## 11. Status semantics

Use the repository's canonical vocabulary consistently:
- `NOT_IMPLEMENTED`: no implementation.
- `PARTIAL`: some behavior exists; acceptance incomplete.
- `BLOCKED`: an explicit dependency/access/decision prevents work.
- `IMPLEMENTED_UNVERIFIED`: code exists but required proof has not run.
- `VERIFIED`: exact stated tests/evidence ran and passed.
- `ACCEPTED`: authorized owner accepted the stated scope.
- `FUTURE_SCOPE`: intentionally excluded from current contractual acceptance.

Never promote status based on code presence, a successful compile alone, a mock, an audit reproduction test or a test run on a different commit.

## 12. Agent output for every package

Include:
1. Base/head commit and exact branch.
2. Requirements covered and files changed.
3. Before/after behavior and threat model.
4. Exact commands and test results (including skipped tests).
5. Evidence classification: unit / integration / E2E / production (production normally not permitted).
6. Migration/configuration/rollback considerations.
7. Remaining risks and explicit blockers.
8. Next smallest safe package.

**Final principle:** NEXUS is autonomous only when it can persist intent, execute through authorized interfaces, verify the real result, recover safely from failure and leave an auditable trail. “AI made a plan,” “endpoint returned 200,” “tests are green,” and “module exists” are not autonomy.
