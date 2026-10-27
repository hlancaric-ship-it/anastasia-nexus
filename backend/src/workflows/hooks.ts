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
import { recordEvent } from "../lib/observability/events"
import { repriceCart } from "../api/store/nexus-cart/route"
import { promotionIdForCode } from "../lib/pricing/coupon-usage"
import { COUPON_LINK_MODULE } from "../modules/coupon-link"
import type CouponLinkModuleService from "../modules/coupon-link/service"
import { claimCartBooking } from "./booking-checkout"
import type BookingModuleService from "../modules/booking/service"
import { GIFT_VOUCHER_MODULE } from "../modules/gift-voucher"
import { giftVoucherCreditLines } from "../modules/gift-voucher/cart"
import type GiftVoucherModuleService from "../modules/gift-voucher/service"
import { prepareGiftVoucherCheckout } from "./gift-voucher-checkout"

import { assertMembershipCheckoutCart } from "../lib/membership/checkout-guard"
import { assertCartConsent } from "../lib/legal/checkout"
import { assertDeliveryPaymentConsistency, loadCartShape, safeOrderPaymentMethod } from "../lib/checkout/delivery-payment"
import { assertNoCompensatedSession } from "../lib/checkout/payment-compensation"

type CheckoutCompensation = {
    bookingClaim?: Awaited<ReturnType<typeof claimCartBooking>>
    giftVoucherRedemption?: string
    couponUsageReservation?: string
}

addToCartWorkflow.hooks.setPricingContext(async () => {
    return new StepResponse({})
})

