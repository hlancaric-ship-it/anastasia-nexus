import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveOrderIdByPayment } from "../modules/entitlement/order-sync"
import { confirmBookingForOrder } from "../modules/booking/order-sync"

export default async function bookingPaymentCapturedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const orderId = await resolveOrderIdByPayment(container, event.data.id)
    if (!orderId) return
    const result = await confirmBookingForOrder(container, orderId)
    if (result.confirmed) logger.info(`[booking] payment.captured ${event.data.id}: objednávka ${orderId}, rezervace potvrzena`)
  } catch (error) {
    logger.error(`[booking] payment.captured ${event.data.id} selhalo`, error as Error)
    throw error
  }
}

export const config: SubscriberConfig = { event: "payment.captured" }
