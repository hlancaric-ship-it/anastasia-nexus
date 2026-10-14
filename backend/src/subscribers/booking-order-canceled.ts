import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { cancelBookingForCanceledOrder } from "../modules/booking/order-sync"
import { recordEvent } from "../lib/observability/events"

export default async function bookingOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const count = await cancelBookingForCanceledOrder(container, event.data.id)
    if (count) await recordEvent(container, "info", "booking", "canceled_for_order", { order_id: event.data.id, canceled: count })
  } catch (error) {
    await recordEvent(container, "error", "booking", "order_canceled_sync_failed", { order_id: event.data.id, error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
