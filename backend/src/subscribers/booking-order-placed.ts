import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { confirmBookingForOrder } from "../modules/booking/order-sync"
import { recordEvent } from "../lib/observability/events"
import { notify } from "../lib/notify"

/** Objednávka vytvořená už zaplacená potvrdí případnou rezervaci konzultace hned. */
export default async function bookingOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  let result: Awaited<ReturnType<typeof confirmBookingForOrder>>
  try {
    result = await confirmBookingForOrder(container, event.data.id)
    if (result.confirmed) await recordEvent(container, "info", "booking", "confirmed", { order_id: event.data.id, trigger: "order.placed" })
  } catch (error) {
    await recordEvent(container, "error", "booking", "confirm_failed", { order_id: event.data.id, trigger: "order.placed", error })
    throw error
  }
  // mimo try: upozornění nikdy nevyhodí a nesmí vyvolat retry potvrzení
  if (result.confirmed && result.booking_id) await notify(container, { type: "booking.confirmed", booking_id: result.booking_id, order_id: event.data.id })
}

export const config: SubscriberConfig = { event: "order.placed" }
