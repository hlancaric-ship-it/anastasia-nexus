import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { confirmBookingForOrder } from "../modules/booking/order-sync"
import { recordEvent } from "../lib/observability/events"
import { notify } from "../lib/notify"

export default async function bookingPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  let orderId: string | null | undefined
  let result: Awaited<ReturnType<typeof confirmBookingForOrder>>
  try {
    orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    result = await confirmBookingForOrder(container, orderId)
    if (result.confirmed) await recordEvent(container, "info", "booking", "confirmed", { order_id: orderId, payment_id: event.data.id, trigger: "payment.captured" })
  } catch (error) {
    await recordEvent(container, "error", "booking", "confirm_failed", { payment_id: event.data.id, trigger: "payment.captured", error })
    throw error
  }
  // order.placed i payment.captured můžou potvrdit totéž – idempotency_key pošle e-mail jen jednou
  if (result.confirmed && result.booking_id) await notify(container, { type: "booking.confirmed", booking_id: result.booking_id, order_id: orderId })
}

export const config: SubscriberConfig = { event: "payment.captured" }
