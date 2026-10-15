import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { grantEntitlementsForOrder, resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { recordEvent } from "../lib/observability/events"

/** Platba zachycena (např. ruční capture nebo webhook po order.placed) zpřístupní produkty. */
export default async function entitlementPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return // platba ještě nemá objednávku; zpřístupní ji order.placed
    const result = await grantEntitlementsForOrder(container, orderId)
    if (result.granted.length) await recordEvent(container, "info", "entitlement", "granted", { order_id: orderId, payment_id: event.data.id, granted: result.granted.length, trigger: "payment.captured" })
  } catch (error) {
    await recordEvent(container, "error", "entitlement", "grant_failed", { payment_id: event.data.id, trigger: "payment.captured", error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.captured" }
