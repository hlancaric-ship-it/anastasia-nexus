import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { attachRedemptionsToOrder, issueVouchersForOrder } from "../modules/gift-voucher/order-sync"

/**
 * order.placed: (1) čerpání poukazu z košíku se priradí k objednávke (podklad pre vratky),
 * (2) zaplatená objednávka (alebo celá uhradená poukazom/kreditom) hneď vystaví kúpené poukazy.
 * Nezaplatenú objednávku dorieši payment.captured.
 */
export default async function giftVoucherOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await attachRedemptionsToOrder(container, event.data.id)
    const result = await issueVouchersForOrder(container, event.data.id)
    if (result.rejected.length) logger.warn(`[gift-voucher] order.placed ${event.data.id}: ${result.rejected.length} riadkov odmietnutých`)
  } catch (error) {
    logger.error(`[gift-voucher] order.placed ${event.data.id} selhalo`, error as Error)
    throw error // event bus zopakuje; vystavenie je idempotentné (issue_key)
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
