import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelBookingForCanceledOrder } from "../modules/booking/order-sync"

export default async function bookingOrderCanceledHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const count = await cancelBookingForCanceledOrder(container, event.data.id)
    if (count) logger.info(`[booking] order.canceled ${event.data.id}: zrušeno rezervací ${count}`)
  } catch (error) {
    logger.error(`[booking] order.canceled ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
