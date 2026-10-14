import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { handleCanceledOrder } from "../modules/gift-voucher/order-sync"

/** order.canceled: suma zaplatená poukazom sa vráti na poukaz, nečerpané kúpené poukazy sa zneplatnia. */
export default async function giftVoucherOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const result = await handleCanceledOrder(container, event.data.id)
    if (result.refunds.length || result.voided.length) {
      logger.info(`[gift-voucher] order.canceled ${event.data.id}: vrátené ${result.refunds.length}, zneplatnené ${result.voided.length}`)
    }
  } catch (error) {
    logger.error(`[gift-voucher] order.canceled ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
