import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { grantEntitlementsForOrder } from "../modules/entitlement/order-sync"
import { recordEvent } from "../lib/observability/events"

/** Objednávka vytvořená už zaplacená (zachycená platba, nulový total) zpřístupní produkty hned. */
export default async function entitlementOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const result = await grantEntitlementsForOrder(container, event.data.id)
    if (result.granted.length) await recordEvent(container, "info", "entitlement", "granted", { order_id: result.orderId, granted: result.granted.length, trigger: "order.placed" })
  } catch (error) {
    await recordEvent(container, "error", "entitlement", "grant_failed", { order_id: event.data.id, trigger: "order.placed", error })
    throw error // nechat event bus zopakovat; grant je idempotentní
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
