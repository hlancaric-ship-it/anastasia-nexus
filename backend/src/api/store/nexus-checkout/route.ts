import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { repriceCart } from "../nexus-cart/route"
import { assertSafeOrderAllows, SafeOrderError } from "./safeorder"

/** Revalidate with NEXUS, then let Medusa's normal workflow create the order. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id: cartId } = req.body as { cart_id?: string }
  if (!cartId || typeof cartId !== "string") {
    return res.status(400).json({ ok: false, error: "INVALID_CART_ID" })
  }

  try {
    const pricing = await repriceCart(cartId, req.scope)
    if (pricing.pricesChanged) {
      return res.status(409).json({
        ok: false,
        error: "PRICE_CHANGED_PAYMENT_REINITIALIZATION_REQUIRED",
        message: "Cena košíku byla znovu ověřena. Znovu vytvořte platební relaci pro aktuální částku a opakujte checkout.",
        pricing: { tenantId: pricing.tenantId, items: pricing.items },
      })
    }

    const query0: any = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: cartData } = await query0.graph({
      entity: "cart",
      fields: ["id", "email", "customer.email", "payment_collection.payment_sessions.provider_id"],
      filters: { id: cartId },
    })
    const cartInfo = cartData?.[0]
    const orderSum = pricing.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    const sessions = cartInfo?.payment_collection?.payment_sessions || []
    await assertSafeOrderAllows({
      orderSum,
      paymentMethod: String(sessions[0]?.provider_id ?? ""),
      customerEmail: String(cartInfo?.email || cartInfo?.customer?.email || ""),
    })

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
    return res.status(200).json({
      ok: true,
      order,
      pricing: { tenantId: pricing.tenantId, items: pricing.items },
      paymentStatus: isPaid ? "PAID" : "PENDING",
    })
  } catch (error) {
    const workflowMessage = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "CHECKOUT_FAILED"
    if (error instanceof SafeOrderError) {
      const status = error.code === "SAFEORDER_UNAVAILABLE" || error.code === "SAFEORDER_NOT_CONFIGURED" ? 503 : error.code === "SAFEORDER_REVIEW_REQUIRED" ? 409 : 403
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`SafeOrder ${error.code} cart=${cartId} score=${error.score ?? "n/a"}`)
      return res.status(status).json({ ok: false, error: error.code })
    }
    const message = error instanceof Error ? error.message : workflowMessage
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error("NEXUS checkout failed", new Error(message))
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
