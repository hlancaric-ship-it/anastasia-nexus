import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { grantEntitlementsForOrder, resolveOrderIdByPayment } from "../modules/entitlement/order-sync"

/** Platba zachycena (např. ruční capture nebo webhook po order.placed) zpřístupní produkty. */
export default async function entitlementPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return // platba ještě nemá objednávku; zpřístupní ji order.placed
    const result = await grantEntitlementsForOrder(container, orderId)
    if (result.granted.length) logger.info(`[entitlement] payment.captured ${event.data.id}: objednávka ${orderId}, zpřístupněno ${result.granted.length}`)
  } catch (error) {
    logger.error(`[entitlement] payment.captured ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.captured" }
