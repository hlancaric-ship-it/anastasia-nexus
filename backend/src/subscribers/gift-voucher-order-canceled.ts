import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { handleCanceledOrder } from "../modules/gift-voucher/order-sync"
import { recordEvent } from "../lib/observability/events"

/** order.canceled: suma zaplatená poukazom sa vráti na poukaz, nečerpané kúpené poukazy sa zneplatnia. */
export default async function giftVoucherOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const result = await handleCanceledOrder(container, event.data.id)
    if (result.refunds.length || result.voided.length) {
      await recordEvent(container, "info", "gift_voucher", "order_canceled_compensated", { order_id: event.data.id, refunds: result.refunds.length, voided: result.voided.length })
    }
  } catch (error) {
    await recordEvent(container, "error", "gift_voucher", "order_canceled_sync_failed", { order_id: event.data.id, error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
