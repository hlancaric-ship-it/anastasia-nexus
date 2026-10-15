import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyPaymentCaptured } from "../lib/notify/order"

/** Pozdější zachycení platby (převod, ruční capture) – jen když potvrzení objednávky odešlo jako nezaplacené. */
export default async function emailPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await notifyPaymentCaptured(container, event.data.id)
}

export const config: SubscriberConfig = { event: "payment.captured" }
