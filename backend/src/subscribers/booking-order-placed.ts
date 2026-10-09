import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { confirmBookingForOrder } from "../modules/booking/order-sync"

/** Objednávka vytvořená už zaplacená potvrdí případnou rezervaci konzultace hned. */
export default async function bookingOrderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const result = await confirmBookingForOrder(container, event.data.id)
    if (result.confirmed) logger.info(`[booking] order.placed ${event.data.id}: rezervace potvrzena`)
  } catch (error) {
    logger.error(`[booking] order.placed ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
