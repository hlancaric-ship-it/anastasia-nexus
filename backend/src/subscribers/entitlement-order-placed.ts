import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { grantEntitlementsForOrder } from "../modules/entitlement/order-sync"

/** Objednávka vytvořená už zaplacená (zachycená platba, nulový total) zpřístupní produkty hned. */
export default async function entitlementOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const result = await grantEntitlementsForOrder(container, event.data.id)
    if (result.granted.length) logger.info(`[entitlement] order.placed ${result.orderId}: zpřístupněno ${result.granted.length}`)
  } catch (error) {
    logger.error(`[entitlement] order.placed ${event.data.id} selhalo`, error as Error)
    throw error // nechat event bus zopakovat; grant je idempotentní
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
