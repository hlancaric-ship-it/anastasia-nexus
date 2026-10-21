import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyCustomerWelcome } from "../lib/notify/order"

/** Uvítání po první registraci (ne pro zákazník převedené ze starého webu). */
export default async function emailCustomerWelcomeHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  if (!event.data?.id) return
  await notifyCustomerWelcome(container, event.data.id)
}

export const config: SubscriberConfig = { event: "customer.created" }
