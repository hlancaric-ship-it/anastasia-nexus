# Medusa and NEXUS pricing boundary

`POST /store/nexus-cart` uses only `{ "cart_id": "..." }` and ignores any
client-supplied price, discount, or tenant fields. It reads the cart,
currency, customer groups, variant prices, SKU, and product metadata from Medusa,
then sends those trusted inputs to the NEXUS Worker. The Worker requires the
server credential `MEDUSA_PRICING_API_KEY` and binds that credential to
`MEDUSA_PRICING_TENANT_ID`; the tenant in the request body cannot switch tenants.
The adapter writes NEXUS's result to Medusa cart line items using
`updateLineItemInCartWorkflow` as a custom price and disables Medusa promotion
discounting on those lines to avoid stacking a second discount engine.

`POST /store/nexus-checkout` accepts only `{ "cart_id": "..." }`, recalculates
all current lines from Medusa catalog data, updates their price snapshots, and
calls Medusa's `completeCartWorkflow`. It never accepts a client price and never
reports payment as successful based on a redirect. An order without a captured
payment is returned as `PENDING`.
If repricing changes the cart, payment sessions are invalidated/refreshed and
checkout returns 409 until a new session exists. A completion-workflow validation
hook rechecks NEXUS pricing against Medusa's locked cart snapshot and confirms
the payment collection/session amounts and currency match that snapshot.

## Authentication & cart ownership

Both routes require an authenticated customer session (`session` or `bearer`),
enforced by `nexusCartMiddlewares` registered in `src/api/middlewares.ts`. An
unauthenticated request is rejected with `401 { "ok": false, "error": "UNAUTHORIZED" }`
before any body handling.

After loading the cart, the handler verifies ownership: `cart.customer_id` must
equal the authenticated customer. A mismatched **or guest** cart (`customer_id`
null, not yet associated to the caller) is rejected with
`403 { "ok": false, "error": "CART_ACCESS_DENIED" }`. A cart must therefore be
associated to the signed-in customer (`POST /store/carts/:id/customer`) before
`nexus-cart`/`nexus-checkout` will accept it. This prevents pricing, coupon
changes and checkout on carts owned by another customer or on guest carts
(findings C1/C3/F3). It does **not** rate-limit coupon guessing on the caller's
own cart; C1 is only made costlier, not closed.

## Store API contracts

Both adapter routes use Medusa's Store API namespace and accept JSON only.
The caller supplies the Medusa cart ID; `tenantId`, product IDs, quantities,
currency, base price, discounts, customer tier, and payment state are never
accepted from this request. Cart changes should use Medusa's standard Store API
first, then call the pricing route before displaying an authoritative price.

`POST /store/nexus-cart` request:

```json
{ "cart_id": "cart_..." }
```

Success returns `{ "ok": true, "tenantId": "anastasia", "items": [...] }`.
Each item contains the Medusa line ID, quantity, NEXUS unit price, and applied
rule names in Medusa line-item metadata.

`POST /store/nexus-checkout` request:

```json
{ "cart_id": "cart_..." }
```

Success returns `{ "ok": true, "order": <Medusa order>, "pricing": <verified NEXUS snapshot>, "paymentStatus": "PENDING" | "PAID" }`.
The routes return 401 for an unauthenticated request, 403 for a foreign/guest
cart (`CART_ACCESS_DENIED`), 400 for invalid cart/line/currency or a malformed
pricing response, 404 for an unknown cart, and 503 when NEXUS is unconfigured or
unavailable. The NEXUS server credential is only sent backend-to-Worker.

Configure `NEXUS_PRICING_URL`, `NEXUS_PRICING_API_KEY`, and `NEXUS_TENANT_ID` in
the Medusa environment. Configure matching Worker secrets/bindings
`MEDUSA_PRICING_API_KEY`, `MEDUSA_PRICING_TENANT_ID`, and a full
`MEDUSA_PRICING_POLICY_JSON` (`loyaltyTiers`, `brandLimits`, `categoryLimits`,
`brandSaleDiscounts`). The Worker rejects missing/invalid tenant policy instead
of silently using its legacy cross-store defaults. Do not reuse the general
voucher `HMAC_SECRET` as the pricing credential.

Set Worker secrets (per environment) with:

```sh
wrangler secret put MEDUSA_PRICING_API_KEY
wrangler secret put MEDUSA_WEBHOOK_SECRET
```

Set
`MEDUSA_PRICING_TENANT_ID` and `MEDUSA_PRICING_POLICY_JSON` as Worker vars for
that deployment. These commands are instructions only; no remote Worker was
changed during this task.

## Current limits

