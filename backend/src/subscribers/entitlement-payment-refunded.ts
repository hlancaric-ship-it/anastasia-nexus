import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveOrderIdByPayment, revokeEntitlementsForRefund } from "../modules/entitlement/order-sync"

/** Plný refund zruší přístup; částečný refund ho ponechá. */
export default async function entitlementPaymentRefundedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    const revoked = await revokeEntitlementsForRefund(container, orderId)
    if (revoked) logger.info(`[entitlement] payment.refunded ${event.data.id}: zrušeno ${revoked} přístupů objednávky ${orderId}`)
  } catch (error) {
    logger.error(`[entitlement] payment.refunded ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.refunded" }
