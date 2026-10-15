import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyShipment } from "../lib/notify/order"

/** Odeslání zásilky; `no_notification` z adminu e-mail potlačí. */
export default async function emailShipmentCreatedHandler({ event, container }: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  await notifyShipment(container, event.data.id, event.data.no_notification === true)
}

export const config: SubscriberConfig = { event: "shipment.created" }