- This repository contains a Medusa backend/admin, not a customer storefront.
- The seed script is the Medusa starter catalog, not ANASTASIA production catalog.
- No approved ANASTASIA commercial pricing policy is currently present in the
  repository. The shared legacy policy includes fishing brands and cannot safely
  be assumed to represent ANASTASIA. A policy must be supplied and reviewed
  before real catalog prices can be verified or staging orders are meaningful.
- The adapter currently accepts EUR only. Product metadata fields consumed by
  NEXUS are `manufacturer`, `category`, and `max_discount`. A Medusa price-list
  sale is passed as NEXUS's sale price alongside Medusa's original amount.
- Medusa promotion codes are disabled on NEXUS-priced line items. NEXUS currently
  receives Medusa's native sale price, but the repository has no verified coupon
  policy contract to replace Medusa's promotion engine.
- Medusa price calculation and the pricing API require a populated region and
  catalog. A blank `DATABASE_URL` or absent PostgreSQL service prevents local
  checkout verification.
- The local `pp_system_default` test provider can authorize a session without a
  real charge, and a local Medusa order was verified with it. No real payment
  gateway or credentials are configured. Provider webhook signature
  verification, captured-payment idempotency, and post-payment digital delivery
  are not implemented or verified by this integration.
- SafeOrder runs in the read-only `completeCartWorkflow.hooks.validate` guard,
  including standard Medusa cart completion. The guard uses the locked snapshot's
  full total (including shipping/taxes), email and all processable payment
  providers after validating NEXUS prices and payment amounts. Anything except
  a tenant/amount/currency-bound, well-formed ALLOW stops completion. This has
  local negative tests; actual workerd + Medusa order persistence acceptance is
  still blocked on an approved isolated compatible environment.
- SafeOrder has no durable order decision record. Digital delivery and membership
  must not infer captured payment from a SafeOrder ALLOW.
- NEXUS webhook signature verification uses Medusa's timestamped
  `X-Medusa-Signature` HMAC format and a five-minute replay window. Delivery
  receipts are deduplicated durably in D1. The current asynchronous handlers
  only log order/customer events; payment side effects still need a durable
  processing/outbox state machine before they can safely be attached.

## Local API E2E

With isolated local PostgreSQL, the NEXUS Worker, and the compiled Medusa
server running on `127.0.0.1:9000`, run:

```sh
MEDUSA_BASE_URL=http://127.0.0.1:9000 \
MEDUSA_TEST_PUBLISHABLE_KEY=pk_... \
npm run test:e2e:local
```

The script reads an EUR variant from the seeded catalog, creates a cart,
attempts a client price/tenant override, calls NEXUS twice, adds available
shipping, creates a standard Medusa payment collection and
`pp_system_default` test session, then completes checkout. It asserts that the
order's persisted line prices and total match NEXUS and Medusa's cart. The test
provider does not make a real charge. This was run successfully against a
temporary PostgreSQL instance on this machine; it does not import production
catalog or customer data.


## Wave 1 P0 SafeOrder contract (2026-10-11)

`POST /api/nexus/safeorder` is server-to-server JSON only. It requires the
existing dedicated `MEDUSA_PRICING_API_KEY` Bearer credential and binds it to
`MEDUSA_PRICING_TENANT_ID`. The backend must set matching
`NEXUS_PRICING_API_KEY` and `NEXUS_TENANT_ID`. No voucher HMAC fallback exists.

Request fields: `{ tenantId, currency: "eur", orderSum, paymentMethod, customerEmail }`.
The amount is a finite nonnegative number from the locked cart total. Extra
fields (including `amount`, `codLimit`, prices) are rejected. Existing COD limit
120 EUR and score thresholds are retained on the server. Supported methods:
`stripe`, `pp_stripe_stripe`, `cardpay`, `CardPay Platobná karta`, `cod`,
`dobierka`, `Platba na dobierku`, `platba pri prevzatí` (case insensitive).
Unknown/empty methods fail closed. `pp_system_default` is permitted only with
Worker `ENVIRONMENT=test` or `development`, never production or unset.

Response includes `tenantId`, `currency`, `orderSum`, numeric score (0–100),
decision and string factors. Backend rejects mismatched context, malformed
responses, high-score ALLOW, redirects and HTTP/network/JSON failures. Credential
transport requires HTTPS; HTTP is permitted only on loopback for isolated tests.
The administrative `POST /api/vouchers/issue` also requires this service identity
and matching body tenant before touching storage. This does not verify real
payment receipts; that is the later payment/voucher gate. Existing external
issuance callers must explicitly adopt the service contract before integration.

No production configuration or deployment changed. See
[security verification](docs/wp/wave1-security.md) and
[execution journal](../CODEX_PROGRESS.md).
