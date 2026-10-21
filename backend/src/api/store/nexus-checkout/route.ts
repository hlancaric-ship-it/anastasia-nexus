import { MedusaResponse, AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../nexus-cart/route"
import { SafeOrderError } from "./safeorder"
import { giftVoucherHttpError } from "../gift-vouchers/errors"
import { recordEvent } from "../../../lib/observability/events"

import { assertCartConsent, loadConsentCart } from "../../../lib/legal/checkout"
import { LegalError } from "../../../modules/legal/policy"
import { compensateUnfinishedCheckout, stripeIntentsOfCart } from "../../../lib/checkout/payment-compensation"
import { recordCouponUsage } from "../../../lib/pricing/coupon-usage"
import { bankTransferInstructions, loadCartShape, paymentMethodByProvider, PICKUP_ADDRESS } from "../../../lib/checkout/delivery-payment"

/** Objednávka nevznikla: ak už bola platba kartou stiahnutá/autorizovaná, vráti ju (nikdy nevyhodí). */
async function compensate(scope: AuthenticatedMedusaRequest["scope"], cartId: string, reason: string, knownIntents: string[]) {
  try {
    return (await compensateUnfinishedCheckout(scope, cartId, reason, {}, knownIntents)).status
  } catch {
    return "failed" as const
  }
}

/** Revalidate with NEXUS, then let Medusa's normal workflow create the order. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!actorId) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" })

  const { cart_id: cartId } = req.body as { cart_id?: string }
  if (!cartId || typeof cartId !== "string") {
    return res.status(400).json({ ok: false, error: "INVALID_CART_ID" })
  }

  // Kompenzovať platbu smie len vlastníčka košíka (nikdy cudzí cart_id).
  let ownerVerified = false
  let knownIntents: string[] = []
  try {
    const cart = await loadConsentCart(req.scope, cartId)
    if (cart.customer_id !== actorId) throw new Error("CART_ACCESS_DENIED")
    ownerVerified = true
    knownIntents = await stripeIntentsOfCart(req.scope, cartId).catch(() => [])
    await assertCartConsent(req.scope, cart)
    const pricing = await repriceCart(cartId, req.scope, true, undefined, actorId)
    if (pricing.pricesChanged) {
      await recordEvent(req.scope, "warn", "checkout", "price_changed", { cart_id: cartId })
      const paymentCompensation = await compensate(req.scope, cartId, "PRICE_CHANGED", knownIntents)
      return res.status(409).json({
        ok: false,
        error: "PRICE_CHANGED_PAYMENT_REINITIALIZATION_REQUIRED",
        payment_compensation: paymentCompensation,
        message: "Cena košíku byla znovu ověřena. Znovu vytvořte platební relaci pro aktuální částku a opakujte checkout.",
        pricing: { tenantId: pricing.tenantId, items: pricing.items },
      })
    }

    // SafeOrder runs in completeCartWorkflow's validation hook for every completion path.
    const result = await completeCartWorkflow(req.scope).run({ input: { id: cartId } })
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "currency_code", "total", "payment_collections.payments.captured_at", "payment_collections.payments.status", "payment_collections.payments.provider_id", "shipping_methods.name", "shipping_methods.shipping_option_id"],
      filters: { id: (result.result as any).id },
    })
    const order = data?.[0]
    if (!order) throw new Error("ORDER_NOT_FOUND_AFTER_COMPLETION")
    const payment = order.payment_collections?.flatMap((collection: any) => collection.payments || []) || []
    const isPaid = payment.some((entry: any) => entry?.captured_at || entry?.status === "captured")
    const method = paymentMethodByProvider(payment.find((entry: any) => entry?.provider_id)?.provider_id)
    // Len informácia pre zákazníčku – chyba tu nesmie zmeniť výsledok už vytvorenej objednávky.
    const pickup = await loadCartShape(req.scope, { profileIds: [], shippingOptionIds: (order.shipping_methods || []).map((m: any) => m?.shipping_option_id).filter(Boolean) })
      .then((shape) => shape.methodTypes.includes("pickup")).catch(() => false)
    // Použitie kupónu sa započíta až po vytvorení objednávky (atomicky, s kontrolou limitu).
    // Chyba tu nesmie zrušiť hotovú objednávku.
    const couponUsage = await recordCouponUsage(req.scope, cartId)
    if (couponUsage.promotion_id) {
      await recordEvent(req.scope, couponUsage.counted ? "info" : "warn", "coupon", couponUsage.counted ? "used" : "limit_exhausted", {
        cart_id: cartId, order_id: order.id, promotion_id: couponUsage.promotion_id,
      })
    }
    await recordEvent(req.scope, "info", "checkout", "completed", { cart_id: cartId, order_id: order.id, paid: isPaid, currency_code: order.currency_code, payment_method: method })
    return res.status(200).json({
      ok: true,
      order: { id: order.id, display_id: order.display_id, currency_code: order.currency_code, total: order.total, payment_collections: order.payment_collections },
      payment_method: method,
      // Prevod: platobné údaje (VS = číslo objednávky); dobierka: platí sa pri prevzatí.
      bank_transfer: method === "bank_transfer" && !isPaid ? bankTransferInstructions(order) : null,
      pickup_address: pickup ? PICKUP_ADDRESS : null,
      pricing: { tenantId: pricing.tenantId, items: pricing.items },
      paymentStatus: isPaid ? "PAID" : "PENDING",
    })
  } catch (error) {
    // Objednávka nevznikla – platbu kartou, ktorá už mohla prebehnúť, vrátime (pri dokončenom košíku nič).
    const failureCode = typeof error === "object" && error !== null && "message" in error && typeof (error as any).message === "string" && /^[A-Z][A-Z0-9_]{2,63}$/.test((error as any).message) ? (error as any).message : "CHECKOUT_FAILED"
    const paymentCompensation = ownerVerified ? await compensate(req.scope, cartId, failureCode, knownIntents) : "none"
    const fail = (status: number, body: Record<string, unknown>) => res.status(status).json({ ...body, payment_compensation: paymentCompensation })
    if (error instanceof LegalError) {
      await recordEvent(req.scope, "error", "checkout", "failed", { cart_id: cartId, error_code: error.code })
      return fail(error.status, { ok: false, error: error.code })
    }
    const workflowMessage = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "CHECKOUT_FAILED"
    // Medusa workflows serialize hook errors, losing their class prototype.
    // Recognize only these exact codes; never log serialized error payloads.
    const safeOrderCode = error instanceof SafeOrderError ? error.code : workflowMessage
    if (["SAFEORDER_UNAVAILABLE", "SAFEORDER_NOT_CONFIGURED", "SAFEORDER_REVIEW_REQUIRED", "SAFEORDER_BLOCKED"].includes(safeOrderCode)) {
      const status = safeOrderCode === "SAFEORDER_UNAVAILABLE" || safeOrderCode === "SAFEORDER_NOT_CONFIGURED" ? 503 : safeOrderCode === "SAFEORDER_REVIEW_REQUIRED" ? 409 : 403
      await recordEvent(req.scope, "warn", "safeorder", safeOrderCode.toLowerCase(), { cart_id: cartId, http_status: status })
      return fail(status, { ok: false, error: safeOrderCode })
    }
    const voucherError = giftVoucherHttpError(workflowMessage)
    if (voucherError) {
      await recordEvent(req.scope, "warn", "gift_voucher", "checkout_rejected", { cart_id: cartId, error_code: voucherError.body.error })
      return fail(voucherError.status, voucherError.body)
    }
    const message = error instanceof Error ? error.message : workflowMessage
    // do logu jen kód chyby, nikdy libovolná zpráva nebo payload
    await recordEvent(req.scope, "error", "checkout", "failed", { cart_id: cartId, error_code: /^[A-Z][A-Z0-9_]{2,63}$/.test(message) ? message : "CHECKOUT_FAILED" })
    if (message === "NEXUS_PRICE_MISMATCH") {
      return fail(409, { ok: false, error: message, message: "Cena košíku se změnila během checkoutu. Přepočítejte košík a znovu vytvořte platební relaci." })
    }
    if (message === "MEDUSA_PAYMENT_AMOUNT_MISMATCH") {
      return fail(409, { ok: false, error: message, message: "Platební relace neodpovídá aktuální měně a částce košíku. Vytvořte novou platební relaci." })
    }
    const status = message === "CART_ACCESS_DENIED" ? 403 : message === "CART_NOT_FOUND" ? 404 : message.startsWith("NEXUS_PRICING") ? 503 : 400
    return fail(status, { ok: false, error: message })
  }
}
