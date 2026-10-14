import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { issueVouchersForOrder } from "../modules/gift-voucher/order-sync"
import { recordEvent } from "../lib/observability/events"

/** payment.captured: poukazy sa vystavia až po zaplatení (idempotentne voči order.placed). */
export default async function giftVoucherPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    await issueVouchersForOrder(container, orderId)
  } catch (error) {
    await recordEvent(container, "error", "gift_voucher", "issue_after_capture_failed", { payment_id: event.data.id, error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.captured" }
