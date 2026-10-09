import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { revokeEntitlementsForCanceledOrder } from "../modules/entitlement/order-sync"

export default async function entitlementOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const revoked = await revokeEntitlementsForCanceledOrder(container, event.data.id)
    if (revoked) logger.info(`[entitlement] order.canceled ${event.data.id}: zrušeno ${revoked} přístupů`)
  } catch (error) {
    logger.error(`[entitlement] order.canceled ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