// Guard against cart changes between the adapter reprice and Medusa's
// locked completion snapshot. Never mutate the cart from completeCartWorkflow's
// validate hook: Medusa documents that the order is built from its earlier snapshot.
completeCartWorkflow.hooks.validate(async ({ input, cart: snapshot }, { container }): Promise<StepResponse<undefined, CheckoutCompensation> | undefined> => {
    // This is the locked snapshot Medusa uses to create the order, not a later query.
    const cart = snapshot as any
    await assertCartConsent(container, cart)
    await assertMembershipCheckoutCart(container, cart)
    // Vrátená/zrušená platba (kompenzácia) už objednávku nedokončí.
    assertNoCompensatedSession(cart)
    const total = amountValue(cart?.total)
    // Košík celý uhrazený poukazem: Medusa platbu přeskočí (total 0, kredit ≥ 0), SafeOrder
    // nemá co posoudit. Výše kreditu se ověří níž proti zůstatku a způsobilé částce.
    const coveredByVoucher = !!cart && total === 0 && giftVoucherCreditLines(cart).length > 0
    const collectionAmount = amountValue(cart?.payment_collection?.amount)
    const sessions = cart?.payment_collection?.payment_sessions || []
    if (!coveredByVoucher && (!cart || cart.currency_code !== cart.payment_collection?.currency_code || !Number.isFinite(total) || !Number.isFinite(collectionAmount) || Math.abs(total - collectionAmount) > 0.000001 || sessions.some((session: any) => !Number.isFinite(amountValue(session.amount)) || session.currency_code !== cart.currency_code || Math.abs(amountValue(session.amount) - total) > 0.000001))) {
        throw new Error("MEDUSA_PAYMENT_AMOUNT_MISMATCH")
    }
    const result = await repriceCart(input.id, container as any, false)
    if (result.pricesChanged || result.items.length !== cart.items?.length || result.items.some((item) => {
        const line = cart.items.find((line: any) => line.id === item.id)
        return !line || amountValue(line.unit_price) !== item.unit_price || line.quantity !== item.quantity || (typeof item.requires_shipping === "boolean" && line.requires_shipping !== item.requires_shipping)
    })) throw new Error("NEXUS_PRICE_MISMATCH")
    if (cart.currency_code !== "eur") throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
    if (!coveredByVoucher) {
        const processable = sessions.filter((session: any) => ["pending", "requires_more", "authorized", "captured", "pending_authorization"].includes(session.status))
        if (!processable.length) throw new SafeOrderError("SAFEORDER_UNAVAILABLE")
        // Dobierka len s kuriérom „na dobierku“ a len pri fyzickom tovare (typy z DB, nie z klienta).
        const shape = await loadCartShape(container as any, {
            profileIds: (cart.items || []).filter((item: any) => item?.requires_shipping !== false).map((item: any) => item?.variant?.product?.shipping_profile?.id).filter(Boolean),
            shippingOptionIds: (cart.shipping_methods || []).map((method: any) => method?.shipping_option_id).filter(Boolean),
        })
        assertDeliveryPaymentConsistency(shape, processable.map((session: any) => session.provider_id))
        // Check every processable provider: a benign first session must not hide a COD session.
        for (const session of processable) {
            try {
                const verdict = await assertSafeOrderAllows({ orderSum: total, paymentMethod: safeOrderPaymentMethod(session.provider_id), customerEmail: cart.email })
                await recordEvent(container as any, "info", "safeorder", "decision", { cart_id: cart.id, customer_id: cart.customer_id ?? null, decision: "ALLOW", score: verdict.score, factors: verdict.factors, payment_provider: session.provider_id, order_sum: total })
            } catch (error) {
                const code = error instanceof SafeOrderError ? error.code : "SAFEORDER_UNAVAILABLE"
                const decision = code === "SAFEORDER_BLOCKED" ? "BLOCK" : code === "SAFEORDER_REVIEW_REQUIRED" ? "REVIEW" : "UNAVAILABLE"
                await recordEvent(container as any, decision === "UNAVAILABLE" ? "error" : "warn", "safeorder", "decision", {
                    cart_id: cart.id, customer_id: cart.customer_id ?? null, decision, error_code: code,
                    score: error instanceof SafeOrderError ? error.score ?? null : null,
                    factors: error instanceof SafeOrderError ? error.factors ?? [] : [],
                    payment_provider: session.provider_id, order_sum: total,
                })
                throw error
            }
        }
    }
    // All validations must pass before a coupon slot is reserved.
    if (cart.completed_at) return
    // Poukazy se ověří ještě před jakoukoli rezervací (nic se nespotřebuje).
    const giftVoucher = await prepareGiftVoucherCheckout(cart, container)
    const compensation: CheckoutCompensation = {}
    compensation.bookingClaim = await claimCartBooking(cart, container) ?? undefined
    try {
        const coupon = cart.metadata?.nexus_coupon
        if (coupon) {
            if (typeof coupon.code !== "string" || !coupon.code.trim()) throw new Error("COUPON_INVALID")
            try {
                // Resolve the promotion from its server-validated code, never cart metadata.
                const promotionId = await promotionIdForCode(container as any, coupon.code)
                if (!promotionId) throw new Error("COUPON_INVALID")
                await container.resolve<CouponLinkModuleService>(COUPON_LINK_MODULE).reserveUsage({
                    promotion_id: promotionId,
                    coupon_code: coupon.code.trim(),
                    cart_id: cart.id,
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : ""
                if (["COUPON_LIMIT_EXHAUSTED", "COUPON_INVALID", "COUPON_USAGE_RESERVATION_CONFLICT", "COUPON_USAGE_RESERVATION_INVALID"].includes(message)) throw error
                throw new Error("COUPON_USAGE_RESERVATION_UNAVAILABLE")
            }
            compensation.couponUsageReservation = cart.id
        }
        if (giftVoucher?.redeem) {
            // Atomické čerpání (zámek řádku poukazu); případné selhání objednávky ho vrátí kompenzací.
            const redemption = await container.resolve<GiftVoucherModuleService>(GIFT_VOUCHER_MODULE).redeem(giftVoucher.redeem)
            compensation.giftVoucherRedemption = redemption.transaction_id
        }
        if (!compensation.bookingClaim && !compensation.giftVoucherRedemption && !compensation.couponUsageReservation) return undefined
        return new StepResponse(undefined, compensation)
    } catch (error) {
        // Při výjimce Medusa kompenzaci tohoto hooku nevolá – vrátit ručně, co se už stihlo.
        await rollbackCheckout(compensation, container)
        throw error
    }
}, async (usage, { container }) => {
    // Match Medusa's own register-usage step: a later payment/order failure
    // returns only the usage successfully registered by this hook.
    if (!usage) return
    await rollbackCheckout(usage, container, true)
})

async function rollbackCheckout(usage: CheckoutCompensation, container: { resolve: <T = any>(key: string) => T }, rethrow = false) {
    const failures: unknown[] = []
    const attempt = async (fn: () => Promise<unknown>) => {
        try { await fn() } catch (error) { failures.push(error) }
    }
    if (usage.giftVoucherRedemption) await attempt(() => container.resolve<GiftVoucherModuleService>(GIFT_VOUCHER_MODULE).reverseRedemption(usage.giftVoucherRedemption!))
    if (usage.bookingClaim) await attempt(() => container.resolve<BookingModuleService>("booking").releaseCheckoutClaim(usage.bookingClaim!))
    if (usage.couponUsageReservation) await attempt(() => container.resolve<CouponLinkModuleService>(COUPON_LINK_MODULE).releaseReservation({ cart_id: usage.couponUsageReservation! }))
    // V kompenzaci se chyba propaguje (Medusa ji zaznamená); v hooku má přednost původní chyba.
    if (rethrow && failures.length) throw failures[0]
}

function amountValue(value: any): number {
    const numeric = typeof value === "object" && value !== null ? value.numeric ?? value.value : value
    if (typeof numeric !== "number" && (typeof numeric !== "string" || !numeric.trim())) return NaN
    return Number(numeric)
}
