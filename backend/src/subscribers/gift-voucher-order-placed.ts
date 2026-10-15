import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { attachRedemptionsToOrder, issueVouchersForOrder } from "../modules/gift-voucher/order-sync"
import { recordEvent } from "../lib/observability/events"

/**
 * order.placed: (1) čerpání poukazu z košíku se priradí k objednávke (podklad pre vratky),
 * (2) zaplatená objednávka (alebo celá uhradená poukazom/kreditom) hneď vystaví kúpené poukazy.
 * Nezaplatenú objednávku dorieši payment.captured.
 */
export default async function giftVoucherOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    await attachRedemptionsToOrder(container, event.data.id)
    const result = await issueVouchersForOrder(container, event.data.id)
    if (result.rejected.length) await recordEvent(container, "warn", "gift_voucher", "issue_rejected_lines", { order_id: event.data.id, rejected: result.rejected.length })
  } catch (error) {
    await recordEvent(container, "error", "gift_voucher", "order_placed_sync_failed", { order_id: event.data.id, error })
    throw error // event bus zopakuje; vystavenie je idempotentné (issue_key)
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
