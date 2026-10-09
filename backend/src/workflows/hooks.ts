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
import { addToCartWorkflow, completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { repriceCart } from "../api/store/nexus-cart/route"

addToCartWorkflow.hooks.setPricingContext(async () => {
    return new StepResponse({})
})

// Read-only guard against cart changes between the adapter reprice and Medusa's
// locked completion snapshot. Never mutate the cart from completeCartWorkflow's
// validate hook: Medusa documents that the order is built from its earlier snapshot.
completeCartWorkflow.hooks.validate(async ({ input }, { container }) => {
    const query: any = (container as any).resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
        entity: "cart",
        fields: ["id", "currency_code", "total", "payment_collection.amount", "payment_collection.currency_code", "payment_collection.payment_sessions.amount", "payment_collection.payment_sessions.currency_code"],
        filters: { id: input.id },
    })
    const cart = data?.[0]
    const total = amountValue(cart?.total)
    const collectionAmount = amountValue(cart?.payment_collection?.amount)
    const sessions = cart?.payment_collection?.payment_sessions || []
    if (!cart || cart.currency_code !== cart.payment_collection?.currency_code || !Number.isFinite(total) || !Number.isFinite(collectionAmount) || Math.abs(total - collectionAmount) > 0.000001 || sessions.some((session: any) => !Number.isFinite(amountValue(session.amount)) || session.currency_code !== cart.currency_code || Math.abs(amountValue(session.amount) - total) > 0.000001)) {
        throw new Error("MEDUSA_PAYMENT_AMOUNT_MISMATCH")
    }
    const result = await repriceCart(input.id, container as any, false)
    if (result.pricesChanged) throw new Error("NEXUS_PRICE_MISMATCH")
})

function amountValue(value: any): number {
    const numeric = typeof value === "object" && value !== null ? value.numeric ?? value.value : value
    return Number(numeric)
}
