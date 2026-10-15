import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { compensatePaymentRefund } from "../lib/compensation/payment-refunded"
import { recordEvent } from "../lib/observability/events"

/** Refund kartou: vrácení poukazové části a zneplatnění poukazů z objednávky (viz compensatePaymentRefund). */
export default async function compensationPaymentRefundedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    const result = await compensatePaymentRefund(container, orderId)
    if (result.action === "manual_review") {
      await recordEvent(container, "warn", "payment", "refund_manual_review", { order_id: orderId, payment_id: event.data.id, captured: result.captured, refunded: result.refunded })
    } else if (result.action === "compensated") {
      await recordEvent(container, "info", "gift_voucher", "refund_compensated", {
        order_id: orderId, payment_id: event.data.id,
        voucher_refunds: result.voucher_refunds.length,
        voucher_refunded_minor: result.voucher_refunds.reduce((sum, r) => sum + r.amount_minor, 0),
        issued_voided: result.issued_voided.length,
      })
      if (result.issued_used.length) await recordEvent(container, "warn", "gift_voucher", "refund_issued_already_used", { order_id: orderId, voucher_ids: result.issued_used })
    }
  } catch (error) {
    await recordEvent(container, "error", "payment", "refund_compensation_failed", { payment_id: event.data.id, error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.refunded" }
