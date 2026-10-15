import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { resolveOrderIdByPayment, revokeEntitlementsForRefund } from "../modules/entitlement/order-sync"
import { recordEvent } from "../lib/observability/events"

/** Plný refund zruší přístup; částečný refund ho ponechá. */
export default async function entitlementPaymentRefundedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    const revoked = await revokeEntitlementsForRefund(container, orderId)
    if (revoked) await recordEvent(container, "info", "entitlement", "revoked_for_refund", { order_id: orderId, payment_id: event.data.id, revoked })
  } catch (error) {
    await recordEvent(container, "error", "entitlement", "refund_sync_failed", { payment_id: event.data.id, error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.refunded" }
