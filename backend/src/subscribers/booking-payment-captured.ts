import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { confirmBookingForOrder } from "../modules/booking/order-sync"
import { recordEvent } from "../lib/observability/events"

export default async function bookingPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    const result = await confirmBookingForOrder(container, orderId)
    if (result.confirmed) await recordEvent(container, "info", "booking", "confirmed", { order_id: orderId, payment_id: event.data.id, trigger: "payment.captured" })
  } catch (error) {
    await recordEvent(container, "error", "booking", "confirm_failed", { payment_id: event.data.id, trigger: "payment.captured", error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.captured" }
