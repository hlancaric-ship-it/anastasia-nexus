import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyOrderCanceled } from "../lib/notify/order"

/** Zrušení objednávky (admin i storno zákazníka – obě cesty končí `order.canceled`). */
export default async function emailOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await notifyOrderCanceled(container, event.data.id)
}

export const config: SubscriberConfig = { event: "order.canceled" }
