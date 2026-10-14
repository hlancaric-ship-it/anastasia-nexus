import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { confirmBookingForOrder } from "../modules/booking/order-sync"
import { recordEvent } from "../lib/observability/events"

/** Objednávka vytvořená už zaplacená potvrdí případnou rezervaci konzultace hned. */
export default async function bookingOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const result = await confirmBookingForOrder(container, event.data.id)
    if (result.confirmed) await recordEvent(container, "info", "booking", "confirmed", { order_id: event.data.id, trigger: "order.placed" })
  } catch (error) {
    await recordEvent(container, "error", "booking", "confirm_failed", { order_id: event.data.id, trigger: "order.placed", error })
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
