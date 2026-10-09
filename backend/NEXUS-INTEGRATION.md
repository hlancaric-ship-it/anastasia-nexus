# Medusa and NEXUS pricing boundary

`POST /store/nexus-cart` accepts only `{ "cart_id": "..." }`. It reads the cart,
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
The routes return 400 for invalid cart/line/currency or a malformed pricing
response, 404 for an unknown cart, and 503 when NEXUS is unconfigured or
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
- No payment provider is configured, so Medusa's complete-cart workflow has not
  been shown to create an order here. Payment sessions, provider signature
  verification, captured-payment idempotency, and post-payment digital delivery
  are not implemented or verified by this integration.
- SafeOrder, digital-product entitlements, and membership provisioning are not
  called by checkout. The current SafeOrder HTTP route exists independently, but
  its policy and a durable order decision record are not connected here.
- NEXUS webhook signature verification uses Medusa's timestamped
  `X-Medusa-Signature` HMAC format and a five-minute replay window. Delivery
  receipts are deduplicated durably in D1. The current asynchronous handlers
  only log order/customer events; payment side effects still need a durable
  processing/outbox state machine before they can safely be attached.

For a first local order, start isolated PostgreSQL, create a local database, set
the required environment values from `.env.template`, run `npx medusa db:migrate`
and `npx medusa exec ./src/migration-scripts/initial-data-seed.ts`, then start
the NEXUS Worker and Medusa backend. Create a cart through Medusa Store API,
add a seeded product variant, call `/store/nexus-cart`, and finish with
`/store/nexus-checkout`. These operational steps have not been verified in this
environment because PostgreSQL is not available.
