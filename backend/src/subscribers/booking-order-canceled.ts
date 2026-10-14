import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { cancelBookingForCanceledOrder } from "../modules/booking/order-sync"
import { recordEvent } from "../lib/observability/events"
import { notify } from "../lib/notify"

export default async function bookingOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  let result: Awaited<ReturnType<typeof cancelBookingForCanceledOrder>>
  try {
    result = await cancelBookingForCanceledOrder(container, event.data.id)
    if (result.canceled) await recordEvent(container, "info", "booking", "canceled_for_order", { order_id: event.data.id, canceled: result.canceled })
  } catch (error) {
    await recordEvent(container, "error", "booking", "order_canceled_sync_failed", { order_id: event.data.id, error })
    throw error
  }
  for (const bookingId of result.confirmed_ids) await notify(container, { type: "booking.canceled", booking_id: bookingId, order_id: event.data.id })
}

export const config: SubscriberConfig = { event: "order.canceled" }
