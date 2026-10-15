import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { revokeEntitlementsForCanceledOrder } from "../modules/entitlement/order-sync"
import { recordEvent } from "../lib/observability/events"

export default async function entitlementOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const revoked = await revokeEntitlementsForCanceledOrder(container, event.data.id)
    if (revoked) await recordEvent(container, "info", "entitlement", "revoked_for_canceled_order", { order_id: event.data.id, revoked })
  } catch (error) {
    await recordEvent(container, "error", "entitlement", "order_canceled_sync_failed", { order_id: event.data.id, error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
