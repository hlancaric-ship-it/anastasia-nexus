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
import { assertSafeOrderAllows, SafeOrderError } from "../api/store/nexus-checkout/safeorder"
import { repriceCart } from "../api/store/nexus-cart/route"

addToCartWorkflow.hooks.setPricingContext(async () => {
    return new StepResponse({})
})

// Read-only guard against cart changes between the adapter reprice and Medusa's
// locked completion snapshot. Never mutate the cart from completeCartWorkflow's
// validate hook: Medusa documents that the order is built from its earlier snapshot.
completeCartWorkflow.hooks.validate(async ({ input, cart: snapshot }, { container }) => {
    // This is the locked snapshot Medusa uses to create the order, not a later query.
    const cart = snapshot as any
    const total = amountValue(cart?.total)
    const collectionAmount = amountValue(cart?.payment_collection?.amount)
    const sessions = cart?.payment_collection?.payment_sessions || []
    if (!cart || cart.currency_code !== cart.payment_collection?.currency_code || !Number.isFinite(total) || !Number.isFinite(collectionAmount) || Math.abs(total - collectionAmount) > 0.000001 || sessions.some((session: any) => !Number.isFinite(amountValue(session.amount)) || session.currency_code !== cart.currency_code || Math.abs(amountValue(session.amount) - total) > 0.000001)) {
        throw new Error("MEDUSA_PAYMENT_AMOUNT_MISMATCH")
    }
    const result = await repriceCart(input.id, container as any, false)
    if (result.pricesChanged || result.items.length !== cart.items?.length || result.items.some((item) => {
        const line = cart.items.find((line: any) => line.id === item.id)
        return !line || amountValue(line.unit_price) !== item.unit_price || line.quantity !== item.quantity
    })) throw new Error("NEXUS_PRICE_MISMATCH")
    const processable = sessions.filter((session: any) => ["pending", "requires_more", "authorized", "captured", "pending_authorization"].includes(session.status))
    if (!processable.length || cart.currency_code !== "eur") throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
    // Check every processable provider: a benign first session must not hide a COD session.
    for (const session of processable) {
        await assertSafeOrderAllows({ orderSum: total, paymentMethod: session.provider_id, customerEmail: cart.email })
    }
})

function amountValue(value: any): number {
    const numeric = typeof value === "object" && value !== null ? value.numeric ?? value.value : value
    if (typeof numeric !== "number" && (typeof numeric !== "string" || !numeric.trim())) return NaN
    return Number(numeric)
}
