import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { issueVouchersForOrder } from "../modules/gift-voucher/order-sync"

/** payment.captured: poukazy sa vystavia až po zaplatení (idempotentne voči order.placed). */
export default async function giftVoucherPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    await issueVouchersForOrder(container, orderId)
  } catch (error) {
    logger.error(`[gift-voucher] payment.captured ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.captured" }
