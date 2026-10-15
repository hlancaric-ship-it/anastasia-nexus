import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyRefunds } from "../lib/notify/order"

/** Vrácení peněz – jeden e-mail za každý refund (i částečný). */
export default async function emailPaymentRefundedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  await notifyRefunds(container, event.data.id)
}

export const config: SubscriberConfig = { event: "payment.refunded" }
