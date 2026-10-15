import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../nexus-cart/route"
import { SafeOrderError } from "./safeorder"
import { giftVoucherHttpError } from "../gift-vouchers/errors"
import { recordEvent } from "../../../lib/observability/events"

import { assertCartConsent, loadConsentCart } from "../../../lib/legal/checkout"
import { LegalError } from "../../../modules/legal/policy"

/** Revalidate with NEXUS, then let Medusa's normal workflow create the order. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id: cartId } = req.body as { cart_id?: string }
  if (!cartId || typeof cartId !== "string") {
    return res.status(400).json({ ok: false, error: "INVALID_CART_ID" })
  }

  try {
    await assertCartConsent(req.scope, await loadConsentCart(req.scope, cartId))
    const pricing = await repriceCart(cartId, req.scope)
    if (pricing.pricesChanged) {
      await recordEvent(req.scope, "warn", "checkout", "price_changed", { cart_id: cartId })
      return res.status(409).json({
        ok: false,
        error: "PRICE_CHANGED_PAYMENT_REINITIALIZATION_REQUIRED",
        message: "Cena košíku byla znovu ověřena. Znovu vytvořte platební relaci pro aktuální částku a opakujte checkout.",
        pricing: { tenantId: pricing.tenantId, items: pricing.items },
      })
    }

    // SafeOrder runs in completeCartWorkflow's validation hook for every completion path.
    const result = await completeCartWorkflow(req.scope).run({ input: { id: cartId } })
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "currency_code", "total", "payment_collections.payments.captured_at", "payment_collections.payments.status"],
      filters: { id: (result.result as any).id },
    })
    const order = data?.[0]
    if (!order) throw new Error("ORDER_NOT_FOUND_AFTER_COMPLETION")
    const payment = order.payment_collections?.flatMap((collection: any) => collection.payments || []) || []
    const isPaid = payment.some((entry: any) => entry?.captured_at || entry?.status === "captured")
    await recordEvent(req.scope, "info", "checkout", "completed", { cart_id: cartId, order_id: order.id, paid: isPaid, currency_code: order.currency_code })
    return res.status(200).json({
      ok: true,
      order,
      pricing: { tenantId: pricing.tenantId, items: pricing.items },
      paymentStatus: isPaid ? "PAID" : "PENDING",
    })
  } catch (error) {
    if (error instanceof LegalError) return res.status(error.status).json({ ok: false, error: error.code })
    const workflowMessage = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "CHECKOUT_FAILED"
    // Medusa workflows serialize hook errors, losing their class prototype.
    // Recognize only these exact codes; never log serialized error payloads.
    const safeOrderCode = error instanceof SafeOrderError ? error.code : workflowMessage
    if (["SAFEORDER_UNAVAILABLE", "SAFEORDER_NOT_CONFIGURED", "SAFEORDER_REVIEW_REQUIRED", "SAFEORDER_BLOCKED"].includes(safeOrderCode)) {
      const status = safeOrderCode === "SAFEORDER_UNAVAILABLE" || safeOrderCode === "SAFEORDER_NOT_CONFIGURED" ? 503 : safeOrderCode === "SAFEORDER_REVIEW_REQUIRED" ? 409 : 403
      await recordEvent(req.scope, "warn", "safeorder", safeOrderCode.toLowerCase(), { cart_id: cartId, http_status: status })
      return res.status(status).json({ ok: false, error: safeOrderCode })
    }
    const voucherError = giftVoucherHttpError(workflowMessage)
    if (voucherError) {
      await recordEvent(req.scope, "warn", "gift_voucher", "checkout_rejected", { cart_id: cartId, error_code: voucherError.body.error })
      return res.status(voucherError.status).json(voucherError.body)
    }
    const message = error instanceof Error ? error.message : workflowMessage
    // do logu jen kód chyby, nikdy libovolná zpráva nebo payload
    await recordEvent(req.scope, "error", "checkout", "failed", { cart_id: cartId, error_code: /^[A-Z][A-Z0-9_]{2,63}$/.test(message) ? message : "CHECKOUT_FAILED" })
    if (message === "NEXUS_PRICE_MISMATCH") {
      return res.status(409).json({ ok: false, error: message, message: "Cena košíku se změnila během checkoutu. Přepočítejte košík a znovu vytvořte platební relaci." })
    }
    if (message === "MEDUSA_PAYMENT_AMOUNT_MISMATCH") {
      return res.status(409).json({ ok: false, error: message, message: "Platební relace neodpovídá aktuální měně a částce košíku. Vytvořte novou platební relaci." })
    }
    const status = message === "CART_NOT_FOUND" ? 404 : message.startsWith("NEXUS_PRICING") ? 503 : 400
    return res.status(status).json({ ok: false, error: message })
  }
}
