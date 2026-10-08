/**
 * Medusa spike: register the setPricingContext hook so cart line-item
 * pricing includes customer.groups.id in the pricing context.
 *
 * VERIFIED FINDING (medusa-adapter-spike): by default, addToCartWorkflow's
 * pricing context (get-variants-and-items-with-prices.js) already spreads
 * cart.customer.groups into context, and cartFieldsForPricingContext already
 * requests "customer.groups.id" -- so in principle this hook is REDUNDANT
 * for the customer-group-id attribute specifically. It is kept here as a
 * no-op-safe pass-through only for auditability; the actual fix that made
 * Test 3 pass was activating the price list (`status: "active"`), not this
 * hook. See MEDUSA-SPIKE-RESULTS.md section 4/6 for the full trace.
 */
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"

addToCartWorkflow.hooks.setPricingContext(async () => {
    return new StepResponse({})
})
