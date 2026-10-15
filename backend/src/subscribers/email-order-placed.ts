import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyOrderPlaced } from "../lib/notify/order"

/** Potvrzení objednávky zákaznici (notify nikdy nevyhodí – e-mail nesmí shodit objednávku). */
export default async function emailOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await notifyOrderPlaced(container, event.data.id)
}

export const config: SubscriberConfig = { event: "order.placed" }
